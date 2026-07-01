import logging
import uuid
from supabase import Client

logger = logging.getLogger(__name__)


def upload_screenshot(
    client: Client,
    jpeg_bytes: bytes,
    session_id: str,
    user_id: str,
    org_id: str,
    captured_at: str,
) -> str:
    """Upload JPEG to Supabase Storage + insert screenshots row. Returns screenshot_id.

    Raises RuntimeError on upload failure. If storage upload succeeds but DB insert
    fails, attempts to clean up the orphaned storage file before re-raising.

    # Integration test: requires real Supabase credentials
    """
    screenshot_id = str(uuid.uuid4())
    storage_path = f"{user_id}/{session_id}/{screenshot_id}.jpg"

    try:
        client.storage.from_("screenshots").upload(
            path=storage_path,
            file=jpeg_bytes,
            file_options={"content-type": "image/jpeg"},
        )
        logger.debug(f"Screenshot uploaded to storage: {storage_path} ({len(jpeg_bytes)} bytes)")
    except Exception as exc:
        logger.error(f"Screenshot storage upload failed: {exc}", exc_info=True)
        raise RuntimeError(f"Screenshot storage upload failed: {exc}") from exc

    try:
        client.table("screenshots").insert({
            "id": screenshot_id,
            "session_id": session_id,
            "user_id": user_id,
            "organization_id": org_id,
            "captured_at": captured_at,
            "storage_path": storage_path,
            "file_size_bytes": len(jpeg_bytes),
        }).execute()
        logger.info(f"Screenshot {screenshot_id} recorded in database")
    except Exception as exc:
        # Attempt cleanup of orphaned storage file
        try:
            client.storage.from_("screenshots").remove([storage_path])
        except Exception:
            pass  # cleanup best-effort only
        logger.error(f"Screenshot DB insert failed: {exc}", exc_info=True)
        raise RuntimeError(f"Screenshot DB insert failed: {exc}") from exc

    return screenshot_id
