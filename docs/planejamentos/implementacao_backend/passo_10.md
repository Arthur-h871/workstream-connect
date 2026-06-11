# Passo 10 — Projetos da organização: CRUD

## Objetivo
Conectar a view de grid de `/tarefas-org` ao banco — listar projetos ativos com contagem de tarefas, criar novos projetos via modal, fechar projetos existentes — e introduzir a rota dinâmica `/tarefas-org/$projectId` para que cada projeto tenha URL própria.

---

## Estado após o Passo 9

- `backend/api/services/tarefas.service.ts` — criado com CRUD de tarefas pessoais
- `src/routes/tarefas-org.tsx` — grid de projetos estático; botão "Novo projeto" sem ação; `ProjectView` com dados mock; componentes `Section` e `SegmentedStatus` definidos no mesmo arquivo
- Loader pattern estabelecido: `context.profile.organization_id` e `context.profile.id` disponíveis via `/_authenticated` beforeLoad

---

## Escopo deste passo

| Área | Neste passo | Passo seguinte |
|------|-------------|----------------|
| Grid de projetos | ✅ listar, criar, fechar | — |
| Rota de detalhe do projeto | ✅ criar arquivo + estrutura | — |
| Tarefas dentro do projeto | ❌ `ProjectView` permanece mock | Passo 11 |

---

## Contexto técnico

**Rota dinâmica em vez de estado local.** A navegação atual usa `useState<string | null>(openProject)` — sem URL própria por projeto. Com uma rota dinâmica, cada projeto tem URL `/tarefas-org/abc123`, compartilhável, bookmarkável, e com back/forward funcional.

**Convenção de nomes no TanStack Router.** O sufixo `_` em `tarefas-org_` quebra o aninhamento de layout: `_authenticated.tarefas-org_.$projectId.tsx` cria uma rota irmã de `_authenticated.tarefas-org.tsx`, não filha. Isso significa que `tarefas-org.tsx` não precisa de `<Outlet />`, e cada rota tem seu próprio `AppShell`.

**Contagem de tarefas sem over-fetch.** `select('*, org_tasks(count)')` retorna `[{ count: N }]` sem carregar as rows de `org_tasks`.

**Role-gate no botão "Novo projeto".** RLS já bloqueia `INSERT` para `tenant_user`; a UI oculta o botão via `context.profile.role`.

**Fechar projeto: ação imediata.** Menu de contexto (três pontos no hover do card), sem modal de confirmação.

---

## Implementação

### 10.1 — Criar `projects.service.ts`

**Arquivo:** `backend/api/services/projects.service.ts` (novo arquivo)

- [ ] Criar o arquivo com as 4 funções

```ts
import { supabase } from '../supabase'

export type Project = {
  id: string
  name: string
  description: string | null
  color: string
  status: 'active' | 'closed'
  due_date: string | null
  task_count: number
  created_at: string
}

export async function getProjects(orgId: string): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, description, color, status, due_date, created_at, org_tasks(count)')
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  if (error) return []

  return (data ?? []).map(p => ({
    id: p.id,
    name: p.name,
    description: p.description,
    color: p.color,
    status: p.status,
    due_date: p.due_date,
    task_count: (p.org_tasks as { count: number }[])[0]?.count ?? 0,
    created_at: p.created_at,
  }))
}

export async function getProject(id: string): Promise<Project | null> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, description, color, status, due_date, created_at, org_tasks(count)')
    .eq('id', id)
    .single()

  if (error || !data) return null

  return {
    id: data.id,
    name: data.name,
    description: data.description,
    color: data.color,
    status: data.status,
    due_date: data.due_date,
    task_count: (data.org_tasks as { count: number }[])[0]?.count ?? 0,
    created_at: data.created_at,
  }
}

export async function createProject(data: {
  orgId: string
  createdBy: string
  name: string
  description: string | null
  color: string
  due_date: string | null
}): Promise<Project | null> {
  const { data: row, error } = await supabase
    .from('projects')
    .insert({
      organization_id: data.orgId,
      created_by: data.createdBy,
      name: data.name,
      description: data.description,
      color: data.color,
      due_date: data.due_date,
    })
    .select('id, name, description, color, status, due_date, created_at')
    .single()

  if (error || !row) return null

  return { ...row, task_count: 0 }
}

export async function closeProject(id: string): Promise<void> {
  await supabase.from('projects').update({ status: 'closed' }).eq('id', id)
}
```

---

### 10.2 — Reescrever `tarefas-org.tsx` (somente o grid)

**Arquivo:** `src/routes/tarefas-org.tsx`

`ProjectView`, `Section` e `SegmentedStatus` saem deste arquivo e vão para o novo arquivo de rota. A navegação para o projeto troca `setOpenProject` por `navigate`.

- [ ] Remover `ProjectView`, `Section`, `SegmentedStatus` e o estado `openProject`
- [ ] Adicionar `useNavigate` e navegar para `/tarefas-org/$projectId` no clique do card
- [ ] Adicionar loader que lê `context.profile`
- [ ] Adicionar `ProjectCard` com menu de contexto e `CreateProjectModal`

```tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Plus, MoreHorizontal } from 'lucide-react'
import { useState } from 'react'
import { AppShell } from '@/components/AppShell'
import {
  getProjects,
  createProject,
  closeProject,
  type Project,
} from 'backend/api/services/projects.service'

export const Route = createFileRoute('/_authenticated/tarefas-org')({
  head: () => ({
    meta: [
      { title: 'Tarefas da Organização — Marco' },
      { name: 'description', content: 'Projetos e tarefas da sua organização.' },
    ],
  }),
  loader: async ({ context }) => {
    const projects = await getProjects(context.profile.organization_id)
    return {
      projects,
      orgId: context.profile.organization_id,
      userId: context.profile.id,
      isAdmin: context.profile.role !== 'tenant_user',
    }
  },
  component: () => (
    <AppShell title="Tarefas da Organização">
      <TarefasOrg />
    </AppShell>
  ),
})

function TarefasOrg() {
  const { projects: initial, orgId, userId, isAdmin } = Route.useLoaderData()
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Project[]>(initial)
  const [showModal, setShowModal] = useState(false)

  async function handleCreate(fields: {
    name: string
    description: string
    color: string
    due_date: string
  }) {
    const created = await createProject({
      orgId,
      createdBy: userId,
      name: fields.name,
      description: fields.description || null,
      color: fields.color,
      due_date: fields.due_date || null,
    })
    if (created) setProjects(prev => [created, ...prev])
    setShowModal(false)
  }

  async function handleClose(id: string) {
    setProjects(prev => prev.filter(p => p.id !== id))
    await closeProject(id)
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Arraste tarefas entre projetos para realocar.</p>
        {isAdmin && (
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-teal px-3 py-1.5 text-sm font-semibold text-background hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" /> Novo projeto
          </button>
        )}
      </div>

      {projects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface px-4 py-16 text-center text-sm text-muted-foreground">
          Nenhum projeto criado
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {projects.map(p => (
            <ProjectCard
              key={p.id}
              project={p}
              isAdmin={isAdmin}
              onClick={() => navigate({ to: '/tarefas-org/$projectId', params: { projectId: p.id } })}
              onClose={handleClose}
            />
          ))}
        </div>
      )}

      {showModal && (
        <CreateProjectModal
          onConfirm={handleCreate}
          onCancel={() => setShowModal(false)}
        />
      )}
    </div>
  )
}

function ProjectCard({
  project,
  isAdmin,
  onClick,
  onClose,
}: {
  project: Project
  isAdmin: boolean
  onClick: () => void
  onClose: (id: string) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="group relative overflow-hidden rounded-lg border border-border bg-surface transition-colors hover:border-muted-foreground/30">
      <div className="h-1" style={{ backgroundColor: project.color }} />
      <button onClick={onClick} className="w-full p-5 text-left">
        <h3 className="mb-4 text-base font-semibold">{project.name}</h3>
        <p className="mt-4 font-mono text-[10px] text-muted-foreground">
          {project.task_count} TAREFAS
        </p>
      </button>
      {isAdmin && (
        <div className="absolute right-2 top-4">
          <button
            onClick={e => { e.stopPropagation(); setMenuOpen(v => !v) }}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-background"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-8 z-50 w-36 rounded-md border border-border bg-surface py-1 shadow-lg">
                <button
                  onClick={() => { onClose(project.id); setMenuOpen(false) }}
                  className="w-full px-3 py-2 text-left text-sm text-muted-foreground hover:bg-background hover:text-foreground"
                >
                  Fechar projeto
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

const COLOR_PRESETS = ['#14B8A6', '#EA580C', '#6366F1', '#EC4899', '#F59E0B', '#10B981']

function CreateProjectModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: (fields: { name: string; description: string; color: string; due_date: string }) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState({ name: '', description: '', color: COLOR_PRESETS[0], due_date: '' })
  const set = (k: keyof typeof form) => (v: string) => setForm(prev => ({ ...prev, [k]: v }))

  return (
    <>
      <div className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-surface p-6 shadow-2xl">
        <h2 className="mb-4 text-base font-semibold">Novo projeto</h2>
        <div className="space-y-4">
          <div>
            <p className="section-label mb-1.5">Nome *</p>
            <input
              autoFocus
              value={form.name}
              onChange={e => set('name')(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-teal focus:outline-none"
              placeholder="Nome do projeto"
            />
          </div>
          <div>
            <p className="section-label mb-1.5">Descrição</p>
            <textarea
              rows={2}
              value={form.description}
              onChange={e => set('description')(e.target.value)}
              className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-teal focus:outline-none"
            />
          </div>
          <div>
            <p className="section-label mb-1.5">Cor</p>
            <div className="flex gap-2">
              {COLOR_PRESETS.map(c => (
                <button
                  key={c}
                  onClick={() => set('color')(c)}
                  className={`h-7 w-7 rounded-full transition-transform ${form.color === c ? 'ring-2 ring-foreground ring-offset-2' : 'hover:scale-110'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div>
            <p className="section-label mb-1.5">Prazo</p>
            <input
              type="date"
              value={form.due_date}
              onChange={e => set('due_date')(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-teal focus:outline-none"
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
            Cancelar
          </button>
          <button
            onClick={() => { if (form.name.trim()) onConfirm(form) }}
            disabled={!form.name.trim()}
            className="rounded-md bg-teal px-4 py-2 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-40"
          >
            Criar
          </button>
        </div>
      </div>
    </>
  )
}
```

---

### 10.3 — Criar `_authenticated.tarefas-org_.$projectId.tsx`

**Arquivo:** `src/routes/_authenticated.tarefas-org_.$projectId.tsx` (novo arquivo)

O sufixo `_` em `tarefas-org_` quebra o aninhamento de layout: esta rota é irmã de `_authenticated.tarefas-org.tsx`, não filha — logo `tarefas-org.tsx` não precisa de `<Outlet />`.

`ProjectView`, `Section` e `SegmentedStatus` são movidos do arquivo anterior para cá. Neste passo as tarefas permanecem mock; o loader só busca os dados do projeto.

- [ ] Criar o arquivo
- [ ] Registrar com `createFileRoute('/_authenticated/tarefas-org/$projectId')`
- [ ] Loader que chama `getProject(params.projectId)` e redireciona para `/tarefas-org` se não encontrar
- [ ] Mover `ProjectView`, `Section` e `SegmentedStatus` do arquivo anterior

```tsx
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { AppShell } from '@/components/AppShell'
import { getProject } from 'backend/api/services/projects.service'

export const Route = createFileRoute('/_authenticated/tarefas-org/$projectId')({
  loader: async ({ params }) => {
    const project = await getProject(params.projectId)
    if (!project) throw redirect({ to: '/tarefas-org' })
    return { project }
  },
  component: ProjectPage,
})

function ProjectPage() {
  const { project } = Route.useLoaderData()
  return (
    <AppShell title="Tarefas da Organização">
      <ProjectView project={project} />
    </AppShell>
  )
}

function ProjectView({ project }: { project: { id: string; name: string; color: string } }) {
  const [expanded, setExpanded] = useState<number | null>(0)
  const mockTasks: string[] = [] // substituído no passo 11

  return (
    <div>
      <Link to="/tarefas-org" className="mb-4 inline-block text-xs text-muted-foreground hover:text-foreground">
        ← Voltar para projetos
      </Link>
      <div className="mb-8 flex items-center gap-3">
        <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: project.color }} />
        <h2 className="text-2xl font-semibold">{project.name}</h2>
      </div>

      {mockTasks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface px-4 py-12 text-center text-sm text-muted-foreground">
          Nenhuma tarefa neste projeto
        </div>
      ) : (
        <div className="space-y-2">
          {mockTasks.map((t, i) => {
            const isOpen = expanded === i
            return (
              <div key={i} className="overflow-hidden rounded-lg border border-border bg-surface">
                <button
                  onClick={() => setExpanded(isOpen ? null : i)}
                  className="flex w-full items-center justify-between px-5 py-4 text-left"
                >
                  <span className="text-sm font-medium">{t}</span>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <div className="space-y-5 border-t border-border px-5 py-5">
                    <Section label="Descrição">
                      <p className="text-sm text-muted-foreground">—</p>
                    </Section>
                    <Section label="Status">
                      <SegmentedStatus />
                    </Section>
                    <div className="grid grid-cols-2 gap-5">
                      <Section label="Responsável">
                        <select className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-teal focus:outline-none">
                          <option value="">Selecionar...</option>
                        </select>
                      </Section>
                      <Section label="Prazo">
                        <input type="date" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-teal focus:outline-none" />
                      </Section>
                    </div>
                    <Section label="Nota">
                      <textarea rows={3} className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-teal focus:outline-none" />
                    </Section>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
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

function SegmentedStatus() {
  const opts = ['Na fila', 'Em progresso', 'Concluída'] as const
  const [v, setV] = useState<(typeof opts)[number]>('Na fila')
  return (
    <div className="inline-flex rounded-md border border-border bg-background p-0.5">
      {opts.map(o => (
        <button
          key={o}
          onClick={() => setV(o)}
          className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
            v === o
              ? o === 'Concluída'
                ? 'bg-[#10B98119] text-[#10B981]'
                : 'bg-teal-soft text-teal'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  )
}
```

---

## Verificação manual

### Cenário 1 — Listar projetos

1. Login com usuário que tem projetos → acessar `/tarefas-org`
2. **Esperado:** cards com nome, cor e contagem de tarefas
3. Usuário sem projetos → estado vazio

### Cenário 2 — Criar projeto (admin)

1. Clicar "Novo projeto" → modal abre
2. Preencher nome, escolher cor → "Criar"
3. **Esperado:** modal fecha; card aparece no grid; linha criada em `projects`
4. Botão "Criar" desabilitado com `name` vazio

### Cenário 3 — Role-gate para tenant_user

1. Login com `tenant_user` → **Esperado:** botão "Novo projeto" e menu três pontos ausentes

### Cenário 4 — Fechar projeto

1. Hover no card → ícone três pontos aparece → "Fechar projeto"
2. **Esperado:** card some; `projects.status = 'closed'`; reload confirma ausência

### Cenário 5 — Navegação com URL própria

1. Clicar em um card → URL muda para `/tarefas-org/abc123`
2. **Esperado:** `ProjectView` renderiza com nome e cor reais; estado vazio de tarefas (passo 11)
3. Recarregar a página → permanece no projeto correto
4. Clicar "← Voltar para projetos" → URL volta para `/tarefas-org`
5. Browser back button → mesmo comportamento

---

## Requisitos para considerar concluído

- [ ] `backend/api/services/projects.service.ts` criado com `getProjects`, `getProject`, `createProject`, `closeProject`
- [ ] `tarefas-org.tsx` sem `ProjectView`, `Section`, `SegmentedStatus`; navegação via `useNavigate`
- [ ] `_authenticated.tarefas-org_.$projectId.tsx` criado com loader e `ProjectView`
- [ ] Loader do projeto redireciona para `/tarefas-org` se `projectId` inválido
- [ ] Cards navegam para URL com `$projectId`; back button funciona
- [ ] Botão "Novo projeto" e menu de três pontos ocultos para `tenant_user`
- [ ] Modal de criação funcional: cor com swatches, name obrigatório
- [ ] Fechar projeto remove da lista e atualiza banco

---

## O que não fazer

- Não usar `<Outlet />` em `tarefas-org.tsx` — o sufixo `_` em `tarefas-org_.$projectId.tsx` quebra o aninhamento; as duas rotas são irmãs independentes
- Não conectar tarefas ao banco neste passo — `mockTasks: string[] = []` permanece até o passo 11
- Não implementar `updateProject` (editar nome/cor) — não há UI de edição inline de projetos no design atual
- Não exibir projetos fechados — sem filtro "Arquivados" no escopo deste plano

---

## Próximo Passo

Após concluir: executar `passo_11.md` — conectar `ProjectView` para listar, criar, atualizar status e atribuir responsável em `org_tasks`.
