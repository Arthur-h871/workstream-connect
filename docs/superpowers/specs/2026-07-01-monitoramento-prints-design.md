# Monitoramento por prints da tela — Design

Status: aprovado (2026-07-01). Implementação NÃO iniciada — aguardando plano.

## Contexto

O projeto já tinha um fluxo de captura de tela + geração de apontamentos via IA,
mas baseado num daemon Python local (`agent/`) que o usuário precisa manter rodando
na própria máquina, escutando mudanças em `capture_sessions` via Supabase Realtime,
capturando com `mss`/Pillow e subindo pra Storage autenticado como uma conta fixa
(`AGENT_EMAIL`/`AGENT_PASSWORD`), e uma edge function (`supabase/functions/generate-report`)
que chamava a Anthropic API direto (`claude-sonnet-4-6`) pra gerar o apontamento,
sem etapa de revisão/chat.

Esta feature substitui esse fluxo por captura nativa do navegador (sem daemon),
mantendo os dados em `capture_sessions`/`screenshots`/`apontamentos`/`personal_tasks`/`org_tasks`
já existentes, e adiciona uma etapa de chat com IA (Haiku) para refinar o relatório
antes de confirmar o apontamento.

## Fluxo

1. Usuário clica "Iniciar gravação" no dashboard.
2. App pede permissão de compartilhamento de tela via `getDisplayMedia` (uma vez por
   monitor que o usuário quiser monitorar — sem limite de quantidade). A partir do(s)
   stream(s) concedido(s), tira um frame a cada intervalo configurado (padrão 30s) por
   monitor autorizado, e faz upload direto pro bucket `screenshots`, autenticado como o
   próprio usuário logado (não mais uma conta fixa).
3. Usuário clica "Parar". Abre modal:
   - Seleção de tarefas pessoais e/ou de organização a vincular, cada uma com status
     ("iniciada" ou "concluída") **para este apontamento**.
   - Campo de contexto adicional em texto livre.
4. Ao confirmar o modal, dispara a primeira chamada (`action: "start"`) pra edge
   function `monitoramento`, enviando: screenshots da sessão (signed URLs), contexto,
   e as tarefas vinculadas (id, tipo, título, descrição, status escolhido).
5. Edge function chama a Anthropic API com Haiku (`claude-haiku-4-5-20251001`),
   persiste a troca no histórico da sessão, e retorna um draft `{ content, hours_worked }`.
6. Frontend mostra ícone de loading enquanto espera, depois mostra o draft. Usuário pode:
   - Mandar novas mensagens de texto (`action: "chat"`) pedindo ajustes — cada resposta
     do Haiku atualiza o draft mostrado.
   - Ajustar as tarefas vinculadas e o status de cada uma livremente, em qualquer
     momento até a confirmação final (não fica fixo desde o modal inicial).
7. Ao clicar "Enviar apontamento" (`action: "confirm"`): cria o registro em
   `apontamentos` com o conteúdo/horas atuais do draft, cria os vínculos em
   `apontamento_personal_tasks`/`apontamento_org_tasks` com o status escolhido no
   momento da confirmação, sincroniza o status das tarefas originais
   (`personal_tasks`/`org_tasks`), e cria a notificação de apontamento gerado —
   mesmo padrão que `generate-report` já fazia.

Se o usuário atualizar a página ou fechar a aba entre os passos 5–7, a conversa e o
draft atual são recuperáveis (persistidos no banco), mas a captura de tela em
andamento (streams do `getDisplayMedia`) não sobrevive a isso — não é um requisito
desta feature (a gravação já foi parada nesse ponto do fluxo).

## Captura no navegador

- Multi-monitor: cada monitor autorizado gera seu próprio stream de
  `getDisplayMedia` (picker do navegador pedido uma vez por monitor). Sem limite de
  quantidade de monitores. A cada tick do intervalo, tira 1 frame de cada stream ativo
  — N monitores autorizados = N screenshots por tick.
- Escolher "Tela inteira" no picker cobre a tela toda daquele monitor (não fica restrito
  à aba/janela do navegador) — desde que o usuário selecione essa opção no picker
  (não há como forçar essa escolha programaticamente em todos os navegadores).
- Implementação isolada num único módulo: `src/lib/screen-capture.ts`, expondo:
  - `startCapture({ sessionId, intervalMs, onCapture })`
  - `addMonitor()` — pede autorização de mais um monitor, adiciona ao conjunto capturado
  - `stopCapture()`

## Backend

Única edge function Deno: `supabase/functions/monitoramento/index.ts`, roteada por
`action` no corpo da requisição:

- **`start`**: `{ session_id, context, screenshot_ids, linked_tasks[] }` → monta prompt
  inicial com as imagens (signed URLs, 5 min de validade), contexto e tarefas → chama
  Haiku → grava mensagens (`user`, `assistant`) em `session_messages` → retorna
  `{ content, hours_worked }`.
- **`chat`**: `{ session_id, message }` → reenvia histórico completo da sessão +
  nova mensagem → Haiku responde → grava e retorna novo draft.
- **`confirm`**: `{ session_id, content, hours_worked, linked_tasks[] }` → cria
  `apontamento` + vínculos de tarefas + notificação. Substitui o papel do
  `generate-report`, que é removido nesta entrega.

O prompt do sistema deve instruir o Haiku a **sempre** responder em JSON
`{ content, hours_worked }` (igual ao `generate-report` atual), mesmo nas mensagens
de acompanhamento — assim o frontend sempre tem um draft estruturado pra exibir,
mesmo quando a mensagem do usuário é uma pergunta/ajuste em texto livre.

## Modelo de dados (nova migration)

- `screenshots`: nova coluna `monitor_index integer not null default 0` — diferencia
  monitores quando há captura multi-monitor.
- Nova tabela `session_messages`:
  - `id uuid primary key default gen_random_uuid()`
  - `session_id uuid not null references capture_sessions(id)`
  - `role text not null check (role in ('user','assistant'))`
  - `content text not null`
  - `created_at timestamptz not null default now()`
- `capture_sessions`: nova coluna `pending_task_links jsonb not null default '[]'` —
  guarda a seleção atual de tarefas+status (array de `{task_id, type, status}`),
  editável durante o chat, lida no momento da confirmação.

Atenção: as tabelas atuais (`capture_sessions`, `screenshots`, `apontamentos`,
`personal_tasks`, `org_tasks`, `apontamento_personal_tasks`, `apontamento_org_tasks`,
`notifications`) existem no ambiente remoto mas não têm migration de criação
localmente — as novas migrations desta feature devem ser `ALTER TABLE`/`CREATE TABLE`
incrementais sobre esse schema remoto existente, não recriações.

## Remoção de legado (nesta entrega)

- Deletar `agent/` (daemon Python completo: `main.py`, `capture.py`, `listener.py`,
  `config.py`, `uploader.py`, `redact.py`, `requirements.txt`, `.env.example`).
- Deletar `src/components/DaemonSessionReview.tsx` e `src/components/DaemonDraftReview.tsx`.
- Remover a lógica de detecção/polling de daemon (`VITE_DAEMON_URL`, checagem de
  `http://localhost:7432`) do componente `Recorder` em `_authenticated.dashboard.tsx`.
- Deletar `supabase/functions/generate-report/`.
- Remover `triggerGenerateReport` de `backend/api/services/sessions.service.ts` e
  adicionar as chamadas para as três ações da nova edge function `monitoramento`.
- `backend/edge_functions/monitoramento.py` (arquivo vazio criado como ponto de partida)
  é descartado — a implementação real vai para `supabase/functions/monitoramento/index.ts`,
  seguindo o padrão Deno das demais edge functions do projeto.

## Componentes de frontend

- Novo componente único `src/components/SessionReviewChat.tsx`, substituindo
  `DaemonSessionReview` + `DaemonDraftReview`:
  - Modal de vínculo de tarefas (pessoais/org) + status + contexto livre, que dispara
    a ação `start`.
  - Área de chat mostrando histórico (`session_messages`) e o draft atual
    (conteúdo + horas) após cada resposta.
  - Painel de tarefas vinculadas, editável a qualquer momento antes da confirmação.
  - Botão "Enviar apontamento", disparando a ação `confirm`.

## Riscos / pontos a verificar durante a implementação

- **Storage RLS**: hoje o upload de screenshots era feito pela conta fixa do daemon
  (que tinha sua própria policy/bypass). Upload direto do navegador exige uma policy
  no bucket `screenshots` permitindo o usuário autenticado escrever no path
  `${org_id}/${user_id}/${session_id}/...` — precisa confirmar se já existe ou criar.
- **Custo/volume**: sem limite de monitores nem de screenshots por sessão — cada
  monitor autorizado multiplica linearmente o número de imagens enviadas ao Haiku
  em cada chamada `start`/`chat` (histórico completo é reenviado a cada turno de chat,
  API da Anthropic é stateless). Sessões longas com múltiplos monitores podem gerar
  custo de tokens de imagem significativo — vale reavaliar se precisa de amostragem
  (nem todo screenshot da sessão precisa ir pro prompt) antes de ir pra produção.
- **Nome/id do modelo**: usar `claude-haiku-4-5-20251001` (Haiku 4.5 atual) — confirmar
  se é esse o modelo pretendido antes de implementar.
