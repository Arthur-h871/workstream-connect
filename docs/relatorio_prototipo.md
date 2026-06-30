# Relatório de Estado do Protótipo — Marco (workstream-connect)

> Gerado em: 2026-06-26
> Escopo: mapeamento completo do frontend, backend de serviços e infraestrutura Supabase

---

## 1. Visão Geral

**Marco** é uma ferramenta de registro de trabalho com IA para equipes. O usuário grava sessões de trabalho, o agente Python local captura screenshots, a Edge Function `generate-report` processa as imagens com Claude Vision e gera apontamentos automaticamente. Há também gestão de tarefas pessoais e da organização, canvas de notas e notificações em tempo real.

**Stack:**
| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 19 + TypeScript (strict) |
| Roteamento | TanStack Router (file-based) + TanStack Start (SSR) |
| Estilo | Tailwind CSS v4 + shadcn/ui |
| Forms | React Hook Form + Zod |
| Server state | TanStack Query v5 |
| Backend | Supabase (PostgreSQL, Auth, Storage, Realtime, Edge Functions) |
| Build | Vite 7 + Nitro |
| Runtime | Bun |

---

## 2. Mapa de Funcionalidades

### 2.1 Status por feature

| # | Feature | Status | Observação |
|---|---------|--------|------------|
| 01 | Autenticação e onboarding | ✅ Completo | Login, cadastro, fluxo de aprovação, tela de espera |
| 02 | Controle de sessões de captura | ✅ Completo | Start/Pause/Stop/Delete via Dashboard; galeria de screenshots |
| 03 | Geração de apontamentos por IA | ⏳ Pendente | Edge function pronta, depende do agente Python |
| 04 | Apontamentos | ✅ Completo | CRUD, vinculação de tarefas, galeria de prints |
| 05 | Tarefas pessoais | ✅ Completo | Kanban drag-drop, CRUD, datas, prioridade |
| 06 | Tarefas da organização | ✅ Completo | Projetos, CRUD de tarefas, atribuição, notas |
| 07 | Dashboard | ✅ Completo | Heatmap, stats, tarefas prioritárias, prazos da org |
| 08 | Notificações em tempo real | ✅ Completo | Supabase Realtime, badge, marcar como lida |
| 09 | Gestão de membros (admin) | ✅ Completo | Aprovação/rejeição, promover/rebaixar, remover |
| 10 | Perfil do usuário | ✅ Completo | Upload de avatar, edição de nome, troca de senha |
| 11 | Agente Python | ⏳ Pendente | Diretório `agent/` existe mas sem implementação |
| 12 | Retenção e limpeza de screenshots | ⏳ Pendente | Edge function pronta, cron não configurado |

### 2.2 Rotas implementadas

| Rota | Propósito | Estado |
|------|-----------|--------|
| `/` | Landing page | ✅ |
| `/login` | Autenticação | ✅ |
| `/cadastro` | Registro com código de org | ✅ |
| `/cadastro-organizacao` | Criar org (usuário master) | ✅ |
| `/aguardando` | Espera de aprovação | ✅ |
| `/dashboard` | Painel principal + controle de sessão | ✅ |
| `/apontamentos` | Gerenciar apontamentos | ✅ |
| `/tarefas` | Tarefas pessoais (Kanban) | ✅ |
| `/tarefas-org` | Listagem de projetos da org | ✅ |
| `/tarefas-org/$projectId` | Tarefas dentro de um projeto | ✅ |
| `/notas` | Canvas (React Flow) | ✅ |
| `/perfil` | Perfil do usuário | ✅ |
| `/admin/membros` | Gerenciar membros (admin) | ✅ |
| `/settings/developer` | Configurar daemon | ✅ |
| `/popup/$blockId` | Editor popup de bloco de nota | ✅ |

---

## 3. Bugs Documentados — Todos Resolvidos

Os seguintes bugs foram levantados durante o desenvolvimento. O arquivo `docs/new/bugs&problems/erros_listados.md` lista todos como **RESOLVIDOS**:

| # | Bug | Solução aplicada |
|---|-----|-----------------|
| 01 | Duas abas ativas na sidebar ao abrir "Tarefas da Org" | Corrigido: lógica `startsWith(item.to + "/")` diferencia `/tarefas` de `/tarefas-org` |
| 02 | Nome longo do usuário vazando da sidebar | Corrigido: exibe apenas o primeiro nome com `truncate` |
| 03 | Tarefa marcada como concluída no apontamento não atualizava status na origem | Corrigido: `updateLinkedTaskStatus` propaga status para `personal_tasks` / `org_tasks` |
| 04 | Desenhos fixos na tela ao mover/zoom no canvas | Corrigido: `DrawingLayer` aplica `<g transform="translate(x,y) scale(zoom)">` |
| 05 | Botão de lápis (segunda forma de criar nota) não salvava no canvas | Corrigido: botão removido, apenas o "+ Nova Nota" no topo funciona |
| 06 | Popup de edição de notas não implementado | Corrigido: rota `/popup/$blockId` + `window.open()` cria janela separada |
| 07 | Sem forma de apagar desenhos livres | Corrigido: ferramenta de borracha implementada na `CanvasToolbar` |
| 08 | Popup de notas abria como modal, sem poder mover ou abrir fora do site | Corrigido: `window.open()` com parâmetros de janela separada |

---

## 4. Problemas Encontrados na Revisão do Código

Estes são erros e inconsistências identificados diretamente no código-fonte, **ainda não documentados**:

### 4.1 `DaemonDraftReview` — revisão de drafts após sessão

**Arquivo:** [src/components/DaemonDraftReview.tsx](../src/components/DaemonDraftReview.tsx)

O componente é exibido quando o daemon encerra uma sessão com drafts para revisar. Porém, como o agente Python ainda não foi implementado (feature 11 pendente), esse fluxo nunca é acionado em produção. O componente existe mas não tem uso real ainda.

---

### 4.2 Canvas — a ferramenta "todo" menciona tarefa vinculada, mas a vinculação não está acessível pela UI

**Arquivo:** [src/components/canvas/TodoListNode.tsx](../src/components/canvas/TodoListNode.tsx)

O tipo `TodoItem` tem os campos `task_id` e `task_type`, permitindo vincular um item de checklist a uma tarefa real. Quando marcado, o `updateTaskStatus` é chamado. Porém, **não há UI para vincular um item de to-do a uma tarefa**. O campo `task_id` só pode ser preenchido pelo popup (que também não oferece essa vinculação). A funcionalidade mencionada na ideia original ("//" para referenciar tarefas em to-do lists) **não está implementada**.

---

### 4.3 `popup.$blockId.tsx` — popup abre sem autenticação verificada

**Arquivo:** [src/routes/popup.$blockId.tsx](../src/routes/popup.$blockId.tsx)

A rota `/popup/$blockId` está fora do guard `/_authenticated`. O `getBlock` usa o cliente Supabase que só funciona com sessão ativa, então na prática falha silenciosamente se o usuário não estiver logado — exibe "Quadro não encontrado" sem clareza. Não há verificação de sessão explícita nessa rota.

**Impacto:** Baixo em produção (o usuário sempre terá sessão ativa ao abrir o popup a partir do canvas), mas pode causar confusão em edge cases (sessão expirada, aba aberta tardiamente).

---

### 4.4 Dashboard — `DaemonDraftReview` não é limpo após confirmação

**Arquivo:** [src/routes/_authenticated.dashboard.tsx](../src/routes/_authenticated.dashboard.tsx)

Após confirmar os drafts no `DaemonDraftReview`, o painel de revisão fecha, mas a lista de apontamentos no dashboard não é recarregada automaticamente. O usuário precisa navegar para `/apontamentos` para ver os novos registros.

**Impacto:** UX — não é um crash, mas a falta de feedback visual pode gerar confusão ("meus apontamentos foram criados?").

---

### 4.5 Perfil — avatar não é atualizado no contexto global após upload

**Arquivo:** [src/routes/_authenticated.perfil.tsx](../src/routes/_authenticated.perfil.tsx)

Após o upload do avatar, `setAvatarUrl(url)` atualiza o estado local da tela de perfil. Mas o `ProfileContext` (que alimenta `AppShell`) ainda guarda o `avatar_url` original do loader. O avatar na sidebar **não muda** sem um reload da página.

**Impacto:** Médio — o usuário faz upload e vê a foto nova na tela de perfil, mas a sidebar ainda mostra as iniciais (ou a foto antiga). Confuso.

---

### 4.6 Tarefas da org — usuário `tenant_user` sem tarefas atribuídas não vê nenhum projeto

**Arquivo:** [src/routes/_authenticated.tarefas-org.tsx](../src/routes/_authenticated.tarefas-org.tsx)

A query de projetos filtra por `organization_id` e traz todos os projetos ativos da org. Não é um bug, mas: se um `tenant_user` nunca foi atribuído a uma tarefa, ele ainda enxerga todos os projetos da org. Dependendo da intenção do produto, isso pode ser correto ou não.

---

### 4.7 `aguardando.tsx` — polling indefinido sem timeout

**Arquivo:** [src/routes/aguardando.tsx](../src/routes/aguardando.tsx)

A tela de "aguardando aprovação" faz polling no Supabase em intervalos regulares para verificar se o perfil foi criado. Não há timeout configurado: se o admin nunca aprovar, o polling roda indefinidamente enquanto a aba estiver aberta.

**Impacto:** Baixo em produção (custo mínimo), mas é um leak de recursos desnecessário.

---

## 5. Features Pendentes de Alta Prioridade

### 5.1 Agente Python (feature 11) — bloqueante para o loop completo

O diretório `agent/` existe com apenas um `.env.example`. Sem o agente, o fluxo principal do produto (capturar → processar → anotar) não funciona de ponta a ponta.

O agente precisa implementar:
- Captura de tela periódica com `mss` + `Pillow`
- Redação de dados sensíveis antes do upload (senhas, chaves de API, CPF, JWT)
- Upload de JPEG para `screenshots/{user_id}/{data}/{id}.jpg` no Supabase Storage
- Controle do loop via Supabase Realtime (escutar a tabela `capture_sessions`)
- Servidor HTTP local em `localhost:7432` com os endpoints esperados pelo frontend:
  - `GET /status`
  - `POST /session/start`, `POST /session/stop`, `POST /session/pause`, `POST /session/resume`
  - `GET /directories`, `POST /directories`, `PUT /directories/:id`, `DELETE /directories/:id`

### 5.2 Cron de limpeza de screenshots (feature 12)

A Edge Function `cleanup-screenshots` já existe mas o cron do Supabase não está configurado. É necessário agendar a execução diária no painel do Supabase ou via `supabase functions deploy --schedule`.

### 5.3 Vinculação de itens de to-do a tarefas reais via `//`

Mencionado na ideia original em `docs/new/ideias/features.md`: ao digitar `//` dentro de uma to-do list, abrir um dropdown de seleção de tarefas. A infraestrutura existe (`task_id`/`task_type` no `TodoItem`), falta apenas a UI do dropdown e a lógica de vinculação.

O componente `TaskMentionDropdown` ([src/components/canvas/TaskMentionDropdown.tsx](../src/components/canvas/TaskMentionDropdown.tsx)) já existe para blocos de texto — pode ser reutilizado para to-do lists.

---

## 6. Qualidade Geral do Código

| Aspecto | Avaliação |
|---------|-----------|
| TypeScript strict | ✅ Ativo e sem erros detectados |
| Separação frontend/backend | ✅ Serviços em `backend/api/services/` isolados |
| Otimismo de UI (optimistic updates) | ✅ Aplicado nas mutações principais |
| Tratamento de erros | ✅ Toast de erro em todos os handlers |
| Console.log de debug | ✅ Limpo — apenas `console.error` em catch blocks |
| Dados mockados no frontend | ✅ Nenhum — tudo vem do Supabase |
| RLS no banco | ✅ Configurado via migrations |
| Formulários com validação | ✅ Zod + React Hook Form |
| Realtime | ✅ Notificações via Supabase Realtime |
| Testes automatizados | ❌ Nenhum teste de frontend encontrado |

---

## 7. Resumo Executivo

O protótipo está **funcionalmente completo no frontend e nos serviços de backend**. As 15 rotas, 13 serviços e 5 Edge Functions estão implementados e integrados ao Supabase. Todos os 8 bugs documentados foram corrigidos.

**O que falta para o produto ser usável de ponta a ponta:**

1. **Agente Python** — sem ele, a captura automática e a geração de apontamentos por IA não funcionam. É o maior bloqueante.
2. **Cron de limpeza** — configuração de 5 minutos no Supabase.
3. **Vinculação de to-do items a tarefas** — melhoria de UX, não bloqueante.

**Bugs não críticos identificados nesta revisão:**

- Avatar não atualiza na sidebar após upload (perfil)
- Dashboard não recarrega apontamentos após confirmar drafts do daemon
- Popup não verifica sessão explicitamente
- Polling indefinido na tela de aguardando aprovação

Nenhum desses bugs quebra o fluxo principal. O produto está em estado sólido para continuar o desenvolvimento.
