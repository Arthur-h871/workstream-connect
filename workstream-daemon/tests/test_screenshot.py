import pytest
from unittest.mock import patch, MagicMock


def test_capture_returns_jpeg_bytes():
    """Smoke test: verifies capture_screenshot returns non-empty bytes."""
    from daemon.capture.screenshot import capture_screenshot

    # Create a fake mss screenshot (100x100 BGRA = 40000 zero bytes)
    fake_frame = MagicMock()
    fake_frame.size = (100, 100)
    fake_frame.bgra = bytes(100 * 100 * 4)

    fake_mss = MagicMock()
    fake_mss.__enter__ = MagicMock(return_value=fake_mss)
    fake_mss.__exit__ = MagicMock(return_value=False)
    fake_mss.monitors = [{"left": 0, "top": 0, "width": 100, "height": 100}]
    fake_mss.grab.return_value = fake_frame

    with patch("daemon.capture.screenshot.mss.mss", return_value=fake_mss):
        jpeg_bytes, timestamp = capture_screenshot()

    assert isinstance(jpeg_bytes, bytes)
    assert len(jpeg_bytes) > 0
    assert "T" in timestamp  # ISO format
