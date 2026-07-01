# Workstream Daemon

Agente Python que captura screenshots automaticamente, redada dados sensíveis, e faz upload para o Supabase.

## Features

- ✅ Captura automática de screenshots (cada 30s, configurável)
- ✅ Redação de dados sensíveis (senhas, JWT, API keys, CPF, cartão de crédito)
- ✅ Upload robusto com retry automático (1s → 2s → 4s backoff)
- ✅ Persistência de fila em SQLite (recuperação após restart)
- ✅ Controle remoto via Supabase Realtime (pausar/parar daemon)
- ✅ Análise automática com Claude AI (diretórios e diffs)
- ✅ Logging estruturado com contexto
- ✅ Snapshot e diff de diretórios (monitorar alterações em tempo real)

## Setup Rápido

### 1. Pré-requisitos

- Python >= 3.10
- pip ou uv

### 2. Instalar dependências

```bash
cd workstream-daemon
python -m venv venv
source venv/bin/activate  # ou venv\Scripts\activate no Windows
pip install -e .
```

### 3. Configurar credenciais

```bash
cp .env.example .env
# Editar .env com suas credenciais Supabase e Anthropic
```

Variáveis necessárias:

```env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-chave-secreta
ANTHROPIC_API_KEY=sk-ant-seu-token
PORT=7432  # porta local (padrão)
SCREENSHOT_INTERVAL_SECONDS=30  # intervalo de captura
```

### 4. Rodar o daemon

```bash
python -m daemon
```

Esperado:

```
2024-01-01 12:00:00 [INFO] daemon.server: Supabase credentials valid
2024-01-01 12:00:00 [INFO] daemon.server: Upload queue drainer started
2024-01-01 12:00:00 [INFO] uvicorn: Uvicorn running on http://127.0.0.1:7432
```

### 5. Testar

```bash
curl http://localhost:7432/status
```

Resposta esperada:

```json
{
  "running": true,
  "version": "0.1.0",
  "active_session": null
}
```

## Como funciona

### Loop Principal

1. **Frontend** (workstream-connect) inicia uma sessão → `POST /session/start`
2. **Daemon** captura snapshots de diretórios monitorados
3. **Daemon** inicia loop de screenshots (a cada 30s)
4. Cada screenshot é:
   - Capturado via `mss` (multi-monitor)
   - Redado (senhas, tokens, CPF removidas)
   - Enfileirado em SQLite local
5. **Queue drainer** processa a fila em background:
   - Envia para Supabase Storage
   - Registra metadados em `screenshots` table
   - Retry automático em falhas
6. **Frontend** para sessão → `POST /session/stop`
7. **Daemon** gera apontamentos via Claude AI (análise de diffs)
8. Resultado enviado para frontend via WebSocket

### Controle Remoto

O daemon escuta mudanças em `capture_sessions` via Supabase Realtime:

- Frontend pausar sessão → `capture_sessions.status = 'paused'` → daemon para captura
- Frontend resumir sessão → `capture_sessions.status = 'active'` → daemon retoma

Fallback: se Realtime falhar, daemon continua por HTTP (sem controle remoto).

## Endpoints HTTP

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/status` | Status do daemon |
| `GET` | `/directories` | Listar diretórios monitorados |
| `POST` | `/directories` | Registrar novo diretório |
| `PUT` | `/directories/{id}` | Atualizar descrição |
| `DELETE` | `/directories/{id}` | Remover diretório |
| `POST` | `/session/start` | Iniciar captura |
| `POST` | `/session/stop` | Parar captura e gerar apontamentos |
| `POST` | `/session/pause` | Pausar captura |
| `POST` | `/session/resume` | Retomar captura |

## Redação de Dados Sensíveis

Padrões automaticamente redados (substituídos por `\x00`):

- **JWT:** `eyJ...eyJ...` → removido
- **Senhas:** `password: ****` → removido
- **API Keys:** `api_key: sk-...` → removido
- **Tokens:** `token: Bearer ...` → removido
- **CPF:** `123.456.789-00` → removido
- **CNPJ:** `11.222.333/0001-81` → removido
- **Cartão:** `4532 1111 2222 3333` → removido

## Fila e Retry

Uploads que falham são automaticamente retentados:

- **Armazenamento:** SQLite em `~/.workstream-daemon/upload_queue.db`
- **Backoff:** 1s, 2s, 4s (exponencial)
- **Máximo de tentativas:** 3
- **Persistência:** fila sobrevive a restarts do daemon

Exemplo: upload falha → aguarda 1s → retry (falha) → aguarda 2s → retry (sucesso) → removido da fila.

## Configuração Avançada

### Mudar intervalo de captura

```bash
SCREENSHOT_INTERVAL_SECONDS=60 python -m daemon
```

### Diretório de dados personalizado

```bash
DATA_DIR=/tmp/workstream-daemon python -m daemon
```

### Rodar em background (Linux/Mac)

```bash
nohup python -m daemon > daemon.log 2>&1 &
```

### Debugar com logs detalhados

```bash
LOGLEVEL=DEBUG python -m daemon
```

## Desenvolvimento

### Rodar testes

```bash
pytest -v
```

### Com coverage

```bash
pytest --cov=daemon
```

### Testes específicos

```bash
pytest tests/test_redactor.py -v
pytest tests/test_queue.py -v
```

## Troubleshooting

### "Supabase credentials invalid"

Verificar:
- `SUPABASE_URL` correto (não tem `.co.uk` no final)
- `SUPABASE_SERVICE_ROLE_KEY` é a chave **secreta**, não a anon key
- Chave não expirou no painel Supabase

### "No active session" no status

Esperado! Significa que nenhuma sessão está em execução. Use o frontend para iniciar uma.

### "Upload failed: RuntimeError"

Possíveis causas:
- Supabase Storage está cheio
- Permissões RLS bloqueando inserts
- Network error (verifique internet)

O daemon continuará tentando (até 3 vezes).

### Daemon não responde a pausas do frontend

Se Realtime estiver desabilitado, pausas via HTTP/API ainda funcionam (sem Realtime).

Verificar logs: `LOGLEVEL=DEBUG python -m daemon`

## Arquitetura

```
daemon/
├── server.py                  # FastAPI + endpoints + screenshot loop
├── config.py                  # Configurações via .env
├── logging_setup.py           # Logging estruturado
├── realtime.py                # Listener Supabase Realtime
├── capture/
│   ├── screenshot.py          # Captura via mss
│   ├── redactor.py            # Redação de dados sensíveis
│   ├── uploader.py            # Upload para Supabase
│   └── queue.py               # Fila persistida com retry
├── dirs/
│   ├── registry.py            # JSON registry de diretórios
│   └── watcher.py             # Snapshot + diff
└── ai/
    └── directory_agent.py     # Análise com Claude
```

## Performance

- **Captura:** ~100-200ms (1920x1080)
- **Redação:** ~50-100ms (regex)
- **Upload:** ~500ms-2s (depende de conexão)
- **Memória:** ~50-100MB em idle, ~200MB durante captura

## Limitações

- Suporta apenas captura de **todos** os monitores (não seletivo)
- Diretórios monitorados não suportam wildcard (apenas paths completos)
- Redação é **irreversível** (por design, para segurança)

## Próximos passos

- [ ] Suporte a múltiplas máquinas (cloud daemon pool)
- [ ] Compressão JPEG variável
- [ ] Configuração via UI
- [ ] Testes de carga (stress testing)

## Licença

Parte do projeto Marco (workstream).
