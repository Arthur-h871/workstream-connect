"""Tests for screenshot_fetcher utilities."""
from unittest.mock import MagicMock


def _make_supabase_client(rows, signed_url="https://signed.example.com/img.jpg", download_bytes=b"jpeg"):
    client = MagicMock()
    client.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = rows
    client.storage.from_.return_value.create_signed_url.return_value = {"signedURL": signed_url}
    client.storage.from_.return_value.download.return_value = download_bytes
    return client


def test_fetch_returns_metadata_with_signed_urls():
    from daemon.capture.screenshot_fetcher import fetch_session_screenshots

    rows = [
        {"id": "sc1", "storage_path": "user/sess/sc1.jpg", "captured_at": "2026-06-30T10:00:00"},
        {"id": "sc2", "storage_path": "user/sess/sc2.jpg", "captured_at": "2026-06-30T10:30:00"},
    ]
    client = _make_supabase_client(rows, signed_url="https://signed.example.com/img.jpg")

    result = fetch_session_screenshots("sess-123", client)

    assert len(result) == 2
    assert result[0]["id"] == "sc1"
    assert result[0]["signed_url"] == "https://signed.example.com/img.jpg"
    assert result[0]["storage_path"] == "user/sess/sc1.jpg"
    assert result[0]["captured_at"] == "2026-06-30T10:00:00"


def test_fetch_returns_empty_on_supabase_error():
    from daemon.capture.screenshot_fetcher import fetch_session_screenshots

    client = MagicMock()
    client.table.return_value.select.return_value.eq.return_value.order.return_value.execute.side_effect = Exception("DB error")

    result = fetch_session_screenshots("sess-123", client)

    assert result == []


def test_fetch_skips_screenshot_when_signed_url_fails():
    from daemon.capture.screenshot_fetcher import fetch_session_screenshots

    rows = [{"id": "sc1", "storage_path": "a/b.jpg", "captured_at": "2026-06-30T10:00:00"}]
    client = MagicMock()
    client.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = rows
    client.storage.from_.return_value.create_signed_url.side_effect = Exception("Storage error")

    result = fetch_session_screenshots("sess-123", client)

    assert result == []


def test_download_returns_bytes():
    from daemon.capture.screenshot_fetcher import download_screenshot_bytes

    client = _make_supabase_client([], download_bytes=b"\xff\xd8\xff")

    result = download_screenshot_bytes("user/sess/sc1.jpg", client)

    assert result == b"\xff\xd8\xff"


def test_download_returns_none_on_error():
    from daemon.capture.screenshot_fetcher import download_screenshot_bytes

    client = MagicMock()
    client.storage.from_.return_value.download.side_effect = Exception("Not found")

    result = download_screenshot_bytes("user/sess/sc1.jpg", client)

    assert result is None
