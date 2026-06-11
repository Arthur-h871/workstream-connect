# Arquitetura Screen Monitor v2

## Contexto

Refatoração completa do sistema. Stack: Supabase + React TypeScript + Anthropic SDK.

Decisões definidas:
- Multi-usuário (Supabase Auth, RLS)
- Retenção configurável de screenshots (X dias)
- Sem timelapse/vídeo

---

## Componentes

```
[Máquina do Usuário]              [Supabase Cloud]          [Anthropic]
┌─────────────────┐               ┌──────────────────┐
│  Python Agent   │  upload JPEG  │  Storage         │
│  - capture mss  │ ─────────────▶│  (já redactado)  │
│  - redact local │               │                  │      ┌────────────┐
│  - subscribe RT │ ◀── Realtime ─│  Realtime        │      │ Claude API │
│  - supabase-py  │    (commands) │  (sessions)      │ ◀────│ (vision)   │
└─────────────────┘               │                  │      └────────────┘
                                  │  PostgreSQL DB   │           ▲
[Browser]                         │  - sessions      │           │
┌─────────────────┐               │  - screenshots   │  Edge Function
│  React + TS     │  REST + RT    │  - reports       │  generate-report
│  - Start/Pause/ │ ─────────────▶│  - user_settings │ ─────────────────▶
│    Stop buttons │               │                  │
│  - galeria      │               │  Auth (email/pw) │
│  - relatórios   │               └──────────────────┘
└─────────────────┘
```

---

## Estrutura de Pastas

```
MONITORAR-2/
├── agent/                     # Python — roda na máquina do usuário
│   ├── agent.py               # entry point: loop principal + auth
│   ├── capture.py             # mss.MSS() → PIL.Image (memória)
│   ├── redactor.py            # OCR + regex + PIL blur (ANTES do upload)
│   ├── uploader.py            # Supabase Storage upload + insert screenshots
│   ├── controller.py          # Supabase Realtime: escuta sessions changes
│   ├── config.py              # ~/.screenmonitor/config.json (token local)
│   └── requirements.txt       # mss, Pillow, supabase, pytesseract (optional)
│
├── supabase/
│   ├── migrations/
│   │   ├── 001_init.sql       # tables + indexes
│   │   └── 002_rls.sql        # Row Level Security por user_id
│   └── functions/
│       └── generate-report/
│           └── index.ts       # Edge Function: Anthropic vision → report
│
└── web/                       # React TypeScript
    ├── src/
    │   ├── pages/
    │   │   ├── Dashboard.tsx  # Start/Pause/Stop + status hoje
    │   │   ├── Sessions.tsx   # histórico de sessões
    │   │   ├── Screenshots.tsx# galeria por sessão/data
    │   │   ├── Reports.tsx    # lista + viewer de relatórios
    │   │   └── Settings.tsx   # intervalo, retenção, conta
    │   ├── components/
    │   ├── hooks/
    │   ├── lib/
    │   │   └── supabase.ts
    │   └── types/
    └── package.json
```

---

## Banco de Dados

```sql
user_settings (user_id, capture_interval_sec, retention_days, updated_at)
sessions      (id, user_id, status, started_at, paused_at, stopped_at, screenshot_count)
screenshots   (id, session_id, user_id, captured_at, storage_path, file_size_bytes)
reports       (id, user_id, session_id, date, content, status, created_at, screenshot_count)
```

Storage: bucket `screenshots` (privado), path `{user_id}/{date}/{id}.jpg`

RLS: todas as tabelas filtradas por `user_id = auth.uid()`

---

## Pipeline de Dados Sensíveis

**Regra:** imagem nunca é armazenada com dados sensíveis — redação acontece em memória antes do upload.

```
mss.grab() → PIL.Image em MEMÓRIA
    ↓
SensitiveDataRedactor.redact():
    → pytesseract.image_to_data() → palavras + bounding boxes
    → regex match: API keys, passwords, cartões, CPF, JWT, PEM
    → PIL.GaussianBlur(radius=20) nas regiões detectadas
    → (se tesseract ausente: aviso, continua sem OCR)
    ↓
PIL → JPEG bytes em memória
    ↓
Supabase Storage upload
    ↓
Insert em screenshots (metadata)
```

---

## Fluxo Start / Pause / Stop

Frontend atualiza tabela `sessions` → Agent escuta via Supabase Realtime:

- **Start**: INSERT sessions {status:'active'} → Agent inicia loop
- **Pause**: UPDATE sessions {status:'paused'} → Agent pausa screenshots
- **Stop**: UPDATE sessions {status:'stopped'} → Agent encerra
- **Gerar Relatório**: chama Edge Function → Anthropic vision → salva em reports → Realtime notifica frontend

---

## Expiração de Screenshots

pg_cron + Edge Function rodam diariamente e deletam screenshots + arquivos do Storage mais antigos que `retention_days` de cada usuário.

---

## Tecnologias

| Camada | Tecnologia |
|--------|-----------|
| Capture local | Python 3.11 + mss + Pillow + supabase-py |
| Redação sensível | pytesseract (opcional) + PIL.GaussianBlur |
| Backend | Supabase (PostgreSQL + Auth + Storage + Realtime) |
| Edge Functions | Deno + Anthropic SDK (`npm:@anthropic-ai/sdk`) |
| Frontend | React 18 + TypeScript + Tailwind + supabase-js |

---

## Páginas da Web

| Página | Rota | Função |
|--------|------|--------|
| Dashboard | `/` | Status live + Start/Pause/Stop + stats |
| Sessões | `/sessions` | Histórico de sessões |
| Screenshots | `/screenshots/:sessionId` | Galeria por sessão |
| Relatórios | `/reports` | Lista + viewer markdown |
| Configurações | `/settings` | Intervalo, retenção, conta |

---

## Status: PLANEJADO — aguardando definição de features adicionais
