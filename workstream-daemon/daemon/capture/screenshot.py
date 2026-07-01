import io
from datetime import datetime, timezone

import mss
from PIL import Image

from daemon.capture.redactor import redact_image


def capture_screenshot(quality: int = 75, max_width: int = 1920) -> tuple[bytes, str]:
    """Capture all monitors, compress to JPEG. Returns (jpeg_bytes, iso_timestamp)."""
    with mss.mss() as sct:
        monitor = sct.monitors[0]
        shot = sct.grab(monitor)
        img = Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")

    if img.width > max_width:
        ratio = max_width / img.width
        img = img.resize((max_width, int(img.height * ratio)), Image.LANCZOS)

    # Redact sensitive data before saving
    img = redact_image(img, quality=quality)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality, optimize=True)
    timestamp = datetime.now(timezone.utc).isoformat()
    return buf.getvalue(), timestamp
