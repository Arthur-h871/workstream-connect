# Passo 12 — Apontamentos: listagem e criação manual

## Objetivo

Conectar `/apontamentos` ao banco — listar apontamentos reais com suas tarefas vinculadas (somente exibição), criar novo apontamento manualmente, editar conteúdo e horas trabalhadas com debounce, e excluir.

---

## Estado após o Passo 11

- `backend/api/supabase.ts` — instância única do cliente
- `backend/api/services/auth.service.ts` — signIn, signUp, signOut, getSession
- `backend/api/services/users.service.ts` — `getProfile`, `updateProfile`, `uploadAvatar`, `getOrgMembers`
- `backend/api/services/organizations.service.ts` — `getMyOrganization`, `getOrgByCode`, etc.
- `backend/api/services/tarefas.service.ts` — CRUD completo de `personal_tasks`
- `backend/api/services/projects.service.ts` — CRUD de `projects`
- `backend/api/services/org-tasks.service.ts` — CRUD de `org_tasks`
- `src/routes/_authenticated.tsx` — layout route com `beforeLoad` que retorna `{ profile }` no contexto
- `src/routes/apontamentos.tsx` — **não migrada**, rota `/apontamentos`, `const items: Item[] = []` hardcoded, sem loader, sem guard

---

## Escopo deste passo

| Funcionalidade | Neste passo |
|----------------|-------------|
| Listar apontamentos reais | ✅ |
| Exibir tarefas vinculadas (somente leitura) | ✅ |
| Exibir contagem de screenshots | ✅ |
| Criar novo apontamento manual | ✅ |
| Editar conteúdo (textarea com debounce) | ✅ |
| Editar horas trabalhadas (input com debounce) | ✅ |
| Excluir apontamento | ✅ |
| Adicionar/remover tarefa vinculada | ❌ passo 13 |
| Alternar status da tarefa (started/concluded) | ❌ passo 13 |
| Galeria de screenshots | ❌ passo 19 |

---

## Contexto técnico

**Nested select em uma query.** `getApontamentos` usa um único `select` com relacionamentos aninhados para buscar apontamentos + tarefas vinculadas de ambas as tabelas + contagem de screenshots via `capture_sessions`. Evita múltiplas queries separadas e N+1.

**`mapRow` para achatar o resultado aninhado.** O Supabase retorna estruturas como `{ apontamento_personal_tasks: [{ id, status, personal_tasks: { id, title } }] }`. A função `mapRow` transforma isso em `linked_tasks: LinkedTask[]` plano, unificando tarefas pessoais e da org num array único para a UI.

**`defaultValue` + `key={apontamento.id}` no painel de detalhe.** Textareas e inputs usam `defaultValue` (não controlado) para evitar conflito de cursor durante o debounce de 800ms. A prop `key={apontamento.id}` no componente `ApontamentoDetail` força remount quando o usuário troca de apontamento — garantindo que os campos resetem para o novo conteúdo.

**Criação otimista.** Ao clicar `+`, `createApontamento` é chamado imediatamente. O retorno do banco é prependado à lista e selecionado automaticamente. Sem modal de criação — o usuário edita o conteúdo diretamente no painel direito.

**`hours_worked` é `numeric(5,2)` no banco — chega como string.** O `mapRow` converte com `Number(row.hours_worked)`. O input usa `step="0.25"` para incrementos de 15 min.

**`capture_sessions.screenshot_count` via FK aninhada.** O `session_id` em `apontamentos` é uma FK opcional para `capture_sessions`. O select aninhado `capture_sessions ( screenshot_count )` retorna um objeto (ou null). O campo `screenshot_count` exibido na UI será expandido para galeria no passo 19.

---

## Implementação

### 12.1 — Criar `apontamentos.service.ts`

**Arquivo:** `backend/api/services/apontamentos.service.ts` (novo arquivo)

- [ ] Criar o arquivo com os tipos `LinkedTask`, `Apontamento` e as 4 funções

```ts
import { supabase } from '../supabase'

export type LinkedTask = {
  link_id: string
  task_id: string
  title: string
  status: 'started' | 'concluded'
  type: 'personal' | 'org'
}

export type Apontamento = {
  id: string
  date: string
  content: string
  hours_worked: number
  created_at: string
  session_id: string | null
  linked_tasks: LinkedTask[]
  screenshot_count: number
}

const SELECT = `
  id, date, content, hours_worked, created_at, session_id,
  capture_sessions ( screenshot_count ),
  apontamento_personal_tasks (
    id, status,
    personal_tasks ( id, title )
  ),
  apontamento_org_tasks (
    id, status,
    org_tasks ( id, title )
  )
`.trim()

function mapRow(row: any): Apontamento {
  const personalLinks: LinkedTask[] = (row.apontamento_personal_tasks ?? []).map((l: any) => ({
    link_id: l.id,
    task_id: l.personal_tasks?.id ?? '',
    title: l.personal_tasks?.title ?? '',
    status: l.status as 'started' | 'concluded',
    type: 'personal' as const,
  }))
  const orgLinks: LinkedTask[] = (row.apontamento_org_tasks ?? []).map((l: any) => ({
    link_id: l.id,
    task_id: l.org_tasks?.id ?? '',
    title: l.org_tasks?.title ?? '',
    status: l.status as 'started' | 'concluded',
    type: 'org' as const,
  }))
  return {
    id: row.id,
    date: row.date,
    content: row.content,
    hours_worked: Number(row.hours_worked),
    created_at: row.created_at,
    session_id: row.session_id,
    linked_tasks: [...personalLinks, ...orgLinks],
    screenshot_count: row.capture_sessions?.screenshot_count ?? 0,
  }
}

export async function getApontamentos(userId: string): Promise<Apontamento[]> {
  const { data, error } = await supabase
    .from('apontamentos')
    .select(SELECT)
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) return []
  return (data ?? []).map(mapRow)
}

export async function createApontamento(
  userId: string,
  orgId: string
): Promise<Apontamento | null> {
  const { data, error } = await supabase
    .from('apontamentos')
    .insert({ user_id: userId, organization_id: orgId })
    .select(SELECT)
    .single()

  if (error || !data) return null
  return mapRow(data)
}

export async function updateApontamento(
  id: string,
  fields: Partial<Pick<Apontamento, 'content' | 'hours_worked' | 'date'>>
): Promise<void> {
  await supabase.from('apontamentos').update(fields).eq('id', id)
}

export async function deleteApontamento(id: string): Promise<void> {
  await supabase.from('apontamentos').delete().eq('id', id)
}
```

---

### 12.2 — Migrar e reescrever a rota de apontamentos

**Arquivo:** `src/routes/_authenticated.apontamentos.tsx` (criar novo)  
**Arquivo:** `src/routes/apontamentos.tsx` (deletar após criar o novo)

- [ ] Criar `_authenticated.apontamentos.tsx` com loader, dados reais e componentes abaixo
- [ ] Deletar `src/routes/apontamentos.tsx`

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { Plus, Circle, CheckCircle2, Trash2 } from 'lucide-react'
import { useState, useRef } from 'react'
import { AppShell } from '@/components/AppShell'
import {
  getApontamentos,
  createApontamento,
  updateApontamento,
  deleteApontamento,
  type Apontamento,
} from 'backend/api/services/apontamentos.service'

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
  onUpdate,
  onDelete,
}: {
  apontamento: Apontamento
  onUpdate: (id: string, fields: Partial<Apontamento>) => void
  onDelete: (id: string) => Promise<void>
}) {
  const contentTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoursTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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

      {/* Card de tarefas */}
      <aside className="col-span-12 rounded-lg border border-border bg-surface p-5 lg:col-span-4">
        <div className="mb-4 flex items-center justify-between">
          <p className="section-label">Tarefas vinculadas</p>
          <span className="rounded bg-border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            passo 13
          </span>
        </div>
        <ul className="space-y-1">
          {apontamento.linked_tasks.length === 0 ? (
            <li className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
              Nenhuma tarefa vinculada
            </li>
          ) : (
            apontamento.linked_tasks.map(t => (
              <li key={t.link_id}>
                <div className="flex items-center gap-2.5 rounded-md px-2 py-2">
                  {t.status === 'concluded' ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 fill-[#10B981] text-background" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-copper" strokeWidth={2.5} />
                  )}
                  <span
                    className={`text-sm ${
                      t.status === 'concluded'
                        ? 'text-muted-foreground line-through'
                        : 'text-foreground'
                    }`}
                  >
                    {t.title}
                  </span>
                </div>
              </li>
            ))
          )}
        </ul>
      </aside>
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

### Cenário 1 — Listar apontamentos existentes

1. Fazer login e acessar `/apontamentos`
2. **Esperado:** lista ordenada por data descendente; preview das primeiras linhas do conteúdo
3. Usuário sem apontamentos vê estado vazio com texto "Nenhum apontamento registrado"
4. Se o apontamento tiver `linked_tasks`, os itens aparecem no card lateral com ícone correto

### Cenário 2 — Criar novo apontamento

1. Clicar no botão `+` no header do painel esquerdo
2. **Esperado:** novo apontamento com data de hoje aparece no topo da lista, já selecionado
3. Painel direito exibe o novo apontamento com textarea vazia e `Horas: 0`
4. Verificar no Supabase: nova linha em `apontamentos` com `user_id` e `organization_id` corretos, `date = today`, `content = ''`, `hours_worked = 0`

### Cenário 3 — Editar conteúdo com debounce

1. Selecionar um apontamento → digitar no textarea do painel direito
2. Parar de digitar → aguardar ~800ms
3. **Esperado:** `apontamentos.content` atualizado no Supabase sem nenhum spinner ou feedback visual durante a digitação
4. Navegar para outro apontamento e voltar → texto persiste

### Cenário 4 — Editar horas trabalhadas

1. Alterar o input "Horas" (ex: digitar `2.5`)
2. Aguardar ~800ms
3. **Esperado:** `apontamentos.hours_worked = 2.50` no Supabase
4. Recarregar a página → valor persiste

### Cenário 5 — Trocar de apontamento selecionado

1. Selecionar o apontamento A e editar o textarea
2. Clicar no apontamento B na lista
3. **Esperado:** textarea e input de horas exibem os dados do apontamento B (não do A)
4. Clicar novamente em A → textarea exibe o texto que foi salvo em A

### Cenário 6 — Excluir apontamento

1. Selecionar um apontamento → clicar "Excluir"
2. **Esperado:** apontamento some da lista imediatamente; o próximo item da lista é selecionado automaticamente
3. Se era o único, painel direito exibe "Selecione um apontamento ou crie um novo"
4. Verificar no Supabase: linha deletada de `apontamentos` (cascade deleta os vínculos)

---

## Requisitos para considerar concluído

- [ ] `backend/api/services/apontamentos.service.ts` criado com `getApontamentos`, `createApontamento`, `updateApontamento`, `deleteApontamento`
- [ ] `src/routes/_authenticated.apontamentos.tsx` criado com route path `/_authenticated/apontamentos`
- [ ] `src/routes/apontamentos.tsx` deletado
- [ ] Loader usa `context.profile.id` e `context.profile.organization_id` (sem chamar `getSession()`)
- [ ] Lista carrega apontamentos reais ordenados por data desc
- [ ] Botão `+` cria apontamento no banco e o seleciona imediatamente
- [ ] Textarea de conteúdo com `defaultValue` e debounce de 800ms
- [ ] Input de horas com `defaultValue`, `step="0.25"` e debounce de 800ms
- [ ] `key={selected.id}` no `ApontamentoDetail` para forçar remount ao trocar seleção
- [ ] Excluir remove da lista e do banco; seleciona próximo item automaticamente
- [ ] Tarefas vinculadas exibidas somente leitura (sem botão de adicionar)
- [ ] Contagem de screenshots exibida (mesmo que galeria seja passo 19)
- [ ] Estado vazio funcional em lista e card de tarefas

---

## O que não fazer

- Não usar `value` no textarea de conteúdo nem no input de horas — causa conflito de cursor durante o debounce; usar `defaultValue` com `key={apontamento.id}` no `ApontamentoDetail`
- Não chamar `getSession()` no loader — usar `context.profile` que já vem do `beforeLoad` de `/_authenticated`
- Não fazer queries separadas para tarefas vinculadas — o nested select resolve em uma única query
- Não criar um modal de criação — criar diretamente no banco ao clicar `+` é mais rápido e consistente com os outros passos
- Não implementar adição/remoção de vínculos de tarefa neste passo — isso é escopo do passo 13; o card lateral exibe apenas o badge "passo 13" e os links existentes em modo leitura

---

## Próximo Passo

Após concluir: executar `passo_13.md` — implementar vinculação de tarefas pessoais e da org a um apontamento, com status `started`/`concluded` e modal de busca.
