# workstream-daemon/tests/test_directory_agent.py
"""Tests for the generate_directory_apontamento wrapper."""
from unittest.mock import MagicMock, patch


def test_returns_content_and_hours(tmp_path):
    from daemon.ai.directory_agent import generate_directory_apontamento

    (tmp_path / "main.py").write_text("def hello(): pass", encoding="utf-8")
    diff = {"created": ["main.py"], "modified": [], "deleted": []}
    mock_generator = MagicMock()
    mock_generator.generate.return_value = {"content": "Criou função hello", "hours_worked": 1.5}

    with patch("daemon.ai.directory_agent.create_generator", return_value=mock_generator):
        result = generate_directory_apontamento(str(tmp_path), "Projeto", diff, note="")

    assert result["content"] == "Criou função hello"
    assert result["hours_worked"] == 1.5
    mock_generator.generate.assert_called_once_with(str(tmp_path), "Projeto", diff, "", [])


def test_passes_note_to_generator(tmp_path):
    from daemon.ai.directory_agent import generate_directory_apontamento

    diff = {"created": ["x.py"], "modified": [], "deleted": []}
    mock_generator = MagicMock()
    mock_generator.generate.return_value = {"content": "ok", "hours_worked": 0.5}

    with patch("daemon.ai.directory_agent.create_generator", return_value=mock_generator):
        generate_directory_apontamento(str(tmp_path), "P", diff, note="minha nota")

    _, _, _, note_arg, _ = mock_generator.generate.call_args[0]
    assert note_arg == "minha nota"


def test_passes_screenshots_to_generator(tmp_path):
    from daemon.ai.directory_agent import generate_directory_apontamento

    screenshots = [{"id": "sc1", "storage_path": "a/b.jpg", "signed_url": "https://x", "captured_at": "2026-06-30", "bytes": b"data"}]
    diff = {"created": ["x.py"], "modified": [], "deleted": []}
    mock_generator = MagicMock()
    mock_generator.generate.return_value = {"content": "ok", "hours_worked": 1.0}

    with patch("daemon.ai.directory_agent.create_generator", return_value=mock_generator):
        generate_directory_apontamento(str(tmp_path), "P", diff, note="", screenshots=screenshots)

    mock_generator.generate.assert_called_once_with(str(tmp_path), "P", diff, "", screenshots)
