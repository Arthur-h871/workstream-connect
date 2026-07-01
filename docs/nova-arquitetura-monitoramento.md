# Nova arquitetura de monitoramento: captura via navegador

Substitui o daemon Python (`workstream-daemon`, diretório `agent/`) por captura
de tela feita inteiramente no navegador, com um chat de revisão via IA para
gerar o apontamento antes do envio.

## Motivação

O daemon exigia instalação e execução local (Python + FastAPI) para observar
diretórios de trabalho e enviar screenshots/hashes para o backend. Isso
adicionava fricção de setup e uma superfície extra de manutenção (agentes por
diretório, diffing SHA256, watcher de arquivos). A nova arquitetura elimina o
daemon: a captura roda no próprio browser usando `getDisplayMedia`, sem
instalação, e o fluxo de geração de relatório é conversacional em vez de
one-shot.

## Fluxo de captura

`src/lib/screen-capture.ts` expõe `startCapture()`, que retorna um
`CaptureHandle`:

1. `addMonitor()` chama `navigator.mediaDevices.getDisplayMedia()` — o usuário
   escolhe qual tela/janela compartilhar. Cada chamada adiciona um monitor
   independente (`monitor_index` incremental), permitindo múltiplas telas na
   mesma sessão.
2. A cada `DEFAULT_INTERVAL_MS` (30s), um frame de cada monitor ativo é
   desenhado em um `<canvas>` offscreen e convertido em PNG (`captureFrame`).
3. Cada frame é enviado direto para o bucket `screenshots` do Supabase
   Storage (`{userId}/{sessionId}/{monitorIndex}/{timestamp}.png`) e uma linha
   é inserida na tabela `screenshots` (`uploadFrame`).
4. `pause()`/`resume()` suspendem o tick sem encerrar os streams;
   `stopCapture()` para o interval e libera todas as tracks de mídia.

Não há mais diffing de arquivos, watcher de diretório, nem processo local —
tudo roda na aba do navegador enquanto a sessão estiver ativa.

## Fluxo de revisão pós-sessão

Ao parar a sessão, o dashboard (`src/routes/_authenticated.dashboard.tsx`)
sempre renderiza `SessionReviewChat.tsx`, substituindo a antiga bifurcação
entre `DaemonSessionReview`/`DaemonDraftReview` e `generate-report`.

O componente tem duas fases:

- **`linking`** — usuário opcionalmente descreve contexto adicional em texto
  livre e marca tarefas pessoais/da organização relacionadas ao trabalho
  feito, com status `started`/`concluded` por tarefa. Cada toggle persiste
  imediatamente via `updatePendingTaskLinks` na coluna
  `capture_sessions.pending_task_links` (JSONB), para sobreviver a um reload
  antes do envio.
- **`chatting`** — após "Iniciar análise", o histórico de mensagens
  (`session_messages`) e o draft corrente (`content` + `hours_worked`) são
  exibidos. O usuário pode pedir ajustes em texto livre, que reabrem uma nova
  rodada de chat, ou confirmar e gerar o apontamento.

Se a sessão já tiver mensagens (`getSessionMessages`), o componente pula
direto para `chatting` ao montar — isso permite retomar uma revisão em
andamento após um refresh de página.

## Edge function `monitoramento`

`supabase/functions/monitoramento/index.ts` substitui a antiga
`generate-report`. Usa `claude-haiku-4-5-20251001` (custo/latência menores que
Sonnet, adequado para o loop de ajuste iterativo do rascunho). Autenticação via
JWT do usuário (`Authorization: Bearer`), autorização checando
`capture_sessions.user_id = auth.uid()`.

Duas actions, mesmo formato de resposta (`{ content, hours_worked }`):

- **`action: "start"`** — recebe `session_id`, `context`, `screenshot_ids`,
  `linked_tasks`. Persiste `linked_tasks` em `pending_task_links`, gera signed
  URLs (5 min) para os screenshots selecionados, monta uma mensagem inicial
  com duração da sessão + contexto + tarefas vinculadas, e chama o Haiku com
  as imagens. Se a chamada à Anthropic falhar, cai num fallback determinístico
  (duração da sessão convertida em horas, texto genérico). Grava a
  troca (`user`/`assistant`) em `session_messages`.
- **`action: "chat"`** — recebe `session_id`, `message`. Carrega todo o
  histórico de `session_messages` para a sessão, acrescenta a nova mensagem do
  usuário, chama o Haiku com o histórico completo (sem re-enviar imagens) e
  grava a nova troca. Em caso de erro na API, usa como fallback o último draft
  assistant salvo.

O prompt do sistema exige resposta em JSON puro (`{content, hours_worked}`),
parseado por `parseDraft`, que clampa `hours_worked` entre 0.25 e 24 e cai no
fallback em caso de JSON inválido.

## Schema (`20260701120000_monitoramento_prints.sql`)

Migration incremental sobre tabelas já existentes no banco remoto:

- `screenshots.monitor_index INTEGER NOT NULL DEFAULT 0` — identifica de qual
  monitor da sessão veio o frame.
- `capture_sessions.pending_task_links JSONB NOT NULL DEFAULT '[]'` —
  vínculos de tarefa persistidos antes da confirmação do apontamento.
- `session_messages` (nova tabela) — histórico de chat por sessão: `id`,
  `session_id` (FK `capture_sessions`, `ON DELETE CASCADE`), `role`
  (`user`/`assistant`), `content`, `created_at`. Índice em `session_id`. RLS
  habilitado com policy `FOR ALL` restringindo acesso a quem é dono da
  `capture_session` associada (`cs.user_id = auth.uid()`).

## O que foi removido

- `agent/` (daemon Python completo: `capture.py`, `listener.py`, `main.py`,
  `config.py`, `redact.py`, `uploader.py`, `requirements.txt`,
  `.env.example`).
- `src/components/DaemonSessionReview.tsx`, `DaemonDraftReview.tsx`.
- `src/routes/_authenticated.settings.developer.tsx` (admin de diretórios
  monitorados pelo daemon).
- `supabase/functions/generate-report/index.ts`.
- Variável de ambiente `VITE_DAEMON_URL`.

Escopo da feature foi reduzido a gravação de tela + geração de apontamento;
diffing de arquivos e agentes locais por diretório não têm substituto — foram
descontinuados, não migrados.
