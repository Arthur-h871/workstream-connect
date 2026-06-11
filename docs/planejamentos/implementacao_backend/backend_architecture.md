# Arquitetura do Backend — Workstream Connect

## Visão geral

O backend é composto pelo Supabase (banco, auth, storage, realtime) mais uma camada de **services** local que encapsula todas as queries. O frontend nunca chama o cliente Supabase diretamente — ele apenas importa e chama funções dos services.

---

## Estrutura de pastas

```
backend/
└── api/
    ├── supabase.ts          ← instância única do cliente Supabase
    └── services/
        ├── auth.service.ts
        ├── users.service.ts
        ├── organizations.service.ts
        ├── apontamentos.service.ts
        ├── tarefas.service.ts
        ├── projects.service.ts
        ├── org-tasks.service.ts
        ├── sessions.service.ts
        ├── screenshots.service.ts
        └── notifications.service.ts
```

> **Nota:** O cliente Supabase (`backend/api/supabase.ts`) é o único arquivo que instancia `createClient`. Todos os services importam dali. Isso substitui o `src/lib/supabase.ts` mencionado no Passo 3 — a localização correta é `backend/api/supabase.ts`.

---

## Regra central

**Uma função por tipo de query.** Se dois lugares do frontend precisam da mesma query, eles chamam a mesma função — não criam uma nova. Se precisam de dados ligeiramente diferentes (ex: lista completa vs só nomes), são funções distintas com propósito claro.

```ts
// ✅ correto
export async function getProfile(userId: string) { ... }
export async function getProfileNames(orgId: string) { ... }

// ❌ errado — mesma query duplicada em dois services
```

---

## Convenções

- Funções exportadas diretamente (`export async function`), sem classes ou objetos intermediários
- Nome no formato `verboNome`: `getProfile`, `createApontamento`, `updateOrgTask`
- Cada função retorna o dado diretamente ou lança erro — sem wrappers de resultado customizados
- Tipos de parâmetros e retorno sempre explícitos (TypeScript)

---

## Services e responsabilidades

### `auth.service.ts`
Operações de autenticação via Supabase Auth.

| Função | Descrição |
|--------|-----------|
| `signIn(email, password)` | Login com email e senha |
| `signUp(email, password, fullName, orgCode)` | Cadastro com código da organização — cria `member_request`, sem profile |
| `signOut()` | Logout |
| `resetPassword(email)` | Enviar e-mail de redefinição de senha |
| `updatePassword(newPassword)` | Atualizar senha (usuário autenticado) |
| `getSession()` | Retornar sessão ativa atual |
| `checkPendingSignup(email)` | Verifica se o e-mail já tem um `member_request` pendente |

---

### `users.service.ts`
Queries na tabela `profiles`.

| Função | Descrição |
|--------|-----------|
| `getProfile(userId)` | Perfil completo do usuário |
| `updateProfile(userId, data)` | Atualizar nome e/ou avatar_url |
| `uploadAvatar(userId, file)` | Upload no Storage + retornar URL pública |

---

### `organizations.service.ts`
Queries na tabela `organizations` e gestão de membros via `profiles`.

| Função | Descrição |
|--------|-----------|
| `getMyOrganization(orgId)` | Dados da org do usuário autenticado |
| `getOrgByCode(code)` | Busca org pelo código de convite — usado no cadastro para exibir confirmação |
| `createOrganization(data)` | **Criação self-service de org** — invoke Edge Function `create-organization` + auto-login via `signIn`. Retorna `{ orgCode, error }`. Ponto único de integração; `cadastro.tsx` só chama esta função |
| `getOrgMembers(orgId)` | Lista de membros ativos da organização (têm profile) |
| `getPendingMembers(orgId)` | Lista de `member_requests` pendentes da org |
| `acceptMember(requestId, role)` | Cria profile, cria user_settings, deleta request, envia notificação `member_accepted` |
| `rejectMember(userId)` | Rejeita pedido pendente via Edge Function `reject-member` |
| `promoteToAdmin(memberId)` | Mudar role para `tenant_admin` |
| `removeMember(memberId)` | Remover membro ativo da organização |

---

### `apontamentos.service.ts`
Queries em `apontamentos`, `apontamento_personal_tasks` e `apontamento_org_tasks`.

| Função | Descrição |
|--------|-----------|
| `getApontamentos(userId)` | Lista de apontamentos com vínculos |
| `createApontamento(data)` | Criar apontamento manual |
| `updateApontamento(id, data)` | Editar conteúdo ou horas |
| `deleteApontamento(id)` | Deletar apontamento |
| `linkPersonalTask(apontamentoId, taskId)` | Vincular tarefa pessoal |
| `linkOrgTask(apontamentoId, taskId)` | Vincular tarefa da org |
| `updateLinkedTaskStatus(linkId, status)` | Marcar tarefa como `concluded` |
| `unlinkTask(linkId, type)` | Remover vínculo |

---

### `tarefas.service.ts`
Queries em `personal_tasks`.

| Função | Descrição |
|--------|-----------|
| `getPersonalTasks(userId)` | Lista de tarefas ordenada por prioridade |
| `createPersonalTask(data)` | Criar tarefa |
| `updatePersonalTask(id, data)` | Atualizar título, status, prazo |
| `reorderPersonalTasks(updates)` | Atualizar `priority` de múltiplas tarefas (lote) |
| `deletePersonalTask(id)` | Deletar tarefa |

---

### `projects.service.ts`
Queries em `projects`.

| Função | Descrição |
|--------|-----------|
| `getProjects(orgId)` | Lista de projetos com contagem de tarefas |
| `createProject(data)` | Criar projeto |
| `updateProject(id, data)` | Editar nome, descrição, cor |
| `closeProject(id)` | Mudar status para `closed` |

---

### `org-tasks.service.ts`
Queries em `org_tasks`.

| Função | Descrição |
|--------|-----------|
| `getOrgTasks(projectId)` | Tarefas de um projeto |
| `getMyOrgTasks(userId)` | Tarefas atribuídas ao usuário |
| `createOrgTask(data)` | Criar tarefa da org |
| `updateOrgTask(id, data)` | Atualizar status, nota, prazo |
| `assignOrgTask(taskId, userId)` | Atribuir responsável |

---

### `sessions.service.ts`
Queries em `capture_sessions`.

| Função | Descrição |
|--------|-----------|
| `getActiveSession(userId)` | Sessão ativa ou pausada do usuário |
| `createSession(userId, orgId)` | Iniciar nova sessão |
| `pauseSession(sessionId)` | Pausar sessão ativa |
| `stopSession(sessionId)` | Encerrar sessão |

---

### `screenshots.service.ts`
Queries em `screenshots` e operações no Storage.

| Função | Descrição |
|--------|-----------|
| `getScreenshots(sessionId)` | Screenshots não deletados da sessão |
| `softDeleteScreenshot(id)` | Setar `deleted_at = now()` |
| `getSignedUrl(storagePath)` | URL assinada temporária para exibição |

---

### `notifications.service.ts`
Queries em `notifications`.

| Função | Descrição |
|--------|-----------|
| `getNotifications(userId)` | Notificações do usuário (mais recentes primeiro) |
| `markAsRead(id)` | Setar `read_at = now()` |
| `markAllAsRead(userId)` | Marcar todas como lidas |

---

## Edge Functions (operações que requerem service role)

Algumas operações não podem ser feitas pelos services por exigirem a `service_role` key (que nunca pode estar no frontend). Estas são delegadas a Edge Functions Supabase:

| Edge Function | Quando chamada | Responsabilidade |
|---------------|---------------|-----------------|
| `reject-member` | Admin rejeita pedido | Deleta `auth.users` do `user_id` → cascade deleta `member_request` |
| `cancel-pending-signup` | Usuário re-cadastra e-mail pendente | Deleta `auth.users` do e-mail informado se `member_request` existe |

Ver detalhes completos em `fluxo_cadastro.md`.

---

## Como o frontend usa os services

O frontend importa diretamente as funções e as chama — em hooks, em `createServerFn`, ou direto no componente conforme o padrão adotado em cada passo.

```ts
import { signIn } from 'backend/api/services/auth.service'

const { error } = await signIn(email, senha)
```

O frontend nunca importa `supabase` diretamente.
