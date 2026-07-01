# Guia Completo — Setup do Workstream Daemon

> Tempo estimado: **5-10 minutos**

---

## Passo 1: Pré-requisitos

Verifique se você tem:

```bash
python --version  # >= 3.10
git --version
```

Se não tiver Python 3.10+, baixe em https://www.python.org/downloads/

---

## Passo 2: Clonar/Abrir repositório

```bash
cd /seu/caminho/workstream-daemon
# ou:
cd ~/workspace/repositorios/workstream/workstream-daemon
```

---

## Passo 3: Criar ambiente virtual

### Linux / Mac

```bash
python3 -m venv venv
source venv/bin/activate
```

### Windows

```bash
python -m venv venv
venv\Scripts\activate
```

Esperado: seu terminal agora mostra `(venv) $`

---

## Passo 4: Instalar dependências

```bash
pip install -e .
```

Isto instala:
- `fastapi>=0.111.0` — servidor web
- `uvicorn[standard]>=0.29.0` — ASGI server
- `mss>=9.0.1` — captura de screenshots
- `Pillow>=10.3.0` — processamento de imagens
- `supabase>=2.5.0` — cliente Supabase
- `anthropic>=0.27.0` — cliente Claude AI
- `pydantic-settings>=2.2.0` — validação de config

Leva ~30s-1min.

---

## Passo 5: Configurar credenciais

### 5.1 Copiar template

```bash
cp .env.example .env
```

### 5.2 Preencher `.env`

Abrir `.env` em seu editor e preencher:

```env
# Supabase (https://app.supabase.com/project/[seu-id]/settings/api)
SUPABASE_URL=https://seu-projeto-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Anthropic (https://console.anthropic.com/account/keys)
ANTHROPIC_API_KEY=sk-ant-v0-...

# (Opcionais — padrões são OK)
PORT=7432
SCREENSHOT_INTERVAL_SECONDS=30
```

### 5.3 Como achar as chaves

**Supabase:**
1. Ir a https://app.supabase.com
2. Selecionar seu projeto
3. Clicar em **Settings** (ícone de engrenagem) → **API**
4. Copiar **Project URL** → `SUPABASE_URL`
5. Copiar **Service Role Key** (não a `anon` key!) → `SUPABASE_SERVICE_ROLE_KEY`

**Anthropic:**
1. Ir a https://console.anthropic.com/account/keys
2. Criar ou copiar uma chave
3. Colar em `ANTHROPIC_API_KEY`

> ⚠️ **NUNCA commit o `.env`** para git. Ele já está em `.gitignore`.

---

## Passo 6: Testar daemon

### Iniciar

```bash
python -m daemon
```

Esperado (deve aparecer em 2-3 segundos):

```
2026-01-01 12:00:00 [INFO] daemon.server: Supabase credentials valid
2026-01-01 12:00:00 [INFO] daemon.server: Upload queue drainer started
2026-01-01 12:00:00 [INFO] uvicorn: Uvicorn running on http://127.0.0.1:7432
```

Se aparecer error, ir para **Troubleshooting** abaixo.

### Testar endpoint

Em **outro terminal** (sem sair da venv):

```bash
curl http://localhost:7432/status
```

Esperado:

```json
{
  "running": true,
  "version": "0.1.0",
  "active_session": null
}
```

Se funcionar, **parar o daemon** com `Ctrl+C` no primeiro terminal.

---

## Passo 7 (Opcionaldo): Rodar testes

```bash
pytest -v
```

Esperado: **42 passed** (ou similar)

---

## Próximos passos

### Para desenvolvimento

Abrir `daemon/server.py` e começar. O servidor recarrega automaticamente com mudanças (em desenvolvimento).

### Para produção

Rodar em background (ver seção "Background" abaixo).

### Para integração com o frontend

1. Ter o daemon rodando em `localhost:7432`
2. O frontend (workstream-connect) detectará automaticamente
3. Ir a `/dashboard` e clicar em "Iniciar sessão" → daemon começa a capturar

---

## Rodar em Background

### Linux / Mac (via `nohup`)

```bash
nohup python -m daemon > daemon.log 2>&1 &
echo $! > daemon.pid
# Para ver logs:
tail -f daemon.log
# Para parar:
kill $(cat daemon.pid)
```

### Linux (via `systemd`)

Criar arquivo `/etc/systemd/system/workstream-daemon.service`:

```ini
[Unit]
Description=Workstream Daemon
After=network.target

[Service]
Type=simple
User=seu-usuario
WorkingDirectory=/caminho/para/workstream-daemon
ExecStart=/caminho/para/workstream-daemon/venv/bin/python -m daemon
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Depois:

```bash
sudo systemctl daemon-reload
sudo systemctl enable workstream-daemon
sudo systemctl start workstream-daemon
sudo systemctl status workstream-daemon
```

### Mac (via `launchd`)

Criar `~/Library/LaunchAgents/com.workstream.daemon.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.workstream.daemon</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/python3</string>
        <string>-m</string>
        <string>daemon</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/seu/caminho/workstream-daemon</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
```

Depois:

```bash
launchctl load ~/Library/LaunchAgents/com.workstream.daemon.plist
```

### Windows (via Task Scheduler)

1. Abrir **Task Scheduler**
2. Criar **Tarefa Básica**
3. Nome: "Workstream Daemon"
4. Trigger: "At startup"
5. Action: 
   - Program: `C:\Users\seu-usuario\path\to\venv\Scripts\python.exe`
   - Arguments: `-m daemon`
   - Start in: `C:\Users\seu-usuario\path\to\workstream-daemon`
6. OK

---

## Troubleshooting

### Erro: `ModuleNotFoundError: No module named 'daemon'`

→ Certificar que você rodou `pip install -e .` dentro da venv ativada

```bash
source venv/bin/activate
pip install -e .
python -m daemon
```

### Erro: `ModuleNotFoundError: No module named 'supabase'`

→ Dependências não instaladas. Rodar novamente:

```bash
pip install -e ".[dev]"
python -m daemon
```

### Erro: `RuntimeError: Screenshot storage upload failed`

Possíveis causas:

1. **Credenciais inválidas:** Conferir `SUPABASE_SERVICE_ROLE_KEY` em `.env`
   - Deve ser a chave **secreta**, não a anon key
   - Copiar exatamente (sem espaços)

2. **Supabase Storage não existe:** Criar bucket `screenshots`
   - Ir a https://app.supabase.com/project/[seu-id]/storage/buckets
   - Clicar em "Create bucket"
   - Nome: `screenshots`
   - Visibility: Private (RLS será aplicada)

3. **Permissões RLS:** Conferir policies de `screenshots` bucket
   - Deve permitir insert via service_role_key

### Erro: `AuthError: Invalid API Key`

→ `ANTHROPIC_API_KEY` inválido

```bash
# Verificar em console.anthropic.com que a chave existe
cp .env.example .env
# Preencher novamente com chave correta
```

### Erro: `RuntimeError: Snapshot failed`

→ Diretório monitorado não existe ou permissões insuficientes

```bash
# Verificar:
ls -la /seu/diretorio
# Se não existir:
mkdir -p /seu/diretorio
```

### Daemon para de enviar screenshots

Possíveis causas:

1. **Supabase storage cheio** → deletar screenshots antigos
2. **Sessão foi parada** no frontend → recomeçar no dashboard
3. **Network desligado** → fila acumula, tenta quando volta online

Ver logs detalhados:

```bash
LOGLEVEL=DEBUG python -m daemon
```

### `curl: (7) Failed to connect`

→ Daemon não está rodando

```bash
python -m daemon
# Em outro terminal:
curl http://localhost:7432/status
```

### `json: invalid type response body`

→ Daemon crashed ou respondeu com erro

Ver logs do daemon (terminal onde rodou `python -m daemon`).

---

## Dicas e Boas Práticas

### 1. Manter daemon rodando

Use `systemd` (Linux) ou `launchd` (Mac) para autostart. Não deixar em terminal aberto.

### 2. Monitorar logs

```bash
LOGLEVEL=INFO python -m daemon 2>&1 | tee daemon.log
# Depois:
tail -f daemon.log
```

### 3. Testar antes de ir live

```bash
# No dashboard, iniciar sessão 30s
# Conferir que appeared em Supabase > Storage > screenshots bucket
# Depois parar sessão
# Conferir que apareceu em Apontamentos com análise IA
```

### 4. Nunca commitar `.env`

Já está em `.gitignore`, mas double-check:

```bash
git status
# Não deve aparecer .env
```

---

## Próximos passos

- Rodar dashboard em paralelo: `cd ../workstream-connect && npm run dev`
- Iniciar uma sessão no dashboard
- Conferir que daemon captura screenshots (logs no terminal)
- Parar sessão e ver apontamentos gerados
- Aproveitar! 🎉

---

**Problemas?** Conferir seção "Troubleshooting" ou abrir issue em GitHub.
