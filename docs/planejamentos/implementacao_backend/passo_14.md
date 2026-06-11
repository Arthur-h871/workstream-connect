# Passo 14 — Dashboard: dados reais

## Objetivo

Substituir todos os arrays vazios e valores `"—"` do dashboard por dados reais — heatmap de frequência com streak, cards de estatísticas, apontamentos recentes, tarefas prioritárias pessoais e prazos da organização.

---

## Estado após o Passo 13

- `backend/api/services/apontamentos.service.ts` — CRUD completo + funções de vínculo; tipos `Apontamento`, `LinkedTask`
- `backend/api/services/org-tasks.service.ts` — `getOrgTasks`, `createOrgTask`, `updateOrgTask`, `deleteOrgTask`, `getMyOrgTasks`; tipos `OrgTask`, `MyOrgTask`
- `backend/api/services/tarefas.service.ts` — `getPersonalTasks` e demais; tipo `PersonalTask`
- `src/routes/_authenticated.tsx` — contexto com `profile` (id, full_name, role, organization_id)
- `src/routes/dashboard.tsx` — **não migrada**, rota `/dashboard`, `const recordings = []`, `const priorityTasks = []`, `const orgTasks = []`, todos os `StatCard` com `"—"`, `Heatmap` com todos os dias inativos, `Recorder` com estado local

---

## Escopo deste passo

| Dado | Neste passo |
|------|-------------|
| Heatmap de frequência (dias ativos do mês) | ✅ |
| Streak (dias consecutivos) | ✅ |
| Horas trabalhadas no mês | ✅ |
| Contagem de apontamentos no mês | ✅ |
| Contagem de tarefas pessoais concluídas | ✅ |
| Projetos ativos com tarefas abertas | ✅ |
| Apontamentos recentes (últimos 3) | ✅ |
| Tarefas prioritárias pessoais (top 3) | ✅ |
| Prazos da organização (próximos 5) | ✅ |
| Saudação com nome do usuário | ✅ |
| Recorder ligado ao banco (Start/Pause/Stop) | ❌ passo 18 |

---

## Contexto técnico

**`dashboard.service.ts` como agregador.** Os dados do dashboard cruzam 3 tabelas (`apontamentos`, `personal_tasks`, `org_tasks`). Em vez de chamar 5 services diferentes no loader, uma função `getDashboardData(userId)` encapsula todas as queries em um `Promise.all` — 5 queries paralelas. O loader fica com uma única linha.

**Últimos 60 dias para streak cross-month.** Para calcular o streak corretamente quando o usuário tem apontamentos em dias de meses diferentes (ex: 30 jun → 1 jul), buscamos apontamentos dos últimos 60 dias. O heatmap usa apenas os dias do mês corrente; o streak usa todos os 60 dias.

**Streak computado client-side.** Não há função de banco para streak. Recebemos o array de datas ativas dos últimos 60 dias e percorremos de hoje para trás, contando consecutivos.

**`count: 'exact', head: true` para contagem eficiente.** A query de tarefas concluídas não precisa dos dados — apenas do count. O Supabase retorna só o header `content-range` sem body, reduzindo payload.

**Projetos ativos via `Set` client-side.** `org_tasks` tem `project_id`. A query retorna só esse campo para as tarefas abertas do usuário. `new Set(data.map(r => r.project_id)).size` dá o count de projetos distintos sem precisar de `GROUP BY` no banco.

**Recorder inalterado.** O componente `Recorder` em `dashboard.tsx` usa `useState` local. Não é tocado neste passo — a integração real com `capture_sessions` é o passo 18.

---

## Implementação

### 14.1 — Criar `dashboard.service.ts`

**Arquivo:** `backend/api/services/dashboard.service.ts` (novo arquivo)

- [ ] Criar o arquivo com os tipos e a função `getDashboardData`

```ts
import { supabase } from '../supabase'

export type RecentApontamento = {
  id: string
  date: string
  preview: string
  done: number
  doing: number
}

export type PriorityTask = {
  id: string
  title: string
  due_date: string | null
}

export type OrgDeadline = {
  id: string
  title: string
  project: string
  days: number
}

export type DashboardData = {
  activeDays: string[]
  streak: number
  horasNoMes: number
  apontamentosNoMes: number
  tarefasConcluidas: number
  projetosAtivos: number
  recentApontamentos: RecentApontamento[]
  priorityTasks: PriorityTask[]
  orgDeadlines: OrgDeadline[]
}

function calculateStreak(allActiveDays: string[]): number {
  if (allActiveDays.length === 0) return 0
  const daySet = new Set(allActiveDays)
  const cursor = new Date()
  cursor.setHours(0, 0, 0, 0)
  let streak = 0
  while (true) {
    const dateStr = cursor.toISOString().split('T')[0]
    if (daySet.has(dateStr)) {
      streak++
      cursor.setDate(cursor.getDate() - 1)
    } else {
      break
    }
  }
  return streak
}

export async function getDashboardData(userId: string): Promise<DashboardData> {
  const now = new Date()
  now.setHours(0, 0, 0, 0)

  const sixtyDaysAgo = new Date(now)
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)
  const sixtyDaysAgoStr = sixtyDaysAgo.toISOString().split('T')[0]

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const [
    apontamentosRes,
    priorityTasksRes,
    orgDeadlinesRes,
    completedCountRes,
    activeProjectsRes,
  ] = await Promise.all([
    supabase
      .from('apontamentos')
      .select(
        'id, date, content, hours_worked, apontamento_personal_tasks(status), apontamento_org_tasks(status)'
      )
      .eq('user_id', userId)
      .gte('date', sixtyDaysAgoStr)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false }),

    supabase
      .from('personal_tasks')
      .select('id, title, due_date')
      .eq('user_id', userId)
      .neq('status', 'completed')
      .order('priority', { ascending: true })
      .limit(3),

    supabase
      .from('org_tasks')
      .select('id, title, due_date, projects ( name )')
      .eq('assigned_to', userId)
      .neq('status', 'completed')
      .not('due_date', 'is', null)
      .order('due_date', { ascending: true })
      .limit(5),

    supabase
      .from('personal_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'completed'),

    supabase
      .from('org_tasks')
      .select('project_id')
      .eq('assigned_to', userId)
      .neq('status', 'completed')
      .not('project_id', 'is', null),
  ])

  const rows = apontamentosRes.data ?? []

  const thisMonthRows = rows.filter(r => new Date(r.date + 'T00:00:00') >= monthStart)
  const activeDays = [...new Set(thisMonthRows.map(r => r.date))]
  const allActiveDays = [...new Set(rows.map(r => r.date))]

  const horasNoMes = thisMonthRows.reduce((sum, r) => sum + Number(r.hours_worked), 0)
  const apontamentosNoMes = thisMonthRows.length

  const recentApontamentos: RecentApontamento[] = rows.slice(0, 3).map(r => {
    const allTasks = [
      ...(r.apontamento_personal_tasks ?? []),
      ...(r.apontamento_org_tasks ?? []),
    ]
    return {
      id: r.id,
      date: r.date,
      preview: r.content.slice(0, 150) || 'Sem conteúdo',
      done: allTasks.filter(t => t.status === 'concluded').length,
      doing: allTasks.filter(t => t.status === 'started').length,
    }
  })

  const today = now
  const orgDeadlines: OrgDeadline[] = (orgDeadlinesRes.data ?? []).map(r => {
    const due = new Date(r.due_date + 'T00:00:00')
    const days = Math.round((due.getTime() - today.getTime()) / 86_400_000)
    return {
      id: r.id,
      title: r.title,
      project: (r.projects as any)?.name ?? '—',
      days,
    }
  })

  return {
    activeDays,
    streak: calculateStreak(allActiveDays),
    horasNoMes,
    apontamentosNoMes,
    tarefasConcluidas: completedCountRes.count ?? 0,
    projetosAtivos: new Set(
      (activeProjectsRes.data ?? []).map(r => r.project_id).filter(Boolean)
    ).size,
    recentApontamentos,
    priorityTasks: (priorityTasksRes.data ?? []) as PriorityTask[],
    orgDeadlines,
  }
}
```

---

### 14.2 — Migrar e reescrever `dashboard.tsx`

**Arquivo:** `src/routes/_authenticated.dashboard.tsx` (criar novo)  
**Arquivo:** `src/routes/dashboard.tsx` (deletar após criar o novo)

- [ ] Criar `_authenticated.dashboard.tsx` com loader e dados reais
- [ ] Deletar `src/routes/dashboard.tsx`

```tsx
import { createFileRoute, Link } from '@tanstack/react-router'
import { Play, Pause, Square, Trash2, GripVertical } from 'lucide-react'
import { useState } from 'react'
import { AppShell } from '@/components/AppShell'
import { getDashboardData, type DashboardData } from 'backend/api/services/dashboard.service'

export const Route = createFileRoute('/_authenticated/dashboard')({
  head: () => ({
    meta: [
      { title: 'Dashboard — Marco' },
      { name: 'description', content: 'Resumo do seu trabalho, tarefas e produtividade.' },
    ],
  }),
  loader: async ({ context }) => {
    const data = await getDashboardData(context.profile.id)
    return { data, fullName: context.profile.full_name }
  },
  component: () => (
    <AppShell>
      <Dashboard />
    </AppShell>
  ),
})

// Recorder permanece com estado local — integração real no Passo 18
function Recorder() {
  const [state, setState] = useState<'idle' | 'recording' | 'paused'>('idle')
  const isActive = state !== 'idle'

  return (
    <div className="flex items-center gap-3">
      {isActive && (
        <span className="font-mono text-xs text-muted-foreground">
          <span className="text-copper">●</span> gravando...
        </span>
      )}
      <div className="flex items-center gap-1 rounded-md border border-border bg-surface p-1">
        {state === 'idle' && (
          <button
            onClick={() => setState('recording')}
            className="flex h-7 w-7 items-center justify-center rounded text-copper hover:bg-copper-soft"
            aria-label="Iniciar gravação"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
          </button>
        )}
        {isActive && (
          <>
            <button
              onClick={() => setState(state === 'paused' ? 'recording' : 'paused')}
              className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
              aria-label="Pausar"
            >
              <Pause className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setState('idle')}
              className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              aria-label="Excluir sessão"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setState('idle')}
              className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
              aria-label="Finalizar"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function Heatmap({ activeDays, streak }: { activeDays: string[]; streak: number }) {
  const now = new Date()
  const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const monthLabel = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(now)

  const activeDayNumbers = new Set(activeDays.map(d => parseInt(d.split('-')[2], 10)))
  const days = Array.from({ length: totalDays }, (_, i) => ({
    day: i + 1,
    active: activeDayNumbers.has(i + 1),
  }))

  return (
    <div>
      <p className="section-label mb-3">{monthLabel} · Frequência</p>
      <div className="grid grid-cols-[repeat(15,minmax(0,1fr))] gap-1.5">
        {days.map(d => (
          <div
            key={d.day}
            title={`Dia ${d.day}`}
            className={`aspect-square rounded-sm ${d.active ? 'bg-copper' : 'bg-border'}`}
          />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>{activeDays.length} {activeDays.length === 1 ? 'dia' : 'dias'} com apontamento</span>
        <span className="font-mono">{streak} seguidos</span>
      </div>
    </div>
  )
}

function Dashboard() {
  const { data, fullName } = Route.useLoaderData()
  const firstName = fullName.split(' ')[0]

  const now = new Date()
  const hour = now.getHours()
  const greeting =
    hour < 12 ? `Bom dia, ${firstName}` : hour < 18 ? `Boa tarde, ${firstName}` : `Boa noite, ${firstName}`

  const dateLabel = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now)

  return (
    <div className="bg-background">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{greeting}</h1>
          <p className="mt-1 text-sm text-muted-foreground capitalize">{dateLabel}</p>
        </div>
        <Recorder />
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Heatmap */}
        <section className="col-span-12 rounded-lg border border-border bg-surface p-6 md:col-span-5">
          <Heatmap activeDays={data.activeDays} streak={data.streak} />
        </section>

        {/* Stats */}
        <section className="col-span-12 grid grid-cols-2 gap-4 md:col-span-7">
          <StatCard
            label="Horas no mês"
            value={formatHours(data.horasNoMes)}
            sub={`${data.apontamentosNoMes} apontamento(s)`}
            tone="copper"
          />
          <StatCard
            label="Apontamentos"
            value={String(data.apontamentosNoMes)}
            sub={`${data.activeDays.length} dia(s) ativo(s)`}
            tone="copper"
          />
          <StatCard
            label="Tarefas concluídas"
            value={String(data.tarefasConcluidas)}
            sub="concluídas no total"
            tone="teal"
          />
          <StatCard
            label="Projetos ativos"
            value={String(data.projetosAtivos)}
            sub="com tarefas abertas"
            tone="teal"
          />
        </section>

        {/* Apontamentos recentes */}
        <section className="col-span-12 md:col-span-7">
          <div className="mb-4 flex items-center justify-between">
            <p className="section-label">Apontamentos recentes</p>
            <Link to="/apontamentos" className="text-xs text-muted-foreground hover:text-foreground">
              Ver todos →
            </Link>
          </div>
          <div className="relative pl-6">
            <div className="absolute bottom-2 left-2 top-2 w-px bg-border" />
            <div className="space-y-3">
              {data.recentApontamentos.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-muted-foreground">
                  Nenhum apontamento registrado
                </div>
              ) : (
                data.recentApontamentos.map(r => (
                  <Link
                    key={r.id}
                    to="/apontamentos"
                    className="relative block rounded-lg border border-border bg-surface p-4 transition-colors hover:border-copper/40"
                  >
                    <span className="absolute -left-[18px] top-5 h-2 w-2 rounded-full bg-copper ring-4 ring-background" />
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wide text-copper">
                        {formatDate(r.date)}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-sm text-muted-foreground">{r.preview}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {r.done > 0 && <Chip color="success">{r.done} concluída(s)</Chip>}
                      {r.doing > 0 && <Chip color="copper">{r.doing} em andamento</Chip>}
                      {r.done === 0 && r.doing === 0 && (
                        <Chip color="teal">sem tarefas vinculadas</Chip>
                      )}
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </section>

        {/* Sidebar — tarefas e prazos */}
        <section className="col-span-12 space-y-8 md:col-span-5">
          {/* Tarefas prioritárias */}
          <div>
            <div className="mb-4 flex items-center justify-between">
              <p className="section-label">Minhas tarefas prioritárias</p>
              <Link to="/tarefas" className="text-xs text-muted-foreground hover:text-foreground">
                Ver todas →
              </Link>
            </div>
            <div className="space-y-2">
              {data.priorityTasks.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-surface px-3 py-6 text-center text-xs text-muted-foreground">
                  Nenhuma tarefa prioritária
                </div>
              ) : (
                data.priorityTasks.map(t => (
                  <div
                    key={t.id}
                    className="group flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5"
                  >
                    <GripVertical className="h-4 w-4 text-muted-foreground/0 transition-opacity group-hover:text-muted-foreground" />
                    <p className="flex-1 truncate text-sm">{t.title}</p>
                    {t.due_date && (
                      <span className="rounded bg-copper-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-copper">
                        {formatDue(t.due_date)}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Prazos da org */}
          <div>
            <div className="mb-4 flex items-center justify-between">
              <p className="section-label">Org · Prazos próximos</p>
              <Link to="/tarefas-org" className="text-xs text-muted-foreground hover:text-foreground">
                Ver →
              </Link>
            </div>
            <div className="space-y-2">
              {data.orgDeadlines.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-surface px-3 py-6 text-center text-xs text-muted-foreground">
                  Nenhum prazo próximo
                </div>
              ) : (
                data.orgDeadlines.map(t => (
                  <div
                    key={t.id}
                    className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{t.title}</p>
                      <p className="truncate text-xs text-teal">{t.project}</p>
                    </div>
                    <span
                      className={`shrink-0 font-mono text-xs ${
                        t.days < 0 ? 'text-destructive' : 'text-muted-foreground'
                      }`}
                    >
                      {t.days < 0 ? `${Math.abs(t.days)}d atrasada` : `${t.days}d`}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub: string
  tone: 'copper' | 'teal'
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <p className="section-label">{label}</p>
      <p
        className={`mt-3 text-3xl font-semibold tracking-tight ${
          tone === 'copper' ? 'text-copper' : 'text-teal'
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </div>
  )
}

function Chip({
  color,
  children,
}: {
  color: 'copper' | 'teal' | 'success'
  children: React.ReactNode
}) {
  const cls =
    color === 'copper'
      ? 'bg-copper-soft text-copper'
      : color === 'teal'
        ? 'bg-teal-soft text-teal'
        : 'bg-[#10B98119] text-[#10B981]'
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}
    >
      {children}
    </span>
  )
}

function formatHours(h: number): string {
  if (h === 0) return '0h'
  const rounded = Math.round(h * 4) / 4
  return `${rounded.toLocaleString('pt-BR')}h`
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(year, month - 1, day))
}

function formatDue(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(year, month - 1, day))
}
```

---

## Verificação manual

### Cenário 1 — Heatmap

1. Ter ao menos um `apontamento` com `date` no mês corrente no banco
2. Acessar `/dashboard`
3. **Esperado:** o quadrado correspondente ao dia do apontamento aparece na cor copper; os demais permanecem em `bg-border`
4. Verificar contagem: "X dias com apontamento" bate com as linhas no banco

### Cenário 2 — Streak

1. Ter apontamentos em dias consecutivos (ex: ontem e hoje)
2. **Esperado:** "2 seguidos" no canto direito do heatmap
3. Sem apontamento hoje nem ontem → "0 seguidos"

### Cenário 3 — StatCards

1. **Esperado:** "Horas no mês" exibe soma de `hours_worked` do mês corrente formatada (ex: "6,25h")
2. "Apontamentos" exibe count do mês com "X dia(s) ativo(s)"
3. "Tarefas concluídas" exibe total de personal_tasks com `status = 'completed'`
4. "Projetos ativos" exibe número de projetos distintos onde o usuário tem org_tasks abertas

### Cenário 4 — Apontamentos recentes

1. Ter ao menos um apontamento com conteúdo e tarefas vinculadas
2. **Esperado:** cards com data formatada, preview (truncado em 2 linhas), chips de concluídas e em andamento
3. Sem apontamento → estado vazio com borda tracejada
4. Link "Ver todos →" navega para `/apontamentos`

### Cenário 5 — Tarefas prioritárias

1. Ter personal_tasks com `status != 'completed'` no banco
2. **Esperado:** top 3 ordenadas por `priority`, com badge de prazo se `due_date` preenchido
3. Link "Ver todas →" navega para `/tarefas`

### Cenário 6 — Prazos da org

1. Ter org_tasks `assigned_to = userId` com `due_date` próximo e `status != 'completed'`
2. **Esperado:** tarefa exibe dias restantes (ex: "3d") ou "Xd atrasada" em vermelho se `days < 0`
3. Nome do projeto exibido em teal abaixo do título

### Cenário 7 — Saudação com nome

1. Fazer login com usuário que tem `full_name = "João Silva"`
2. **Esperado:** h1 exibe "Bom dia, João" (ou "Boa tarde/noite" conforme horário)

---

## Requisitos para considerar concluído

- [ ] `backend/api/services/dashboard.service.ts` criado com tipos e `getDashboardData`
- [ ] `src/routes/_authenticated.dashboard.tsx` criado com route path `/_authenticated/dashboard`
- [ ] `src/routes/dashboard.tsx` deletado
- [ ] Loader chama `getDashboardData(context.profile.id)` e retorna `{ data, fullName }`
- [ ] 5 queries em `Promise.all` (apontamentos, priorityTasks, orgDeadlines, completedCount, activeProjects)
- [ ] `Heatmap` recebe `activeDays` e `streak` como props; quadrados marcados corretamente
- [ ] Streak calculado dos últimos 60 dias (cross-month)
- [ ] 4 `StatCard` com valores reais e sub-labels informativos
- [ ] `recentApontamentos` exibe últimos 3 com counts de done/doing
- [ ] `priorityTasks` exibe top 3 por priority com due_date formatada
- [ ] `orgDeadlines` exibe up to 5 com project name e dias restantes/atrasados
- [ ] Saudação usa primeiro nome do `profile.full_name` com horário correto
- [ ] `Recorder` permanece com estado local (sem alteração)

---

## O que não fazer

- Não criar um hook `useDashboardData` com TanStack Query — o loader do TanStack Router roda no servidor/antes da renderização, elimina o flash de carregamento; Query não traz benefício aqui
- Não chamar `getApontamentos` do `apontamentos.service.ts` no loader do dashboard — aquela função carrega `linked_tasks` completos com joins extras que não são necessários aqui; `dashboard.service.ts` faz uma query mais leve
- Não buscar apontamentos apenas do mês corrente — streak cross-month requer os últimos 60 dias; filtrar para o mês corrente deve ser feito client-side sobre os dados retornados
- Não implementar a integração do `Recorder` com o banco — isso é escopo do passo 18; modificar o `Recorder` agora quebraria a UI sem o restante da infra de sessões
- Não criar `getDashboardData` dentro de um service existente — o dashboard cruza múltiplos domínios e merece seu próprio arquivo

---

## Próximo Passo

Após concluir: executar `passo_15.md` — conectar `/perfil` para editar nome, trocar avatar (upload no Storage) e alterar senha.
