from datetime import datetime, timezone
from supabase import Client


def upload_screenshot(
    client: Client,
    image_bytes: bytes,
    user_id: str,
    org_id: str,
    session_id: str,
) -> str:
    """
    Faz upload do screenshot e insere registro na tabela screenshots.
    Retorna o storage_path.
    """
    captured_at = datetime.now(timezone.utc)
    timestamp = captured_at.strftime("%Y%m%dT%H%M%SZ")
    storage_path = f"{org_id}/{user_id}/{session_id}/{timestamp}.png"

    client.storage.from_("screenshots").upload(
        path=storage_path,
        file=image_bytes,
        file_options={"content-type": "image/png", "upsert": "false"},
    )

    client.table("screenshots").insert(
        {
            "session_id": session_id,
            "user_id": user_id,
            "organization_id": org_id,
            "captured_at": captured_at.isoformat(),
            "storage_path": storage_path,
            "file_size_bytes": len(image_bytes),
        }
    ).execute()

    current = (
        client.table("capture_sessions")
        .select("screenshot_count")
        .eq("id", session_id)
        .single()
        .execute()
        .data
    )
    new_count = (current["screenshot_count"] or 0) + 1
    client.table("capture_sessions").update({"screenshot_count": new_count}).eq(
        "id", session_id
    ).execute()

    return storage_path
