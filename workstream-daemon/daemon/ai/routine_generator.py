# workstream-daemon/daemon/ai/routine_generator.py
"""Claude Routine implementation of apontamento generation."""
import logging

import httpx

from daemon.ai.apontamento_generator import (
    ApontamentoGenerator,
    build_generation_context,
    coerce_result,
)

logger = logging.getLogger(__name__)


class RoutineGeneratorError(Exception):
    """Raised when the configured routine fails."""


class RoutineGenerator(ApontamentoGenerator):
    """Trigger a Claude routine and return session metadata for the frontend."""

    def __init__(self, fire_url: str, routine_key: str):
        self.fire_url = fire_url
        self.routine_key = routine_key

    def generate(
        self,
        dir_path: str,
        description: str,
        diff: dict,
        note: str = "",
        screenshots: list = [],
    ) -> dict:
        logger.info(
            "Generating apontamento via Routine (%s): %s (%s created, %s modified)",
            self.fire_url,
            dir_path,
            len(diff.get("created", [])),
            len(diff.get("modified", [])),
        )
        context = build_generation_context(dir_path, description, diff, note)
        text = (
            f"Projeto: {context['project_description']}\n"
            f"Diretório: {context['directory']}\n\n"
            f"Alterações:\n{context['diff_lines']}\n\n"
            f"Conteúdo dos arquivos alterados:\n{context['file_excerpts']}"
        )
        if context["developer_note"]:
            text += f"\n\nNota do desenvolvedor:\n{context['developer_note']}"

        if screenshots:
            url_lines = "\n".join(
                f"- {sc['captured_at']}: {sc['signed_url']}"
                for sc in screenshots[:20]
            )
            text += f"\n\nScreenshots da sessão ({len(screenshots)} capturas):\n{url_lines}"

        try:
            response = httpx.post(
                self.fire_url,
                json={"text": text},
                timeout=60.0,
                headers={
                    "Authorization": f"Bearer {self.routine_key}",
                    "anthropic-beta": "experimental-cc-routine-2025-04-02",
                    "anthropic-version": "2023-06-01",
                    "Content-Type": "application/json",
                },
            )
            response.raise_for_status()
            result = response.json()
        except Exception as exc:
            logger.error("Routine call failed: %s", exc, exc_info=True)
            raise RoutineGeneratorError(f"Routine invocation failed: {exc}") from exc

        if (
            not isinstance(result, dict)
            or "claude_code_session_id" not in result
            or "claude_code_session_url" not in result
        ):
            raise RoutineGeneratorError(
                "Routine response missing required session fields"
            )

        return coerce_result(
            {
                "type": "routine_fire",
                "claude_code_session_id": result["claude_code_session_id"],
                "claude_code_session_url": result["claude_code_session_url"],
            }
        )
