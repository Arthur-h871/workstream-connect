# Páginas — Marco

Todas as rotas do frontend com o que cada uma faz.

**Legenda:**
- ✅ Implementado
- ⚙️ Parcialmente implementado
- ⏳ Pendente

---

## Páginas Públicas (sem autenticação)

### `/login` ✅
**Arquivo:** `src/routes/login.tsx`

Formulário de login com email e senha.
- Chama `signIn()` do `auth.service`
- Em caso de sucesso, redireciona para `/dashboard`
- Link para `/cadastro`

---

### `/cadastro` ✅
**Arquivo:** `src/routes/cadastro.tsx`

Formulário de cadastro de novo usuário.
- Campos: nome completo, email, senha, código da organização
- Chama `signUp()` do `auth.service`, que passa `full_name` e `organization_code` nos metadados do Supabase Auth
- Trigger no banco cria `member_requests` automaticamente
- Após cadastro, redireciona para `/aguardando`

---

### `/cadastro-organizacao` ✅
**Arquivo:** `src/routes/cadastro-organizacao.tsx`

Criação de uma nova organização (somente usuários `master`).
- Campos: nome da organização
- Gera código único de convite (`char(6)`)

---

### `/aguardando` ✅
**Arquivo:** `src/routes/aguardando.tsx`

Tela exibida enquanto o pedido de entrada na org está pendente.
- Usuário tem sessão Auth mas sem `profile` — sem acesso aos dados da org
- Exibe mensagem de "aguardando aprovação do administrador"
- Polling ou botão para verificar se foi aprovado

---

## Páginas Autenticadas

O layout autenticado (`src/routes/_authenticated.tsx`) verifica sessão e perfil antes de carregar qualquer rota abaixo. Sem sessão → `/login`. Com sessão mas sem perfil → `/aguardando`.

O `AppShell` (`src/components/AppShell.tsx`) envolve todas as páginas autenticadas e fornece a sidebar de navegação com notificações em tempo real.

---

### `/dashboard` ✅
**Arquivo:** `src/routes/_authenticated.dashboard.tsx`

Painel principal do usuário.

**Seções:**
- **Controle de sessão:** botões Start / Pause / Stop / Delete para a sessão de captura ativa
- **Stats do mês:** horas trabalhadas, número de apontamentos, tarefas concluídas, projetos ativos
- **Gravações recentes:** últimos apontamentos (link direto)
- **Tarefas prioritárias:** tarefas pessoais ordenadas por `priority`
- **Prazos da org:** tarefas da org com `due_date` mais próximas

**Dados carregados no loader:**
- `getActiveSession(userId)` — sessão de captura ativa
- `getDashboardData(userId)` — stats, gravações recentes, tarefas prioritárias, prazos da org

---

### `/apontamentos` ✅
**Arquivo:** `src/routes/_authenticated.apontamentos.tsx`

Listagem e gestão de apontamentos de trabalho.

**Funcionalidades:**
- Lista de apontamentos com data e horas trabalhadas
- Criação manual de novo apontamento
- Edição de conteúdo de texto e horas
- Exclusão de apontamento
- Vinculação de tarefas pessoais e da org ao apontamento (busca e seleção)
- Marcação de tarefa vinculada como `started` ou `concluded`
- Galeria de screenshots da sessão vinculada (com opção de soft delete por print)

---

### `/tarefas` ✅
**Arquivo:** `src/routes/_authenticated.tarefas.tsx`

Gerenciador de tarefas pessoais do usuário.

**Funcionalidades:**
- Lista de tarefas em colunas por status: Na fila / Em progresso / Concluída
- Criar nova tarefa (título, descrição, prazo)
- Editar tarefa (inline ou modal)
- Deletar tarefa
- Mudar status de tarefa
- Reordenação drag-and-drop via `@dnd-kit`

---

### `/tarefas-org` ✅
**Arquivo:** `src/routes/_authenticated.tarefas-org.tsx`

Listagem de projetos da organização.

**Funcionalidades:**
- Lista de projetos com nome, cor, status e contagem de tarefas
- Criar projeto (admin)
- Fechar projeto (admin)
- Clicar em projeto → navega para `/tarefas-org/$projectId`

---

### `/tarefas-org/$projectId` ✅
**Arquivo:** `src/routes/_authenticated.tarefas-org_.$projectId.tsx`

Tarefas de um projeto específico da organização.

**Funcionalidades:**
- Lista de tarefas do projeto
- Criar tarefa (admin)
- Editar título, descrição, prazo, nota (admin / membro atribuído)
- Atribuir responsável
- Mudar status
- Deletar tarefa (admin)

---

### `/perfil` ⚙️
**Arquivo:** `src/routes/_authenticated.perfil.tsx`

Perfil do usuário logado.

**Implementado:**
- Exibição de nome completo, email e avatar
- Streak de dias consecutivos com apontamentos
- Estatísticas do perfil

**Pendente:**
- Upload de avatar
- Alteração de senha

---

### `/admin/membros` ✅
**Arquivo:** `src/routes/_authenticated.admin.membros.tsx`

Gestão de membros da organização (somente admins).

**Funcionalidades:**
- Listagem de membros ativos
- Exibição do código de convite da org
- Aprovação e rejeição de pedidos de entrada pendentes
- Promoção/rebaixamento de membros (tenant_user ↔ tenant_admin)
- Remoção de membros

---

## Fluxo de Navegação

```
/ → redireciona para /login ou /dashboard
/login → autenticação → /dashboard
/cadastro → signup → /aguardando
/aguardando → aprovação pelo admin → /dashboard

Autenticado:
sidebar: Dashboard | Apontamentos | Tarefas da Org | Minhas Tarefas | Perfil | Membros (admin)
```
