"""Fetch screenshot metadata and bytes from Supabase Storage."""
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def fetch_session_screenshots(session_id: str, client) -> list[dict]:
    """Query screenshots table and generate 60-min signed URLs for each entry."""
    try:
        resp = (
            client.table("screenshots")
            .select("id, storage_path, captured_at")
            .eq("session_id", session_id)
            .order("captured_at")
            .execute()
        )
    except Exception as exc:
        logger.error("Failed to fetch screenshots for session %s: %s", session_id, exc)
        return []

    result = []
    for row in resp.data:
        try:
            signed = client.storage.from_("screenshots").create_signed_url(
                row["storage_path"], 3600
            )
            result.append(
                {
                    "id": row["id"],
                    "storage_path": row["storage_path"],
                    "signed_url": signed["signedURL"],
                    "captured_at": row["captured_at"],
                }
            )
        except Exception as exc:
            logger.warning(
                "Failed to create signed URL for %s: %s", row["storage_path"], exc
            )
    return result


def download_screenshot_bytes(storage_path: str, client) -> Optional[bytes]:
    """Download JPEG bytes from Supabase Storage. Returns None on failure."""
    try:
        return client.storage.from_("screenshots").download(storage_path)
    except Exception as exc:
        logger.warning("Failed to download %s: %s", storage_path, exc)
        return None
