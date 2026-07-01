# Passo 11 — Tarefas da organização: CRUD

## Objetivo
Substituir `mockTasks: string[] = []` em `ProjectView` por tarefas reais — listar, criar, atualizar status/nota/responsável/prazo/descrição e deletar `org_tasks` de cada projeto.

---

## Estado após o Passo 10

- `backend/api/services/projects.service.ts` — `getProject`, `getProjects`, `createProject`, `closeProject`
- `src/routes/_authenticated.tarefas-org_.$projectId.tsx` — `ProjectView` com `mockTasks: string[] = []`; loader só busca dados do projeto
- `src/routes/tarefas-org.tsx` — grid de projetos conectado ao banco
- `backend/api/services/users.service.ts` — `getProfile`, tipo `UserProfile`

---

## Escopo deste passo

| Campo | Quem edita | Neste passo |
|-------|-----------|-------------|
| Status | Todos os membros | ✅ |
| Nota | Todos os membros | ✅ |
| Descrição | Admin | ✅ |
| Responsável | Admin | ✅ |
| Prazo | Admin | ✅ |
| Criar tarefa | Admin | ✅ |
| Deletar tarefa | Admin | ✅ |
| Dependências entre tarefas | — | ❌ fora do escopo |

---

## Contexto técnico

**RLS para `tenant_user`.** A política "Membro atualiza status e nota de tarefas" permite UPDATE quando `get_my_role() = 'tenant_user'`; o `WITH CHECK` só restringe `assigned_to`. A UI reflete isso: `tenant_user` vê e edita status e nota; campos de admin (responsável, prazo, descrição, delete) são ocultados.

**`getOrgMembers` vai em `users.service.ts`.** A query é em `profiles` — mesmo arquivo responsável por queries de perfis de usuário. Evita criar um terceiro service para uma única função.

**Loader paralelo.** `Promise.all([getProject, getOrgTasks, getOrgMembers])` — as três queries são independentes e devem rodar em paralelo.

**`orgId` via loader.** O tipo `Project` não expõe `organization_id`. O loader tem acesso a `context.profile.organization_id` e o passa como campo separado no retorno — necessário para `createOrgTask`.

**Debounce para `description` e `note`.** 800ms com `useRef<ReturnType<typeof setTimeout> | null>` dentro de `TaskRow`. Campos não-debounced (status, assigned_to, due_date) salvam imediatamente via `updateOrgTask`.

**`SegmentedStatus` agora controlado.** Recebe `value: OrgTask['status']` e `onChange: (status: OrgTask['status']) => void` — sem mapeamento string→enum; usa os valores do DB diretamente.

**Textareas de `description` e `note`: `defaultValue` (não controlado).** Evita conflito de cursor durante digitação. O estado do pai é atualizado otimisticamente via `onUpdate` para manter consistência se o painel for fechado e reaberto.

---

## Implementação

### 11.1 — Adicionar `getOrgMembers` a `users.service.ts`

**Arquivo:** `backend/api/services/users.service.ts`

- [ ] Adicionar o tipo `OrgMember` e a função `getOrgMembers`

```ts
export type OrgMember = {
  id: string
  full_name: string
}

export async function getOrgMembers(orgId: string): Promise<OrgMember[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('organization_id', orgId)
    .order('full_name')

  if (error) return []
  return data ?? []
}
```

---

### 11.2 — Criar `org-tasks.service.ts`

**Arquivo:** `backend/api/services/org-tasks.service.ts` (novo arquivo)

- [ ] Criar o arquivo com o tipo `OrgTask`, alias `OrgTaskUpdate` e as 4 funções

```ts
import { supabase } from '../supabase'

export type OrgTask = {
  id: string
  title: string
  description: string | null
  status: 'queued' | 'in_progress' | 'completed'
  priority: number
  due_date: string | null
  note: string | null
  assigned_to: string | null
  created_at: string
}

export type OrgTaskUpdate = Partial<
  Pick<OrgTask, 'title' | 'description' | 'status' | 'due_date' | 'note' | 'assigned_to'>
>

const TASK_SELECT = 'id, title, description, status, priority, due_date, note, assigned_to, created_at'

export async function getOrgTasks(projectId: string): Promise<OrgTask[]> {
  const { data, error } = await supabase
    .from('org_tasks')
    .select(TASK_SELECT)
    .eq('project_id', projectId)
    .order('priority', { ascending: true })

  if (error) return []
  return data ?? []
}

export async function createOrgTask(data: {
  projectId: string
  orgId: string
  createdBy: string
  title: string
}): Promise<OrgTask | null> {
  const { data: row, error } = await supabase
    .from('org_tasks')
    .insert({
      project_id: data.projectId,
      organization_id: data.orgId,
      created_by: data.createdBy,
      title: data.title,
    })
    .select(TASK_SELECT)
    .single()

  if (error || !row) return null
  return row
}

export async function updateOrgTask(id: string, fields: OrgTaskUpdate): Promise<void> {
  await supabase.from('org_tasks').update(fields).eq('id', id)
}

export async function deleteOrgTask(id: string): Promise<void> {
  await supabase.from('org_tasks').delete().eq('id', id)
}
```

---

### 11.3 — Reescrever `_authenticated.tarefas-org_.$projectId.tsx`

**Arquivo:** `src/routes/_authenticated.tarefas-org_.$projectId.tsx`

- [ ] Atualizar o loader: `Promise.all` para projeto + tarefas + membros; retornar `orgId`, `userId`, `isAdmin`
- [ ] Reescrever `ProjectView` com estado real, criação inline e `TaskRow`
- [ ] Substituir `SegmentedStatus` não-controlado pela versão controlada
- [ ] Implementar debounce para `description` e `note` dentro de `TaskRow`

```tsx
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import { useState, useRef } from 'react'
import { AppShell } from '@/components/AppShell'
import { getProject } from 'backend/api/services/projects.service'
import {
  getOrgTasks,
  createOrgTask,
  updateOrgTask,
  deleteOrgTask,
  type OrgTask,
} from 'backend/api/services/org-tasks.service'
import { getOrgMembers, type OrgMember } from 'backend/api/services/users.service'

export const Route = createFileRoute('/_authenticated/tarefas-org/$projectId')({
  loader: async ({ params, context }) => {
    const [project, tasks, members] = await Promise.all([
      getProject(params.projectId),
      getOrgTasks(params.projectId),
      getOrgMembers(context.profile.organization_id),
    ])
    if (!project) throw redirect({ to: '/tarefas-org' })
    return {
      project,
      tasks,
      members,
      orgId: context.profile.organization_id,
      userId: context.profile.id,
      isAdmin: context.profile.role !== 'tenant_user',
    }
  },
  component: ProjectPage,
})

function ProjectPage() {
  const { project, tasks, members, orgId, userId, isAdmin } = Route.useLoaderData()
  return (
    <AppShell title="Tarefas da Organização">
      <ProjectView
        project={project}
        initialTasks={tasks}
        members={members}
        orgId={orgId}
        userId={userId}
        isAdmin={isAdmin}
      />
    </AppShell>
  )
}

function ProjectView({
  project,
  initialTasks,
  members,
  orgId,
  userId,
  isAdmin,
}: {
  project: { id: string; name: string; color: string }
  initialTasks: OrgTask[]
  members: OrgMember[]
  orgId: string
  userId: string
  isAdmin: boolean
}) {
  const [tasks, setTasks] = useState<OrgTask[]>(initialTasks)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')

  function handleUpdate(id: string, fields: Partial<OrgTask>) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...fields } : t))
  }

  async function handleCreate() {
    const title = newTitle.trim()
    if (!title) return
    const task = await createOrgTask({
      projectId: project.id,
      orgId,
      createdBy: userId,
      title,
    })
    if (task) setTasks(prev => [...prev, task])
    setNewTitle('')
    setCreating(false)
  }

  function handleDelete(id: string) {
    setTasks(prev => prev.filter(t => t.id !== id))
    deleteOrgTask(id)
  }

  return (
    <div>
      <Link
        to="/tarefas-org"
        className="mb-4 inline-block text-xs text-muted-foreground hover:text-foreground"
      >
        ← Voltar para projetos
      </Link>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: project.color }} />
          <h2 className="text-2xl font-semibold">{project.name}</h2>
        </div>
        {isAdmin && (
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-teal px-3 py-1.5 text-sm font-semibold text-background hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" /> Nova tarefa
          </button>
        )}
      </div>

      {creating && (
        <div className="mb-2 overflow-hidden rounded-lg border border-teal bg-surface">
          <input
            autoFocus
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreate()
              if (e.key === 'Escape') { setCreating(false); setNewTitle('') }
            }}
            placeholder="Título da tarefa..."
            className="w-full bg-transparent px-4 py-3 text-sm focus:outline-none"
          />
        </div>
      )}

      {tasks.length === 0 && !creating ? (
        <div className="rounded-lg border border-dashed border-border bg-surface px-4 py-12 text-center text-sm text-muted-foreground">
          Nenhuma tarefa neste projeto
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map(task => (
            <TaskRow
              key={task.id}
              task={task}
              members={members}
              isAdmin={isAdmin}
              isOpen={expanded === task.id}
              onToggle={() => setExpanded(prev => prev === task.id ? null : task.id)}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const STATUS_LABELS: Record<OrgTask['status'], string> = {
  queued: 'Na fila',
  in_progress: 'Em progresso',
  completed: 'Concluída',
}

function TaskRow({
  task,
  members,
  isAdmin,
  isOpen,
  onToggle,
  onUpdate,
  onDelete,
}: {
  task: OrgTask
  members: OrgMember[]
  isAdmin: boolean
  isOpen: boolean
  onToggle: () => void
  onUpdate: (id: string, fields: Partial<OrgTask>) => void
  onDelete: (id: string) => void
}) {
  const descDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const noteDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleDescChange(value: string) {
    onUpdate(task.id, { description: value })
    clearTimeout(descDebounce.current!)
    descDebounce.current = setTimeout(() => updateOrgTask(task.id, { description: value }), 800)
  }

  function handleNoteChange(value: string) {
    onUpdate(task.id, { note: value })
    clearTimeout(noteDebounce.current!)
    noteDebounce.current = setTimeout(() => updateOrgTask(task.id, { note: value }), 800)
  }

  function handleStatusChange(status: OrgTask['status']) {
    onUpdate(task.id, { status })
    updateOrgTask(task.id, { status })
  }

  function handleAssignedChange(value: string) {
    const assigned_to = value || null
    onUpdate(task.id, { assigned_to })
    updateOrgTask(task.id, { assigned_to })
  }

  function handleDueDateChange(value: string) {
    const due_date = value || null
    onUpdate(task.id, { due_date })
    updateOrgTask(task.id, { due_date })
  }

  const done = task.status === 'completed'

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-3">
          <span className={`text-sm font-medium ${done ? 'text-muted-foreground line-through' : ''}`}>
            {task.title}
          </span>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
            done
              ? 'bg-[#10B98119] text-[#10B981]'
              : task.status === 'in_progress'
                ? 'bg-copper-soft text-copper'
                : 'bg-border text-muted-foreground'
          }`}>
            {STATUS_LABELS[task.status]}
          </span>
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="space-y-5 border-t border-border px-5 py-5">
          {isAdmin && (
            <Section label="Descrição">
              <textarea
                rows={2}
                defaultValue={task.description ?? ''}
                onChange={e => handleDescChange(e.target.value)}
                className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-teal focus:outline-none"
              />
            </Section>
          )}

          <Section label="Status">
            <SegmentedStatus value={task.status} onChange={handleStatusChange} />
          </Section>

          {isAdmin && (
            <div className="grid grid-cols-2 gap-5">
              <Section label="Responsável">
                <select
                  value={task.assigned_to ?? ''}
                  onChange={e => handleAssignedChange(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-teal focus:outline-none"
                >
                  <option value="">Selecionar...</option>
                  {members.map(m => (
                    <option key={m.id} value={m.id}>{m.full_name}</option>
                  ))}
                </select>
              </Section>
              <Section label="Prazo">
                <input
                  type="date"
                  value={task.due_date ?? ''}
                  onChange={e => handleDueDateChange(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-teal focus:outline-none"
                />
              </Section>
            </div>
          )}

          <Section label="Nota">
            <textarea
              rows={3}
              defaultValue={task.note ?? ''}
              onChange={e => handleNoteChange(e.target.value)}
              className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-teal focus:outline-none"
            />
          </Section>

          {isAdmin && (
            <div className="flex justify-end">
              <button
                onClick={() => onDelete(task.id)}
                className="inline-flex items-center gap-1 text-xs text-destructive hover:underline"
              >
                <Trash2 className="h-3 w-3" /> Excluir tarefa
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const STATUS_OPTS: { label: string; status: OrgTask['status'] }[] = [
  { label: 'Na fila', status: 'queued' },
  { label: 'Em progresso', status: 'in_progress' },
  { label: 'Concluída', status: 'completed' },
]

function SegmentedStatus({
  value,
  onChange,
}: {
  value: OrgTask['status']
  onChange: (status: OrgTask['status']) => void
}) {
  return (
    <div className="inline-flex rounded-md border border-border bg-background p-0.5">
      {STATUS_OPTS.map(o => (
        <button
          key={o.status}
          onClick={() => onChange(o.status)}
          className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
            value === o.status
              ? o.status === 'completed'
                ? 'bg-[#10B98119] text-[#10B981]'
                : 'bg-teal-soft text-teal'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="section-label mb-2">{label}</p>
      {children}
    </div>
  )
}
```

---

## Verificação manual

### Cenário 1 — Listar tarefas

1. Abrir `/tarefas-org/$projectId` com projeto que tem tarefas no banco
2. **Esperado:** lista de tarefas com título e badge de status
3. Projeto sem tarefas → estado vazio

### Cenário 2 — Criar tarefa (admin)

1. Clicar "Nova tarefa" → input aparece com foco
2. Digitar título → Enter
3. **Esperado:** tarefa aparece no final da lista; linha criada em `org_tasks`
4. Escape → cancela sem criar
5. Botão "Nova tarefa" ausente para `tenant_user`

### Cenário 3 — Atualizar status

1. Expandir tarefa → clicar em "Em progresso" no `SegmentedStatus`
2. **Esperado:** badge no header atualiza imediatamente; `org_tasks.status = 'in_progress'` no banco
3. Repetir como `tenant_user` → deve funcionar (RLS permite)

### Cenário 4 — Editar nota (debounce)

1. Expandir tarefa → digitar no campo Nota
2. Aguardar 800ms sem digitar
3. **Esperado:** `org_tasks.note` atualizado; sem request durante a digitação

### Cenário 5 — Atribuir responsável (admin)

1. Expandir tarefa → selecionar membro no select Responsável
2. **Esperado:** `org_tasks.assigned_to` atualizado imediatamente
3. Campos Responsável e Prazo ausentes para `tenant_user`

### Cenário 6 — Deletar tarefa (admin)

1. Expandir tarefa → "Excluir tarefa"
2. **Esperado:** tarefa some da lista; linha deletada em `org_tasks`
3. Botão ausente para `tenant_user`

### Cenário 7 — Recarregar página

1. Fazer mudanças → recarregar
2. **Esperado:** dados persistidos; accordion fechado (sem estado de UI persistido — correto)

---

## Requisitos para considerar concluído

- [ ] `OrgMember` e `getOrgMembers` adicionados a `users.service.ts`
- [ ] `backend/api/services/org-tasks.service.ts` criado com `getOrgTasks`, `createOrgTask`, `updateOrgTask`, `deleteOrgTask`
- [ ] Loader busca projeto + tarefas + membros em paralelo
- [ ] Loader passa `orgId`, `userId`, `isAdmin` junto com projeto e tarefas
- [ ] Criação inline funcional: Enter cria, Escape cancela, foco automático
- [ ] `SegmentedStatus` controlado: `value` vem do banco, `onChange` salva imediatamente
- [ ] Debounce de 800ms em `description` e `note`
- [ ] `assigned_to` e `due_date` salvam imediatamente ao mudar
- [ ] Campos Descrição, Responsável, Prazo e botão Excluir ausentes para `tenant_user`
- [ ] Otimistic update: UI reflete mudanças antes da confirmação do banco

---

## O que não fazer

- Não recriar o mapeamento string → enum no `SegmentedStatus` — passar `OrgTask['status']` diretamente evita dois mapas
- Não usar `value` nas textareas de `description` e `note` — causa conflito de cursor durante debounce; usar `defaultValue`
- Não chamar `getOrgMembers` com `project_id` — a tabela `profiles` não tem esse campo; filtrar por `organization_id`
- Não mostrar `assigned_to` como select para `tenant_user` — RLS bloqueia no banco, mas gerar o request desnecessário e expor a UI de atribuição é confuso
- Não implementar reordenação de tarefas da org neste passo — drag-and-drop entre projetos é escopo futuro
- Não carregar `org_tasks` na rota `tarefas-org.tsx` (grid de projetos) — a contagem via `org_tasks(count)` no `getProjects` é suficiente; carregar tasks completas lá seria over-fetch

---

## Próximo Passo

Após concluir: executar `passo_12.md` — conectar `/apontamentos` para listar apontamentos existentes e permitir criação manual.
