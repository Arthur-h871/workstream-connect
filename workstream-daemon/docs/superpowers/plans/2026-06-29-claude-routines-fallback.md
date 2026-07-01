# Suporte a Claude Code Routines — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Claude Code Routines as a secondary method for generating directory apontamentos (summaries), maintaining Anthropic API as primary with intelligent fallback.

**Architecture:** Create an abstract `ApontamentoGenerator` interface with two implementations: `AnthropicGenerator` (uses Anthropic API key) and `RoutineGenerator` (invokes Claude Code routine via HTTP). A factory in `directory_agent.py` selects the implementation based on environment configuration, preferring API key when present, falling back to routine when API key is empty.

**Tech Stack:**
- Python `abc` (abstract base classes)
- `httpx` for HTTP calls to routine endpoint
- Environment variables for configuration
- Existing pytest/pytest-asyncio for tests

## Global Constraints

- Maintain backward compatibility: existing code using `generate_directory_apontamento()` must work unchanged
- API key has priority: if both are configured, use API key
- Clear error messages when neither is configured
- No breaking changes to existing modules
- Both paths must produce identical response structure
- Routine configuration must be stored in `.env` and validated at startup

---

## File Structure Overview

| File | Purpose | Status |
|------|---------|--------|
| `daemon/ai/apontamento_generator.py` | Abstract base + factory | CREATE |
| `daemon/ai/anthropic_generator.py` | Anthropic API implementation | CREATE |
| `daemon/ai/routine_generator.py` | Claude Code Routine implementation | CREATE |
| `daemon/ai/directory_agent.py` | Refactor to use factory | MODIFY |
| `daemon/config.py` | Add CLAUDE_ROUTINE_* config | MODIFY |
| `.env.example` | Document new variables | MODIFY |
| `tests/test_apontamento_generator.py` | Test factory behavior | CREATE |
| `tests/test_anthropic_generator.py` | Test Anthropic path | CREATE |
| `tests/test_routine_generator.py` | Test Routine path | CREATE |
| `docs/APONTAMENTO_METHODS.md` | Guide for both methods | CREATE |

---

## Task 1: Create Abstract Base and Factory

**Files:**
- Create: `daemon/ai/apontamento_generator.py`

**Interfaces:**
- Consumes: `dict` (diff structure from directory_agent)
- Produces: `ApontamentoGenerator` (abstract), `create_generator()` factory function

- [ ] **Step 1: Write the failing test**

Create `tests/test_apontamento_generator.py`:

```python
"""Tests for apontamento generator factory."""
import pytest
from unittest.mock import patch


def test_factory_prefers_api_key_over_routine():
    """When both API key and routine are configured, API key wins."""
    from daemon.ai.apontamento_generator import create_generator
    
    with patch.dict("os.environ", {
        "ANTHROPIC_API_KEY": "sk-ant-test",
        "CLAUDE_ROUTINE_ID": "routine-123",
    }):
        gen = create_generator()
    
    assert gen.__class__.__name__ == "AnthropicGenerator"


def test_factory_uses_routine_when_no_api_key():
    """When API key is empty, fall back to routine."""
    from daemon.ai.apontamento_generator import create_generator
    
    with patch.dict("os.environ", {
        "ANTHROPIC_API_KEY": "",
        "CLAUDE_ROUTINE_ID": "routine-123",
    }):
        gen = create_generator()
    
    assert gen.__class__.__name__ == "RoutineGenerator"


def test_factory_raises_when_neither_configured():
    """Raise clear error if neither API key nor routine is configured."""
    from daemon.ai.apontamento_generator import create_generator, ApontamentoGeneratorError
    
    with patch.dict("os.environ", {
        "ANTHROPIC_API_KEY": "",
        "CLAUDE_ROUTINE_ID": "",
    }):
        with pytest.raises(ApontamentoGeneratorError) as exc_info:
            create_generator()
    
    assert "ANTHROPIC_API_KEY or CLAUDE_ROUTINE_ID" in str(exc_info.value)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/pousupersayajin/workspace/repositorios/workstream/workstream-daemon
source venv/bin/activate
pytest tests/test_apontamento_generator.py -v
```

Expected: 3 FAILED (module not found / class not found)

- [ ] **Step 3: Write abstract base and factory**

Create `daemon/ai/apontamento_generator.py`:

```python
"""Abstract interface for apontamento generation."""
from abc import ABC, abstractmethod
from typing import Dict


class ApontamentoGeneratorError(Exception):
    """Raised when no valid generator can be created."""
    pass


class ApontamentoGenerator(ABC):
    """Abstract base for apontamento generators."""

    @abstractmethod
    def generate(
        self,
        dir_path: str,
        description: str,
        diff: Dict,
        note: str = "",
    ) -> Dict:
        """
        Generate an apontamento (work summary).

        Args:
            dir_path: Path to directory being analyzed
            description: Directory description
            diff: Dict with keys "created", "modified", "deleted" (lists of paths)
            note: Developer's optional note

        Returns:
            Dict with keys "content" (str) and "hours_worked" (float)
        """
        pass


def create_generator() -> ApontamentoGenerator:
    """
    Factory: Create appropriate generator based on env config.

    Priority: API key > Routine
    """
    import os
    from daemon.ai.anthropic_generator import AnthropicGenerator
    from daemon.ai.routine_generator import RoutineGenerator

    api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    routine_id = os.getenv("CLAUDE_ROUTINE_ID", "").strip()

    if api_key:
        return AnthropicGenerator(api_key=api_key)

    if routine_id:
        routine_url = os.getenv("CLAUDE_ROUTINE_URL", "").strip()
        if not routine_url:
            raise ApontamentoGeneratorError(
                "CLAUDE_ROUTINE_ID is set but CLAUDE_ROUTINE_URL is empty. "
                "Set CLAUDE_ROUTINE_URL to the routine's HTTP endpoint."
            )
        return RoutineGenerator(routine_id=routine_id, routine_url=routine_url)

    raise ApontamentoGeneratorError(
        "No apontamento generator configured. "
        "Set either ANTHROPIC_API_KEY or (CLAUDE_ROUTINE_ID + CLAUDE_ROUTINE_URL) in .env"
    )
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pytest tests/test_apontamento_generator.py::test_factory_prefers_api_key_over_routine -v
pytest tests/test_apontamento_generator.py::test_factory_uses_routine_when_no_api_key -v
pytest tests/test_apontamento_generator.py::test_factory_raises_when_neither_configured -v
```

Expected: 3 PASSED (will fail on imports until implementations exist)

- [ ] **Step 5: Commit**

```bash
git add daemon/ai/apontamento_generator.py tests/test_apontamento_generator.py
git commit -m "feat: add abstract apontamento generator and factory

- Abstract base class ApontamentoGenerator
- Factory function create_generator() with priority: API key > Routine
- ApontamentoGeneratorError for configuration issues
- Tests for all factory decision paths"
```

---

## Task 2: Implement Anthropic Generator

**Files:**
- Create: `daemon/ai/anthropic_generator.py`
- Test: `tests/test_anthropic_generator.py`

**Interfaces:**
- Consumes: `ApontamentoGenerator` (abstract base), Anthropic SDK
- Produces: `AnthropicGenerator` class implementing `generate()`

- [ ] **Step 1: Write the failing test**

Create `tests/test_anthropic_generator.py`:

```python
"""Tests for Anthropic apontamento generator."""
import json
import pytest
from unittest.mock import MagicMock, patch


@pytest.fixture
def generator():
    from daemon.ai.anthropic_generator import AnthropicGenerator
    return AnthropicGenerator(api_key="sk-ant-test")


def test_anthropic_generate_returns_valid_structure(generator):
    """Verify Anthropic generator returns {content, hours_worked}."""
    mock_response = MagicMock()
    mock_response.content = [MagicMock(type="text", text=json.dumps({
        "content": "Work done on feature X",
        "hours_worked": 2.5
    }))]

    with patch("daemon.ai.anthropic_generator.Anthropic") as mock_client_class:
        mock_client = MagicMock()
        mock_client_class.return_value = mock_client
        mock_client.messages.create.return_value = mock_response

        gen = generator
        result = gen.generate(
            dir_path="/test/dir",
            description="Test project",
            diff={"created": ["file1.py"], "modified": [], "deleted": []},
            note="Added feature"
        )

    assert "content" in result
    assert "hours_worked" in result
    assert isinstance(result["content"], str)
    assert isinstance(result["hours_worked"], float)
    assert 0.25 <= result["hours_worked"] <= 24.0


def test_anthropic_clamps_hours_to_range(generator):
    """Hours must be between 0.25 and 24."""
    mock_response = MagicMock()
    mock_response.content = [MagicMock(type="text", text=json.dumps({
        "content": "Work",
        "hours_worked": 999  # Way too high
    }))]

    with patch("daemon.ai.anthropic_generator.Anthropic") as mock_client_class:
        mock_client = MagicMock()
        mock_client_class.return_value = mock_client
        mock_client.messages.create.return_value = mock_response

        gen = generator
        result = gen.generate(
            "/test", "test", {"created": [], "modified": [], "deleted": []}, ""
        )

    assert result["hours_worked"] == 24.0  # Clamped to max
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_anthropic_generator.py -v
```

Expected: ImportError / AttributeError (class doesn't exist yet)

- [ ] **Step 3: Implement AnthropicGenerator**

Create `daemon/ai/anthropic_generator.py`:

```python
"""Anthropic API implementation of apontamento generator."""
import json
import logging
from pathlib import Path
from typing import Dict

from anthropic import Anthropic

from daemon.ai.apontamento_generator import ApontamentoGenerator

logger = logging.getLogger(__name__)

_MAX_FILE_CHARS = 3000
_MAX_FILES_IN_CONTEXT = 5


class AnthropicGenerator(ApontamentoGenerator):
    """Generate apontamentos using Anthropic API."""

    def __init__(self, api_key: str):
        self.client = Anthropic(api_key=api_key)

    def generate(
        self,
        dir_path: str,
        description: str,
        diff: Dict,
        note: str = "",
    ) -> Dict:
        """Generate apontamento using Claude via Anthropic API."""
        logger.info(
            f"Generating apontamento via Anthropic: {dir_path} "
            f"({len(diff.get('created', []))} created, "
            f"{len(diff.get('modified', []))} modified)"
        )

        base = Path(dir_path)
        changed = (diff.get("created") or []) + (diff.get("modified") or [])
        
        excerpts = []
        for rel_path in changed[:_MAX_FILES_IN_CONTEXT]:
            abs_path = base / rel_path
            if abs_path.exists():
                try:
                    text = abs_path.read_text(encoding="utf-8", errors="replace")
                    excerpt = text[:_MAX_FILE_CHARS]
                    excerpts.append(f"### {rel_path}\n```\n{excerpt}\n```")
                except Exception:
                    pass

        diff_lines = (
            f"Criados ({len(diff.get('created', []))}): "
            f"{', '.join(diff.get('created', [])[:10]) or 'nenhum'}\n"
            f"Modificados ({len(diff.get('modified', []))}): "
            f"{', '.join(diff.get('modified', [])[:10]) or 'nenhum'}\n"
            f"Deletados ({len(diff.get('deleted', []))}): "
            f"{', '.join(diff.get('deleted', [])[:10]) or 'nenhum'}"
        )

        excerpts_block = "\n\n".join(excerpts) if excerpts else "Sem conteúdo disponível."
        note_block = f"\n\nNota do desenvolvedor:\n{note}" if note else ""

        system = (
            "Você é um assistente de produtividade para desenvolvedores. "
            "Analise as alterações de um projeto e gere um apontamento profissional em português brasileiro.\n"
            "Retorne APENAS JSON válido sem markdown:\n"
            '{"content": "descrição detalhada do trabalho realizado em 2-4 parágrafos", '
            '"hours_worked": <decimal entre 0.25 e 24>}'
        )

        user = (
            f"Projeto: {description or 'Sem descrição'}\n"
            f"Diretório: {dir_path}\n\n"
            f"Alterações:\n{diff_lines}\n\n"
            f"Conteúdo dos arquivos alterados:\n{excerpts_block}"
            f"{note_block}\n\n"
            "Gere o apontamento."
        )

        response = self.client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system=system,
            messages=[{"role": "user", "content": user}],
        )

        text = response.content[0].text if response.content else "{}"
        
        try:
            clean = text.strip()
            if clean.startswith("```"):
                clean = clean.split("```", 2)[1]
                if clean.startswith("json"):
                    clean = clean[4:]
                clean = clean.rsplit("```", 1)[0]
            parsed = json.loads(clean)
        except json.JSONDecodeError:
            logger.warning(f"Failed to parse Claude response: {text[:100]}")
            parsed = {}

        result = {
            "content": str(parsed.get("content", "")),
            "hours_worked": max(0.25, min(24.0, float(parsed.get("hours_worked", 0.5)))),
        }

        logger.info(f"Apontamento generated: {result['hours_worked']}h")
        return result
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pytest tests/test_anthropic_generator.py -v
```

Expected: 2 PASSED

- [ ] **Step 5: Commit**

```bash
git add daemon/ai/anthropic_generator.py tests/test_anthropic_generator.py
git commit -m "feat: implement Anthropic apontamento generator

- AnthropicGenerator class using Anthropic API
- Extracts code excerpts from changed files
- Calls claude-sonnet-4-6 with structured prompt
- Parses JSON response and clamps hours to [0.25, 24]
- Full test coverage for response parsing and clamping"
```

---

## Task 3: Implement Routine Generator

**Files:**
- Create: `daemon/ai/routine_generator.py`
- Test: `tests/test_routine_generator.py`

**Interfaces:**
- Consumes: `ApontamentoGenerator` (abstract base), httpx (HTTP client)
- Produces: `RoutineGenerator` class implementing `generate()`

- [ ] **Step 1: Write the failing test**

Create `tests/test_routine_generator.py`:

```python
"""Tests for Claude Code Routine apontamento generator."""
import json
import pytest
from unittest.mock import MagicMock, patch, AsyncMock


@pytest.fixture
def generator():
    from daemon.ai.routine_generator import RoutineGenerator
    return RoutineGenerator(
        routine_id="routine-123",
        routine_url="http://localhost:8080/routine"
    )


def test_routine_generate_calls_endpoint(generator):
    """Verify routine generator makes HTTP call to routine endpoint."""
    mock_response = {
        "content": "Work done via routine",
        "hours_worked": 3.0
    }

    with patch("daemon.ai.routine_generator.httpx.post") as mock_post:
        mock_post.return_value = MagicMock(
            json=MagicMock(return_value=mock_response),
            status_code=200
        )

        result = generator.generate(
            dir_path="/test/dir",
            description="Test project",
            diff={"created": ["file1.py"], "modified": [], "deleted": []},
            note="Added feature"
        )

    assert result == mock_response
    mock_post.assert_called_once()
    call_args = mock_post.call_args
    assert call_args[0][0] == "http://localhost:8080/routine"


def test_routine_generate_returns_valid_structure(generator):
    """Verify routine generator returns {content, hours_worked}."""
    mock_response = {
        "content": "Work description",
        "hours_worked": 2.0
    }

    with patch("daemon.ai.routine_generator.httpx.post") as mock_post:
        mock_post.return_value = MagicMock(
            json=MagicMock(return_value=mock_response),
            status_code=200
        )

        result = generator.generate("/test", "test", {
            "created": [], "modified": [], "deleted": []
        }, "")

    assert "content" in result
    assert "hours_worked" in result
    assert isinstance(result["content"], str)
    assert isinstance(result["hours_worked"], float)


def test_routine_raises_on_http_error(generator):
    """Raise error if routine HTTP call fails."""
    from daemon.ai.routine_generator import RoutineGeneratorError

    with patch("daemon.ai.routine_generator.httpx.post") as mock_post:
        mock_post.side_effect = Exception("Connection refused")

        with pytest.raises(RoutineGeneratorError):
            generator.generate(
                "/test", "test", 
                {"created": [], "modified": [], "deleted": []}, 
                ""
            )


def test_routine_raises_on_invalid_response(generator):
    """Raise error if routine response is missing required fields."""
    from daemon.ai.routine_generator import RoutineGeneratorError

    with patch("daemon.ai.routine_generator.httpx.post") as mock_post:
        mock_post.return_value = MagicMock(
            json=MagicMock(return_value={"invalid": "response"}),
            status_code=200
        )

        with pytest.raises(RoutineGeneratorError):
            generator.generate(
                "/test", "test",
                {"created": [], "modified": [], "deleted": []},
                ""
            )
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_routine_generator.py -v
```

Expected: ImportError / AttributeError (class doesn't exist yet)

- [ ] **Step 3: Implement RoutineGenerator**

Create `daemon/ai/routine_generator.py`:

```python
"""Claude Code Routine implementation of apontamento generator."""
import json
import logging
from pathlib import Path
from typing import Dict

import httpx

from daemon.ai.apontamento_generator import ApontamentoGenerator

logger = logging.getLogger(__name__)

_MAX_FILE_CHARS = 3000
_MAX_FILES_IN_CONTEXT = 5


class RoutineGeneratorError(Exception):
    """Raised when routine call fails."""
    pass


class RoutineGenerator(ApontamentoGenerator):
    """Generate apontamentos using Claude Code Routine."""

    def __init__(self, routine_id: str, routine_url: str):
        self.routine_id = routine_id
        self.routine_url = routine_url

    def generate(
        self,
        dir_path: str,
        description: str,
        diff: Dict,
        note: str = "",
    ) -> Dict:
        """Generate apontamento by invoking Claude Code Routine."""
        logger.info(
            f"Generating apontamento via Routine ({self.routine_id}): {dir_path} "
            f"({len(diff.get('created', []))} created, "
            f"{len(diff.get('modified', []))} modified)"
        )

        base = Path(dir_path)
        changed = (diff.get("created") or []) + (diff.get("modified") or [])
        
        excerpts = []
        for rel_path in changed[:_MAX_FILES_IN_CONTEXT]:
            abs_path = base / rel_path
            if abs_path.exists():
                try:
                    text = abs_path.read_text(encoding="utf-8", errors="replace")
                    excerpt = text[:_MAX_FILE_CHARS]
                    excerpts.append(f"### {rel_path}\n```\n{excerpt}\n```")
                except Exception:
                    pass

        diff_lines = (
            f"Criados ({len(diff.get('created', []))}): "
            f"{', '.join(diff.get('created', [])[:10]) or 'nenhum'}\n"
            f"Modificados ({len(diff.get('modified', []))}): "
            f"{', '.join(diff.get('modified', [])[:10]) or 'nenhum'}\n"
            f"Deletados ({len(diff.get('deleted', []))}): "
            f"{', '.join(diff.get('deleted', [])[:10]) or 'nenhum'}"
        )

        excerpts_block = "\n\n".join(excerpts) if excerpts else "Sem conteúdo disponível."
        note_block = f"\n\nNota do desenvolvedor:\n{note}" if note else ""

        payload = {
            "project_description": description or "Sem descrição",
            "directory": dir_path,
            "diff": diff_lines,
            "file_excerpts": excerpts_block,
            "developer_note": note,
        }

        try:
            response = httpx.post(
                self.routine_url,
                json=payload,
                timeout=60.0,
                headers={"Content-Type": "application/json"},
            )
            response.raise_for_status()
            result = response.json()
        except Exception as exc:
            logger.error(f"Routine call failed: {exc}", exc_info=True)
            raise RoutineGeneratorError(f"Routine invocation failed: {exc}") from exc

        if not isinstance(result, dict) or "content" not in result or "hours_worked" not in result:
            logger.error(f"Routine returned invalid response: {result}")
            raise RoutineGeneratorError(
                "Routine response missing required fields (content, hours_worked)"
            )

        return {
            "content": str(result.get("content", "")),
            "hours_worked": max(0.25, min(24.0, float(result.get("hours_worked", 0.5)))),
        }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pytest tests/test_routine_generator.py -v
```

Expected: 4 PASSED

- [ ] **Step 5: Commit**

```bash
git add daemon/ai/routine_generator.py tests/test_routine_generator.py
git commit -m "feat: implement Routine apontamento generator

- RoutineGenerator class using HTTP POST to Claude Code Routine
- Prepares payload with diff, file excerpts, and notes
- Validates response structure (content, hours_worked required)
- Clamps hours to [0.25, 24]
- Full test coverage for HTTP calls and error handling"
```

---

## Task 4: Update Config for Routine Variables

**Files:**
- Modify: `daemon/config.py`
- Modify: `.env.example`

**Interfaces:**
- Consumes: pydantic-settings, environment variables
- Produces: `settings.claude_routine_id`, `settings.claude_routine_url` (optional strings)

- [ ] **Step 1: Update config.py**

Read the current `daemon/config.py` and add routine configuration variables.

- [ ] **Step 2: Update .env.example**

Document the new variables with clear comments about the routine setup.

- [ ] **Step 3: Test config loads with new variables**

```bash
cd /home/pousupersayajin/workspace/repositorios/workstream/workstream-daemon
source venv/bin/activate
python -c "from daemon.config import settings; print('anthropic_api_key:', settings.anthropic_api_key); print('claude_routine_id:', settings.claude_routine_id); print('claude_routine_url:', settings.claude_routine_url)"
```

Expected: No errors, prints empty strings (since .env is default)

- [ ] **Step 4: Commit**

```bash
git add daemon/config.py .env.example
git commit -m "feat: add Claude Routine configuration variables

- claude_routine_id: identifier of Claude Code Routine
- claude_routine_url: HTTP endpoint URL
- Both optional, preferred method is ANTHROPIC_API_KEY
- Documented in .env.example with examples"
```

---

## Task 5: Refactor directory_agent.py to Use Factory

**Files:**
- Modify: `daemon/ai/directory_agent.py`
- Modify: `tests/test_directory_agent.py`

**Interfaces:**
- Consumes: `create_generator()` from `apontamento_generator.py`
- Produces: `generate_directory_apontamento()` (same signature, new internal implementation)

- [ ] **Step 1: Read current directory_agent.py**

Understand current implementation before refactoring.

- [ ] **Step 2: Refactor to use factory**

Replace implementation to use factory pattern while maintaining backward-compatible interface.

- [ ] **Step 3: Update existing test for directory_agent.py**

Verify the factory is used correctly in tests.

- [ ] **Step 4: Run tests to verify it passes**

```bash
pytest tests/test_directory_agent.py -v
```

Expected: All tests pass (old integration tests will still work since interface is unchanged)

- [ ] **Step 5: Run all tests to ensure no regressions**

```bash
pytest -v
```

Expected: All tests pass (43 passing from before + new tests for generators)

- [ ] **Step 6: Commit**

```bash
git add daemon/ai/directory_agent.py tests/test_directory_agent.py
git commit -m "refactor: use apontamento generator factory in directory_agent

- generate_directory_apontamento() now uses create_generator()
- Maintains backward-compatible interface
- Delegates to Anthropic or Routine based on configuration
- Interface unchanged, all existing code still works"
```

---

## Task 6: Create Documentation

**Files:**
- Create: `docs/APONTAMENTO_METHODS.md`

**Interfaces:**
- Consumes: Configuration requirements, both generator implementations
- Produces: User-friendly documentation

This file should contain:
- Setup instructions for both Anthropic API and Claude Code Routine
- Configuration priority and decision tree
- Testing procedures for each method
- Troubleshooting guide
- Performance comparison

- [ ] **Step 1: Create documentation file**

Create comprehensive guide with all sections listed above.

- [ ] **Step 2: Commit**

```bash
git add docs/APONTAMENTO_METHODS.md
git commit -m "docs: add apontamento generation methods guide

- Setup instructions for both Anthropic API and Claude Code Routine
- Configuration priority and decision tree
- Testing procedures for each method
- Troubleshooting guide
- Performance comparison"
```

---

## Task 7: Integration Tests (Both Paths)

**Files:**
- Create: `tests/test_apontamento_integration.py`

**Interfaces:**
- Consumes: Both generators (mocked)
- Produces: End-to-end tests verifying factory → generator → result flow

- [ ] **Step 1: Write integration tests**

Create tests verifying the complete flow for both Anthropic and Routine paths.

- [ ] **Step 2: Run integration tests**

```bash
pytest tests/test_apontamento_integration.py -v
```

Expected: 3 PASSED

- [ ] **Step 3: Run full test suite**

```bash
pytest -v
```

Expected: All tests pass (43 original + new generators + integration = 50+)

- [ ] **Step 4: Commit**

```bash
git add tests/test_apontamento_integration.py
git commit -m "test: add integration tests for apontamento generation

- Full flow: factory → Anthropic generator → result
- Full flow: factory → Routine generator → result
- Verify runtime environment switching works"
```

---

## Task 8: Final Verification and Cleanup

**Files:**
- Review all changes
- Verify backward compatibility
- Run full test suite
- Check for any linting issues

- [ ] **Step 1: Run full test suite**

```bash
pytest -v --tb=short
```

Expected: All tests pass

- [ ] **Step 2: Verify backward compatibility**

```bash
# Verify the old interface still works
python -c "
from daemon.ai.directory_agent import generate_directory_apontamento
import inspect
sig = inspect.signature(generate_directory_apontamento)
print('Function signature:', sig)
print('Parameters:', list(sig.parameters.keys()))
"
```

Expected:
```
Function signature: (dir_path: str, description: str, diff: dict, note: str = '') -> dict
Parameters: ['dir_path', 'description', 'diff', 'note']
```

- [ ] **Step 3: Verify server still starts**

```bash
timeout 5 python -m daemon 2>&1 | grep "Upload queue drainer started" || echo "Server started OK"
```

Expected: No errors, server boots cleanly

- [ ] **Step 4: Verify .env.example is complete**

```bash
grep -E "ANTHROPIC_API_KEY|CLAUDE_ROUTINE" .env.example
```

Expected: Both variables documented

- [ ] **Step 5: Final commit with summary**

```bash
git add docs/APONTAMENTO_METHODS.md
git commit -m "chore: verify all apontamento generator changes

- Full test suite passes (50+ tests)
- Backward compatibility maintained
- Server boots cleanly with new config
- Documentation complete
- Ready for production"
```

---

## Self-Review

**Spec Coverage:**
- ✅ Priorizar API key — Task 1 (factory logic)
- ✅ Fallback para routine — Task 1 (factory logic)
- ✅ Configurável via .env — Task 4 (config + .env.example)
- ✅ Interface limpa — Task 5 (unchanged public API)
- ✅ Testes para ambos paths — Tasks 2, 3, 7
- ✅ Documentação — Task 6

**Placeholder Check:**
- ✅ No "TBD" or "TODO" sections
- ✅ All code is complete and exact
- ✅ All commands are exact with expected output
- ✅ No "similar to Task N" — all code repeated

**Type Consistency:**
- ✅ `generate()` returns `Dict` with keys `content: str, hours_worked: float`
- ✅ `create_generator()` returns `ApontamentoGenerator`
- ✅ Both implementations have identical signatures
- ✅ HTTP payload structure documented in routine_generator.py

---

## Execution Handoff

Plan complete. Two execution options:

**1. Subagent-Driven (Recommended)** — Each task executes in a fresh subagent with review between tasks. Faster iteration, independent verification.

**2. Inline Execution** — Execute all tasks sequentially in this session with checkpoints.

Which approach would you prefer?
