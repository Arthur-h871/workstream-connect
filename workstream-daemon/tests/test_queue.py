"""Tests for upload queue with retry."""
import asyncio
import sqlite3
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from daemon.capture.queue import UploadQueue


@pytest.fixture
def queue(tmp_path):
    """Create a queue instance with temporary database."""
    db_path = tmp_path / "test_queue.db"
    return UploadQueue(db_path)


@pytest.fixture
def temp_dir(tmp_path):
    """Create temporary directory for JPEGs."""
    return tmp_path


@pytest.mark.asyncio
async def test_enqueue_creates_file_and_db_entry(queue, temp_dir):
    """Test that enqueue saves JPEG to disk and records in DB."""
    jpeg_bytes = b"\xFF\xD8\xFF\xE0" + b"\x00" * 100  # Minimal JPEG header

    upload_id = await queue.enqueue(
        jpeg_bytes,
        "session-1",
        "user-1",
        "org-1",
        "2024-01-01T12:00:00Z",
        temp_dir
    )

    # Check file was written
    jpeg_path = temp_dir / "pending" / f"{upload_id}.jpg"
    assert jpeg_path.exists()
    assert jpeg_path.read_bytes() == jpeg_bytes

    # Check DB entry
    with sqlite3.connect(queue.db_path) as conn:
        row = conn.execute(
            "SELECT * FROM upload_queue WHERE id = ?",
            (upload_id,)
        ).fetchone()
        assert row is not None
        assert row[2] == "session-1"  # session_id
        assert row[3] == "user-1"  # user_id


@pytest.mark.asyncio
async def test_retry_upload_increments_attempts_on_failure(queue, temp_dir):
    """Test that failed uploads increment attempt counter."""
    jpeg_bytes = b"\xFF\xD8\xFF\xE0" + b"\x00" * 100

    upload_id = await queue.enqueue(
        jpeg_bytes,
        "session-1",
        "user-1",
        "org-1",
        "2024-01-01T12:00:00Z",
        temp_dir
    )

    # Mock client that always fails
    mock_client = MagicMock()

    with patch("daemon.capture.uploader.upload_screenshot", side_effect=Exception("Upload failed")):
        await queue._retry_upload(
            upload_id,
            str(temp_dir / "pending" / f"{upload_id}.jpg"),
            "session-1",
            "user-1",
            "org-1",
            "2024-01-01T12:00:00Z",
            0,  # attempt 0
            mock_client
        )

    # Check attempts incremented
    with sqlite3.connect(queue.db_path) as conn:
        attempts = conn.execute(
            "SELECT attempts FROM upload_queue WHERE id = ?",
            (upload_id,)
        ).fetchone()[0]
        assert attempts == 1


@pytest.mark.asyncio
async def test_successful_upload_removes_from_queue(queue, temp_dir):
    """Test that successful upload removes from queue and deletes file."""
    jpeg_bytes = b"\xFF\xD8\xFF\xE0" + b"\x00" * 100

    upload_id = await queue.enqueue(
        jpeg_bytes,
        "session-1",
        "user-1",
        "org-1",
        "2024-01-01T12:00:00Z",
        temp_dir
    )

    jpeg_path = temp_dir / "pending" / f"{upload_id}.jpg"

    mock_client = MagicMock()

    with patch("daemon.capture.uploader.upload_screenshot"):
        await queue._retry_upload(
            upload_id,
            str(jpeg_path),
            "session-1",
            "user-1",
            "org-1",
            "2024-01-01T12:00:00Z",
            0,
            mock_client
        )

    # Check removed from DB
    with sqlite3.connect(queue.db_path) as conn:
        row = conn.execute(
            "SELECT * FROM upload_queue WHERE id = ?",
            (upload_id,)
        ).fetchone()
        assert row is None

    # Check file deleted
    assert not jpeg_path.exists()


@pytest.mark.asyncio
async def test_queue_size():
    """Test queue_size method."""
    import tempfile
    with tempfile.TemporaryDirectory() as tmp_dir:
        queue = UploadQueue(Path(tmp_dir) / "queue.db")

        # Add some items
        for i in range(3):
            await queue.enqueue(
                b"\xFF\xD8" + str(i).encode(),
                f"session-{i}",
                f"user-{i}",
                "org-1",
                "2024-01-01T12:00:00Z",
                Path(tmp_dir)
            )

        assert queue.queue_size() == 3


def test_queue_table_created_on_init(tmp_path):
    """Test that queue creates database table on initialization."""
    db_path = tmp_path / "test.db"
    queue = UploadQueue(db_path)

    with sqlite3.connect(db_path) as conn:
        tables = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
        table_names = [t[0] for t in tables]
        assert "upload_queue" in table_names




@pytest.mark.asyncio
async def test_exponential_backoff_delays():
    """Test that retry uses exponential backoff (1s, 2s, 4s)."""
    import tempfile
    with tempfile.TemporaryDirectory() as tmp_dir:
        queue = UploadQueue(Path(tmp_dir) / "queue.db")
        temp_path = Path(tmp_dir)

        jpeg_bytes = b"\xFF\xD8" + b"\x00" * 100

        upload_id = await queue.enqueue(
            jpeg_bytes,
            "session-1",
            "user-1",
            "org-1",
            "2024-01-01T12:00:00Z",
            temp_path
        )

        jpeg_path = temp_path / "pending" / f"{upload_id}.jpg"

        mock_client = MagicMock()

        # Test attempt 0 (should wait 2^0 = 1s)
        with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            with patch("daemon.capture.uploader.upload_screenshot", side_effect=Exception("fail")):
                await queue._retry_upload(
                    upload_id, str(jpeg_path), "session-1", "user-1", "org-1",
                    "2024-01-01T12:00:00Z", 0, mock_client
                )
            mock_sleep.assert_called_with(1)
