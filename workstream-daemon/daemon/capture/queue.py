"""Upload queue with retry logic and persistence."""
import asyncio
import logging
import sqlite3
import uuid
from pathlib import Path
from datetime import datetime, timezone

from supabase import Client

logger = logging.getLogger(__name__)


class UploadQueue:
    """Persistent upload queue with exponential backoff retry."""

    def __init__(self, db_path: Path):
        """
        Initialize upload queue with SQLite backing store.

        Args:
            db_path: Path to SQLite database file
        """
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        """Create queue table if it doesn't exist."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS upload_queue (
                    id TEXT PRIMARY KEY,
                    jpeg_path TEXT NOT NULL,
                    session_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    org_id TEXT NOT NULL,
                    captured_at TEXT NOT NULL,
                    attempts INTEGER DEFAULT 0,
                    last_error TEXT,
                    created_at TEXT NOT NULL
                )
                """
            )
            conn.commit()

    async def enqueue(
        self,
        jpeg_bytes: bytes,
        session_id: str,
        user_id: str,
        org_id: str,
        captured_at: str,
        temp_dir: Path,
    ) -> str:
        """
        Enqueue a screenshot for upload.

        Saves JPEG to disk and records in queue database.

        Args:
            jpeg_bytes: JPEG image bytes
            session_id: Session ID
            user_id: User ID
            org_id: Organization ID
            captured_at: ISO timestamp when captured
            temp_dir: Directory for storing pending JPEGs

        Returns:
            Upload ID
        """
        upload_id = str(uuid.uuid4())
        jpeg_path = temp_dir / "pending" / f"{upload_id}.jpg"
        jpeg_path.parent.mkdir(parents=True, exist_ok=True)
        jpeg_path.write_bytes(jpeg_bytes)

        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO upload_queue
                (id, jpeg_path, session_id, user_id, org_id, captured_at, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    upload_id,
                    str(jpeg_path),
                    session_id,
                    user_id,
                    org_id,
                    captured_at,
                    datetime.now(timezone.utc).isoformat(),
                ),
            )
            conn.commit()

        logger.debug(f"Enqueued screenshot {upload_id} ({len(jpeg_bytes)} bytes)")
        return upload_id

    async def drain(self, client: Client) -> None:
        """
        Process queue with exponential backoff retry.

        Continuously drains pending uploads with 1s → 2s → 4s backoff.
        Runs indefinitely until explicitly stopped.

        Args:
            client: Supabase client for uploads
        """
        from daemon.capture.uploader import upload_screenshot

        while True:
            try:
                await asyncio.sleep(5)  # Check queue every 5s

                with sqlite3.connect(self.db_path) as conn:
                    rows = conn.execute(
                        """
                        SELECT id, jpeg_path, session_id, user_id, org_id,
                               captured_at, attempts
                        FROM upload_queue
                        WHERE attempts < 3
                        ORDER BY created_at ASC
                        LIMIT 5
                        """
                    ).fetchall()

                for (
                    upload_id,
                    jpeg_path,
                    session_id,
                    user_id,
                    org_id,
                    captured_at,
                    attempts,
                ) in rows:
                    await self._retry_upload(
                        upload_id,
                        jpeg_path,
                        session_id,
                        user_id,
                        org_id,
                        captured_at,
                        attempts,
                        client,
                    )

            except asyncio.CancelledError:
                logger.info("Upload queue draining stopped")
                break
            except Exception as exc:
                logger.error(f"Unexpected error in upload queue: {exc}", exc_info=True)
                await asyncio.sleep(10)  # Back off before retrying

    async def _retry_upload(
        self,
        upload_id: str,
        jpeg_path: str,
        session_id: str,
        user_id: str,
        org_id: str,
        captured_at: str,
        attempts: int,
        client: Client,
    ) -> None:
        """
        Attempt upload with exponential backoff.

        Args:
            upload_id: Upload queue ID
            jpeg_path: Path to JPEG file
            session_id: Session ID
            user_id: User ID
            org_id: Organization ID
            captured_at: ISO timestamp
            attempts: Current attempt number (0, 1, 2)
            client: Supabase client
        """
        from daemon.capture.uploader import upload_screenshot

        # Exponential backoff: 1s, 2s, 4s
        backoff = 2 ** attempts
        await asyncio.sleep(backoff)

        try:
            jpeg_bytes = Path(jpeg_path).read_bytes()
            await asyncio.to_thread(
                upload_screenshot, client, jpeg_bytes, session_id, user_id, org_id, captured_at
            )

            # Success: remove from queue
            with sqlite3.connect(self.db_path) as conn:
                conn.execute("DELETE FROM upload_queue WHERE id = ?", (upload_id,))
                conn.commit()

            Path(jpeg_path).unlink(missing_ok=True)
            logger.info(f"Screenshot {upload_id} uploaded successfully")

        except Exception as exc:
            # Failure: increment attempts
            with sqlite3.connect(self.db_path) as conn:
                conn.execute(
                    """
                    UPDATE upload_queue
                    SET attempts = attempts + 1, last_error = ?
                    WHERE id = ?
                    """,
                    (str(exc), upload_id),
                )
                conn.commit()

            if attempts < 2:
                logger.warning(
                    f"Upload {upload_id} failed (attempt {attempts + 1}/3): {exc}"
                )
            else:
                logger.error(f"Upload {upload_id} failed after 3 attempts: {exc}")

    def queue_size(self) -> int:
        """Get current queue size."""
        with sqlite3.connect(self.db_path) as conn:
            count = conn.execute(
                "SELECT COUNT(*) FROM upload_queue WHERE attempts < 3"
            ).fetchone()[0]
        return count
