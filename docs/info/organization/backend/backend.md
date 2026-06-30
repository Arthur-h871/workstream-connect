# Organização do Backend — Marco

O backend é escrito em TypeScript e roda como parte do mesmo projeto do frontend (TanStack Start). Os serviços são chamados diretamente nos loaders e actions das rotas — não há um servidor REST separado.

---

## Estrutura de Pastas

```
backend/
└── api/
    ├── supabase.ts          # cliente Supabase tipado (Database type)
    └── services/            # um arquivo por domínio
        ├── auth.service.ts
        ├── users.service.ts
        ├── dashboard.service.ts
        ├── sessions.service.ts
        ├── apontamentos.service.ts
        ├── tarefas.service.ts
        ├── org-tasks.service.ts
        ├── projects.service.ts
        ├── screenshots.service.ts
        ├── notifications.service.ts
        └── organizations.service.ts
```

---

## Camadas

### `backend/api/supabase.ts`

Cria e exporta o cliente Supabase tipado com `Database` (gerado via `supabase gen types`):

```ts
export const supabase = createClient<Database>(url, anonKey)
```

Importado por todos os services como `import { supabase } from "backend/api/supabase"`.

---

### `backend/api/services/`

Cada service é um módulo com funções assíncronas puras — sem classe, sem estado. Cada função recebe os parâmetros necessários (geralmente `userId`, `orgId`, IDs de entidades) e retorna dados ou `null`/`error`.

| Arquivo | Responsabilidade |
|---------|-----------------|
| `auth.service.ts` | `signIn`, `signUp`, `signOut`, `getSession` |
| `users.service.ts` | `getProfile` — retorna `UserProfile` (profiles + role) |
| `dashboard.service.ts` | `getDashboardData` — stats, gravações recentes, tarefas, prazos |
| `sessions.service.ts` | `getActiveSession`, `createSession`, `pauseSession`, `resumeSession`, `stopSession`, `deleteSession`, `triggerGenerateReport` |
| `apontamentos.service.ts` | CRUD de apontamentos + `linkPersonalTask`, `linkOrgTask`, `updateLinkedTaskStatus`, `unlinkTask` |
| `tarefas.service.ts` | CRUD de `personal_tasks` + `reorderPersonalTasks` |
| `org-tasks.service.ts` | `getMyOrgTasks` — tarefas da org vinculáveis a apontamentos |
| `projects.service.ts` | `getProjects`, `createProject`, `closeProject` |
| `screenshots.service.ts` | `getScreenshots`, `softDeleteScreenshot` |
| `notifications.service.ts` | `getNotifications`, `markAsRead` |
| `organizations.service.ts` | Gestão de membros e pedidos de entrada |

---

## Banco de Dados

PostgreSQL via Supabase. Detalhes completos em [DATABASE_SCHEMA.md](../../../../docs/DATABASE_SCHEMA.md).

**Tabelas principais:**

| Tabela | Domínio |
|--------|---------|
| `organizations` | Empresa/equipe |
| `member_requests` | Pedidos de entrada pendentes |
| `profiles` | Extensão de `auth.users` — usuários aprovados |
| `user_settings` | Configurações de captura por usuário |
| `capture_sessions` | Sessões de gravação de tela |
| `screenshots` | Metadados de capturas (arquivo no Storage) |
| `apontamentos` | Registros de trabalho |
| `personal_tasks` | Tarefas privadas do usuário |
| `org_tasks` | Tarefas da organização |
| `projects` | Agrupadores de org_tasks |
| `notifications` | Notificações in-app |

**RLS:** todas as tabelas têm Row Level Security filtrando por `user_id = auth.uid()` ou `organization_id = get_my_org_id()`.

---

## Funções Helper no Banco

| Função | Tipo | Descrição |
|--------|------|-----------|
| `get_my_org_id()` | SECURITY DEFINER | Retorna `organization_id` do usuário logado |
| `get_my_role()` | SECURITY DEFINER | Retorna `role` do usuário logado |
| `is_admin()` | SECURITY DEFINER | `true` se `role IN ('tenant_admin', 'master')` |
| `handle_new_user()` | Trigger | Cria `member_requests` ao fazer signup |
| `touch_updated_at()` | Trigger | Atualiza `updated_at` nas tabelas relevantes |

---

## Edge Functions (Supabase Deno) ⏳

Ambas ainda pendentes de implementação:

| Função | Trigger | Descrição |
|--------|---------|-----------|
| `generate-report` | Manual ou ao parar sessão | Analisa screenshots via Claude Vision, salva apontamento |
| `cleanup-screenshots` | Cron diário | Deleta screenshots mais antigos que `organizations.retention_days` |

---

## Tipos

`src/types/supabase.ts` — gerado pelo Supabase CLI:

```bash
supabase gen types typescript --project-id <PROJECT_ID> > src/types/supabase.ts
```

Importado pelo `supabase.ts` para tipagem estática das queries.

---

## Variáveis de Ambiente

| Variável | Onde |
|----------|------|
| `VITE_SUPABASE_URL` | Frontend + services |
| `VITE_SUPABASE_ANON_KEY` | Frontend + services |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions (nunca no frontend) |
| `ANTHROPIC_API_KEY` | Edge Function `generate-report` |
