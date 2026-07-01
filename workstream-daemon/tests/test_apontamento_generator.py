# workstream-daemon/tests/test_apontamento_generator.py
"""Tests for apontamento generator factory."""
from unittest.mock import patch


def test_factory_prefers_api_key_over_routine():
    from daemon.ai.apontamento_generator import create_generator

    with patch.dict(
        "os.environ",
        {
            "ANTHROPIC_API_KEY": "sk-ant-test",
            "CLAUDE_FIRE_URL": "https://api.anthropic.com/v1/claude_code/routines/trig_123/fire",
            "CLAUDE_ROUTINE_KEY": "sk-ant-oat01-routine-token",
        },
        clear=False,
    ):
        gen = create_generator()

    assert gen.__class__.__name__ == "AnthropicGenerator"


def test_factory_uses_routine_when_no_api_key():
    from daemon.ai.apontamento_generator import create_generator

    with patch.dict(
        "os.environ",
        {
            "ANTHROPIC_API_KEY": "",
            "CLAUDE_FIRE_URL": "https://api.anthropic.com/v1/claude_code/routines/trig_123/fire",
            "CLAUDE_ROUTINE_KEY": "sk-ant-oat01-routine-token",
        },
        clear=False,
    ):
        gen = create_generator()

    assert gen.__class__.__name__ == "RoutineGenerator"


def test_factory_raises_when_neither_configured():
    from daemon.ai.apontamento_generator import ApontamentoGeneratorError, create_generator
    import pytest

    with patch.dict(
        "os.environ",
        {"ANTHROPIC_API_KEY": "", "CLAUDE_FIRE_URL": "", "CLAUDE_ROUTINE_KEY": ""},
        clear=False,
    ):
        with pytest.raises(ApontamentoGeneratorError) as exc_info:
            create_generator()

    assert "ANTHROPIC_API_KEY" in str(exc_info.value)
