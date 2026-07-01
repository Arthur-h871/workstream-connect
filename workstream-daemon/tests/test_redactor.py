"""Tests for sensitive data redaction."""
import io

import pytest
from PIL import Image, ImageDraw

from daemon.capture.redactor import redact_jpeg_bytes, redact_image


@pytest.fixture
def sample_image():
    """Create a simple test image."""
    img = Image.new('RGB', (100, 50), color='white')
    return img


def test_redact_jwt_in_bytes():
    """Test JWT token redaction in raw bytes."""
    jwt = b'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
    data = b'Some text before ' + jwt + b' and after'

    redacted = redact_jpeg_bytes(data)

    # JWT should be replaced with nulls
    assert jwt not in redacted
    assert b'\x00' in redacted
    # Non-sensitive parts preserved
    assert b'Some text before' in redacted
    assert b'and after' in redacted


def test_redact_api_key_in_bytes():
    """Test API key redaction."""
    data = b'api_key: sk-1234567890abcdefghij rest of data'

    redacted = redact_jpeg_bytes(data)

    # API key should be redacted
    assert b'sk-1234567890abcdefghij' not in redacted
    assert b'\x00' in redacted
    # Non-sensitive parts preserved
    assert b'rest of data' in redacted


def test_redact_cpf_in_bytes():
    """Test CPF redaction."""
    data = b'CPF: 123.456.789-00 is the id'

    redacted = redact_jpeg_bytes(data)

    # CPF should be redacted
    assert b'123.456.789-00' not in redacted
    assert b'\x00' in redacted
    # Non-sensitive parts preserved
    assert b'is the id' in redacted


def test_redact_credit_card_in_bytes():
    """Test credit card redaction."""
    data = b'card: 4532-1111-2222-3333 valid'

    redacted = redact_jpeg_bytes(data)

    # Card number should be redacted
    assert b'4532-1111-2222-3333' not in redacted
    assert b'\x00' in redacted
    # Non-sensitive parts preserved
    assert b'valid' in redacted


def test_redact_password_in_bytes():
    """Test password field redaction."""
    data = b'password: mySecretPassword123 was set'

    redacted = redact_jpeg_bytes(data)

    # Password should be redacted
    assert b'mySecretPassword123' not in redacted
    assert b'\x00' in redacted
    # Non-sensitive parts preserved
    assert b'was set' in redacted


def test_redact_multiple_patterns():
    """Test redaction of multiple patterns in same data."""
    jwt = b'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.TJVA95OrM7E2cBab30RMHrHDcEfxjoYZgeFONFh7HgQ'
    data = (
        b'Your JWT is: ' + jwt +
        b' and your CPF is 123.456.789-00' +
        b' and api_key: sk-test-1234567890'
    )

    redacted = redact_jpeg_bytes(data)

    # All sensitive data should be gone
    assert jwt not in redacted
    assert b'123.456.789-00' not in redacted
    assert b'sk-test-1234567890' not in redacted
    # Safe parts preserved
    assert b'Your' in redacted
    assert b'is:' in redacted


def test_redact_image_with_pil():
    """Test image redaction via PIL round-trip."""
    img = Image.new('RGB', (100, 50), color='white')
    draw = ImageDraw.Draw(img)
    # Draw text (will be encoded in JPEG)
    draw.text((10, 10), 'api_key: sk-1234567890', fill='black')

    redacted = redact_image(img, quality=75)

    # Should be a valid image
    assert isinstance(redacted, Image.Image)
    assert redacted.size == img.size
    assert redacted.mode == 'RGB'


def test_redact_empty_bytes():
    """Test redaction of empty input."""
    result = redact_jpeg_bytes(b'')
    assert result == b''


def test_redact_no_sensitive_data():
    """Test that safe data is not modified unnecessarily."""
    safe_data = b'This is completely safe text with no secrets'

    redacted = redact_jpeg_bytes(safe_data)

    # Should still contain the original data (no null bytes added)
    assert redacted == safe_data
    assert b'\x00' not in redacted


def test_cnpj_redaction():
    """Test CNPJ redaction."""
    data = b'CNPJ: 11.222.333/0001-81 is registered'

    redacted = redact_jpeg_bytes(data)

    # CNPJ should be redacted
    assert b'11.222.333/0001-81' not in redacted
    assert b'\x00' in redacted
    assert b'is registered' in redacted


def test_token_redaction():
    """Test token field redaction."""
    jwt_token = b'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.TJVA95OrM7E2cBab30RMHrHDcEfxjoYZgeFONFh7HgQ'
    data = b'token: Bearer ' + jwt_token + b' expires'

    redacted = redact_jpeg_bytes(data)

    # JWT token value should be redacted
    assert jwt_token not in redacted
    assert b'\x00' in redacted
    assert b'token:' in redacted
    assert b'expires' in redacted
