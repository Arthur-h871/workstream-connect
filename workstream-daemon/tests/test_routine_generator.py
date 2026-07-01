# workstream-daemon/tests/test_routine_generator.py
"""Tests for RoutineGenerator."""
from unittest.mock import MagicMock, patch
import pytest


@pytest.fixture
def generator():
    from daemon.ai.routine_generator import RoutineGenerator

    return RoutineGenerator(
        fire_url="https://api.anthropic.com/v1/claude_code/routines/trig_123/fire",
        routine_key="sk-ant-oat01-routine-token",
    )


def test_routine_generate_calls_endpoint(generator, tmp_path):
    (tmp_path / "file1.py").write_text("print('hello')", encoding="utf-8")
    mock_response = {
        "claude_code_session_id": "session_123",
        "claude_code_session_url": "https://claude.ai/code/session_123",
    }

    with patch("daemon.ai.routine_generator.httpx.post") as mock_post:
        mock_post.return_value = MagicMock(
            json=MagicMock(return_value=mock_response),
            raise_for_status=MagicMock(),
        )
        result = generator.generate(
            str(tmp_path), "Test project",
            {"created": ["file1.py"], "modified": [], "deleted": []},
            note="Added feature",
        )

    assert result["type"] == "routine_fire"
    assert result["claude_code_session_id"] == "session_123"
    assert result["claude_code_session_url"] == "https://claude.ai/code/session_123"
    mock_post.assert_called_once()
    call_kwargs = mock_post.call_args
    assert call_kwargs[0][0] == "https://api.anthropic.com/v1/claude_code/routines/trig_123/fire"
    assert call_kwargs.kwargs["headers"]["Authorization"] == "Bearer sk-ant-oat01-routine-token"


def test_routine_raises_on_http_error(generator):
    from daemon.ai.routine_generator import RoutineGeneratorError

    with patch("daemon.ai.routine_generator.httpx.post") as mock_post:
        mock_post.side_effect = Exception("Connection refused")

        with pytest.raises(RoutineGeneratorError):
            generator.generate("/test", "test", {"created": [], "modified": [], "deleted": []})


def test_routine_raises_on_invalid_response(generator):
    from daemon.ai.routine_generator import RoutineGeneratorError

    with patch("daemon.ai.routine_generator.httpx.post") as mock_post:
        mock_post.return_value = MagicMock(
            json=MagicMock(return_value={"invalid": "response"}),
            raise_for_status=MagicMock(),
        )

        with pytest.raises(RoutineGeneratorError):
            generator.generate("/test", "test", {"created": [], "modified": [], "deleted": []})


def test_routine_includes_screenshot_urls_in_text(generator):
    screenshots = [
        {"id": "sc1", "storage_path": "a/b.jpg", "signed_url": "https://storage.example.com/sc1", "captured_at": "2026-06-30T10:00:00", "bytes": None},
        {"id": "sc2", "storage_path": "a/c.jpg", "signed_url": "https://storage.example.com/sc2", "captured_at": "2026-06-30T10:30:00", "bytes": None},
    ]
    mock_response = {
        "claude_code_session_id": "sess_abc",
        "claude_code_session_url": "https://claude.ai/code/sess_abc",
    }

    with patch("daemon.ai.routine_generator.httpx.post") as mock_post:
        mock_post.return_value = MagicMock(
            json=MagicMock(return_value=mock_response),
            raise_for_status=MagicMock(),
        )
        generator.generate(
            "/test", "proj",
            {"created": [], "modified": [], "deleted": []},
            screenshots=screenshots,
        )

    payload_text = mock_post.call_args.kwargs["json"]["text"]
    assert "https://storage.example.com/sc1" in payload_text
    assert "https://storage.example.com/sc2" in payload_text
    assert "Screenshots da sessão" in payload_text
