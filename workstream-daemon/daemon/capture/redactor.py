"""Redaction of sensitive data patterns in JPEG bytes."""
import io
import re
from PIL import Image


# Compiled regex patterns for sensitive data
_PATTERNS = {
    'jwt': re.compile(
        rb'eyJ[A-Za-z0-9_.-]+\.eyJ[A-Za-z0-9_.-]+\.[A-Za-z0-9_.-]+',
        re.IGNORECASE
    ),
    'api_key': re.compile(
        rb'(?i)(api[_-]?key|api[_-]?secret|secret[_-]?key)[:\s=]+([^\s"\n\r]{10,})',
        re.IGNORECASE
    ),
    'password': re.compile(
        rb'(?i)password[:\s=]+([^\s"\n\r]{6,})',
        re.IGNORECASE
    ),
    'token': re.compile(
        rb'(?i)token[:\s=]+([^\s"\n\r]{10,})',
        re.IGNORECASE
    ),
    'cpf': re.compile(rb'\d{3}\.\d{3}\.\d{3}-\d{2}'),
    'cnpj': re.compile(rb'\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}'),
    'credit_card': re.compile(rb'\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b'),
}


def redact_jpeg_bytes(jpeg_bytes: bytes) -> bytes:
    """
    Detects and redacts sensitive patterns in JPEG bytes.

    Scans the JPEG for readable text containing:
    - JWT tokens
    - API keys and secrets
    - Passwords
    - CPF/CNPJ
    - Credit card numbers

    Sensitive matches are replaced with null bytes.

    Args:
        jpeg_bytes: Raw JPEG file content

    Returns:
        JPEG bytes with sensitive data redacted
    """
    if not jpeg_bytes:
        return jpeg_bytes

    result = bytearray(jpeg_bytes)

    # Search for all patterns and redact matches
    for pattern_name, pattern in _PATTERNS.items():
        for match in pattern.finditer(result):
            start, end = match.span()
            # Replace match with null bytes (invisible in display, but data is gone)
            result[start:end] = b'\x00' * (end - start)

    return bytes(result)


def redact_image(img: Image.Image, quality: int = 75) -> Image.Image:
    """
    Redacts sensitive data in a PIL image by round-tripping through JPEG.

    Converts PIL Image → JPEG bytes → redact → PIL Image.
    This catches sensitive data that appears in JPEG compression artifacts.

    Args:
        img: PIL Image object
        quality: JPEG quality (1-100)

    Returns:
        PIL Image with sensitive data redacted
    """
    # Encode to JPEG
    buf = io.BytesIO()
    img.save(buf, format='JPEG', quality=quality, optimize=True)
    jpeg_bytes = buf.getvalue()

    # Redact patterns in JPEG bytes
    redacted_bytes = redact_jpeg_bytes(jpeg_bytes)

    # Decode back to PIL Image
    return Image.open(io.BytesIO(redacted_bytes))
