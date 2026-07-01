"""FastAPI server for workstream-daemon.

Exposes HTTP endpoints for directory management and session control,
and runs a background screenshot loop while a session is active.
"""
import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from daemon.config import settings
from daemon.dirs import registry, watcher
from daemon.logging_setup import get_logger
from daemon.realtime import RealtimeController
from daemon.capture.queue import UploadQueue
from daemon.ai.directory_agent import generate_directory_apontamento

logger = get_logger(__name__)

__version__ = "0.1.0"

app = FastAPI(title="workstream-daemon")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:4173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    """Initialize upload queue on startup."""
    global _upload_queue, _queue_task, _supabase_client
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    _upload_queue = UploadQueue(settings.data_dir / "upload_queue.db")
    try:
        from supabase import create_client

        client = create_client(settings.supabase_url, settings.supabase_service_role_key)
        _supabase_client = client
        _queue_task = asyncio.create_task(_upload_queue.drain(client))
        logger.info("Upload queue drainer started")
    except Exception as exc:
        logger.error(f"Failed to start upload queue: {exc}")


@app.on_event("shutdown")
async def shutdown():
    """Clean up on shutdown."""
    global _queue_task
    if _queue_task:
        _queue_task.cancel()
        try:
            await _queue_task
        except asyncio.CancelledError:
            pass


@dataclass
class _Session:
    session_id: str
    user_id: str
    org_id: str
    status: str = "active"
    started_at: Optional[str] = None
    screenshot_task: Optional[asyncio.Task] = field(default=None, repr=False)


_session: Optional[_Session] = None
_realtime_controller = RealtimeController()
_upload_queue: Optional[UploadQueue] = None
_queue_task: Optional[asyncio.Task] = None
_supabase_client = None


# ── Status ─────────────────────────────────────────────────────────────────────


@app.get("/status")
def get_status() -> dict:
    """Return daemon running status and active session info."""
    logger.debug("Status check")
    return {
        "running": True,
        "version": __version__,
        "active_session": (
            {"id": _session.session_id, "started_at": _session.started_at or ""}
            if _session
            else None
        ),
    }


# ── Directories ────────────────────────────────────────────────────────────────


class DirectoryCreate(BaseModel):
    path: str
    description: str = ""


class DirectoryUpdate(BaseModel):
    description: str


@app.get("/directories")
def list_directories() -> list:
    """List all registered directories."""
    dirs = registry.list_dirs(settings.registry_path)
    for d in dirs:
        d["snapshot_exists"] = (settings.bases_dir / d["id"]).exists()
    return dirs


@app.post("/directories", status_code=201)
def add_directory(body: DirectoryCreate) -> dict:
    """Register a new directory for tracking."""
    try:
        return registry.add_dir(settings.registry_path, body.path, body.description)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))


@app.put("/directories/{dir_id}")
def update_directory(dir_id: str, body: DirectoryUpdate) -> dict:
    """Update a registered directory's description."""
    try:
        return registry.update_dir(settings.registry_path, dir_id, description=body.description)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@app.delete("/directories/{dir_id}", status_code=204)
def delete_directory(dir_id: str) -> None:
    """Remove a directory from tracking."""
    try:
        registry.remove_dir(settings.registry_path, dir_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


# ── Session ────────────────────────────────────────────────────────────────────


class SessionStart(BaseModel):
    session_id: str
    user_id: str
    org_id: str


class SessionStop(BaseModel):
    session_id: str
    dir_notes: dict[str, str] = {}


class SessionPause(BaseModel):
    session_id: str


class SessionGenerate(BaseModel):
    session_id: str
    dir_notes: dict[str, str] = {}
    screenshot_ids: list[str] = []
    linked_task_context: str = ""


async def _screenshot_loop(session_id: str, user_id: str, org_id: str) -> None:
    """Background coroutine that captures and queues screenshots at a fixed interval."""
    from daemon.capture.screenshot import capture_screenshot

    while True:
        try:
            await asyncio.sleep(settings.screenshot_interval_seconds)
            jpeg, ts = capture_screenshot()
            if _upload_queue:
                await _upload_queue.enqueue(jpeg, session_id, user_id, org_id, ts, settings.data_dir)
            else:
                logger.warning("Upload queue not initialized, discarding screenshot")
        except asyncio.CancelledError:
            logger.info(f"Screenshot loop cancelled for session {session_id}")
            break
        except Exception as exc:
            logger.exception(f"Screenshot capture failed: {exc}")


def _create_screenshot_task(session_id: str, user_id: str, org_id: str) -> asyncio.Task:
    """Create an asyncio task for the screenshot loop."""
    return asyncio.create_task(_screenshot_loop(session_id, user_id, org_id))


@app.post("/session/start")
async def start_session(body: SessionStart) -> dict:
    """Start a new work session: take snapshots and launch screenshot loop."""
    global _session
    if _session and _session.status in ("active", "paused"):
        raise HTTPException(status_code=409, detail="Session already active")

    logger.info(f"Starting session {body.session_id} for user {body.user_id}")

    dirs = registry.list_dirs(settings.registry_path)
    snapshots = []
    for d in dirs:
        dest = settings.bases_dir / d["id"]
        try:
            count = watcher.take_snapshot(Path(d["path"]), dest)
            snapshots.append({"dir_id": d["id"], "files_count": count, "ok": True})
        except Exception as exc:
            logger.error(f"Snapshot failed for {d['id']}: {exc}")
            snapshots.append({"dir_id": d["id"], "ok": False, "error": str(exc)})

    _session = _Session(
        session_id=body.session_id,
        user_id=body.user_id,
        org_id=body.org_id,
        started_at=datetime.now(timezone.utc).isoformat(),
    )
    _session.screenshot_task = _create_screenshot_task(
        body.session_id, body.user_id, body.org_id
    )

    # Start Realtime listener for remote control
    def pause_callback():
        global _session
        if _session:
            _session.status = "paused"
            if _session.screenshot_task:
                _session.screenshot_task.cancel()

    def stop_callback():
        global _session
        if _session:
            _session.status = "stopped"
            if _session.screenshot_task:
                _session.screenshot_task.cancel()

    try:
        from supabase import create_client

        client = create_client(settings.supabase_url, settings.supabase_service_role_key)
        asyncio.create_task(
            _realtime_controller.listen_session_changes(
                client, body.session_id, pause_callback, stop_callback
            )
        )
    except Exception as exc:
        logger.warning(f"Realtime setup failed, continuing with HTTP control: {exc}")

    return {"ok": True, "snapshots": snapshots}


@app.post("/session/stop")
async def stop_session(body: SessionStop) -> dict:
    """Stop the current session, cancel screenshot loop, and return diffs + screenshot metadata."""
    global _session
    if not _session:
        raise HTTPException(status_code=400, detail="No active session")
    if body.session_id != _session.session_id:
        raise HTTPException(status_code=400, detail="Session ID mismatch")

    logger.info(f"Stopping session {body.session_id}")

    _session.status = "stopped"
    if _session.screenshot_task:
        _session.screenshot_task.cancel()
        try:
            await _session.screenshot_task
        except asyncio.CancelledError:
            pass

    _realtime_controller.stop()

    dirs_list = registry.list_dirs(settings.registry_path)
    dirs_with_diffs = []
    for d in dirs_list:
        snap = settings.bases_dir / d["id"]
        if not snap.exists():
            continue
        try:
            diff = watcher.diff_directories(snap, Path(d["path"]))
            dirs_with_diffs.append(
                {
                    "dir_id": d["id"],
                    "path": d["path"],
                    "description": d["description"],
                    "diff": diff,
                }
            )
        except Exception as exc:
            logger.error(f"Diff failed for {d['id']}: {exc}", exc_info=True)

    screenshots = []
    if _supabase_client is not None:
        from daemon.capture.screenshot_fetcher import fetch_session_screenshots

        screenshots = fetch_session_screenshots(body.session_id, _supabase_client)

    _session = None
    logger.info(
        f"Session {body.session_id} stopped: {len(dirs_with_diffs)} dirs, {len(screenshots)} screenshots"
    )
    return {"ok": True, "dirs": dirs_with_diffs, "screenshots": screenshots}


@app.post("/session/generate")
async def generate_apontamentos(body: SessionGenerate) -> dict:
    """Generate AI apontamentos for a stopped session with screenshot context."""
    from daemon.capture.screenshot_fetcher import (
        download_screenshot_bytes,
        fetch_session_screenshots,
    )

    if _supabase_client is None:
        raise HTTPException(status_code=503, detail="Supabase client not initialized")

    all_screenshots = fetch_session_screenshots(body.session_id, _supabase_client)

    if body.screenshot_ids:
        id_set = set(body.screenshot_ids)
        selected = [s for s in all_screenshots if s["id"] in id_set]
    else:
        selected = all_screenshots

    for sc in selected[:20]:
        sc["bytes"] = download_screenshot_bytes(sc["storage_path"], _supabase_client)

    dirs_list = registry.list_dirs(settings.registry_path)
    results = []

    for d in dirs_list:
        snap = settings.bases_dir / d["id"]
        if not snap.exists():
            continue
        try:
            diff = watcher.diff_directories(snap, Path(d["path"]))
            note = body.dir_notes.get(d["id"], "")
            if body.linked_task_context:
                note = f"{note}\n\nTarefas realizadas hoje:\n{body.linked_task_context}".strip()
            has_changes = any(diff[k] for k in ("created", "modified", "deleted"))
            if has_changes:
                logger.info(f"Generating apontamento for {d['id']}")
                draft = generate_directory_apontamento(
                    d["path"], d["description"], diff, note, selected[:20]
                )
                results.append(
                    {
                        "dir_id": d["id"],
                        "path": d["path"],
                        "description": d["description"],
                        "diff": diff,
                        "draft": draft,
                    }
                )
        except Exception as exc:
            logger.error(f"Generate failed for {d['id']}: {exc}", exc_info=True)
            results.append(
                {
                    "dir_id": d["id"],
                    "path": d["path"],
                    "ok": False,
                    "error": str(exc),
                }
            )

    logger.info(f"Generated {len(results)} apontamentos for session {body.session_id}")
    return {"ok": True, "results": results}


@app.post("/session/pause")
async def pause_session(body: SessionPause) -> dict:
    """Pause the current session and cancel the screenshot loop."""
    if not _session:
        raise HTTPException(status_code=400, detail="No active session")
    if body.session_id != _session.session_id:
        raise HTTPException(status_code=400, detail="Session ID mismatch")

    logger.info(f"Pausing session {body.session_id}")

    _session.status = "paused"
    if _session.screenshot_task:
        _session.screenshot_task.cancel()
        try:
            await _session.screenshot_task
        except asyncio.CancelledError:
            pass
    return {"ok": True}


@app.post("/session/resume")
async def resume_session(body: SessionPause) -> dict:
    """Resume a paused session and restart the screenshot loop."""
    global _session
    if not _session:
        raise HTTPException(status_code=400, detail="No active session")

    logger.info(f"Resuming session {_session.session_id}")

    _session.status = "active"
    _session.screenshot_task = _create_screenshot_task(
        _session.session_id, _session.user_id, _session.org_id
    )
    return {"ok": True}
