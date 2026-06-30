# Passo 20 — Agente Python

## Objetivo

Criar o agente local (`agent/`) que roda na máquina do usuário: escuta mudanças em `capture_sessions` via Supabase Realtime, captura screenshots periodicamente enquanto a sessão está `active`, faz upload automático para o Storage, atualiza `screenshot_count` no banco e interrompe capturas quando a sessão é pausada ou encerrada.

---

## Estado após o Passo 19

- `agent/` — **não existe**
- Tabela `capture_sessions` operacional (passos 18)
- Bucket `screenshots` no Storage criado (precisa ser criado se não foi — ver 20.1)
- O frontend consegue criar, pausar e encerrar sessões; o agente Python ainda não existe para capturar as telas

---

## Estrutura de pastas

```
agent/
├── main.py              ← ponto de entrada; loop principal
├── capture.py           ← lógica de captura de tela (mss)
├── redact.py            ← redação de dados sensíveis (optional, phase 2)
├── uploader.py          ← upload para Supabase Storage + update do banco
├── listener.py          ← Supabase Realtime via websocket
├── config.py            ← leitura das variáveis de ambiente
├── requirements.txt     ← dependências Python
└── .env.example         ← template de variáveis de ambiente
```

---

## Contexto técnico

**Realtime via `supabase-py`.** A biblioteca `supabase-py` expõe `RealtimeClient` para escutar `postgres_changes`. O agente se autentica com a `anon key` e faz login com as credenciais do usuário para que o JWT garanta as políticas RLS (o usuário só vê suas próprias sessões).

**Loop de captura.** Enquanto `session_status == 'active'`, o agente captura um screenshot a cada N segundos (configurável via `CAPTURE_INTERVAL_SECONDS`, padrão 30). O intervalo é configurado no `.env`.

**Realtime para controle.** O agente escuta `postgres_changes` na tabela `capture_sessions` com filtro `user_id=eq.<userId>`. Quando o status muda para `paused`, o loop de captura é pausado mas não encerrado. Quando muda para `stopped`, o loop encerra e o agente fica em `idle` aguardando nova sessão.

**Upload com path padronizado.** Cada screenshot é salvo com path `<orgId>/<userId>/<sessionId>/<timestamp>.png`. Esse path é armazenado na coluna `storage_path` da tabela `screenshots`.

**`screenshot_count` atualizado por RPC.** Após cada upload, o agente incrementa `screenshot_count` na sessão. Para evitar race conditions com a leitura + escrita direta, usa-se a função RPC `increment_screenshot_count(session_id)` no banco.

**Sem RPC extra no esquema atual.** O schema não tem essa função. Alternativamente, o UPDATE pode ser feito via `.rpc('increment_screenshot_count', { sid: sessionId })` se a função for criada, ou pode-se simplesmente fazer um SELECT do valor atual + UPDATE. Para simplicidade neste passo, usa-se a abordagem de `UPDATE ... SET screenshot_count = screenshot_count + 1` com um UPDATE direto.

**`redact.py` é fase 2.** A redação de dados sensíveis (blurs em campos de senha, dados pessoais) exige modelos de visão computacional e está fora do escopo deste passo. O módulo existe como placeholder para a próxima fase.

---

## Implementação

### 20.1 — Criar bucket `screenshots` no Supabase (se não existir)

Via Supabase Dashboard → Storage → New Bucket:
- **Nome:** `screenshots`
- **Público:** NÃO (privado — acesso via URL assinada)
- **Tamanho máximo de arquivo:** 10MB

Ou via SQL Migration:

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('screenshots', 'screenshots', false, 10485760)
ON CONFLICT (id) DO NOTHING;
```

Policy de Storage (executar no SQL Editor):

```sql
-- Usuário pode fazer upload dos seus próprios screenshots
CREATE POLICY "Usuário faz upload de screenshots"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'screenshots'
  AND auth.uid()::text = (storage.foldername(name))[2]
);

-- Usuário pode ler seus próprios screenshots
CREATE POLICY "Usuário lê seus próprios screenshots"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'screenshots'
  AND auth.uid()::text = (storage.foldername(name))[2]
);

-- Usuário pode deletar seus próprios screenshots
CREATE POLICY "Usuário deleta seus próprios screenshots"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'screenshots'
  AND auth.uid()::text = (storage.foldername(name))[2]
);
```

> O path tem formato `<orgId>/<userId>/<sessionId>/<timestamp>.png`. `storage.foldername(name)[2]` extrai o segundo segmento do path (userId). Índice 1-based no Postgres array.

---

### 20.2 — `requirements.txt`

**Arquivo:** `agent/requirements.txt`

```
supabase==2.10.0
python-dotenv==1.0.1
mss==9.0.2
Pillow==10.4.0
websockets==12.0
```

---

### 20.3 — `config.py`

**Arquivo:** `agent/config.py`

```python
import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_ANON_KEY = os.environ["SUPABASE_ANON_KEY"]
AGENT_EMAIL = os.environ["AGENT_EMAIL"]
AGENT_PASSWORD = os.environ["AGENT_PASSWORD"]
CAPTURE_INTERVAL_SECONDS = int(os.getenv("CAPTURE_INTERVAL_SECONDS", "30"))
```

---

### 20.4 — `.env.example`

**Arquivo:** `agent/.env.example`

```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
AGENT_EMAIL=seu@email.com
AGENT_PASSWORD=suasenha
CAPTURE_INTERVAL_SECONDS=30
```

---

### 20.5 — `capture.py`

**Arquivo:** `agent/capture.py`

```python
import mss
import mss.tools
from io import BytesIO
from PIL import Image


def capture_screenshot() -> bytes:
    """Captura tela principal e retorna como bytes PNG."""
    with mss.mss() as sct:
        monitor = sct.monitors[1]  # monitor principal
        screenshot = sct.grab(monitor)
        img = Image.frombytes("RGB", screenshot.size, screenshot.bgra, "raw", "BGRX")
        buf = BytesIO()
        img.save(buf, format="PNG", optimize=True)
        return buf.getvalue()
```

---

### 20.6 — `uploader.py`

**Arquivo:** `agent/uploader.py`

```python
from datetime import datetime, timezone
from supabase import Client


def upload_screenshot(
    client: Client,
    image_bytes: bytes,
    user_id: str,
    org_id: str,
    session_id: str,
) -> str:
    """
    Faz upload do screenshot e insere registro na tabela screenshots.
    Retorna o storage_path.
    """
    captured_at = datetime.now(timezone.utc)
    timestamp = captured_at.strftime("%Y%m%dT%H%M%SZ")
    storage_path = f"{org_id}/{user_id}/{session_id}/{timestamp}.png"

    # Upload para o Storage
    client.storage.from_("screenshots").upload(
        path=storage_path,
        file=image_bytes,
        file_options={"content-type": "image/png", "upsert": "false"},
    )

    # Inserir registro no banco
    client.table("screenshots").insert({
        "session_id": session_id,
        "user_id": user_id,
        "organization_id": org_id,
        "captured_at": captured_at.isoformat(),
        "storage_path": storage_path,
        "file_size_bytes": len(image_bytes),
    }).execute()

    # Incrementar screenshot_count na sessão
    client.table("capture_sessions").update(
        {"screenshot_count": client.table("capture_sessions")
            .select("screenshot_count")
            .eq("id", session_id)
            .single()
            .execute()
            .data["screenshot_count"] + 1}
    ).eq("id", session_id).execute()

    return storage_path
```

> **Alternativa mais simples para incremento:** usar `supabase.rpc("increment_screenshot_count", {"sid": session_id})` com uma função SQL `SECURITY DEFINER` no banco. Mas para evitar adicionar migração, a abordagem read-then-write funciona para uso single-agent por usuário.

---

### 20.7 — `listener.py`

**Arquivo:** `agent/listener.py`

```python
import threading
from supabase import Client


class SessionListener:
    """
    Escuta mudanças em capture_sessions para o usuário autenticado.
    Chama callbacks quando o status muda.
    """

    def __init__(self, client: Client, user_id: str):
        self._client = client
        self._user_id = user_id
        self._current_session: dict | None = None
        self._channel = None
        self._on_start_callbacks: list = []
        self._on_pause_callbacks: list = []
        self._on_resume_callbacks: list = []
        self._on_stop_callbacks: list = []

    def on_start(self, fn):
        self._on_start_callbacks.append(fn)

    def on_pause(self, fn):
        self._on_pause_callbacks.append(fn)

    def on_resume(self, fn):
        self._on_resume_callbacks.append(fn)

    def on_stop(self, fn):
        self._on_stop_callbacks.append(fn)

    def _handle_change(self, payload):
        record = payload.get("new", {})
        status = record.get("status")
        session_id = record.get("id")
        event_type = payload.get("eventType")

        if event_type == "INSERT" and status == "active":
            self._current_session = record
            for cb in self._on_start_callbacks:
                cb(session_id, record)

        elif event_type == "UPDATE":
            prev_status = (self._current_session or {}).get("status")
            self._current_session = record

            if status == "paused":
                for cb in self._on_pause_callbacks:
                    cb(session_id)
            elif status == "active" and prev_status == "paused":
                for cb in self._on_resume_callbacks:
                    cb(session_id)
            elif status == "stopped":
                for cb in self._on_stop_callbacks:
                    cb(session_id)

        elif event_type == "DELETE":
            # Sessão deletada (botão Trash no frontend)
            self._current_session = None
            for cb in self._on_stop_callbacks:
                cb(session_id)

    def start(self):
        self._channel = (
            self._client.realtime
            .channel("session-control")
            .on_postgres_changes(
                event="*",
                schema="public",
                table="capture_sessions",
                filter=f"user_id=eq.{self._user_id}",
                callback=self._handle_change,
            )
            .subscribe()
        )
```

---

### 20.8 — `main.py`

**Arquivo:** `agent/main.py`

```python
import threading
import time
import signal
import sys

from supabase import create_client
from config import (
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    AGENT_EMAIL,
    AGENT_PASSWORD,
    CAPTURE_INTERVAL_SECONDS,
)
from capture import capture_screenshot
from uploader import upload_screenshot
from listener import SessionListener


def main():
    print("[marco-agent] Iniciando...")

    client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)

    # Autenticar com credenciais do usuário
    auth_response = client.auth.sign_in_with_password({
        "email": AGENT_EMAIL,
        "password": AGENT_PASSWORD,
    })
    user = auth_response.user
    if not user:
        print("[marco-agent] Falha na autenticação. Verifique AGENT_EMAIL e AGENT_PASSWORD.")
        sys.exit(1)

    # Buscar profile para obter organization_id
    profile = (
        client.table("profiles")
        .select("id, organization_id")
        .eq("id", user.id)
        .single()
        .execute()
        .data
    )
    user_id = profile["id"]
    org_id = profile["organization_id"]

    print(f"[marco-agent] Autenticado como {AGENT_EMAIL} (org: {org_id})")

    # Estado da captura
    capturing = threading.Event()
    current_session_id: list[str | None] = [None]  # list para mutabilidade em closure

    def capture_loop():
        while True:
            capturing.wait()  # aguarda até estar ativo
            if current_session_id[0] is None:
                time.sleep(1)
                continue
            try:
                image_bytes = capture_screenshot()
                upload_screenshot(client, image_bytes, user_id, org_id, current_session_id[0])
                print(f"[marco-agent] Screenshot capturado para sessão {current_session_id[0]}")
            except Exception as e:
                print(f"[marco-agent] Erro ao capturar: {e}")
            time.sleep(CAPTURE_INTERVAL_SECONDS)

    # Callbacks do listener
    def on_start(session_id, _record):
        print(f"[marco-agent] Sessão iniciada: {session_id}")
        current_session_id[0] = session_id
        capturing.set()

    def on_pause(session_id):
        print(f"[marco-agent] Sessão pausada: {session_id}")
        capturing.clear()

    def on_resume(session_id):
        print(f"[marco-agent] Sessão retomada: {session_id}")
        capturing.set()

    def on_stop(session_id):
        print(f"[marco-agent] Sessão encerrada: {session_id}")
        capturing.clear()
        current_session_id[0] = None

    listener = SessionListener(client, user_id)
    listener.on_start(on_start)
    listener.on_pause(on_pause)
    listener.on_resume(on_resume)
    listener.on_stop(on_stop)
    listener.start()

    # Loop de captura em thread separada
    capture_thread = threading.Thread(target=capture_loop, daemon=True)
    capture_thread.start()

    # Graceful shutdown
    def shutdown(signum, frame):
        print("\n[marco-agent] Encerrando...")
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    print("[marco-agent] Aguardando sessões...")
    client.realtime.listen()  # bloqueia; processa eventos Realtime


if __name__ == "__main__":
    main()
```

---

## Como executar

```bash
cd agent
cp .env.example .env
# Editar .env com credenciais reais

pip install -r requirements.txt

python main.py
```

---

## Checklist de verificação manual

### Cenário 1 — Iniciar sessão via frontend
1. `python main.py` rodando no terminal
2. No frontend, clicar Play no dashboard
3. **Esperado:** após `CAPTURE_INTERVAL_SECONDS` segundos, log `[marco-agent] Screenshot capturado para sessão <id>` no terminal
4. Verificar no Supabase: registro em `screenshots` com `storage_path` correto; `capture_sessions.screenshot_count` incrementado

### Cenário 2 — Pausar sessão
1. Com sessão ativa e capturas ocorrendo, clicar Pause no frontend
2. **Esperado:** log `[marco-agent] Sessão pausada` no terminal; nenhum novo screenshot após isso
3. Clicar Play (retomar) → capturas reiniciam

### Cenário 3 — Encerrar sessão
1. Clicar Stop no frontend
2. **Esperado:** log `[marco-agent] Sessão encerrada` → sem mais capturas
3. `capture_sessions.status = 'stopped'`

### Cenário 4 — Restart do agente com sessão ativa
1. Iniciar sessão no frontend → matar o agente (Ctrl+C) → reiniciar agente
2. **Esperado:** agente reinicia, autentica, aguarda novos eventos — **não retoma automaticamente sessões ativas** (a sessão ativa no banco precisa ser pausada/encerrada manualmente ou o agente pode ser melhorado para buscar sessão ativa no startup)

> **Nota sobre restart:** A implementação atual não busca sessão ativa ao iniciar. Se o agente for reiniciado com uma sessão `active` no banco, ele ficará em `idle`. Uma melhoria futura seria adicionar no startup: `getActiveSession(userId)` e setar `current_session_id` e `capturing` corretamente.

---

## O que não fazer

- **Não** usar a `service_role` key no agente — o agente autentica com as credenciais do usuário; a `service_role` nunca deve estar em código client-side ou local
- **Não** capturar múltiplos monitores por padrão — `sct.monitors[1]` captura apenas o monitor principal; múltiplos monitores podem ser adicionados como configuração futura
- **Não** implementar `redact.py` neste passo — a redação de dados sensíveis é fase 2 e requer modelos de visão computacional separados
- **Não** fazer upload em background thread separada por screenshot — a captura já está em sua própria thread; um upload síncrono dentro dela é suficiente para os intervalos de 30s
- **Não** armazenar credenciais em código — sempre via `.env`, nunca hardcoded no Python

---

## Próximo Passo

**Passo 21 — Edge Function: generate-report:** criar a Edge Function que é chamada após `stopSession`, busca os screenshots não deletados, chama a API Anthropic Vision e cria o apontamento automaticamente.
