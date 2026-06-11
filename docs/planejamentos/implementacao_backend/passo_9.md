# Passo 9 — Tarefas pessoais: CRUD completo

## Objetivo
Conectar `/tarefas` ao banco — listar, criar inline, editar (descrição, status, prazo), reordenar por drag & drop e deletar tarefas pessoais.

---

## Estado após o Passo 8

- `backend/api/services/users.service.ts` — exporta `getProfile`, `UserProfile`
- `src/routes/_authenticated.tsx` — `beforeLoad` retorna `{ profile }` no contexto da rota
- `src/routes/tarefas.tsx` — lista estática vazia; FAB sem ação; handle de drag decorativo; textarea e botão de delete sem lógica

---

## Decisões de design (alinhadas)

| Decisão | Escolha |
|---------|---------|
| Criação | Inline no topo da lista: FAB revela input; Enter cria; Escape fecha |
| Drag & drop | `@dnd-kit/core` + `@dnd-kit/sortable` |
| Edição de descrição | Debounce: salva 800 ms após parar de digitar |
| Mudança de status | Select no painel expandido (3 opções: Fila / Em progresso / Concluída) |

---

## Contexto técnico

**Loader do TanStack Router para carregar tarefas.** O contexto da rota pai `/_authenticated` já contém `profile` (passo 8). O `loader` de `tarefas.tsx` recebe esse contexto e chama `getPersonalTasks(context.profile.id)` — sem precisar chamar `getSession()` novamente. Os dados chegam antes da renderização, sem estado de loading.

**`priority` como inteiro crescente.** Menor valor = maior prioridade. Ao criar, a nova tarefa recebe `max(priority) + 1`. Ao reordenar, os índices do array pós-drag são escritos de volta como os novos valores de `priority` via `reorderPersonalTasks`.

**Debounce sem biblioteca.** Um `useEffect` com `setTimeout(800ms)` + cleanup via `clearTimeout` — sem `use-debounce` ou similar. Aplica-se à `description` e ao `title` (editável inline no painel expandido).

**RLS transparente.** `personal_tasks` tem política `user_id = auth.uid()` para todas as operações — o service não precisa filtrar por userId no update/delete (o banco recusa qualquer tentativa de acessar tarefa de outro usuário).

---

## Implementação

### 9.1 — Instalar @dnd-kit

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

---

### 9.2 — Criar `tarefas.service.ts`

**Arquivo:** `backend/api/services/tarefas.service.ts` (novo arquivo)

- [ ] Criar o arquivo com as 5 funções

```ts
import { supabase } from '../supabase'

export type PersonalTask = {
  id: string
  title: string
  description: string | null
  status: 'queued' | 'in_progress' | 'completed'
  priority: number
  due_date: string | null
  created_at: string
  updated_at: string
}

export async function getPersonalTasks(userId: string): Promise<PersonalTask[]> {
  const { data, error } = await supabase
    .from('personal_tasks')
    .select('id, title, description, status, priority, due_date, created_at, updated_at')
    .eq('user_id', userId)
    .order('priority', { ascending: true })

  if (error) return []
  return data ?? []
}

export async function createPersonalTask(
  userId: string,
  title: string
): Promise<PersonalTask | null> {
  const { data: last } = await supabase
    .from('personal_tasks')
    .select('priority')
    .eq('user_id', userId)
    .order('priority', { ascending: false })
    .limit(1)

  const nextPriority = last && last.length > 0 ? last[0].priority + 1 : 0

  const { data, error } = await supabase
    .from('personal_tasks')
    .insert({ user_id: userId, title, priority: nextPriority })
    .select('id, title, description, status, priority, due_date, created_at, updated_at')
    .single()

  if (error) return null
  return data
}

export async function updatePersonalTask(
  id: string,
  fields: Partial<Pick<PersonalTask, 'title' | 'description' | 'status' | 'due_date'>>
): Promise<void> {
  await supabase.from('personal_tasks').update(fields).eq('id', id)
}

export async function reorderPersonalTasks(
  updates: { id: string; priority: number }[]
): Promise<void> {
  await Promise.all(
    updates.map(({ id, priority }) =>
      supabase.from('personal_tasks').update({ priority }).eq('id', id)
    )
  )
}

export async function deletePersonalTask(id: string): Promise<void> {
  await supabase.from('personal_tasks').delete().eq('id', id)
}
```

---

### 9.3 — Reescrever `tarefas.tsx`

**Arquivo:** `src/routes/tarefas.tsx` (reescrita completa)

- [ ] Adicionar `loader` que lê `context.profile.id` e busca tarefas
- [ ] Adicionar input inline (exibido quando `adding === true`)
- [ ] Implementar `@dnd-kit` para reordenação
- [ ] Implementar debounce para edição de título e descrição
- [ ] Implementar select de status no painel expandido
- [ ] Adicionar input de prazo (`<input type="date">`) no painel expandido
- [ ] Ligar botão de delete
- [ ] Remover mock `initial` e demais dados estáticos

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { Plus, GripVertical, ChevronDown, Trash2 } from 'lucide-react'
import { useState, useEffect, useRef, useCallback } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AppShell } from '@/components/AppShell'
import {
  getPersonalTasks,
  createPersonalTask,
  updatePersonalTask,
  reorderPersonalTasks,
  deletePersonalTask,
  type PersonalTask,
} from 'backend/api/services/tarefas.service'

export const Route = createFileRoute('/_authenticated/tarefas')({
  head: () => ({
    meta: [
      { title: 'Minhas Tarefas — Marco' },
      { name: 'description', content: 'Suas tarefas pessoais.' },
    ],
  }),
  loader: async ({ context }) => {
    const tasks = await getPersonalTasks(context.profile.id)
    return { tasks, userId: context.profile.id }
  },
  component: () => (
    <AppShell title="Minhas Tarefas">
      <Tarefas />
    </AppShell>
  ),
})

const STATUS_LABELS: Record<PersonalTask['status'], string> = {
  queued: 'Fila',
  in_progress: 'Em progresso',
  completed: 'Concluída',
}

const STATUS_CLASSES: Record<PersonalTask['status'], string> = {
  queued: 'bg-border text-muted-foreground',
  in_progress: 'bg-copper-soft text-copper',
  completed: 'bg-[#10B98119] text-[#10B981]',
}

function Tarefas() {
  const { tasks: initial, userId } = Route.useLoaderData()
  const [tasks, setTasks] = useState<PersonalTask[]>(initial)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const addInputRef = useRef<HTMLInputElement>(null)

  const sensors = useSensors(useSensor(PointerSensor))

  useEffect(() => {
    if (adding) addInputRef.current?.focus()
  }, [adding])

  async function handleCreate() {
    const title = newTitle.trim()
    if (!title) {
      setAdding(false)
      return
    }
    const task = await createPersonalTask(userId, title)
    if (task) setTasks(prev => [...prev, task])
    setNewTitle('')
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = tasks.findIndex(t => t.id === active.id)
    const newIndex = tasks.findIndex(t => t.id === over.id)
    const reordered = arrayMove(tasks, oldIndex, newIndex)

    setTasks(reordered)
    await reorderPersonalTasks(
      reordered.map((t, i) => ({ id: t.id, priority: i }))
    )
  }

  async function handleDelete(id: string) {
    setTasks(prev => prev.filter(t => t.id !== id))
    if (expanded === id) setExpanded(null)
    await deletePersonalTask(id)
  }

  function updateLocal(id: string, fields: Partial<PersonalTask>) {
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, ...fields } : t)))
  }

  return (
    <div className="relative">
      <p className="mb-6 text-sm text-muted-foreground">Arraste para reordenar por prioridade.</p>

      {adding && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-copper bg-surface px-3 py-3">
          <GripVertical className="h-4 w-4 text-muted-foreground/30" />
          <input
            ref={addInputRef}
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreate()
              if (e.key === 'Escape') { setAdding(false); setNewTitle('') }
            }}
            onBlur={() => { if (!newTitle.trim()) setAdding(false) }}
            placeholder="Nome da tarefa…"
            className="flex-1 bg-transparent text-sm focus:outline-none"
          />
          <span className="text-xs text-muted-foreground">↵ criar · Esc cancelar</span>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {tasks.length === 0 && !adding ? (
              <div className="rounded-lg border border-dashed border-border bg-surface px-4 py-12 text-center text-sm text-muted-foreground">
                Nenhuma tarefa criada
              </div>
            ) : (
              tasks.map(task => (
                <TaskRow
                  key={task.id}
                  task={task}
                  expanded={expanded === task.id}
                  onToggle={() => setExpanded(expanded === task.id ? null : task.id)}
                  onUpdate={updateLocal}
                  onDelete={handleDelete}
                />
              ))
            )}
          </div>
        </SortableContext>
      </DndContext>

      <button
        onClick={() => setAdding(true)}
        className="fixed bottom-8 right-8 flex h-12 w-12 items-center justify-center rounded-full bg-copper text-primary-foreground shadow-lg hover:opacity-90"
      >
        <Plus className="h-5 w-5" />
      </button>
    </div>
  )
}

function TaskRow({
  task,
  expanded,
  onToggle,
  onUpdate,
  onDelete,
}: {
  task: PersonalTask
  expanded: boolean
  onToggle: () => void
  onUpdate: (id: string, fields: Partial<PersonalTask>) => void
  onDelete: (id: string) => Promise<void>
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const done = task.status === 'completed'

  // Debounce helpers
  const titleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const descTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleTitleChange(value: string) {
    onUpdate(task.id, { title: value })
    if (titleTimerRef.current) clearTimeout(titleTimerRef.current)
    titleTimerRef.current = setTimeout(() => {
      updatePersonalTask(task.id, { title: value })
    }, 800)
  }

  function handleDescChange(value: string) {
    onUpdate(task.id, { description: value })
    if (descTimerRef.current) clearTimeout(descTimerRef.current)
    descTimerRef.current = setTimeout(() => {
      updatePersonalTask(task.id, { description: value })
    }, 800)
  }

  async function handleStatusChange(status: PersonalTask['status']) {
    onUpdate(task.id, { status })
    await updatePersonalTask(task.id, { status })
  }

  async function handleDueDateChange(due_date: string) {
    onUpdate(task.id, { due_date: due_date || null })
    await updatePersonalTask(task.id, { due_date: due_date || null })
  }

  return (
    <div ref={setNodeRef} style={style} className="group overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex items-center gap-2 px-3 py-3">
        <button
          className="cursor-grab touch-none text-muted-foreground/0 transition-opacity group-hover:text-muted-foreground"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <button onClick={onToggle} className="flex flex-1 items-center gap-3 text-left">
          <span className={`text-sm ${done ? 'text-muted-foreground line-through' : ''}`}>
            {task.title}
          </span>
        </button>

        {task.due_date && (
          <span className="rounded bg-copper-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase text-copper">
            {task.due_date}
          </span>
        )}

        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${STATUS_CLASSES[task.status]}`}>
          {STATUS_LABELS[task.status]}
        </span>

        <button onClick={onToggle}>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {expanded && (
        <div className="space-y-4 border-t border-border px-5 py-4">
          <div>
            <p className="section-label mb-2">Título</p>
            <input
              value={task.title}
              onChange={e => handleTitleChange(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-copper focus:outline-none"
            />
          </div>

          <div>
            <p className="section-label mb-2">Descrição</p>
            <textarea
              rows={3}
              value={task.description ?? ''}
              onChange={e => handleDescChange(e.target.value)}
              className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-copper focus:outline-none"
            />
          </div>

          <div className="flex items-end gap-4">
            <div className="flex-1">
              <p className="section-label mb-2">Status</p>
              <select
                value={task.status}
                onChange={e => handleStatusChange(e.target.value as PersonalTask['status'])}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-copper focus:outline-none"
              >
                <option value="queued">Fila</option>
                <option value="in_progress">Em progresso</option>
                <option value="completed">Concluída</option>
              </select>
            </div>

            <div className="flex-1">
              <p className="section-label mb-2">Prazo</p>
              <input
                type="date"
                value={task.due_date ?? ''}
                onChange={e => handleDueDateChange(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-copper focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => onDelete(task.id)}
              className="inline-flex items-center gap-1 text-xs text-destructive hover:underline"
            >
              <Trash2 className="h-3 w-3" /> Excluir tarefa
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
```

---

## Verificação manual

### Cenário 1 — Listar tarefas existentes

1. Fazer login e acessar `/tarefas`
2. **Esperado:** tarefas do usuário aparecem ordenadas por `priority`
3. Usuário sem tarefas vê o estado vazio com borda tracejada

### Cenário 2 — Criar tarefa inline

1. Clicar no FAB → input aparece no topo com borda copper
2. Digitar título → pressionar Enter → tarefa aparece ao final da lista
3. Input permanece aberto para criação de outra tarefa
4. Pressionar Escape (ou blur com campo vazio) → input fecha
5. Verificar no Supabase: nova linha em `personal_tasks` com `user_id` correto e `priority = max + 1`

### Cenário 3 — Editar com debounce

1. Expandir uma tarefa → alterar título ou descrição
2. Parar de digitar → aguardar ~800 ms
3. **Esperado:** nenhum spinner/feedback visual, mas no Supabase a linha foi atualizada
4. Navegar para outra rota e voltar → alteração persiste

### Cenário 4 — Mudar status

1. Expandir tarefa → alterar select de status
2. **Esperado:** badge da tarefa na lista atualiza imediatamente (estado local); banco atualizado em seguida

### Cenário 5 — Reordenar por drag

1. Arrastar uma tarefa para cima ou para baixo
2. **Esperado:** lista reordena visualmente durante o drag; ao soltar, `priority` de todas as tarefas afetadas é escrito no banco
3. Recarregar página → ordem persiste

### Cenário 6 — Deletar tarefa

1. Expandir tarefa → clicar "Excluir tarefa"
2. **Esperado:** tarefa some da lista imediatamente (estado local); linha deletada no banco pelo RLS via `auth.uid()`

---

## Requisitos para considerar concluído

- [ ] `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` em `dependencies`
- [ ] `backend/api/services/tarefas.service.ts` criado com 5 funções
- [ ] `loader` em `tarefas.tsx` lê `context.profile.id` e retorna tarefas do banco
- [ ] FAB abre input inline; Enter cria; Escape fecha
- [ ] Drag & drop reordena localmente e persiste via `reorderPersonalTasks`
- [ ] Título e descrição editáveis com debounce de 800 ms
- [ ] Select de status funcional; badge atualiza imediatamente
- [ ] Input de prazo (`type="date"`) funcional
- [ ] Botão de delete remove da lista e do banco
- [ ] Estado vazio exibido quando não há tarefas

---

## O que não fazer

- Não chamar `getSession()` no loader — usar `context.profile.id` que já vem do `beforeLoad` do `/_authenticated`
- Não usar `useEffect` para carregar tarefas no mount — o `loader` do TanStack Router roda antes da renderização e elimina o flash de loading
- Não criar um componente separado `TaskList` ou abstrair o `DndContext` — a complexidade atual não justifica
- Não confirmar o delete com modal — exclusão imediata é o padrão definido (mesma decisão do logout no passo 7)
- Não implementar `personal_task_dependencies` — a UI mostra "Sem dependências" como texto fixo; dependências entre tarefas não estão no escopo deste plano

---

## Próximo Passo

Após concluir: executar `passo_10.md` — conectar `/tarefas-org` para listar e criar projetos da organização.
