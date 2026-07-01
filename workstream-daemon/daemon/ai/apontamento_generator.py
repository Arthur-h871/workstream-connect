# workstream-daemon/daemon/ai/apontamento_generator.py
"""Abstract interface and shared helpers for apontamento generation."""
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any

_MAX_FILE_CHARS = 3000
_MAX_FILES_IN_CONTEXT = 5


class ApontamentoGeneratorError(Exception):
    """Raised when apontamento generation cannot be configured."""


class ApontamentoGenerator(ABC):
    """Abstract base for apontamento generators."""

    @abstractmethod
    def generate(
        self,
        dir_path: str,
        description: str,
        diff: dict,
        note: str = "",
        screenshots: list = [],
    ) -> dict:
        """Generate an apontamento payload for the current generator."""


def _read_excerpt(path: Path) -> str:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
        return text[:_MAX_FILE_CHARS]
    except Exception:
        return "[não foi possível ler]"


def build_generation_context(
    dir_path: str,
    description: str,
    diff: dict,
    note: str = "",
) -> dict[str, str]:
    """Build prompt and payload context from a directory diff."""
    base = Path(dir_path)
    changed = (diff.get("created") or []) + (diff.get("modified") or [])

    excerpts = []
    for rel_path in changed[:_MAX_FILES_IN_CONTEXT]:
        abs_path = base / rel_path
        if abs_path.exists():
            excerpts.append(f"### {rel_path}\n```\n{_read_excerpt(abs_path)}\n```")

    diff_lines = (
        f"Criados ({len(diff.get('created', []))}): {', '.join(diff.get('created', [])[:10]) or 'nenhum'}\n"
        f"Modificados ({len(diff.get('modified', []))}): {', '.join(diff.get('modified', [])[:10]) or 'nenhum'}\n"
        f"Deletados ({len(diff.get('deleted', []))}): {', '.join(diff.get('deleted', [])[:10]) or 'nenhum'}"
    )
    excerpts_block = "\n\n".join(excerpts) if excerpts else "Sem conteúdo disponível."

    return {
        "project_description": description or "Sem descrição",
        "directory": dir_path,
        "diff_lines": diff_lines,
        "file_excerpts": excerpts_block,
        "developer_note": note,
    }


def coerce_result(result: Any) -> dict[str, Any]:
    """Normalize a generator result to the public response shape."""
    parsed = result if isinstance(result, dict) else {}
    normalized = {
        "content": str(parsed.get("content", "")),
        "hours_worked": max(0.25, min(24.0, float(parsed.get("hours_worked", 0.5)))),
    }
    for key in ("type", "claude_code_session_id", "claude_code_session_url"):
        if key in parsed:
            normalized[key] = parsed[key]
    return normalized


def create_generator() -> ApontamentoGenerator:
    """Create the configured apontamento generator, preferring API key over routine."""
    import os

    from daemon.ai.anthropic_generator import AnthropicGenerator
    from daemon.ai.routine_generator import RoutineGenerator

    api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    fire_url = os.getenv("CLAUDE_FIRE_URL", "").strip()
    routine_key = os.getenv("CLAUDE_ROUTINE_KEY", "").strip()

    if api_key:
        return AnthropicGenerator(api_key=api_key)

    if fire_url:
        if not routine_key:
            raise ApontamentoGeneratorError(
                "CLAUDE_FIRE_URL is set but CLAUDE_ROUTINE_KEY is empty. "
                "Set both CLAUDE_FIRE_URL and CLAUDE_ROUTINE_KEY."
            )
        return RoutineGenerator(fire_url=fire_url, routine_key=routine_key)

    raise ApontamentoGeneratorError(
        "No apontamento generator configured. Set ANTHROPIC_API_KEY or "
        "(CLAUDE_FIRE_URL and CLAUDE_ROUTINE_KEY)."
    )
