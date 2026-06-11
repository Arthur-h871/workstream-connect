# Passo 13 — Apontamentos: vinculação de tarefas

## Objetivo

Tornar o card "Tarefas vinculadas" totalmente funcional — adicionar tarefas (pessoais e da org) via modal com busca, alternar status `started`/`concluded` com clique no ícone, e desvincular tarefas com botão de hover.

---

## Estado após o Passo 12

- `backend/api/services/apontamentos.service.ts` — `getApontamentos`, `createApontamento`, `updateApontamento`, `deleteApontamento`; tipos `Apontamento`, `LinkedTask`
- `backend/api/services/org-tasks.service.ts` — `getOrgTasks`, `createOrgTask`, `updateOrgTask`, `deleteOrgTask`; tipo `OrgTask`
- `backend/api/services/tarefas.service.ts` — `getPersonalTasks`, `createPersonalTask`, `updatePersonalTask`, `reorderPersonalTasks`, `deletePersonalTask`; tipo `PersonalTask`
- `src/routes/_authenticated.apontamentos.tsx` — carrega apontamentos reais; tarefas vinculadas exibidas somente leitura com badge "passo 13"; sem botão funcional de adição; `ApontamentoDetail` sem prop `userId`

---

## Escopo deste passo

| Funcionalidade | Neste passo |
|----------------|-------------|
| Modal para adicionar tarefas | ✅ |
| Busca por nome dentro do modal | ✅ |
| Tabs "Minhas tarefas" / "Da organização" | ✅ |
| Filtrar tarefas já vinculadas no modal | ✅ |
| Adicionar múltiplas tarefas de uma vez | ✅ |
| Alternar status `started` ↔ `concluded` | ✅ |
| Desvincular tarefa | ✅ |
| Galeria de screenshots | ❌ passo 19 |

---

## Contexto técnico

**Funções de vínculo retornam `LinkedTask`.** `linkPersonalTask` e `linkOrgTask` retornam a estrutura `LinkedTask` completa (com `link_id`, `title`, `status`, `type`) para que o estado local possa ser atualizado sem recarregar o apontamento inteiro.

**`getMyOrgTasks(userId)` filtra por `assigned_to`.** O modal mostra as org tasks atribuídas ao usuário — não todas da org. O usuário cria apontamentos sobre seu próprio trabalho; vincular tarefas de outros é um caso raro. A função fica em `org-tasks.service.ts` pois é uma query em `org_tasks` com filtro de usuário.

**Filtragem de já-vinculadas é client-side.** O modal recebe `alreadyLinked: LinkedTask[]` e filtra `personalTasks` e `orgTasks` por `task_id`. Evita adicionar duplicatas sem roundtrip extra ao banco.

**Carregamento lazy no modal.** As listas de tarefas disponíveis são buscadas dentro do `AddTaskModal` via `useEffect` ao montar. São duas queries em paralelo (`Promise.all`). Não há TanStack Query aqui — o modal tem vida curta e o dado não precisa de cache.

**Adição de múltiplas tarefas em paralelo.** `Promise.all` para todos os links selecionados. Se algum falhar (ex: UNIQUE constraint — tarefa já vinculada por race condition), o `if (!link) continue` ignora silenciosamente e os bem-sucedidos são adicionados ao estado local.

**Unlink e toggle sem confirmação.** Consistente com o padrão de delete imediato dos passos anteriores. O estado local é atualizado otimisticamente antes da chamada ao banco.

**`userId` agora é prop de `ApontamentoDetail`.** O modal precisa do `userId` para buscar tarefas. Como `ApontamentosPage` já tem `userId` vindo do loader, passa-se como nova prop — sem nenhum contexto extra necessário.

---

## Implementação

### 13.1 — Adicionar funções de vínculo a `apontamentos.service.ts`

**Arquivo:** `backend/api/services/apontamentos.service.ts` (adicionar ao arquivo existente)

- [ ] Adicionar as funções `linkPersonalTask`, `linkOrgTask`, `updateLinkedTaskStatus`, `unlinkTask`

```ts
export async function linkPersonalTask(
  apontamentoId: string,
  taskId: string
): Promise<LinkedTask | null> {
  const { data, error } = await supabase
    .from('apontamento_personal_tasks')
    .insert({ apontamento_id: apontamentoId, personal_task_id: taskId })
    .select('id, status, personal_tasks ( id, title )')
    .single()

  if (error || !data) return null
  return {
    link_id: data.id,
    task_id: (data.personal_tasks as any)?.id ?? '',
    title: (data.personal_tasks as any)?.title ?? '',
    status: data.status as 'started' | 'concluded',
    type: 'personal',
  }
}

export async function linkOrgTask(
  apontamentoId: string,
  taskId: string
): Promise<LinkedTask | null> {
  const { data, error } = await supabase
    .from('apontamento_org_tasks')
    .insert({ apontamento_id: apontamentoId, org_task_id: taskId })
    .select('id, status, org_tasks ( id, title )')
    .single()

  if (error || !data) return null
  return {
    link_id: data.id,
    task_id: (data.org_tasks as any)?.id ?? '',
    title: (data.org_tasks as any)?.title ?? '',
    status: data.status as 'started' | 'concluded',
    type: 'org',
  }
}

export async function updateLinkedTaskStatus(
  linkId: string,
  type: 'personal' | 'org',
  status: 'started' | 'concluded'
): Promise<void> {
  const table =
    type === 'personal' ? 'apontamento_personal_tasks' : 'apontamento_org_tasks'
  await supabase.from(table).update({ status }).eq('id', linkId)
}

export async function unlinkTask(
  linkId: string,
  type: 'personal' | 'org'
): Promise<void> {
  const table =
    type === 'personal' ? 'apontamento_personal_tasks' : 'apontamento_org_tasks'
  await supabase.from(table).delete().eq('id', linkId)
}
```

---

### 13.2 — Adicionar `getMyOrgTasks` a `org-tasks.service.ts`

**Arquivo:** `backend/api/services/org-tasks.service.ts` (adicionar ao arquivo existente)

- [ ] Adicionar o tipo `MyOrgTask` e a função `getMyOrgTasks`

```ts
export type MyOrgTask = {
  id: string
  title: string
  project_name: string | null
}

export async function getMyOrgTasks(userId: string): Promise<MyOrgTask[]> {
  const { data, error } = await supabase
    .from('org_tasks')
    .select('id, title, projects ( name )')
    .eq('assigned_to', userId)
    .neq('status', 'completed')
    .order('created_at', { ascending: false })

  if (error) return []
  return (data ?? []).map(row => ({
    id: row.id,
    title: row.title,
    project_name: (row.projects as any)?.name ?? null,
  }))
}
```

---

### 13.3 — Atualizar `_authenticated.apontamentos.tsx`

**Arquivo:** `src/routes/_authenticated.apontamentos.tsx` (reescrita completa)

- [ ] Adicionar `userId` como prop de `ApontamentoDetail`
- [ ] Passar `userId` no `<ApontamentoDetail key={...} ... userId={userId} />`
- [ ] Substituir badge "passo 13" por botão `+` funcional no card de tarefas
- [ ] Tornar ícone de cada tarefa clicável (toggle `started`/`concluded`)
- [ ] Adicionar botão X (invisível, visível no hover) para desvincular
- [ ] Adicionar `AddTaskModal` com tabs, busca e seleção múltipla

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { Plus, Circle, CheckCircle2, Trash2, X, Search } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { AppShell } from '@/components/AppShell'
import {
  getApontamentos,
  createApontamento,
  updateApontamento,
  deleteApontamento,
  linkPersonalTask,
  linkOrgTask,
  updateLinkedTaskStatus,
  unlinkTask,
  type Apontamento,
  type LinkedTask,
} from 'backend/api/services/apontamentos.service'
import { getPersonalTasks, type PersonalTask } from 'backend/api/services/tarefas.service'
import { getMyOrgTasks, type MyOrgTask } from 'backend/api/services/org-tasks.service'

export const Route = createFileRoute('/_authenticated/apontamentos')({
  head: () => ({
    meta: [
      { title: 'Apontamentos — Marco' },
      { name: 'description', content: 'Visualize e gerencie seus apontamentos diários.' },
    ],
  }),
  loader: async ({ context }) => {
    const apontamentos = await getApontamentos(context.profile.id)
    return {
      apontamentos,
      userId: context.profile.id,
      orgId: context.profile.organization_id,
    }
  },
  component: ApontamentosPage,
})

function ApontamentosPage() {
  const { apontamentos: initial, userId, orgId } = Route.useLoaderData()
  const [items, setItems] = useState<Apontamento[]>(initial)
  const [selectedId, setSelectedId] = useState<string | null>(initial[0]?.id ?? null)

  const selected = items.find(a => a.id === selectedId) ?? null

  async function handleCreate() {
    const novo = await createApontamento(userId, orgId)
    if (!novo) return
    setItems(prev => [novo, ...prev])
    setSelectedId(novo.id)
  }

  function handleUpdate(id: string, fields: Partial<Apontamento>) {
    setItems(prev => prev.map(a => (a.id === id ? { ...a, ...fields } : a)))
  }

  async function handleDelete(id: string) {
    const remaining = items.filter(a => a.id !== id)
    setItems(remaining)
    if (selectedId === id) setSelectedId(remaining[0]?.id ?? null)
    await deleteApontamento(id)
  }

  return (
    <div className="-mx-8 -my-8 flex h-screen bg-background">
      {/* Painel esquerdo — lista */}
      <aside className="flex w-[300px] shrink-0 flex-col border-r border-border">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h1 className="text-base font-semibold">Apontamentos</h1>
          <button
            onClick={handleCreate}
            className="flex h-7 w-7 items-center justify-center rounded-md bg-copper text-primary-foreground hover:opacity-90"
            aria-label="Novo apontamento"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          {items.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              Nenhum apontamento registrado
            </div>
          ) : (
            <div className="relative pl-5">
              <div className="absolute bottom-2 left-1.5 top-2 w-px bg-border" />
              <div className="space-y-2">
                {items.map(item => {
                  const active = item.id === selectedId
                  return (
                    <button
                      key={item.id}
                      onClick={() => setSelectedId(item.id)}
                      className={`relative block w-full rounded-md p-3 text-left transition-colors ${
                        active ? 'border-l-2 border-copper bg-surface pl-[10px]' : 'hover:bg-surface'
                      }`}
                    >
                      <span
                        className={`absolute -left-[14px] top-4 h-2 w-2 rounded-full ring-4 ring-background ${
                          active ? 'bg-copper' : 'bg-border'
                        }`}
                      />
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wide text-copper">
                          {formatDate(item.date)}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {formatTime(item.created_at)}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {item.content || 'Sem conteúdo'}
                      </p>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Painel direito — detalhe */}
      <div className="relative flex-1 overflow-y-auto p-8">
        {!selected ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Selecione um apontamento ou crie um novo
          </div>
        ) : (
          <ApontamentoDetail
            key={selected.id}
            apontamento={selected}
            userId={userId}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
          />
        )}
      </div>
    </div>
  )
}

function ApontamentoDetail({
  apontamento,
  userId,
  onUpdate,
  onDelete,
}: {
  apontamento: Apontamento
  userId: string
  onUpdate: (id: string, fields: Partial<Apontamento>) => void
  onDelete: (id: string) => Promise<void>
}) {
  const contentTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoursTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [showModal, setShowModal] = useState(false)

  function handleContentChange(value: string) {
    onUpdate(apontamento.id, { content: value })
    clearTimeout(contentTimer.current!)
    contentTimer.current = setTimeout(
      () => updateApontamento(apontamento.id, { content: value }),
      800
    )
  }

  function handleHoursChange(value: string) {
    const hours = parseFloat(value) || 0
    onUpdate(apontamento.id, { hours_worked: hours })
    clearTimeout(hoursTimer.current!)
    hoursTimer.current = setTimeout(
      () => updateApontamento(apontamento.id, { hours_worked: hours }),
      800
    )
  }

  async function handleToggleStatus(task: LinkedTask) {
    const newStatus = task.status === 'concluded' ? 'started' : 'concluded'
    onUpdate(apontamento.id, {
      linked_tasks: apontamento.linked_tasks.map(t =>
        t.link_id === task.link_id ? { ...t, status: newStatus } : t
      ),
    })
    await updateLinkedTaskStatus(task.link_id, task.type, newStatus)
  }

  async function handleUnlink(task: LinkedTask) {
    onUpdate(apontamento.id, {
      linked_tasks: apontamento.linked_tasks.filter(t => t.link_id !== task.link_id),
    })
    await unlinkTask(task.link_id, task.type)
  }

  function handleAdd(newLinks: LinkedTask[]) {
    onUpdate(apontamento.id, {
      linked_tasks: [...apontamento.linked_tasks, ...newLinks],
    })
  }

  return (
    <div className="grid grid-cols-12 gap-5">
      {/* Card principal */}
      <article className="col-span-12 rounded-lg border border-border bg-surface p-7 lg:col-span-8">
        <div className="mb-5 flex items-center justify-between border-b border-border pb-4">
          <div>
            <p className="text-sm font-medium">{formatDate(apontamento.date)}</p>
            <p className="font-mono text-xs text-muted-foreground">
              {formatTime(apontamento.created_at)}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Horas</span>
              <input
                type="number"
                step="0.25"
                min="0"
                defaultValue={apontamento.hours_worked}
                onChange={e => handleHoursChange(e.target.value)}
                className="w-20 rounded-md border border-border bg-background px-2 py-1 text-right font-mono text-sm focus:border-copper focus:outline-none"
              />
            </label>
            <button
              onClick={() => onDelete(apontamento.id)}
              className="flex items-center gap-1 text-xs text-destructive hover:underline"
            >
              <Trash2 className="h-3 w-3" /> Excluir
            </button>
          </div>
        </div>

        <textarea
          rows={10}
          defaultValue={apontamento.content}
          onChange={e => handleContentChange(e.target.value)}
          placeholder="Descreva o que foi feito…"
          className="w-full resize-none bg-transparent text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
        />

        <div className="mt-7 border-t border-border pt-5">
          <p className="section-label mb-3">
            Prints capturados · {apontamento.screenshot_count}
          </p>
          <div className="rounded-md border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
            {apontamento.screenshot_count === 0
              ? 'Nenhum print capturado'
              : `${apontamento.screenshot_count} print(s) — galeria disponível no Passo 19`}
          </div>
        </div>
      </article>

      {/* Card de tarefas vinculadas */}
      <aside className="col-span-12 rounded-lg border border-border bg-surface p-5 lg:col-span-4">
        <div className="mb-4 flex items-center justify-between">
          <p className="section-label">Tarefas vinculadas</p>
          <button
            onClick={() => setShowModal(true)}
            className="flex h-6 w-6 items-center justify-center rounded border border-border text-muted-foreground hover:bg-background hover:text-foreground"
            aria-label="Adicionar tarefa"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        <ul className="space-y-1">
          {apontamento.linked_tasks.length === 0 ? (
            <li className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
              Nenhuma tarefa vinculada
            </li>
          ) : (
            apontamento.linked_tasks.map(t => (
              <li
                key={t.link_id}
                className="group flex items-center gap-2.5 rounded-md px-2 py-2 hover:bg-background"
              >
                <button
                  onClick={() => handleToggleStatus(t)}
                  aria-label={
                    t.status === 'concluded'
                      ? 'Marcar como iniciada'
                      : 'Marcar como concluída'
                  }
                >
                  {t.status === 'concluded' ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 fill-[#10B981] text-background" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-copper" strokeWidth={2.5} />
                  )}
                </button>
                <span
                  className={`flex-1 text-sm ${
                    t.status === 'concluded'
                      ? 'text-muted-foreground line-through'
                      : 'text-foreground'
                  }`}
                >
                  {t.title}
                </span>
                <button
                  onClick={() => handleUnlink(t)}
                  aria-label="Desvincular tarefa"
                  className="invisible text-muted-foreground group-hover:visible hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))
          )}
        </ul>
      </aside>

      {showModal && (
        <AddTaskModal
          apontamentoId={apontamento.id}
          alreadyLinked={apontamento.linked_tasks}
          userId={userId}
          onAdd={handleAdd}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}

function AddTaskModal({
  apontamentoId,
  alreadyLinked,
  userId,
  onAdd,
  onClose,
}: {
  apontamentoId: string
  alreadyLinked: LinkedTask[]
  userId: string
  onAdd: (newLinks: LinkedTask[]) => void
  onClose: () => void
}) {
  const [tab, setTab] = useState<'personal' | 'org'>('personal')
  const [query, setQuery] = useState('')
  const [personalTasks, setPersonalTasks] = useState<PersonalTask[]>([])
  const [orgTasks, setOrgTasks] = useState<MyOrgTask[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(new Map<string, 'personal' | 'org'>())
  const [saving, setSaving] = useState(false)

  const alreadyLinkedIds = new Set(alreadyLinked.map(t => t.task_id))

  useEffect(() => {
    async function load() {
      const [personal, org] = await Promise.all([
        getPersonalTasks(userId),
        getMyOrgTasks(userId),
      ])
      setPersonalTasks(personal)
      setOrgTasks(org)
      setLoading(false)
    }
    load()
  }, [userId])

  const filteredPersonal = personalTasks.filter(
    t =>
      !alreadyLinkedIds.has(t.id) &&
      t.title.toLowerCase().includes(query.toLowerCase())
  )

  const filteredOrg = orgTasks.filter(
    t =>
      !alreadyLinkedIds.has(t.id) &&
      t.title.toLowerCase().includes(query.toLowerCase())
  )

  function toggle(id: string, type: 'personal' | 'org') {
    setSelected(prev => {
      const next = new Map(prev)
      if (next.has(id)) next.delete(id)
      else next.set(id, type)
      return next
    })
  }

  async function handleAdd() {
    if (selected.size === 0 || saving) return
    setSaving(true)

    const results: LinkedTask[] = []
    await Promise.all(
      Array.from(selected.entries()).map(async ([taskId, type]) => {
        const link =
          type === 'personal'
            ? await linkPersonalTask(apontamentoId, taskId)
            : await linkOrgTask(apontamentoId, taskId)
        if (link) results.push(link)
      })
    )

    onAdd(results)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-lg border border-border bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold">Adicionar tarefas</h2>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Busca */}
        <div className="border-b border-border px-5 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar tarefa…"
              className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm focus:border-copper focus:outline-none"
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          {(['personal', 'org'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                tab === t
                  ? 'border-b-2 border-copper text-copper'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t === 'personal' ? 'Minhas tarefas' : 'Da organização'}
            </button>
          ))}
        </div>

        {/* Lista */}
        <div className="max-h-60 overflow-y-auto px-3 py-2">
          {loading ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              Carregando…
            </div>
          ) : tab === 'personal' ? (
            filteredPersonal.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                Nenhuma tarefa disponível
              </div>
            ) : (
              <ul className="space-y-0.5">
                {filteredPersonal.map(t => (
                  <li key={t.id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-background">
                      <input
                        type="checkbox"
                        checked={selected.has(t.id)}
                        onChange={() => toggle(t.id, 'personal')}
                        className="h-3.5 w-3.5 accent-copper"
                      />
                      <span className="text-sm">{t.title}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )
          ) : filteredOrg.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              Nenhuma tarefa disponível
            </div>
          ) : (
            <ul className="space-y-0.5">
              {filteredOrg.map(t => (
                <li key={t.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-background">
                    <input
                      type="checkbox"
                      checked={selected.has(t.id)}
                      onChange={() => toggle(t.id, 'org')}
                      className="h-3.5 w-3.5 accent-copper"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{t.title}</p>
                      {t.project_name && (
                        <p className="text-xs text-teal">{t.project_name}</p>
                      )}
                    </div>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <span className="text-xs text-muted-foreground">
            {selected.size > 0 ? `${selected.size} selecionada(s)` : ''}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              Cancelar
            </button>
            <button
              onClick={handleAdd}
              disabled={selected.size === 0 || saving}
              className="rounded-md bg-copper px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
            >
              {saving ? 'Adicionando…' : 'Adicionar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(year, month - 1, day))
}

function formatTime(isoStr: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(isoStr))
}
```

---

## Verificação manual

### Cenário 1 — Abrir modal e carregar tarefas

1. Selecionar um apontamento → clicar `+` no card "Tarefas vinculadas"
2. **Esperado:** modal abre; tab "Minhas tarefas" ativa; enquanto carrega, exibe "Carregando…"
3. Após carregar: lista de tarefas pessoais do usuário **não** inclui as já vinculadas ao apontamento
4. Clicar na tab "Da organização" → exibe tarefas `assigned_to = userId` com `status != completed`, com nome do projeto embaixo

### Cenário 2 — Busca por nome

1. Com o modal aberto, digitar parte do nome de uma tarefa no campo de busca
2. **Esperado:** lista filtra em tempo real (client-side); sem nova query ao banco
3. Limpar campo → lista completa volta

### Cenário 3 — Adicionar tarefas

1. Marcar 2 tarefas pessoais → clicar "Adicionar"
2. **Esperado:** botão muda para "Adicionando…"; modal fecha; card lateral exibe as 2 novas tarefas com ícone `Circle` (status `started`)
3. Verificar no Supabase: 2 novas linhas em `apontamento_personal_tasks` com `apontamento_id` e `status = 'started'`
4. Abrir o modal novamente → as 2 tarefas recém-adicionadas **não aparecem** mais na lista (filtradas)

### Cenário 4 — Alternar status para concluída

1. No card de tarefas, clicar no ícone `Circle` de uma tarefa
2. **Esperado:** ícone muda para `CheckCircle2` verde, texto fica riscado — imediato (otimistic)
3. Verificar no Supabase: `status = 'concluded'` na tabela correspondente
4. Clicar novamente → volta para `Circle` e `status = 'started'`

### Cenário 5 — Desvincular tarefa

1. Passar o mouse sobre uma tarefa vinculada → botão `X` fica visível
2. Clicar `X`
3. **Esperado:** tarefa some do card imediatamente (otimistic)
4. Verificar no Supabase: linha deletada de `apontamento_personal_tasks` ou `apontamento_org_tasks`
5. Abrir modal novamente → tarefa desvinculada volta a aparecer na lista

### Cenário 6 — Nenhuma tarefa disponível

1. Vincular todas as tarefas pessoais ao apontamento → abrir modal
2. **Esperado:** tab "Minhas tarefas" exibe "Nenhuma tarefa disponível"

### Cenário 7 — Persistência após recarregar

1. Vincular uma tarefa, marcá-la como concluída
2. Recarregar a página (`F5`)
3. **Esperado:** tarefa aparece como concluída (checkmark verde)

---

## Requisitos para considerar concluído

- [ ] `linkPersonalTask`, `linkOrgTask`, `updateLinkedTaskStatus`, `unlinkTask` adicionados a `apontamentos.service.ts`
- [ ] `MyOrgTask` e `getMyOrgTasks` adicionados a `org-tasks.service.ts`
- [ ] `ApontamentoDetail` recebe `userId: string` como nova prop
- [ ] `<ApontamentoDetail ... userId={userId} />` atualizado no `ApontamentosPage`
- [ ] Botão `+` funcional no card de tarefas abre `AddTaskModal`
- [ ] Modal carrega tarefas pessoais e da org em paralelo ao montar
- [ ] Modal filtra tarefas já vinculadas (client-side por `task_id`)
- [ ] Busca filtra client-side em tempo real
- [ ] Seleção múltipla com `Map<string, 'personal' | 'org'>`
- [ ] "Adicionar" cria todos os links em `Promise.all` e fecha modal
- [ ] Clicar no ícone toggle alterna `started` ↔ `concluded` (otimistic + banco)
- [ ] Botão X visível no hover remove o vínculo (otimistic + banco)
- [ ] `handleAdd` adiciona novos links ao estado local sem recarregar

---

## O que não fazer

- Não usar `value` nas textareas de conteúdo — vem do passo 12; manter `defaultValue` + `key={apontamento.id}`
- Não recarregar o apontamento inteiro após adicionar tarefas — usar `onUpdate` com os novos `linked_tasks`
- Não confirmar o unlink com modal — remoção imediata é o padrão estabelecido nos passos anteriores
- Não mostrar todas as org_tasks da organização no modal — usar `getMyOrgTasks(userId)` que filtra por `assigned_to`; mostrar todas seria over-fetch e ruído para o usuário
- Não usar `useQuery` / `invalidateQueries` no modal — o modal tem vida curta e não precisa de cache; `useState` + `useEffect` é suficiente

---

## Próximo Passo

Após concluir: executar `passo_14.md` — conectar o dashboard com dados reais (heatmap, horas no mês, contadores de tarefas, apontamentos recentes e prazos da org).
