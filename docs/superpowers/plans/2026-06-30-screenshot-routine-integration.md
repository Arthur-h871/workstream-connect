# Screenshot-to-Routine Multimodal Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Após finalizar uma sessão de gravação, mostrar uma tela de pré-envio com screenshots e contexto, disparar geração multimodal com Claude, e exibir o resultado no DaemonDraftReview existente.

**Architecture:** O `/session/stop` para de gravar e retorna diffs + metadados de screenshots sem chamar IA. O frontend exibe `DaemonSessionReview` (galeria + contexto + task linker). O usuário confirma e o frontend chama o novo `POST /session/generate`, que baixa as screenshots, chama o generator configurado (multimodal para Anthropic, URL no texto para Routine), e retorna os drafts.

**Tech Stack:** Python 3.12, FastAPI, httpx, anthropic SDK, supabase-py (daemon); React 18, TanStack Start, TypeScript (frontend).

## Global Constraints

- Testes rodam via `cd workstream-daemon && source .venv/bin/activate && pytest` — sempre dentro do virtualenv
- Frontend: `cd workstream-connect && npm run dev` — porta 5173
- Daemon: `cd workstream-daemon && source .venv/bin/activate && python3 -m daemon` — porta 7432
- Não commitar `.env` nem arquivos de credencial
- Manter CORS em `["http://localhost:5173", "http://localhost:4173"]` no daemon
- Screenshots cap: 20 por chamada de geração (evitar limite de tokens)
- Signed URLs: 3600s (60 min) de validade

---

### Task 1: Migrar generator framework do worktree para main

**Files:**
- Create: `workstream-daemon/daemon/ai/apontamento_generator.py`
- Create: `workstream-daemon/daemon/ai/anthropic_generator.py`
- Create: `workstream-daemon/daemon/ai/routine_generator.py`
- Modify: `workstream-daemon/daemon/ai/directory_agent.py`
- Create: `workstream-daemon/tests/test_apontamento_generator.py`
- Create: `workstream-daemon/tests/test_anthropic_generator.py`
- Create: `workstream-daemon/tests/test_routine_generator.py`
- Modify: `workstream-daemon/tests/test_directory_agent.py`

**Interfaces:**
- Produces: `generate_directory_apontamento(dir_path, description, diff, note="") -> dict` (mesmo shape de antes — as tarefas seguintes vão extender a assinatura)
- Produces: `create_generator() -> ApontamentoGenerator`

- [ ] **Step 1: Criar `apontamento_generator.py`**

```python
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
```

- [ ] **Step 2: Criar `anthropic_generator.py`**

```python
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
    ) -> dict:
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

        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system=system,
            messages=[{"role": "user", "content": user_text}],
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
```

- [ ] **Step 3: Criar `routine_generator.py`**

```python
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
```

- [ ] **Step 4: Substituir `directory_agent.py` pelo wrapper fino**

Sobrescreve o arquivo existente:

```python
# workstream-daemon/daemon/ai/directory_agent.py
"""Thin wrapper that delegates to the configured apontamento generator."""
import logging

from daemon.ai.apontamento_generator import create_generator

logger = logging.getLogger(__name__)


def generate_directory_apontamento(
    dir_path: str,
    description: str,
    diff: dict,
    note: str = "",
) -> dict:
    """Generate a directory apontamento using the configured generator."""
    logger.info(
        "Analyzing %s: %s created, %s modified",
        dir_path,
        len(diff.get("created", [])),
        len(diff.get("modified", [])),
    )
    generator = create_generator()
    result = generator.generate(dir_path, description, diff, note)
    logger.info("Apontamento generated: %sh", result["hours_worked"])
    return result
```

- [ ] **Step 5: Criar `tests/test_apontamento_generator.py`**

```python
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
```

- [ ] **Step 6: Criar `tests/test_anthropic_generator.py`**

```python
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
```

- [ ] **Step 7: Criar `tests/test_routine_generator.py`**

```python
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
```

- [ ] **Step 8: Atualizar `tests/test_directory_agent.py` para o novo padrão de factory**

Substitui o conteúdo atual (que patcha `Anthropic` diretamente) pelo padrão factory:

```python
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
    mock_generator.generate.assert_called_once_with(str(tmp_path), "Projeto", diff, "")


def test_passes_note_to_generator(tmp_path):
    from daemon.ai.directory_agent import generate_directory_apontamento

    diff = {"created": ["x.py"], "modified": [], "deleted": []}
    mock_generator = MagicMock()
    mock_generator.generate.return_value = {"content": "ok", "hours_worked": 0.5}

    with patch("daemon.ai.directory_agent.create_generator", return_value=mock_generator):
        generate_directory_apontamento(str(tmp_path), "P", diff, note="minha nota")

    _, _, _, note_arg = mock_generator.generate.call_args[0]
    assert note_arg == "minha nota"
```

- [ ] **Step 9: Rodar os testes**

```bash
cd workstream-daemon && source .venv/bin/activate && pytest tests/test_apontamento_generator.py tests/test_anthropic_generator.py tests/test_routine_generator.py tests/test_directory_agent.py -v
```

Esperado: todos os testes PASS.

- [ ] **Step 10: Commit**

```bash
cd workstream-daemon
git add daemon/ai/apontamento_generator.py daemon/ai/anthropic_generator.py daemon/ai/routine_generator.py daemon/ai/directory_agent.py tests/test_apontamento_generator.py tests/test_anthropic_generator.py tests/test_routine_generator.py tests/test_directory_agent.py
git commit -m "feat: migrate generator framework from worktree (factory pattern)"
```

---

### Task 2: Adicionar suporte multimodal a screenshots nos generators

**Files:**
- Modify: `workstream-daemon/daemon/ai/apontamento_generator.py`
- Modify: `workstream-daemon/daemon/ai/anthropic_generator.py`
- Modify: `workstream-daemon/daemon/ai/routine_generator.py`
- Modify: `workstream-daemon/daemon/ai/directory_agent.py`
- Modify: `workstream-daemon/tests/test_anthropic_generator.py`
- Modify: `workstream-daemon/tests/test_routine_generator.py`
- Modify: `workstream-daemon/tests/test_directory_agent.py`

**Interfaces:**
- Consumes: `ApontamentoGenerator` de Task 1
- Produces: `generate(dir_path, description, diff, note="", screenshots=[]) -> dict`
  - `screenshots` é `list[dict]` onde cada dict tem: `id: str`, `storage_path: str`, `signed_url: str`, `captured_at: str`, `bytes: bytes | None`

- [ ] **Step 1: Escrever testes que falham — AnthropicGenerator com screenshots**

Adicionar ao final de `tests/test_anthropic_generator.py`:

```python
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
```

- [ ] **Step 2: Rodar testes para confirmar falha**

```bash
cd workstream-daemon && source .venv/bin/activate && pytest tests/test_anthropic_generator.py::test_anthropic_generate_includes_image_blocks_when_bytes_provided tests/test_anthropic_generator.py::test_anthropic_generate_skips_screenshots_without_bytes -v
```

Esperado: FAIL com `TypeError: generate() got an unexpected keyword argument 'screenshots'`

- [ ] **Step 3: Atualizar método abstrato em `apontamento_generator.py`**

Alterar a assinatura do `@abstractmethod generate` de:
```python
    def generate(
        self,
        dir_path: str,
        description: str,
        diff: dict,
        note: str = "",
    ) -> dict:
```
Para:
```python
    def generate(
        self,
        dir_path: str,
        description: str,
        diff: dict,
        note: str = "",
        screenshots: list = [],
    ) -> dict:
```

- [ ] **Step 4: Atualizar `AnthropicGenerator.generate()` para multimodal**

Substituir o método `generate` completo em `anthropic_generator.py`:

```python
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
```

- [ ] **Step 5: Rodar testes do AnthropicGenerator**

```bash
cd workstream-daemon && source .venv/bin/activate && pytest tests/test_anthropic_generator.py -v
```

Esperado: todos PASS.

- [ ] **Step 6: Escrever testes que falham — RoutineGenerator com screenshots**

Adicionar ao final de `tests/test_routine_generator.py`:

```python
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
```

- [ ] **Step 7: Rodar para confirmar falha**

```bash
cd workstream-daemon && source .venv/bin/activate && pytest tests/test_routine_generator.py::test_routine_includes_screenshot_urls_in_text -v
```

Esperado: FAIL com `TypeError: generate() got an unexpected keyword argument 'screenshots'`

- [ ] **Step 8: Atualizar `RoutineGenerator.generate()` para incluir URLs no texto**

Substituir o método `generate` completo em `routine_generator.py`:

```python
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
```

- [ ] **Step 9: Atualizar `directory_agent.py` para propagar screenshots**

Substituir o conteúdo do arquivo:

```python
# workstream-daemon/daemon/ai/directory_agent.py
"""Thin wrapper that delegates to the configured apontamento generator."""
import logging

from daemon.ai.apontamento_generator import create_generator

logger = logging.getLogger(__name__)


def generate_directory_apontamento(
    dir_path: str,
    description: str,
    diff: dict,
    note: str = "",
    screenshots: list = [],
) -> dict:
    """Generate a directory apontamento using the configured generator."""
    logger.info(
        "Analyzing %s: %s created, %s modified",
        dir_path,
        len(diff.get("created", [])),
        len(diff.get("modified", [])),
    )
    generator = create_generator()
    result = generator.generate(dir_path, description, diff, note, screenshots)
    logger.info("Apontamento generated: %sh", result["hours_worked"])
    return result
```

- [ ] **Step 10: Atualizar `test_directory_agent.py` para cobrir screenshots**

Adicionar ao final do arquivo:

```python
def test_passes_screenshots_to_generator(tmp_path):
    from daemon.ai.directory_agent import generate_directory_apontamento

    screenshots = [{"id": "sc1", "storage_path": "a/b.jpg", "signed_url": "https://x", "captured_at": "2026-06-30", "bytes": b"data"}]
    diff = {"created": ["x.py"], "modified": [], "deleted": []}
    mock_generator = MagicMock()
    mock_generator.generate.return_value = {"content": "ok", "hours_worked": 1.0}

    with patch("daemon.ai.directory_agent.create_generator", return_value=mock_generator):
        generate_directory_apontamento(str(tmp_path), "P", diff, note="", screenshots=screenshots)

    mock_generator.generate.assert_called_once_with(str(tmp_path), "P", diff, "", screenshots)
```

- [ ] **Step 11: Rodar todos os testes de generators**

```bash
cd workstream-daemon && source .venv/bin/activate && pytest tests/test_apontamento_generator.py tests/test_anthropic_generator.py tests/test_routine_generator.py tests/test_directory_agent.py -v
```

Esperado: todos PASS.

- [ ] **Step 12: Commit**

```bash
cd workstream-daemon
git add daemon/ai/apontamento_generator.py daemon/ai/anthropic_generator.py daemon/ai/routine_generator.py daemon/ai/directory_agent.py tests/test_anthropic_generator.py tests/test_routine_generator.py tests/test_directory_agent.py
git commit -m "feat: add multimodal screenshots support to generators"
```

---

### Task 3: Utilitário `screenshot_fetcher.py`

**Files:**
- Create: `workstream-daemon/daemon/capture/screenshot_fetcher.py`
- Create: `workstream-daemon/tests/test_screenshot_fetcher.py`

**Interfaces:**
- Produces: `fetch_session_screenshots(session_id: str, client) -> list[dict]`
  - Cada dict: `{id: str, storage_path: str, signed_url: str, captured_at: str}`
- Produces: `download_screenshot_bytes(storage_path: str, client) -> bytes | None`

- [ ] **Step 1: Escrever os testes primeiro**

```python
# workstream-daemon/tests/test_screenshot_fetcher.py
"""Tests for screenshot_fetcher utilities."""
from unittest.mock import MagicMock


def _make_supabase_client(rows, signed_url="https://signed.example.com/img.jpg", download_bytes=b"jpeg"):
    client = MagicMock()
    client.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = rows
    client.storage.from_.return_value.create_signed_url.return_value = {"signedURL": signed_url}
    client.storage.from_.return_value.download.return_value = download_bytes
    return client


def test_fetch_returns_metadata_with_signed_urls():
    from daemon.capture.screenshot_fetcher import fetch_session_screenshots

    rows = [
        {"id": "sc1", "storage_path": "user/sess/sc1.jpg", "captured_at": "2026-06-30T10:00:00"},
        {"id": "sc2", "storage_path": "user/sess/sc2.jpg", "captured_at": "2026-06-30T10:30:00"},
    ]
    client = _make_supabase_client(rows, signed_url="https://signed.example.com/img.jpg")

    result = fetch_session_screenshots("sess-123", client)

    assert len(result) == 2
    assert result[0]["id"] == "sc1"
    assert result[0]["signed_url"] == "https://signed.example.com/img.jpg"
    assert result[0]["storage_path"] == "user/sess/sc1.jpg"
    assert result[0]["captured_at"] == "2026-06-30T10:00:00"


def test_fetch_returns_empty_on_supabase_error():
    from daemon.capture.screenshot_fetcher import fetch_session_screenshots

    client = MagicMock()
    client.table.return_value.select.return_value.eq.return_value.order.return_value.execute.side_effect = Exception("DB error")

    result = fetch_session_screenshots("sess-123", client)

    assert result == []


def test_fetch_skips_screenshot_when_signed_url_fails():
    from daemon.capture.screenshot_fetcher import fetch_session_screenshots

    rows = [{"id": "sc1", "storage_path": "a/b.jpg", "captured_at": "2026-06-30T10:00:00"}]
    client = MagicMock()
    client.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = rows
    client.storage.from_.return_value.create_signed_url.side_effect = Exception("Storage error")

    result = fetch_session_screenshots("sess-123", client)

    assert result == []


def test_download_returns_bytes():
    from daemon.capture.screenshot_fetcher import download_screenshot_bytes

    client = _make_supabase_client([], download_bytes=b"\xff\xd8\xff")

    result = download_screenshot_bytes("user/sess/sc1.jpg", client)

    assert result == b"\xff\xd8\xff"


def test_download_returns_none_on_error():
    from daemon.capture.screenshot_fetcher import download_screenshot_bytes

    client = MagicMock()
    client.storage.from_.return_value.download.side_effect = Exception("Not found")

    result = download_screenshot_bytes("user/sess/sc1.jpg", client)

    assert result is None
```

- [ ] **Step 2: Rodar para confirmar falha**

```bash
cd workstream-daemon && source .venv/bin/activate && pytest tests/test_screenshot_fetcher.py -v
```

Esperado: FAIL com `ModuleNotFoundError: No module named 'daemon.capture.screenshot_fetcher'`

- [ ] **Step 3: Criar `screenshot_fetcher.py`**

```python
# workstream-daemon/daemon/capture/screenshot_fetcher.py
"""Fetch screenshot metadata and bytes from Supabase Storage."""
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def fetch_session_screenshots(session_id: str, client) -> list[dict]:
    """Query screenshots table and generate 60-min signed URLs for each entry."""
    try:
        resp = (
            client.table("screenshots")
            .select("id, storage_path, captured_at")
            .eq("session_id", session_id)
            .order("captured_at")
            .execute()
        )
    except Exception as exc:
        logger.error("Failed to fetch screenshots for session %s: %s", session_id, exc)
        return []

    result = []
    for row in resp.data:
        try:
            signed = client.storage.from_("screenshots").create_signed_url(
                row["storage_path"], 3600
            )
            result.append(
                {
                    "id": row["id"],
                    "storage_path": row["storage_path"],
                    "signed_url": signed["signedURL"],
                    "captured_at": row["captured_at"],
                }
            )
        except Exception as exc:
            logger.warning(
                "Failed to create signed URL for %s: %s", row["storage_path"], exc
            )
    return result


def download_screenshot_bytes(storage_path: str, client) -> Optional[bytes]:
    """Download JPEG bytes from Supabase Storage. Returns None on failure."""
    try:
        return client.storage.from_("screenshots").download(storage_path)
    except Exception as exc:
        logger.warning("Failed to download %s: %s", storage_path, exc)
        return None
```

- [ ] **Step 4: Rodar testes**

```bash
cd workstream-daemon && source .venv/bin/activate && pytest tests/test_screenshot_fetcher.py -v
```

Esperado: todos PASS.

- [ ] **Step 5: Commit**

```bash
cd workstream-daemon
git add daemon/capture/screenshot_fetcher.py tests/test_screenshot_fetcher.py
git commit -m "feat: add screenshot_fetcher utility for Supabase Storage"
```

---

### Task 4: Desacoplar `/session/stop` da geração de IA

**Files:**
- Modify: `workstream-daemon/daemon/server.py`
- Modify: `workstream-daemon/tests/conftest.py`
- Modify: `workstream-daemon/tests/test_server.py`

**Interfaces:**
- Consumes: `fetch_session_screenshots` de Task 3
- Produces: `POST /session/stop` retorna `{"ok": true, "dirs": [...], "screenshots": [...]}`

- [ ] **Step 1: Escrever testes que falham**

Adicionar ao final de `tests/test_server.py`:

```python
def test_stop_returns_dirs_and_screenshots(client, tmp_path, monkeypatch):
    """Stop should return dirs+screenshots without calling AI."""
    from daemon import config, server as srv
    monkeypatch.setattr(config.settings, "bases_dir", tmp_path / "bases")
    monkeypatch.setattr(config.settings, "registry_path", tmp_path / "registry.json")

    project = tmp_path / "proj"
    (project / "src").mkdir(parents=True)
    (project / "src" / "main.py").write_text("print()")

    client.post("/directories", json={"path": str(project), "description": "P"})
    client.post("/session/start", json={"session_id": "s1", "user_id": "u1", "org_id": "o1"})

    (project / "src" / "new.py").write_text("# new")

    from unittest.mock import MagicMock
    mock_supabase = MagicMock()
    mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = []
    monkeypatch.setattr(srv, "_supabase_client", mock_supabase)

    resp = client.post("/session/stop", json={"session_id": "s1"})

    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert "dirs" in data
    assert "screenshots" in data
    assert "results" not in data


def test_stop_does_not_call_ai_generator(client, tmp_path, monkeypatch):
    """Stop must not call generate_directory_apontamento."""
    from daemon import config, server as srv
    monkeypatch.setattr(config.settings, "bases_dir", tmp_path / "bases")
    monkeypatch.setattr(config.settings, "registry_path", tmp_path / "registry.json")

    project = tmp_path / "proj"
    project.mkdir()
    (project / "file.py").write_text("x = 1")

    client.post("/directories", json={"path": str(project), "description": "P"})
    client.post("/session/start", json={"session_id": "s1", "user_id": "u1", "org_id": "o1"})
    (project / "file.py").write_text("x = 2")

    from unittest.mock import MagicMock, patch
    mock_supabase = MagicMock()
    mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = []
    monkeypatch.setattr(srv, "_supabase_client", mock_supabase)

    with patch("daemon.server.generate_directory_apontamento") as mock_gen:
        resp = client.post("/session/stop", json={"session_id": "s1"})

    assert resp.status_code == 200
    mock_gen.assert_not_called()
```

- [ ] **Step 2: Rodar para confirmar falha**

```bash
cd workstream-daemon && source .venv/bin/activate && pytest tests/test_server.py::test_stop_returns_dirs_and_screenshots tests/test_server.py::test_stop_does_not_call_ai_generator -v
```

Esperado: FAIL (resposta atual tem `results`, não `dirs`).

- [ ] **Step 3: Adicionar `_supabase_client` global em `server.py`**

Após a linha `_queue_task: Optional[asyncio.Task] = None`, adicionar:

```python
_supabase_client = None
```

- [ ] **Step 4: Armazenar o cliente Supabase no startup**

No método `startup()`, alterar de:
```python
        client = create_client(settings.supabase_url, settings.supabase_service_role_key)
        _queue_task = asyncio.create_task(_upload_queue.drain(client))
```
Para:
```python
        global _supabase_client
        client = create_client(settings.supabase_url, settings.supabase_service_role_key)
        _supabase_client = client
        _queue_task = asyncio.create_task(_upload_queue.drain(client))
```

- [ ] **Step 5: Atualizar `conftest.py` para também resetar `_supabase_client`**

No arquivo `tests/conftest.py`, dentro do fixture `client`, após `monkeypatch.setattr(srv, "_session", None)`, adicionar:

```python
    monkeypatch.setattr(srv, "_supabase_client", None)
```

E ao final do yield (após `srv._session = None`), adicionar:

```python
        srv._supabase_client = None
```

O arquivo completo ficará:

```python
import pytest
from unittest.mock import AsyncMock, patch


@pytest.fixture
def client(tmp_path, monkeypatch):
    from daemon import config
    monkeypatch.setattr(config.settings, "data_dir", tmp_path)
    monkeypatch.setattr(config.settings, "supabase_url", "http://fake")
    monkeypatch.setattr(config.settings, "supabase_service_role_key", "fake")
    monkeypatch.setattr(config.settings, "anthropic_api_key", "fake")

    import daemon.server as srv
    monkeypatch.setattr(srv, "_session", None)
    monkeypatch.setattr(srv, "_supabase_client", None)

    with patch("daemon.server._screenshot_loop", new_callable=AsyncMock):
        from fastapi.testclient import TestClient
        yield TestClient(srv.app)
        srv._session = None
        srv._supabase_client = None
```

- [ ] **Step 6: Substituir o handler `stop_session` em `server.py`**

Localizar o handler `async def stop_session(body: SessionStop)` (linha ~250) e substituir o corpo completo:

```python
@app.post("/session/stop")
async def stop_session(body: SessionStop) -> dict:
    """Stop the current session, cancel screenshot loop, and return diffs + screenshot metadata."""
    global _session
    if not _session:
        raise HTTPException(status_code=400, detail="No active session")
    if body.session_id != _session.session_id:
        raise HTTPException(status_code=400, detail="Session ID mismatch")

    logger.info(f"Stopping session {body.session_id}")

    _session.status = "stopped"
    if _session.screenshot_task:
        _session.screenshot_task.cancel()
        try:
            await _session.screenshot_task
        except asyncio.CancelledError:
            pass

    _realtime_controller.stop()

    dirs_list = registry.list_dirs(settings.registry_path)
    dirs_with_diffs = []
    for d in dirs_list:
        snap = settings.bases_dir / d["id"]
        if not snap.exists():
            continue
        try:
            diff = watcher.diff_directories(snap, Path(d["path"]))
            dirs_with_diffs.append(
                {
                    "dir_id": d["id"],
                    "path": d["path"],
                    "description": d["description"],
                    "diff": diff,
                }
            )
        except Exception as exc:
            logger.error(f"Diff failed for {d['id']}: {exc}", exc_info=True)

    screenshots = []
    if _supabase_client is not None:
        from daemon.capture.screenshot_fetcher import fetch_session_screenshots

        screenshots = fetch_session_screenshots(body.session_id, _supabase_client)

    _session = None
    logger.info(
        f"Session {body.session_id} stopped: {len(dirs_with_diffs)} dirs, {len(screenshots)} screenshots"
    )
    return {"ok": True, "dirs": dirs_with_diffs, "screenshots": screenshots}
```

- [ ] **Step 7: Rodar os testes do server**

```bash
cd workstream-daemon && source .venv/bin/activate && pytest tests/test_server.py -v
```

Esperado: todos PASS (incluindo os dois novos).

- [ ] **Step 8: Commit**

```bash
cd workstream-daemon
git add daemon/server.py tests/conftest.py tests/test_server.py
git commit -m "feat: decouple /session/stop from AI generation, return dirs+screenshots"
```

---

### Task 5: Novo endpoint `POST /session/generate`

**Files:**
- Modify: `workstream-daemon/daemon/server.py`
- Modify: `workstream-daemon/tests/test_server.py`

**Interfaces:**
- Consumes: `generate_directory_apontamento(dir_path, description, diff, note, screenshots)` de Task 2
- Consumes: `fetch_session_screenshots`, `download_screenshot_bytes` de Task 3
- Produces: `POST /session/generate` → `{"ok": true, "results": [{dir_id, path, description, diff, draft: {...}}]}`

- [ ] **Step 1: Escrever o teste**

Adicionar ao final de `tests/test_server.py`:

```python
def test_generate_returns_results(client, tmp_path, monkeypatch):
    """POST /session/generate calls AI for dirs with changes and returns results."""
    from daemon import config, server as srv
    monkeypatch.setattr(config.settings, "bases_dir", tmp_path / "bases")
    monkeypatch.setattr(config.settings, "registry_path", tmp_path / "registry.json")

    project = tmp_path / "proj"
    project.mkdir()
    (project / "file.py").write_text("x = 1")

    client.post("/directories", json={"path": str(project), "description": "Meu projeto"})
    client.post("/session/start", json={"session_id": "s1", "user_id": "u1", "org_id": "o1"})
    (project / "file.py").write_text("x = 2")

    from unittest.mock import MagicMock, patch
    mock_supabase = MagicMock()
    mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = []
    monkeypatch.setattr(srv, "_supabase_client", mock_supabase)

    # Stop the session first (no AI)
    client.post("/session/stop", json={"session_id": "s1"})

    mock_draft = {"content": "Modificou file.py", "hours_worked": 1.0}

    with patch("daemon.server.generate_directory_apontamento", return_value=mock_draft) as mock_gen:
        resp = client.post(
            "/session/generate",
            json={"session_id": "s1", "dir_notes": {}, "screenshot_ids": [], "linked_task_context": ""},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert len(data["results"]) == 1
    assert data["results"][0]["draft"]["content"] == "Modificou file.py"
    mock_gen.assert_called_once()


def test_generate_503_without_supabase_client(client):
    """Generate should return 503 if Supabase client is not initialized."""
    resp = client.post(
        "/session/generate",
        json={"session_id": "s1", "dir_notes": {}, "screenshot_ids": [], "linked_task_context": ""},
    )
    assert resp.status_code == 503


def test_generate_skips_dirs_without_changes(client, tmp_path, monkeypatch):
    """Dirs with no file changes produce no entry in results."""
    from daemon import config, server as srv
    monkeypatch.setattr(config.settings, "bases_dir", tmp_path / "bases")
    monkeypatch.setattr(config.settings, "registry_path", tmp_path / "registry.json")

    project = tmp_path / "proj"
    project.mkdir()
    (project / "file.py").write_text("x = 1")

    client.post("/directories", json={"path": str(project), "description": "P"})
    client.post("/session/start", json={"session_id": "s1", "user_id": "u1", "org_id": "o1"})
    # Do NOT modify any file — no changes

    from unittest.mock import MagicMock
    mock_supabase = MagicMock()
    mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = []
    monkeypatch.setattr(srv, "_supabase_client", mock_supabase)

    client.post("/session/stop", json={"session_id": "s1"})

    resp = client.post(
        "/session/generate",
        json={"session_id": "s1", "dir_notes": {}, "screenshot_ids": [], "linked_task_context": ""},
    )
    assert resp.status_code == 200
    assert resp.json()["results"] == []
```

- [ ] **Step 2: Rodar para confirmar falha**

```bash
cd workstream-daemon && source .venv/bin/activate && pytest tests/test_server.py::test_generate_returns_results tests/test_server.py::test_generate_503_without_supabase_client tests/test_server.py::test_generate_skips_dirs_without_changes -v
```

Esperado: FAIL com `404 Not Found` (endpoint não existe ainda).

- [ ] **Step 3: Adicionar o modelo Pydantic e o endpoint em `server.py`**

Logo após a classe `SessionStop` (em torno da linha 160), adicionar o modelo:

```python
class SessionGenerate(BaseModel):
    session_id: str
    dir_notes: dict[str, str] = {}
    screenshot_ids: list[str] = []
    linked_task_context: str = ""
```

Logo após o handler `stop_session`, adicionar o novo endpoint:

```python
@app.post("/session/generate")
async def generate_apontamentos(body: SessionGenerate) -> dict:
    """Generate AI apontamentos for a stopped session with screenshot context."""
    from daemon.ai.directory_agent import generate_directory_apontamento
    from daemon.capture.screenshot_fetcher import (
        download_screenshot_bytes,
        fetch_session_screenshots,
    )

    if _supabase_client is None:
        raise HTTPException(status_code=503, detail="Supabase client not initialized")

    all_screenshots = fetch_session_screenshots(body.session_id, _supabase_client)

    if body.screenshot_ids:
        id_set = set(body.screenshot_ids)
        selected = [s for s in all_screenshots if s["id"] in id_set]
    else:
        selected = all_screenshots

    for sc in selected[:20]:
        sc["bytes"] = download_screenshot_bytes(sc["storage_path"], _supabase_client)

    dirs_list = registry.list_dirs(settings.registry_path)
    results = []

    for d in dirs_list:
        snap = settings.bases_dir / d["id"]
        if not snap.exists():
            continue
        try:
            diff = watcher.diff_directories(snap, Path(d["path"]))
            note = body.dir_notes.get(d["id"], "")
            if body.linked_task_context:
                note = f"{note}\n\nTarefas realizadas hoje:\n{body.linked_task_context}".strip()
            has_changes = any(diff[k] for k in ("created", "modified", "deleted"))
            if has_changes:
                logger.info(f"Generating apontamento for {d['id']}")
                draft = generate_directory_apontamento(
                    d["path"], d["description"], diff, note, selected[:20]
                )
                results.append(
                    {
                        "dir_id": d["id"],
                        "path": d["path"],
                        "description": d["description"],
                        "diff": diff,
                        "draft": draft,
                    }
                )
        except Exception as exc:
            logger.error(f"Generate failed for {d['id']}: {exc}", exc_info=True)
            results.append(
                {
                    "dir_id": d["id"],
                    "path": d["path"],
                    "ok": False,
                    "error": str(exc),
                }
            )

    logger.info(f"Generated {len(results)} apontamentos for session {body.session_id}")
    return {"ok": True, "results": results}
```

- [ ] **Step 4: Rodar todos os testes do server**

```bash
cd workstream-daemon && source .venv/bin/activate && pytest tests/test_server.py -v
```

Esperado: todos PASS.

- [ ] **Step 5: Rodar a suite completa**

```bash
cd workstream-daemon && source .venv/bin/activate && pytest -v
```

Esperado: todos PASS.

- [ ] **Step 6: Commit**

```bash
cd workstream-daemon
git add daemon/server.py tests/test_server.py
git commit -m "feat: add POST /session/generate endpoint with multimodal screenshot support"
```

---

### Task 6: Componente `DaemonSessionReview` no frontend

**Files:**
- Create: `workstream-connect/src/components/DaemonSessionReview.tsx`

**Interfaces:**
- Consumes: `getApontamentoSummaries(userId: string)` de `backend/api/services/apontamentos.service`
- Produces: componente `DaemonSessionReview` + tipos exportados `GeneratePayload`, `DirEntry`, `SessionScreenshot`

- [ ] **Step 1: Criar `DaemonSessionReview.tsx`**

```typescript
// workstream-connect/src/components/DaemonSessionReview.tsx
import { useState, useEffect, useMemo } from "react";
import { getApontamentoSummaries } from "backend/api/services/apontamentos.service";

export type SessionScreenshot = {
  id: string;
  signed_url: string;
  captured_at: string;
};

export type DirEntry = {
  dir_id: string;
  path: string;
  description: string;
  diff: { created: string[]; modified: string[]; deleted: string[] };
};

type ApontamentoSummary = {
  id: string;
  date: string;
  content: string;
  hours_worked: number;
};

export type GeneratePayload = {
  session_id: string;
  dir_notes: Record<string, string>;
  screenshot_ids: string[];
  linked_task_context: string;
};

type Props = {
  sessionId: string;
  dirs: DirEntry[];
  screenshots: SessionScreenshot[];
  userId: string;
  onSubmit: (payload: GeneratePayload) => Promise<void>;
  onDiscard: () => void;
};

function totalChanges(diff: DirEntry["diff"]): number {
  return diff.created.length + diff.modified.length + diff.deleted.length;
}

export function DaemonSessionReview({
  sessionId,
  dirs,
  screenshots,
  userId,
  onSubmit,
  onDiscard,
}: Props) {
  const [context, setContext] = useState("");
  const [linkedTaskIds, setLinkedTaskIds] = useState<Set<string>>(new Set());
  const [todayTasks, setTodayTasks] = useState<ApontamentoSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    getApontamentoSummaries(userId)
      .then((all) =>
        setTodayTasks(
          (all as ApontamentoSummary[]).filter((a) => a.date === today),
        ),
      )
      .catch(() => setTodayTasks([]));
  }, [userId, today]);

  function toggleTask(id: string) {
    setLinkedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const dirsWithChanges = useMemo(
    () => dirs.filter((d) => totalChanges(d.diff) > 0),
    [dirs],
  );

  async function handleSubmit() {
    setLoading(true);
    setError(null);

    const linkedLines = todayTasks
      .filter((t) => linkedTaskIds.has(t.id))
      .map((t) => `- ${t.content}`)
      .join("\n");

    const linked_task_context = [
      context.trim(),
      linkedLines ? `Tarefas do dia:\n${linkedLines}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    try {
      await onSubmit({
        session_id: sessionId,
        dir_notes: {},
        screenshot_ids: [],
        linked_task_context,
      });
    } catch {
      setError("Falha ao enviar para o Claude. Tente novamente.");
      setLoading(false);
    }
  }

  return (
    <div className="mb-6 space-y-4 rounded-lg border border-copper/30 bg-surface p-4">
      <h2 className="text-base font-semibold">
        Sessão finalizada — enviar para Claude
      </h2>

      {dirsWithChanges.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            Alterações detectadas:
          </p>
          {dirsWithChanges.map((d) => (
            <div
              key={d.dir_id}
              className="rounded-md border border-border px-3 py-2"
            >
              <p className="font-mono text-xs text-muted-foreground">
                {d.path}
              </p>
              <p className="text-xs text-muted-foreground">
                {d.diff.created.length} criados · {d.diff.modified.length}{" "}
                modificados · {d.diff.deleted.length} deletados
              </p>
            </div>
          ))}
        </div>
      )}

      {screenshots.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Screenshots ({screenshots.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {screenshots.map((sc) => (
              <a key={sc.id} href={sc.signed_url} target="_blank" rel="noreferrer">
                <img
                  src={sc.signed_url}
                  alt={`Screenshot ${sc.captured_at}`}
                  className="h-[90px] w-[120px] rounded-md border border-border object-cover"
                />
              </a>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Contexto adicional (opcional)
        </label>
        <textarea
          className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground focus:outline-none focus:ring-1 focus:ring-copper"
          rows={3}
          placeholder="Descreva o que foi feito, decisões importantes..."
          value={context}
          onChange={(e) => setContext(e.target.value)}
        />
      </div>

      {todayTasks.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Conectar apontamentos do dia:
          </p>
          <div className="space-y-1">
            {todayTasks.map((t) => (
              <label
                key={t.id}
                className="flex cursor-pointer items-start gap-2"
              >
                <input
                  type="checkbox"
                  checked={linkedTaskIds.has(t.id)}
                  onChange={() => toggleTask(t.id)}
                  className="mt-0.5 accent-copper"
                />
                <span className="line-clamp-2 text-xs text-muted-foreground">
                  {t.content}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          onClick={handleSubmit}
          disabled={loading || dirsWithChanges.length === 0}
          className="rounded-md bg-copper px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Enviando..." : "Enviar para Claude"}
        </button>
        <button
          onClick={onDiscard}
          disabled={loading}
          className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          Descartar
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar que o TypeScript compila**

```bash
cd workstream-connect && npx tsc --noEmit 2>&1 | head -40
```

Esperado: sem erros relacionados a `DaemonSessionReview`.

- [ ] **Step 3: Verificar que `getApontamentoSummaries` existe na service**

```bash
grep -n "getApontamentoSummaries" workstream-connect/backend/api/services/apontamentos.service.ts
```

Esperado: pelo menos uma linha com `export`.

- [ ] **Step 4: Commit**

```bash
cd workstream-connect
git add src/components/DaemonSessionReview.tsx
git commit -m "feat: add DaemonSessionReview component with gallery, context, task linker"
```

---

### Task 7: Atualizar o stop flow no dashboard

**Files:**
- Modify: `workstream-connect/src/routes/_authenticated.dashboard.tsx`

**Interfaces:**
- Consumes: `DaemonSessionReview`, `DirEntry`, `SessionScreenshot`, `GeneratePayload` de Task 6
- Consumes: `DaemonDraftReview` (existente)
- Produces: fluxo completo Stop → SessionReview → DraftReview

O fluxo atual: `handleStopRequest` → `NotesModal` → `handleStopConfirm` → `setDaemonDrafts`

O novo fluxo: `handleStopRequest` → `POST /session/stop` diretamente → `setDaemonSession` → `DaemonSessionReview` → `handleSessionSubmit` → `POST /session/generate` → `setDaemonDrafts`

- [ ] **Step 1: Adicionar imports em `dashboard.tsx`**

Localizar a linha de import de `DaemonDraftReview`:
```typescript
import { DaemonDraftReview } from "@/components/DaemonDraftReview";
```

Substituir por:
```typescript
import { DaemonDraftReview } from "@/components/DaemonDraftReview";
import {
  DaemonSessionReview,
  type DirEntry,
  type GeneratePayload,
  type SessionScreenshot,
} from "@/components/DaemonSessionReview";
```

- [ ] **Step 2: Adicionar o tipo `DaemonSession` e o estado no componente `Dashboard`**

Localizar o componente `Dashboard` — é a função que usa `Route.useLoaderData()`. Encontrar onde os estados `daemonDrafts` e `stoppedSessionId` são declarados (procurar por `useState` com `daemonDrafts`).

Adicionar logo após essas linhas o novo estado:

```typescript
  type DaemonSession = {
    sessionId: string;
    dirs: DirEntry[];
    screenshots: SessionScreenshot[];
  };
  const [daemonSession, setDaemonSession] = useState<DaemonSession | null>(null);
```

- [ ] **Step 3: Atualizar props do `Recorder` para incluir `setDaemonSession` e `onStopSessionId`**

Localizar a renderização de `<Recorder` dentro de `Dashboard` e adicionar a prop:

```typescript
<Recorder
  setDaemonDrafts={setDaemonDrafts}
  onStopSessionId={setStoppedSessionId}
  setDaemonSession={setDaemonSession}
/>
```

- [ ] **Step 4: Atualizar a assinatura do componente `Recorder` para receber `setDaemonSession`**

Localizar `function Recorder({` e adicionar o novo prop:

```typescript
function Recorder({
  setDaemonDrafts,
  onStopSessionId,
  setDaemonSession,
}: {
  setDaemonDrafts: React.Dispatch<React.SetStateAction<unknown[]>>;
  onStopSessionId: (sessionId: string) => void;
  setDaemonSession: React.Dispatch<React.SetStateAction<{
    sessionId: string;
    dirs: DirEntry[];
    screenshots: SessionScreenshot[];
  } | null>>;
}) {
```

- [ ] **Step 5: Simplificar `handleStopRequest` — remover o modal**

Substituir o método `handleStopRequest` completo:

```typescript
  async function handleStopRequest() {
    if (!session || loading) return;
    setLoading(true);
    await handleStopConfirm();
  }
```

- [ ] **Step 6: Reescrever `handleStopConfirm` para o novo fluxo**

O método `handleStopConfirm` mudou: não recebe mais `notes` como parâmetro.

Substituir o método `handleStopConfirm` completo:

```typescript
  async function handleStopConfirm() {
    if (!session) return;
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;
    setLoading(true);
    const sessionId = session.id;
    try {
      await stopSession(sessionId);
      setSession(null);

      if (daemonOnline) {
        try {
          const resp = await fetch(`${DAEMON_URL}/session/stop`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ session_id: sessionId, dir_notes: {} }),
          });
          const data = (await resp.json()) as {
            dirs?: DirEntry[];
            screenshots?: SessionScreenshot[];
          };
          if ((data.dirs ?? []).length > 0) {
            onStopSessionId(sessionId);
            setDaemonSession({
              sessionId,
              dirs: data.dirs ?? [],
              screenshots: data.screenshots ?? [],
            });
          } else {
            triggerGenerateReport(sessionId).catch((e: unknown) => {
              console.error("Erro ao gerar relatório:", e);
            });
          }
        } catch {
          triggerGenerateReport(sessionId).catch((e: unknown) => {
            console.error("Erro ao gerar relatório:", e);
          });
        }
      } else {
        triggerGenerateReport(sessionId).catch((e: unknown) => {
          console.error("Erro ao gerar relatório:", e);
        });
      }
    } finally {
      setLoading(false);
      isStoppingRef.current = false;
    }
  }
```

- [ ] **Step 7: Remover o `NotesModal` e o estado relacionado de `Recorder`**

Remover as seguintes linhas do componente `Recorder`:
- `const [showNotesModal, setShowNotesModal] = useState(false);`
- `const [watchedDirs, setWatchedDirs] = useState<WatchedDir[]>([]);`
- O bloco `{showNotesModal && <NotesModal ... />}` no JSX

Também remover a renderização da `NotesModal` e os handlers que buscam dirs do daemon para o modal.

Remover o fetch de dirs em `handleStopRequest` (não é mais necessário — o stop já retorna os dirs).

- [ ] **Step 8: Adicionar `handleSessionSubmit` no componente `Dashboard`**

Logo antes do `return` do `Dashboard`, adicionar:

```typescript
  async function handleSessionSubmit(payload: GeneratePayload) {
    try {
      const resp = await fetch(`${DAEMON_URL}/session/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await resp.json()) as { results?: unknown[] };
      setDaemonSession(null);
      setDaemonDrafts(data.results ?? []);
    } catch (e) {
      console.error("Erro ao gerar apontamentos:", e);
      throw e;
    }
  }
```

- [ ] **Step 9: Adicionar `DaemonSessionReview` no JSX do `Dashboard`**

Localizar onde `DaemonDraftReview` é renderizado e adicionar antes dele:

```typescript
{daemonSession && (
  <DaemonSessionReview
    sessionId={daemonSession.sessionId}
    dirs={daemonSession.dirs}
    screenshots={daemonSession.screenshots}
    userId={userId}
    onSubmit={handleSessionSubmit}
    onDiscard={() => setDaemonSession(null)}
  />
)}
```

- [ ] **Step 10: Verificar que o TypeScript compila sem erros**

```bash
cd workstream-connect && npx tsc --noEmit 2>&1
```

Esperado: sem erros.

- [ ] **Step 11: Testar manualmente o fluxo completo**

1. `cd workstream-daemon && source .venv/bin/activate && python3 -m daemon`
2. `cd workstream-connect && npm run dev`
3. Abrir `http://localhost:5173`
4. Registrar um diretório com arquivos
5. Clicar em Play para iniciar sessão
6. Modificar um arquivo no diretório monitorado
7. Clicar em Stop — deve aparecer `DaemonSessionReview` com:
   - Lista de diretórios com alterações
   - Galeria de screenshots (se houver)
   - Textarea de contexto
   - Lista de apontamentos do dia (se houver)
8. Adicionar contexto e clicar "Enviar para Claude"
9. Verificar que `DaemonDraftReview` aparece com o resultado

- [ ] **Step 12: Commit**

```bash
cd workstream-connect
git add src/routes/_authenticated.dashboard.tsx
git commit -m "feat: update dashboard stop flow to use DaemonSessionReview pre-send UI"
```

---

## Self-Review

**Spec coverage:**
- ✅ Screenshots enviadas via routine (Task 2 + Task 5)
- ✅ Opção de adicionar contexto manualmente (Task 6 — textarea)
- ✅ Conectar tarefas do dia (Task 6 — task linker com apontamentos)
- ✅ Worktree migrado (Task 1)
- ✅ Multimodal para AnthropicGenerator (Task 2)
- ✅ URLs no texto para RoutineGenerator (Task 2)
- ✅ `/session/stop` desacoplado da IA (Task 4)
- ✅ `/session/generate` novo endpoint (Task 5)
- ✅ `DaemonSessionReview` galeria + contexto + task linker (Task 6)
- ✅ Dashboard stop flow atualizado (Task 7)

**Placeholders:** Nenhum TBD, TODO ou "similar ao task N" encontrado.

**Type consistency:**
- `DirEntry`, `SessionScreenshot`, `GeneratePayload` exportados de Task 6 e consumidos em Task 7 ✓
- `generate(dir_path, description, diff, note="", screenshots=[])` definido em Task 2, chamado em Task 5 com `selected[:20]` ✓
- `fetch_session_screenshots(session_id, client) -> list[dict]` definido em Task 3, usado em Tasks 4 e 5 ✓
- Shape de `POST /session/stop` (`{ok, dirs, screenshots}`) definido em Task 4, consumido em Task 7 ✓
- Shape de `POST /session/generate` response (`{ok, results: [...]}`) definido em Task 5, consumido em Task 7 ✓
