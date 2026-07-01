# Design: Screenshot-to-Claude Routine Integration

**Data:** 2026-06-30  
**Status:** Aprovado — pronto para plano de implementação

## Visão geral

Quando o usuário finaliza uma gravação, o frontend exibe uma tela de pré-envio com thumbnails das screenshots capturadas, um campo de contexto livre e um seletor das tarefas feitas no dia. Ao confirmar, o daemon dispara a geração multimodal: para `AnthropicGenerator`, as screenshots são enviadas como blocos de imagem base64 na chamada à API; para `RoutineGenerator`, as signed URLs são incluídas no texto da routine. O usuário então revisa o resultado no componente existente `DaemonDraftReview`.

---

## Fluxo: antes vs. depois

### Antes (atual)
```
Stop → POST /session/stop → IA inline → DaemonDraftReview
```

### Depois
```
Stop → POST /session/stop (sem IA)
     → DaemonSessionReview (galeria + contexto + tasks)
     → usuário confirma
     → POST /session/generate (IA com screenshots)
     → DaemonDraftReview
```

---

## Mudanças no backend (workstream-daemon)

### 1. Migrar worktree para main

Os arquivos abaixo estão no worktree `feat/claude-routines-fallback` (não commitados) e precisam ser copiados para `workstream-daemon/daemon/ai/`:

- `apontamento_generator.py` — abstract base + `build_generation_context` + `coerce_result` + `create_generator()`
- `anthropic_generator.py` — `AnthropicGenerator`
- `routine_generator.py` — `RoutineGenerator`
- `directory_agent.py` — wrapper fino que chama `create_generator().generate(...)`

O `directory_agent.py` atual do main é substituído pela versão do worktree.

### 2. Adicionar suporte a screenshots nos generators

Assinatura nova do método abstrato:

```python
def generate(
    self,
    dir_path: str,
    description: str,
    diff: dict,
    note: str = "",
    screenshots: list[dict] = [],   # lista de {storage_path, signed_url, captured_at, bytes?}
) -> dict:
```

**`AnthropicGenerator.generate()`**  
Constrói mensagem multimodal. Antes do bloco de texto, adiciona até 20 blocos de imagem:

```python
content = []
for sc in screenshots[:20]:
    if sc.get("bytes"):
        content.append({
            "type": "image",
            "source": {"type": "base64", "media_type": "image/jpeg",
                       "data": base64.b64encode(sc["bytes"]).decode()},
        })
content.append({"type": "text", "text": user_text})

response = client.messages.create(
    model="claude-sonnet-4-6",
    messages=[{"role": "user", "content": content}],
    ...
)
```

**Nota:** análise visual real exige `ANTHROPIC_API_KEY` válida. Com `sk-ant-test` (env atual), o fallback é `RoutineGenerator`.

**`RoutineGenerator.generate()`**  
Adiciona lista de signed URLs ao texto enviado à routine:

```python
if screenshots:
    url_list = "\n".join(
        f"- {sc['captured_at']}: {sc['signed_url']}"
        for sc in screenshots[:20]
    )
    text += f"\n\nScreenshots da sessão ({len(screenshots)} capturas):\n{url_list}"
```

### 3. Novo utilitário: `daemon/capture/screenshot_fetcher.py`

Duas funções:

```python
def fetch_session_screenshots(session_id: str) -> list[dict]:
    """Busca metadados de screenshots do Supabase e gera signed URLs (60min)."""
    # SELECT * FROM screenshots WHERE session_id = ? ORDER BY captured_at
    # Gera signed URL via supabase.storage.from_("screenshots").create_signed_url(path, 3600)
    # Retorna lista de {id, storage_path, signed_url, captured_at}

def download_screenshot_bytes(storage_path: str) -> bytes:
    """Baixa o JPEG do Supabase Storage para envio multimodal."""
    # supabase.storage.from_("screenshots").download(storage_path)
```

### 4. Mudanças em `server.py`

**`POST /session/stop`** — para de gravar, retorna diffs + screenshots SEM chamar IA:

```python
# Resposta nova
{
    "ok": True,
    "dirs": [
        {"dir_id": ..., "path": ..., "description": ..., "diff": {...}}
    ],
    "screenshots": [
        {"id": ..., "storage_path": ..., "signed_url": ..., "captured_at": ...}
    ]
}
```

**Novo `POST /session/generate`** — recebe contexto do usuário, executa IA:

```python
# Body
{
    "session_id": str,
    "dir_notes": {"<dir_id>": "nota opcional"},
    "screenshot_ids": ["<id>", ...],          # subset a usar
    "linked_task_context": str                 # texto das tarefas linkadas
}

# Resposta (mesmo shape que results do /session/stop antigo)
{
    "ok": True,
    "results": [
        {
            "dir_id": ..., "path": ..., "description": ..., "diff": {...},
            "draft": {
                "content": ..., "hours_worked": ...,
                # se routine:
                "type": "routine_fire",
                "claude_code_session_id": ...,
                "claude_code_session_url": ...
            }
        }
    ]
}
```

O endpoint:
1. Busca todos os screenshots da sessão via `fetch_session_screenshots`
2. Filtra por `screenshot_ids` (se passado; se vazio, usa todos)
3. Baixa bytes dos screenshots (para `AnthropicGenerator`)
4. Para cada dir com mudanças, chama `generate_directory_apontamento(dir_path, description, diff, note, screenshots)`
5. Inclui `linked_task_context` no note se presente

---

## Mudanças no frontend (workstream-connect)

### 1. Novo componente `DaemonSessionReview`

`src/components/DaemonSessionReview.tsx`

Props:
```typescript
type Props = {
  sessionId: string;
  dirs: DirectoryDiff[];          // diffs por diretório
  screenshots: SessionScreenshot[]; // {id, signed_url, captured_at}
  userId: string;
  orgId: string;
  onSubmit: (payload: GeneratePayload) => Promise<void>;
  onDiscard: () => void;
};
```

UI:
- **Resumo dos diffs**: lista de diretórios com contagem de arquivos alterados
- **Galeria de screenshots**: grid de `<img src={signed_url}>` com `captured_at` como legenda; thumbnails 120×90px; clique para ampliar (lightbox simples)
- **Contexto livre**: `<textarea>` com placeholder "Adicionar contexto sobre o que foi feito..."
- **Task linker**: busca `getApontamentoSummaries(userId)` do dia de hoje (`date = today`), lista com checkboxes. Ao marcar, o `content` do apontamento é incluído no payload como `linked_task_context`
- **Botão "Enviar para Claude"**: desabilitado durante loading
- **Botão "Descartar"**: chama `onDiscard`

### 2. Atualização do dashboard (`_authenticated.dashboard.tsx`)

**`handleStopConfirm()`** — após o POST `/session/stop`:

```typescript
// Antes
const data = await fetch(`/session/stop`, ...).json()
setDaemonDrafts(data.results ?? [])

// Depois
const data = await fetch(`/session/stop`, ...).json()
if (data.dirs?.length > 0) {
    setDaemonSession({ dirs: data.dirs, screenshots: data.screenshots ?? [] })
} else {
    triggerGenerateReport(sessionId)
}
```

**Novo handler `handleSessionSubmit(payload)`** — chamado por `DaemonSessionReview.onSubmit`:

```typescript
const resp = await fetch(`${DAEMON_URL}/session/generate`, {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId, ...payload }),
})
const data = await resp.json()
setDaemonSession(null)
setDaemonDrafts(data.results ?? [])
```

Estado novo no componente:
```typescript
const [daemonSession, setDaemonSession] = useState<DaemonSession | null>(null)
```

Renderização condicional:
```typescript
{daemonSession && (
    <DaemonSessionReview
        {...daemonSession}
        sessionId={sessionId}
        userId={user.id}
        orgId={orgId}
        onSubmit={handleSessionSubmit}
        onDiscard={() => setDaemonSession(null)}
    />
)}
{daemonDrafts.length > 0 && (
    <DaemonDraftReview ... />
)}
```

---

## Tratamento de erros

| Situação | Comportamento |
|---|---|
| Supabase sem screenshots (sessão nova / falha de upload) | `/session/stop` retorna `screenshots: []`; galeria fica vazia mas fluxo continua |
| Download de screenshot falha | Log + skip; imagem não incluída no payload multimodal |
| `/session/generate` retorna erro | Frontend exibe mensagem de erro inline em `DaemonSessionReview`; usuário pode tentar novamente |
| `RoutineGenerator` falha | Erro propagado como 500; frontend trata igual erro de geração normal |
| `ANTHROPIC_API_KEY` inválida | `AnthropicGenerator` levanta exceção; `create_generator()` não faz fallback automático — requer configuração correta |

---

## Fora de escopo

- Persistir screenshots linkadas a apontamentos (relação many-to-many) — pode ser future work
- Preview em tela cheia das screenshots (lightbox completo) — thumbnails simples são suficientes
- Seleção parcial de screenshots para envio — todas as screenshots da sessão são enviadas por padrão
- Paginação da lista de tasks — assume que o usuário tem ≤20 apontamentos no dia
