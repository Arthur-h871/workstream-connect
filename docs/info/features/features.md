# Features — Marco

Marco é uma ferramenta de registro de trabalho com IA, voltada para equipes organizadas em organizações. Combina captura automática de tela, geração de apontamentos por IA, e gestão de tarefas pessoais e da organização.

**Legenda:**
- ✅ Implementado
- ⚙️ Parcialmente implementado
- ⏳ Pendente

---

## 01 — Autenticação e Onboarding ✅

Fluxo completo de entrada no sistema:

- Login com email e senha
- Cadastro com código de convite da organização (`char(6)`)
- Criação de organização por usuário `master`
- Solicitação de entrada pendente (`member_requests`) — usuário tem sessão Auth válida mas sem acesso
- Aprovação ou rejeição de pedidos pelo `tenant_admin`
- Tela de "aguardando aprovação" exibida até o admin agir

---

## 02 — Sessões de Captura ⚙️

Controle de sessões de gravação de tela:

- **Implementado:** Start, Pause, Stop e Delete de sessões via Dashboard
- **Implementado:** Galeria de screenshots vinculada à sessão (soft delete de prints individuais)
- **Pendente:** Agente Python rodando na máquina do usuário (captura + upload real)
- **Pendente:** Sincronização via Supabase Realtime entre frontend e agente

---

## 03 — Geração de Apontamentos por IA ⏳

Edge Function `generate-report` (Supabase Deno):

- Recebe `session_id`
- Busca screenshots não processados da sessão
- Gera URLs assinadas do Storage (expiram em 60s)
- Chama Claude Vision (`claude-opus-4-8`) com as imagens
- Salva o resultado como apontamento em `apontamentos`
- Envia notificação ao usuário via Supabase Realtime

---

## 04 — Apontamentos ✅

Registros diários de trabalho (gerados por IA ou criados manualmente):

- Criação manual com data e horas trabalhadas
- Edição de conteúdo de texto e horas
- Exclusão de apontamentos
- Vinculação de tarefas pessoais (`apontamento_personal_tasks`)
- Vinculação de tarefas da org (`apontamento_org_tasks`)
- Status da tarefa vinculada: `started` (iniciada) ou `concluded` (concluída naquele dia)
- Galeria de screenshots da sessão vinculada ao apontamento

---

## 05 — Tarefas Pessoais ✅

Tarefas privadas do usuário (somente ele enxerga):

- CRUD completo (criar, editar título/descrição/prazo, deletar)
- Status: `queued` → `in_progress` → `completed`
- Reordenação drag-and-drop (campo `priority`)
- Prazo (`due_date`) opcional

---

## 06 — Tarefas da Organização ✅

Tarefas compartilhadas organizadas em projetos:

- **Projetos:** criar, editar, fechar (`status: closed`)
- **Tarefas dentro de projetos:** criar, editar título/descrição/prazo/nota, deletar
- Atribuição de responsável (`assigned_to`)
- Status: `queued` → `in_progress` → `completed`
- Nota livre editável por qualquer membro da org
- Visível por todos os membros da organização

---

## 07 — Dashboard ✅

Painel principal de visão geral e controle:

- Horas trabalhadas no mês atual
- Número de apontamentos no mês
- Tarefas pessoais concluídas
- Projetos da org ativos
- Lista de gravações recentes (últimos apontamentos)
- Tarefas pessoais prioritárias (ordenadas por `priority`)
- Prazos da org do usuário (tarefas com `due_date` próximo)
- Controle da sessão de captura (Start / Pause / Stop / Delete)

---

## 08 — Notificações ✅

Notificações in-app em tempo real:

- Sino na sidebar com badge de não lidas
- Recebidas via Supabase Realtime (INSERT na tabela `notifications`)
- Tipos:
  - `new_org_task` — nova tarefa criada na org
  - `task_assigned` — tarefa atribuída ao usuário
  - `member_request` — novo pedido de entrada (para admins)
  - `member_accepted` — pedido aceito (para o usuário)
- Marcação como lida ao abrir o painel

---

## 09 — Gestão de Membros ✅

Administração da organização (apenas `tenant_admin` e `master`):

- Listagem de membros ativos da org
- Visualização do código de convite (`code`)
- Aprovação e rejeição de pedidos de entrada
- Promoção/rebaixamento de membros entre `tenant_user` e `tenant_admin`
- Remoção de membros

---

## 10 — Perfil do Usuário ⚙️

- **Implementado:** Exibição de nome, avatar e streak de dias consecutivos com apontamentos
- **Implementado:** Cálculo de streak e estatísticas do perfil
- **Pendente:** Upload de avatar para Supabase Storage
- **Pendente:** Alteração de senha

---

## 11 — Agente Python ⏳

Aplicativo desktop rodando na máquina do usuário:

- Captura de tela via `mss` + `Pillow`
- Redação de dados sensíveis antes do upload: API keys, JWT, senhas, cartões, CPF, PEM
- Upload de JPEG para Supabase Storage (`screenshots/{user_id}/{data}/{id}.jpg`)
- Controle do loop via Supabase Realtime (escuta a tabela `capture_sessions`)

---

## 12 — Retenção e Limpeza de Screenshots ⏳

Edge Function `cleanup-screenshots` (cron diário):

- Lê `retention_days` da tabela `organizations`
- Deleta screenshots com `captured_at` mais antigo que o limite
- Remove arquivos do Supabase Storage nos mesmos paths
