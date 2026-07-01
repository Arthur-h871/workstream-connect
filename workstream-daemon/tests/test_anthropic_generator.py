# workstream-daemon/tests/test_anthropic_generator.py
"""Tests for AnthropicGenerator."""
import json
from unittest.mock import MagicMock, patch


def _mock_response(content: str, hours: float):
    mock_resp = MagicMock()
    mock_resp.content = [
        MagicMock(type="text", text=json.dumps({"content": content, "hours_worked": hours}))
    ]
    return mock_resp


def test_anthropic_generate_returns_content_and_hours(tmp_path):
    from daemon.ai.anthropic_generator import AnthropicGenerator

    (tmp_path / "main.py").write_text("print('hello')")
    gen = AnthropicGenerator(api_key="sk-ant-test")
    diff = {"created": ["main.py"], "modified": [], "deleted": []}

    with patch("daemon.ai.anthropic_generator.Anthropic") as MockAnthropic:
        mock_client = MagicMock()
        mock_client.messages.create.return_value = _mock_response("Trabalho realizado", 2.0)
        MockAnthropic.return_value = mock_client

        result = gen.generate(str(tmp_path), "Projeto", diff, note="Nota teste")

    assert result["content"] == "Trabalho realizado"
    assert result["hours_worked"] == 2.0


def test_anthropic_generate_clamps_hours_min(tmp_path):
    from daemon.ai.anthropic_generator import AnthropicGenerator

    gen = AnthropicGenerator(api_key="sk-ant-test")

    with patch("daemon.ai.anthropic_generator.Anthropic") as MockAnthropic:
        mock_client = MagicMock()
        mock_client.messages.create.return_value = _mock_response("texto", -5.0)
        MockAnthropic.return_value = mock_client

        result = gen.generate(str(tmp_path), "", {"created": [], "modified": [], "deleted": []})

    assert result["hours_worked"] == 0.25


def test_anthropic_generate_clamps_hours_max(tmp_path):
    from daemon.ai.anthropic_generator import AnthropicGenerator

    gen = AnthropicGenerator(api_key="sk-ant-test")

    with patch("daemon.ai.anthropic_generator.Anthropic") as MockAnthropic:
        mock_client = MagicMock()
        mock_client.messages.create.return_value = _mock_response("texto", 999.0)
        MockAnthropic.return_value = mock_client

        result = gen.generate(str(tmp_path), "", {"created": [], "modified": [], "deleted": []})

    assert result["hours_worked"] == 24.0


def test_anthropic_generate_includes_image_blocks_when_bytes_provided(tmp_path):
    import base64
    from daemon.ai.anthropic_generator import AnthropicGenerator

    fake_jpeg = b"\xff\xd8\xff" + b"\x00" * 100  # bytes mínimos de JPEG
    screenshots = [{"id": "sc1", "storage_path": "a/b.jpg", "signed_url": "https://x", "captured_at": "2026-06-30T10:00:00", "bytes": fake_jpeg}]

    gen = AnthropicGenerator(api_key="sk-ant-test")
    diff = {"created": [], "modified": ["app.py"], "deleted": []}

    with patch("daemon.ai.anthropic_generator.Anthropic") as MockAnthropic:
        import json as _json
        mock_client = MagicMock()
        mock_client.messages.create.return_value = MagicMock(
            content=[MagicMock(type="text", text=_json.dumps({"content": "ok", "hours_worked": 1.0}))]
        )
        MockAnthropic.return_value = mock_client

        gen.generate(str(tmp_path), "P", diff, screenshots=screenshots)

    call_kwargs = mock_client.messages.create.call_args
    messages = call_kwargs.kwargs["messages"]
    content_blocks = messages[0]["content"]

    image_blocks = [b for b in content_blocks if isinstance(b, dict) and b.get("type") == "image"]
    assert len(image_blocks) == 1
    assert image_blocks[0]["source"]["type"] == "base64"
    assert image_blocks[0]["source"]["media_type"] == "image/jpeg"
    assert image_blocks[0]["source"]["data"] == base64.b64encode(fake_jpeg).decode()


def test_anthropic_generate_skips_screenshots_without_bytes(tmp_path):
    from daemon.ai.anthropic_generator import AnthropicGenerator
    import json as _json

    screenshots = [{"id": "sc1", "storage_path": "a/b.jpg", "signed_url": "https://x", "captured_at": "2026-06-30T10:00:00", "bytes": None}]
    gen = AnthropicGenerator(api_key="sk-ant-test")
    diff = {"created": [], "modified": ["app.py"], "deleted": []}

    with patch("daemon.ai.anthropic_generator.Anthropic") as MockAnthropic:
        mock_client = MagicMock()
        mock_client.messages.create.return_value = MagicMock(
            content=[MagicMock(type="text", text=_json.dumps({"content": "ok", "hours_worked": 1.0}))]
        )
        MockAnthropic.return_value = mock_client

        gen.generate(str(tmp_path), "P", diff, screenshots=screenshots)

    messages = mock_client.messages.create.call_args.kwargs["messages"]
    content_blocks = messages[0]["content"]
    image_blocks = [b for b in content_blocks if isinstance(b, dict) and b.get("type") == "image"]
    assert len(image_blocks) == 0
