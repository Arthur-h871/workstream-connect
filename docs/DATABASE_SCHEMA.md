# Database Schema — Workstream Connect

**Banco:** PostgreSQL via Supabase  
**Autenticação:** Supabase Auth (email/senha)  
**Segurança:** Row Level Security (RLS) em todas as tabelas  
**Convenção:** nomes de tabela seguem o domínio (mix PT/EN onde o domínio é PT)

---

## Diagrama de Entidades

```
organizations ──< member_requests >── auth.users (pendentes, sem profile)
organizations ──< profiles
organizations ──< projects ──< org_tasks ──< org_task_dependencies
profiles ──< capture_sessions ──< screenshots
profiles ──< apontamentos ──< apontamento_personal_tasks >── personal_tasks
                           └──< apontamento_org_tasks    >── org_tasks
profiles ──< personal_tasks ──< personal_task_dependencies
profiles ──  user_settings
profiles ──< notifications
org_tasks >── profiles (assigned_to)
```

---

## ENUMs

| Tipo | Valores |
|------|---------|
| `user_role` | `master`, `tenant_admin`, `tenant_user` |
| `session_status` | `active`, `paused`, `stopped` |
| `task_status` | `queued`, `in_progress`, `completed` |
| `project_status` | `active`, `closed` |
| `linked_task_status` | `started`, `concluded` |
| `notification_type` | `new_org_task`, `task_assigned`, `member_request`, `member_accepted` |

> `master` cria organizações (service role). `tenant_admin` gerencia membros e projetos. `tenant_user` usa o sistema. Usuários pendentes de aprovação ficam em `member_requests` — sem profile, sem acesso.

> `member_request` → notificação enviada aos admins quando novo usuário pede entrada. `member_accepted` → notificação enviada ao usuário quando aceito.

---

## Tabelas

### `organizations`
Empresa/equipe. `code` é compartilhado pelo `tenant_admin` para convidar membros.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid PK | Identificador único |
| `name` | text NOT NULL | Nome da organização |
| `code` | char(6) UNIQUE NOT NULL | Código de convite (ex: `AB12CD`) |
| `retention_days` | int DEFAULT 30 | Dias de retenção de screenshots (toda a org) |
| `removed_member_retention_days` | int DEFAULT 30 | Retenção de dados após remover membro |
| `created_at` | timestamptz | Criação |

**RLS:** membros leem apenas a própria org.

---

### `member_requests`
Pedido de entrada pendente. Criado via trigger ao fazer signup. O usuário tem sessão Auth válida mas **sem profile** — sem acesso a nenhum dado da org.  
Deletado quando o admin aceita (profile é criado) ou rejeita (auth.users é deletado via Edge Function).

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid PK | Identificador único |
| `user_id` | uuid NOT NULL FK→auth.users CASCADE UNIQUE | Usuário pendente |
| `organization_id` | uuid NOT NULL FK→organizations CASCADE | Org que o usuário quer entrar |
| `full_name` | text NOT NULL | Nome informado no cadastro |
| `created_at` | timestamptz | Data do pedido |

**RLS:**
- Usuário lê o próprio request (para exibir tela de "aguardando aprovação")
- Admin lê todos os requests da própria org
- Admin pode deletar requests (ao aceitar ou rejeitar)

---

### `profiles`
Extensão de `auth.users`. Criado pelo admin ao aceitar um `member_request`.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid PK FK→auth.users CASCADE | Mesmo ID do Supabase Auth |
| `organization_id` | uuid NOT NULL FK→organizations RESTRICT | Obrigatório — usuário sempre pertence a uma org |
| `role` | user_role DEFAULT 'tenant_user' | Papel na organização |
| `full_name` | text NOT NULL | Nome completo |
| `avatar_url` | text | URL do avatar no Storage |
| `created_at` | timestamptz | Entrada na org |
| `updated_at` | timestamptz | Atualizado via trigger |

**RLS:**
- Membros da mesma org enxergam uns aos outros
- Usuário atualiza o próprio perfil (sem poder mudar `role` nem `organization_id`)
- `tenant_admin` pode atualizar `role` de outros membros

**Nota:** `email` não é armazenado aqui — usar `auth.users.email` via join ou `auth.email()`.

---

### `user_settings`
Configurações locais do agente Python por usuário.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `user_id` | uuid PK FK→profiles CASCADE | Um registro por usuário |
| `capture_interval_sec` | int DEFAULT 30 | Intervalo entre capturas |
| `updated_at` | timestamptz | Atualizado via trigger |

**Nota:** `retention_days` fica em `organizations` (decisão da org, não do usuário).

---

### `capture_sessions`
Sessões de captura de tela iniciadas pelo agente Python.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid PK | Identificador único |
| `user_id` | uuid NOT NULL FK→profiles CASCADE | Dono da sessão |
| `organization_id` | uuid NOT NULL FK→organizations CASCADE | Para RLS de admin |
| `status` | session_status DEFAULT 'active' | `active`, `paused`, `stopped` |
| `started_at` | timestamptz DEFAULT now() | Início |
| `paused_at` | timestamptz | Última pausa (NULL se nunca pausado) |
| `stopped_at` | timestamptz | Encerramento (NULL se ativa/pausada) |
| `screenshot_count` | int DEFAULT 0 | Sincronizado via trigger |

**Constraints:**
- `paused_at IS NULL OR status IN ('paused', 'stopped')`
- `stopped_at IS NULL OR status = 'stopped'`

**Fluxo:** Frontend faz INSERT/UPDATE → agente Python escuta via Realtime.

---

### `screenshots`
Metadados de cada captura. Arquivo real fica no Storage bucket `screenshots`.  
`deleted_at` permite curação (soft delete) antes de gerar o apontamento.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid PK | Identificador único |
| `session_id` | uuid NOT NULL FK→capture_sessions CASCADE | Sessão de origem |
| `user_id` | uuid NOT NULL FK→profiles CASCADE | Para RLS direto |
| `organization_id` | uuid NOT NULL FK→organizations CASCADE | Para RLS de admin |
| `captured_at` | timestamptz NOT NULL | Momento da captura |
| `storage_path` | text NOT NULL | `{user_id}/{YYYY-MM-DD}/{id}.jpg` |
| `file_size_bytes` | int NOT NULL | Tamanho em bytes |
| `deleted_at` | timestamptz | NULL = ativo; NOT NULL = excluído pelo usuário (soft delete) |

**Índices:** `(session_id)`, `(user_id)`, `(organization_id)`, `(captured_at)`, `(deleted_at) WHERE deleted_at IS NULL`

---

### `apontamentos`
Registros de trabalho. Gerados pela IA (Edge Function) ou criados manualmente.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid PK | Identificador único |
| `user_id` | uuid NOT NULL FK→profiles CASCADE | Dono |
| `organization_id` | uuid NOT NULL FK→organizations CASCADE | Para RLS de admin |
| `session_id` | uuid FK→capture_sessions SET NULL | Sessão de origem (opcional) |
| `date` | date NOT NULL DEFAULT current_date | Data do trabalho |
| `content` | text NOT NULL DEFAULT '' | Texto gerado pela IA ou editado |
| `hours_worked` | numeric(5,2) NOT NULL DEFAULT 0 | Horas trabalhadas neste apontamento |
| `created_at` | timestamptz | Criação |
| `updated_at` | timestamptz | Atualizado via trigger |

**Índices:** `(user_id)`, `(organization_id)`, `(date)`, `(session_id)`

---

### `personal_tasks`
Tarefas privadas do usuário — apenas ele enxerga.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid PK | Identificador único |
| `user_id` | uuid NOT NULL FK→profiles CASCADE | Dono |
| `title` | text NOT NULL | Título |
| `description` | text | Descrição |
| `status` | task_status DEFAULT 'queued' | `queued`, `in_progress`, `completed` |
| `priority` | int DEFAULT 0 | Ordem drag-and-drop (menor = maior prioridade) |
| `due_date` | date | Prazo |
| `created_at` | timestamptz | Criação |
| `updated_at` | timestamptz | Atualizado via trigger |

**Índices:** `(user_id)`, `(user_id, priority)`

---

### `personal_task_dependencies`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `task_id` | uuid PK FK→personal_tasks CASCADE | Tarefa dependente |
| `depends_on_id` | uuid PK FK→personal_tasks CASCADE | Pré-requisito |

Constraint: `task_id != depends_on_id`

---

### `projects`
Agrupamentos de tarefas da organização. Criados pelo `tenant_admin`.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid PK | Identificador único |
| `organization_id` | uuid NOT NULL FK→organizations CASCADE | Organização dona |
| `created_by` | uuid NOT NULL FK→profiles RESTRICT | Criador |
| `name` | text NOT NULL | Nome |
| `description` | text | Descrição do projeto |
| `color` | char(7) DEFAULT '#14B8A6' | Cor hex para UI |
| `status` | project_status DEFAULT 'active' | `active` ou `closed` |
| `due_date` | date | Prazo do projeto |
| `created_at` | timestamptz | Criação |
| `updated_at` | timestamptz | Atualizado via trigger |

**RLS:** membros leem; apenas admins criam/editam/deletam.  
**Índices:** `(organization_id)`, `(organization_id, status)`

---

### `org_tasks`
Tarefas da organização — visíveis por todos os membros.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid PK | Identificador único |
| `organization_id` | uuid NOT NULL FK→organizations CASCADE | Para RLS sem join |
| `project_id` | uuid FK→projects SET NULL | Projeto pai (opcional) |
| `created_by` | uuid NOT NULL FK→profiles RESTRICT | Criador |
| `assigned_to` | uuid FK→profiles SET NULL | Responsável |
| `title` | text NOT NULL | Título |
| `description` | text | Descrição |
| `status` | task_status DEFAULT 'queued' | `queued`, `in_progress`, `completed` |
| `priority` | int DEFAULT 0 | Ordem de exibição |
| `due_date` | date | Prazo |
| `note` | text | Anotação livre (editável por qualquer membro) |
| `created_at` | timestamptz | Criação |
| `updated_at` | timestamptz | Atualizado via trigger |

**RLS:** membros leem; admins gerenciam tudo; `tenant_user` pode atualizar `status` e `note` da tarefa atribuída a si.  
**Índices:** `(organization_id)`, `(project_id)`, `(assigned_to)`, `(organization_id, priority)`, `(due_date) WHERE due_date IS NOT NULL`

---

### `org_task_dependencies`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `task_id` | uuid PK FK→org_tasks CASCADE | Tarefa dependente |
| `depends_on_id` | uuid PK FK→org_tasks CASCADE | Pré-requisito |

Constraint: `task_id != depends_on_id`

---

### `apontamento_personal_tasks`
Vínculo N:M entre apontamento e tarefa pessoal.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid PK | Identificador único |
| `apontamento_id` | uuid NOT NULL FK→apontamentos CASCADE | Apontamento |
| `personal_task_id` | uuid NOT NULL FK→personal_tasks CASCADE | Tarefa pessoal |
| `status` | linked_task_status DEFAULT 'started' | `started` ou `concluded` naquele dia |

**Unique:** `(apontamento_id, personal_task_id)`

---

### `apontamento_org_tasks`
Vínculo N:M entre apontamento e tarefa da organização.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid PK | Identificador único |
| `apontamento_id` | uuid NOT NULL FK→apontamentos CASCADE | Apontamento |
| `org_task_id` | uuid NOT NULL FK→org_tasks CASCADE | Tarefa da org |
| `status` | linked_task_status DEFAULT 'started' | `started` ou `concluded` naquele dia |

**Unique:** `(apontamento_id, org_task_id)`

**RLS:** usuário gerencia vínculos dos próprios apontamentos; admin lê todos da org.

---

### `notifications`
Notificações in-app. `reference_id` aponta para a entidade relacionada.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid PK | Identificador único |
| `user_id` | uuid NOT NULL FK→profiles CASCADE | Destinatário |
| `type` | notification_type NOT NULL | `new_org_task`, `task_assigned` |
| `title` | text NOT NULL | Título |
| `body` | text NOT NULL | Conteúdo |
| `reference_id` | uuid | ID da entidade relacionada (ex: org_task.id) |
| `reference_type` | text | `'org_task'`, etc. |
| `read_at` | timestamptz | NULL = não lida; timestamp = quando foi lida |
| `created_at` | timestamptz | Criação |

**Índices:** `(user_id)`, `(user_id, created_at) WHERE read_at IS NULL`

---

## Storage

| Bucket | Visibilidade | Path |
|--------|-------------|------|
| `screenshots` | Privado | `{user_id}/{YYYY-MM-DD}/{screenshot_id}.jpg` |
| `avatars` | Público | `{user_id}.jpg` |

RLS via `auth.uid()` comparado ao primeiro segmento do path.

---

## Funções e Triggers

| Nome | Tipo | Descrição |
|------|------|-----------|
| `get_my_org_id()` | Função SECURITY DEFINER | Retorna `organization_id` do usuário autenticado |
| `get_my_role()` | Função SECURITY DEFINER | Retorna `role` do usuário autenticado |
| `is_admin()` | Função SECURITY DEFINER | Retorna true se `role IN ('tenant_admin', 'master')` |
| `handle_new_user()` | Trigger AFTER INSERT auth.users | Cria `member_requests` e notifica admins da org |
| `touch_updated_at()` | Trigger BEFORE UPDATE | Atualiza `updated_at` nas tabelas relevantes |
| `update_session_screenshot_count()` | Trigger AFTER INSERT/DELETE screenshots | Mantém `capture_sessions.screenshot_count` sincronizado |

---

## Campos calculados (não armazenados)

| Dado | Como calcular |
|------|--------------|
| Streak do usuário | Contagem de dias consecutivos com `apontamentos` para `user_id` |
| Horas no mês | `SUM(hours_worked) FROM apontamentos WHERE user_id = X AND date_trunc('month', date) = ...` |
| Projetos ativos | `COUNT(DISTINCT project_id) FROM org_tasks WHERE assigned_to = X AND status != 'completed'` |
