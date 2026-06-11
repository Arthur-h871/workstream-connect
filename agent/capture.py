import mss
import mss.tools
from io import BytesIO
from PIL import Image


def capture_screenshot() -> bytes:
    """Captura tela principal e retorna como bytes PNG."""
    with mss.mss() as sct:
        monitor = sct.monitors[1]  # monitor principal
        screenshot = sct.grab(monitor)
        img = Image.frombytes("RGB", screenshot.size, screenshot.bgra, "raw", "BGRX")
        buf = BytesIO()
        img.save(buf, format="PNG", optimize=True)
        return buf.getvalue()
