# workstream-daemon/daemon/ai/anthropic_generator.py
"""Anthropic implementation of apontamento generation."""
import json
import logging

from anthropic import Anthropic

from daemon.ai.apontamento_generator import (
    ApontamentoGenerator,
    build_generation_context,
    coerce_result,
)

logger = logging.getLogger(__name__)


class AnthropicGenerator(ApontamentoGenerator):
    """Generate apontamentos using the Anthropic API."""

    def __init__(self, api_key: str):
        self.api_key = api_key

    def generate(
        self,
        dir_path: str,
        description: str,
        diff: dict,
        note: str = "",
        screenshots: list = [],
    ) -> dict:
        import base64

        logger.info(
            "Generating apontamento via Anthropic: %s (%s created, %s modified)",
            dir_path,
            len(diff.get("created", [])),
            len(diff.get("modified", [])),
        )
        context = build_generation_context(dir_path, description, diff, note)
        client = Anthropic(api_key=self.api_key)

        system = (
            "Você é um assistente de produtividade para desenvolvedores. "
            "Analise as alterações de um projeto e gere um apontamento profissional em português brasileiro.\n"
            "Retorne APENAS JSON válido sem markdown:\n"
            '{"content": "descrição detalhada do trabalho realizado em 2-4 parágrafos", '
            '"hours_worked": <decimal entre 0.25 e 24>}'
        )
        user_text = (
            f"Projeto: {context['project_description']}\n"
            f"Diretório: {context['directory']}\n\n"
            f"Alterações:\n{context['diff_lines']}\n\n"
            f"Conteúdo dos arquivos alterados:\n{context['file_excerpts']}"
        )
        if context["developer_note"]:
            user_text += f"\n\nNota do desenvolvedor:\n{context['developer_note']}"
        user_text += "\n\nGere o apontamento."

        content: list = []
        for sc in screenshots[:20]:
            sc_bytes = sc.get("bytes")
            if sc_bytes:
                content.append(
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/jpeg",
                            "data": base64.b64encode(sc_bytes).decode(),
                        },
                    }
                )
        content.append({"type": "text", "text": user_text})

        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system=system,
            messages=[{"role": "user", "content": content}],
        )
        text = (
            response.content[0].text
            if response.content and response.content[0].type == "text"
            else "{}"
        )

        try:
            clean = text.strip()
            if clean.startswith("```"):
                clean = clean.split("```", 2)[1]
                if clean.startswith("json"):
                    clean = clean[4:]
                clean = clean.rsplit("```", 1)[0]
            parsed = json.loads(clean)
        except json.JSONDecodeError:
            logger.warning("Failed to parse Claude response: %s", text[:100])
            parsed = {}

        return coerce_result(parsed)
