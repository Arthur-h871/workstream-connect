# Relatório de Integração Backend — Workstream Connect

Status atual: **frontend completo, backend inexistente**.  
Toda a UI usa dados mockados hardcoded nos componentes.

---

## Ordem de implementação recomendada

```
1. Setup Supabase + variáveis de ambiente
2. Autenticação (login / cadastro / logout / guard)
3. Profiles + Organizations
4. CRUD tarefas pessoais e da organização
5. Sessões + Realtime (start/pause/stop)
6. Agente Python
7. Edge Function generate-report (Anthropic Vision)
8. Apontamentos (listagem + vinculação de tarefas)
9. Notificações Realtime
10. Edge Function cleanup (cron de retenção)
```

---

## 1. Setup

### Arquivos a criar

**`src/lib/supabase.ts`**
```ts
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)
```

**`.env`**
```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

### Pacote a instalar
```bash
npm install @supabase/supabase-js
```

---

## 2. Autenticação

| Item | Rota | O que implementar |
|------|------|-------------------|
| Login | `/login` | `supabase.auth.signInWithPassword({ email, password })` |
| Cadastro | `/cadastro` | 1. Buscar org por `org_code` → 2. `supabase.auth.signUp()` com `full_name` no metadata → 3. `UPDATE profiles SET organization_id` |
| Logout | `AppShell` | `supabase.auth.signOut()` no botão do sidebar footer |
| Guard de rotas | `__root.tsx` | `beforeLoad`: redirecionar para `/login` se `session === null` |
| Sessão persistida | `__root.tsx` | `supabase.auth.onAuthStateChange()` para manter estado global |

**Observação:** o trigger `on_auth_user_created` já cria o `profile` e `user_settings` automaticamente ao fazer `signUp`.

---

## 3. Dashboard (`/dashboard`)

| Elemento UI | Query necessária |
|-------------|-----------------|
| Heatmap mensal | `SELECT date, count(*) FROM apontamentos WHERE user_id = auth.uid() GROUP BY date` |
| Horas no mês | `SELECT SUM(hours_worked) FROM apontamentos WHERE user_id = auth.uid() AND date_trunc('month', date) = date_trunc('month', current_date)` |
| Nº de apontamentos | `SELECT count(*) FROM apontamentos WHERE user_id = auth.uid() AND date_trunc('month', date) = date_trunc('month', current_date)` |
| Tarefas concluídas | `SELECT count(*) FROM personal_tasks WHERE user_id = auth.uid() AND status = 'completed'` |
| Projetos ativos | `SELECT count(DISTINCT project_id) FROM org_tasks WHERE assigned_to = auth.uid() AND status != 'completed'` |
| Gravações recentes | `SELECT * FROM apontamentos WHERE user_id = auth.uid() ORDER BY created_at DESC LIMIT 5` |
| Tarefas prioritárias | `SELECT * FROM personal_tasks WHERE user_id = auth.uid() ORDER BY priority LIMIT 5` |
| Prazos da org | `SELECT * FROM org_tasks WHERE assigned_to = auth.uid() AND due_date IS NOT NULL ORDER BY due_date LIMIT 5` |

**Botões Start/Pause/Stop:**
- Start → `INSERT INTO capture_sessions (user_id, organization_id, status)`
- Pause → `UPDATE capture_sessions SET status = 'paused', paused_at = now() WHERE id = $id`
- Stop → `UPDATE capture_sessions SET status = 'stopped', stopped_at = now() WHERE id = $id`
- Agente Python escuta via `supabase.channel('session:{user_id}').on('postgres_changes', ...)`

---

## 4. Apontamentos (`/apontamentos`)

| Operação | Query |
|----------|-------|
| Listar | `SELECT a.*, aot.*, apt.* FROM apontamentos a LEFT JOIN apontamento_org_tasks aot ON aot.apontamento_id = a.id LEFT JOIN apontamento_personal_tasks apt ON apt.apontamento_id = a.id WHERE a.user_id = auth.uid() ORDER BY date DESC` |
| Criar (manual) | `INSERT INTO apontamentos (user_id, organization_id, content, date, hours_worked)` |
| Vincular tarefa da org | `INSERT INTO apontamento_org_tasks (apontamento_id, org_task_id, status)` |
| Vincular tarefa pessoal | `INSERT INTO apontamento_personal_tasks (apontamento_id, personal_task_id, status)` |
| Marcar tarefa | `UPDATE apontamento_org_tasks SET status = 'concluded' WHERE id = $id` |
| Prints capturados | `SELECT * FROM screenshots WHERE session_id = $session_id AND deleted_at IS NULL` + URL assinada do Storage |
| Curar print (soft delete) | `UPDATE screenshots SET deleted_at = now() WHERE id = $id` |

---

## 5. Tarefas Pessoais (`/tarefas`)

| Operação | Query |
|----------|-------|
| Listar | `SELECT * FROM personal_tasks WHERE user_id = auth.uid() ORDER BY priority` |
| Criar | `INSERT INTO personal_tasks (user_id, title, due_date)` |
| Atualizar status | `UPDATE personal_tasks SET status = $status WHERE id = $id` |
| Reordenar (drag) | `UPDATE personal_tasks SET priority = $priority WHERE id = $id` (em lote) |
| Deletar | `DELETE FROM personal_tasks WHERE id = $id` |
| Dependências | `INSERT/DELETE personal_task_dependencies` |

---

## 6. Tarefas da Org (`/tarefas-org`)

| Operação | Query |
|----------|-------|
| Listar projetos | `SELECT p.*, count(ot.id) as task_count FROM projects p LEFT JOIN org_tasks ot ON ot.project_id = p.id WHERE p.organization_id = $org_id GROUP BY p.id ORDER BY p.status, p.created_at` |
| Criar projeto | `INSERT INTO projects (organization_id, name, color, description, created_by)` |
| Fechar projeto | `UPDATE projects SET status = 'closed' WHERE id = $id` |
| Listar tarefas | `SELECT * FROM org_tasks WHERE project_id = $id ORDER BY priority` |
| Criar tarefa | `INSERT INTO org_tasks (organization_id, project_id, title, assigned_to, due_date, created_by)` |
| Atualizar status | `UPDATE org_tasks SET status = $status WHERE id = $id` |
| Atribuir responsável | `UPDATE org_tasks SET assigned_to = $user_id WHERE id = $id` |

---

## 7. Perfil (`/perfil`)

| Operação | Query |
|----------|-------|
| Carregar dados | `SELECT * FROM profiles WHERE id = auth.uid()` |
| Atualizar nome | `UPDATE profiles SET full_name = $name WHERE id = auth.uid()` |
| Trocar avatar | Upload para `avatars/{user_id}.jpg` → `UPDATE profiles SET avatar_url` |
| Trocar senha | `supabase.auth.updateUser({ password: $newPassword })` |
| Streak | Calculado: dias consecutivos com `apontamentos` até hoje para `user_id` |

---

## 8. Membros (`/admin/membros`)

| Operação | Query |
|----------|-------|
| Listar membros | `SELECT * FROM profiles WHERE organization_id = get_my_org_id()` |
| Ver org code | `SELECT code FROM organizations WHERE id = get_my_org_id()` |
| Promover admin | `UPDATE profiles SET role = 'tenant_admin' WHERE id = $member_id` (só tenant_admin executa) |
| Remover membro | `UPDATE profiles SET organization_id = NULL WHERE id = $member_id` (verificar `removed_member_retention_days`) |

---

## 9. Edge Functions (Supabase Deno)

### `generate-report`
Acionada após `sessions.status = 'stopped'` ou manualmente.

**Fluxo:**
1. Recebe `session_id`
2. Busca `screenshots` não processados da sessão
3. Gera URLs assinadas do Storage (expiram em 60s)
4. Chama `anthropic.messages.create` com model `claude-opus-4-8` e `image_url` para cada screenshot
5. Faz `INSERT INTO time_entries (user_id, session_id, content, entry_date)`
6. Marca screenshots como `processed = true`
7. Envia notificação via `INSERT INTO notifications`

### `cleanup-screenshots` (cron diário)
1. Busca `user_settings` com `retention_days`
2. Para cada usuário: `DELETE FROM screenshots WHERE user_id = $id AND captured_at < now() - interval '$days days'`
3. Remove arquivos do Storage nos mesmos paths

---

## 10. Agente Python

Ainda não existe. Precisa ser criado em repositório separado ou em `agent/` neste repo.

| Módulo | Responsabilidade |
|--------|-----------------|
| `agent.py` | Entry point, autenticação via `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` |
| `capture.py` | `mss.MSS()` → `PIL.Image` em memória |
| `redactor.py` | OCR + regex + `PIL.GaussianBlur` para dados sensíveis |
| `uploader.py` | Upload JPEG → Storage + `INSERT INTO screenshots` |
| `controller.py` | Realtime: escuta `sessions` do usuário, controla loop de captura |

**Dados sensíveis que devem ser redactados antes do upload:**
- API keys / tokens (`sk-`, `Bearer`, `ghp_`, etc.)
- Senhas em formulários
- Números de cartão de crédito
- CPF / CNPJ
- JWT tokens
- Chaves PEM / SSH

---

## 11. Notificações Realtime

O sino de notificações no `AppShell` precisa:

```ts
supabase
  .channel('notifications')
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
    (payload) => addNotification(payload.new)
  )
  .subscribe()
```

---

## Checklist de arquivos a criar no frontend

```
src/
├── lib/
│   └── supabase.ts              # cliente Supabase
├── hooks/
│   ├── useAuth.ts               # session, user, signIn, signOut
│   ├── useDashboard.ts          # stats, heatmap, sessão ativa
│   ├── useApontamentos.ts       # CRUD apontamentos + vínculos
│   ├── usePersonalTasks.ts      # CRUD tarefas pessoais
│   ├── useProjects.ts           # projetos da org
│   ├── useOrgTasks.ts           # CRUD org_tasks
│   ├── useProfile.ts            # perfil + avatar
│   ├── useMembers.ts            # membros da org
│   └── useNotifications.ts      # notificações + Realtime
└── types/
    └── database.ts              # tipos gerados pelo Supabase CLI
        # npx supabase gen types typescript --project-id <id> > src/types/database.ts
```

---

## Variáveis de ambiente necessárias

| Variável | Onde usar |
|----------|-----------|
| `VITE_SUPABASE_URL` | Frontend |
| `VITE_SUPABASE_ANON_KEY` | Frontend |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions (nunca no frontend) |
| `ANTHROPIC_API_KEY` | Edge Function `generate-report` |
| `SUPABASE_URL` | Agente Python |
| `SUPABASE_SERVICE_KEY` | Agente Python |
