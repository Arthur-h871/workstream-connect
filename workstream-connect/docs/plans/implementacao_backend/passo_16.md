# Passo 16 — Membros da organização (admin)

## Objetivo

Conectar a rota `/admin/membros` para listar membros ativos, exibir o código da org, promover admins, remover membros, e gerenciar pedidos pendentes (aceitar/rejeitar).

---

## Arquivos envolvidos

| Ação | Arquivo |
|------|---------|
| Modificar | `backend/api/services/organizations.service.ts` |
| Migrar + reescrever | `src/routes/admin.membros.tsx` → `src/routes/_authenticated.admin.membros.tsx` |

---

## Estado atual antes do passo

### `backend/api/services/organizations.service.ts`

Já existe desde o passo 5 (fluxo de cadastro). Contém apenas:

```ts
export async function getOrgByCode(code: string): Promise<Organization | null>
```

### `src/routes/admin.membros.tsx`

```ts
const members: Member[] = []       // array vazio
const orgId = ""                   // código da org não carregado
// MoreVertical sem ação
// Sem aba "Pendentes"
```

---

## 16.1 — Adicionar funções a `organizations.service.ts`

Adicionar logo após `getOrgByCode` os tipos e funções necessários para a página admin.

### Tipos novos

```ts
export type AdminOrgMember = {
  id: string
  full_name: string
  avatar_url: string | null
  role: 'master' | 'tenant_admin' | 'tenant_user'
  created_at: string
}

export type PendingMember = {
  id: string          // member_requests.id
  user_id: string
  full_name: string
  created_at: string
}
```

> **Nota:** `AdminOrgMember` é distinto do tipo `OrgMember` em `users.service.ts` (que contém apenas `id` e `full_name` para o dropdown de atribuição de tarefas). Este tipo carrega dados completos para a tela admin.

### `getMyOrganization(orgId)`

```ts
export async function getMyOrganization(
  orgId: string
): Promise<{ id: string; name: string; code: string } | null> {
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name, code')
    .eq('id', orgId)
    .single()

  if (error || !data) return null
  return data
}
```

### `getOrgMembers(orgId)` — versão admin (dados completos)

```ts
export async function getOrgMembers(orgId: string): Promise<AdminOrgMember[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, role, created_at')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: true })

  if (error) return []
  return data ?? []
}
```

### `getPendingMembers(orgId)`

```ts
export async function getPendingMembers(orgId: string): Promise<PendingMember[]> {
  const { data, error } = await supabase
    .from('member_requests')
    .select('id, user_id, full_name, created_at')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: true })

  if (error) return []
  return data ?? []
}
```

### `acceptMember(requestId, role)`

Conforme `fluxo_cadastro.md`: lê o pedido → cria profile → cria user_settings → deleta pedido → notifica o usuário.

```ts
export async function acceptMember(
  requestId: string,
  role: 'tenant_user' | 'tenant_admin'
): Promise<void> {
  // 1. Ler o pedido para obter user_id, organization_id e full_name
  const { data: req, error: reqErr } = await supabase
    .from('member_requests')
    .select('user_id, organization_id, full_name')
    .eq('id', requestId)
    .single()

  if (reqErr || !req) throw new Error('Pedido não encontrado')

  // 2. Criar o profile
  const { error: profileErr } = await supabase
    .from('profiles')
    .insert({
      id: req.user_id,
      organization_id: req.organization_id,
      full_name: req.full_name,
      role,
    })

  if (profileErr) throw profileErr

  // 3. Criar user_settings com valores padrão
  await supabase
    .from('user_settings')
    .insert({ user_id: req.user_id })

  // 4. Deletar o pedido
  await supabase
    .from('member_requests')
    .delete()
    .eq('id', requestId)

  // 5. Notificar o usuário
  await supabase.from('notifications').insert({
    user_id: req.user_id,
    type: 'member_accepted',
    title: 'Você foi aceito na organização',
    body: 'Seu pedido de entrada foi aprovado. Bem-vindo!',
  })
}
```

> **Sem transação:** os 5 passos são sequenciais sem rollback automático. O passo crítico é o 2 (criação do profile). Caso os passos 3–5 falhem isoladamente, o usuário conseguirá acessar o sistema mas não terá `user_settings` ou notificação. Em produção, considerar RPC com `BEGIN/COMMIT`.

### `rejectMember(userId)`

Rejeição exige `service_role` para deletar de `auth.users`. Usar Edge Function `reject-member`.

```ts
export async function rejectMember(userId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('reject-member', {
    body: { user_id: userId },
  })
  if (error) throw error
}
```

### `promoteToAdmin(memberId)`

```ts
export async function promoteToAdmin(memberId: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ role: 'tenant_admin' })
    .eq('id', memberId)

  if (error) throw error
}
```

### `removeMember(memberId)`

Deleta o profile. Por causa de `ON DELETE CASCADE` em todas as tabelas referenciando `profiles.id`, todos os dados do membro serão removidos do banco. Arquivos físicos no Storage (screenshots, avatar) não são deletados aqui — são limpos pelo cron do passo 22.

```ts
export async function removeMember(memberId: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .delete()
    .eq('id', memberId)

  if (error) throw error
}
```

---

## 16.2 — Migrar e reescrever `admin.membros.tsx`

Criar `src/routes/_authenticated.admin.membros.tsx` substituindo `src/routes/admin.membros.tsx`.

### Loader e route definition

```tsx
import { createFileRoute, redirect } from '@tanstack/react-router'
import {
  getMyOrganization,
  getOrgMembers,
  getPendingMembers,
  acceptMember,
  rejectMember,
  promoteToAdmin,
  removeMember,
} from 'backend/api/services/organizations.service'
import { AppShell } from '@/components/AppShell'
import { Copy, Check, MoreVertical } from 'lucide-react'
import { useState } from 'react'

export const Route = createFileRoute('/_authenticated/admin/membros')({
  head: () => ({
    meta: [
      { title: 'Membros — Workstream' },
      { name: 'description', content: 'Gerencie membros da organização.' },
    ],
  }),
  beforeLoad: ({ context }) => {
    if (context.profile.role === 'tenant_user') {
      throw redirect({ to: '/dashboard' })
    }
  },
  loader: async ({ context }) => {
    const orgId = context.profile.organization_id
    const [org, members, pending] = await Promise.all([
      getMyOrganization(orgId),
      getOrgMembers(orgId),
      getPendingMembers(orgId),
    ])
    return { org, members, pending, currentUserId: context.profile.id }
  },
  component: () => (
    <AppShell title="Membros da Organização">
      <Membros />
    </AppShell>
  ),
})
```

> **Guard de admin:** `beforeLoad` redireciona `tenant_user` para `/dashboard`. O link na sidebar já fica visível só para admins via `AppShell`, mas o guard no route garante proteção mesmo por URL direta.

### Componentes auxiliares

```tsx
import type { AdminOrgMember } from 'backend/api/services/organizations.service'

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

function formatDate(isoStr: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(isoStr))
}

function MemberAvatar({
  name,
  avatarUrl,
}: {
  name: string
  avatarUrl: string | null
}) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="h-11 w-11 rounded-full object-cover"
      />
    )
  }
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-copper-soft text-sm font-semibold text-copper">
      {getInitials(name)}
    </div>
  )
}

function RoleBadge({ role }: { role: AdminOrgMember['role'] }) {
  const isAdmin = role === 'tenant_admin' || role === 'master'
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        isAdmin
          ? 'bg-teal-soft text-teal'
          : 'bg-border text-muted-foreground'
      }`}
    >
      {isAdmin ? 'Admin' : 'Membro'}
    </span>
  )
}
```

### `MemberCard`

Dropdown de ações (MoreVertical) com overlay transparente para fechar ao clicar fora.

```tsx
function MemberCard({
  member,
  currentUserId,
  onPromote,
  onRemove,
}: {
  member: AdminOrgMember
  currentUserId: string
  onPromote: (id: string) => void
  onRemove: (id: string) => void
}) {
  const [showMenu, setShowMenu] = useState(false)
  const isSelf = member.id === currentUserId
  const isAdmin =
    member.role === 'tenant_admin' || member.role === 'master'

  return (
    <div className="group relative rounded-lg border border-border bg-surface p-5">
      {!isSelf && (
        <div className="absolute right-3 top-3">
          <button
            onClick={() => setShowMenu((v) => !v)}
            className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
            aria-label="Ações do membro"
          >
            <MoreVertical className="h-4 w-4" />
          </button>

          {showMenu && (
            <>
              {/* Overlay para fechar ao clicar fora */}
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowMenu(false)}
              />
              <div className="absolute right-0 top-6 z-20 min-w-[160px] overflow-hidden rounded-md border border-border bg-surface shadow-lg">
                {!isAdmin && (
                  <button
                    onClick={() => {
                      onPromote(member.id)
                      setShowMenu(false)
                    }}
                    className="w-full px-3 py-2 text-left text-xs hover:bg-background"
                  >
                    Promover a Admin
                  </button>
                )}
                <button
                  onClick={() => {
                    onRemove(member.id)
                    setShowMenu(false)
                  }}
                  className="w-full px-3 py-2 text-left text-xs text-destructive hover:bg-destructive/10"
                >
                  Remover da organização
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="flex items-start gap-3">
        <MemberAvatar name={member.full_name} avatarUrl={member.avatar_url} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{member.full_name}</p>
          <div className="mt-2 flex items-center gap-2">
            <RoleBadge role={member.role} />
            <span className="font-mono text-[10px] text-muted-foreground">
              desde {formatDate(member.created_at)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
```

### `PendingRow`

```tsx
import type { PendingMember } from 'backend/api/services/organizations.service'

function PendingRow({
  request,
  onAccept,
  onReject,
}: {
  request: PendingMember
  onAccept: (id: string, role: 'tenant_user' | 'tenant_admin') => Promise<void>
  onReject: (userId: string, id: string) => Promise<void>
}) {
  const [state, setState] = useState<
    'idle' | 'accepting-user' | 'accepting-admin' | 'rejecting'
  >('idle')

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-5 py-4">
      <div>
        <p className="text-sm font-medium">{request.full_name}</p>
        <p className="text-xs text-muted-foreground">
          Pedido em {formatDate(request.created_at)}
        </p>
      </div>

      <div className="flex items-center gap-2">
        {/* Aceitar como Membro */}
        <button
          onClick={async () => {
            setState('accepting-user')
            await onAccept(request.id, 'tenant_user')
          }}
          disabled={state !== 'idle'}
          className="rounded-md bg-teal px-3 py-1.5 text-xs font-semibold text-background hover:opacity-90 disabled:opacity-40"
        >
          {state === 'accepting-user' ? 'Aceitando…' : 'Membro'}
        </button>

        {/* Aceitar como Admin */}
        <button
          onClick={async () => {
            setState('accepting-admin')
            await onAccept(request.id, 'tenant_admin')
          }}
          disabled={state !== 'idle'}
          className="rounded-md bg-teal-soft px-3 py-1.5 text-xs font-semibold text-teal hover:opacity-90 disabled:opacity-40"
        >
          {state === 'accepting-admin' ? 'Aceitando…' : 'Admin'}
        </button>

        {/* Rejeitar */}
        <button
          onClick={async () => {
            setState('rejecting')
            await onReject(request.user_id, request.id)
          }}
          disabled={state !== 'idle'}
          className="rounded-md border border-border px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-40"
        >
          {state === 'rejecting' ? 'Rejeitando…' : 'Rejeitar'}
        </button>
      </div>
    </div>
  )
}
```

> **Decisão de UX:** Dois botões para aceitar ("Membro" e "Admin") evitam um modal/select extra e tornam a intenção imediata. O admin raramente aceita como Admin, portanto o botão "Membro" é primário (cor sólida) e "Admin" é secundário (outline).

### Componente principal `Membros`

```tsx
function Membros() {
  const {
    org,
    members: initialMembers,
    pending: initialPending,
    currentUserId,
  } = Route.useLoaderData()

  const [tab, setTab] = useState<'active' | 'pending'>('active')
  const [members, setMembers] = useState(initialMembers)
  const [pending, setPending] = useState(initialPending)
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(org?.code ?? '')
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function handlePromote(memberId: string) {
    // Atualização otimista: troca role localmente
    setMembers((prev) =>
      prev.map((m) =>
        m.id === memberId ? { ...m, role: 'tenant_admin' as const } : m,
      ),
    )
    promoteToAdmin(memberId).catch(() => {
      // Em caso de erro, reverter
      setMembers(initialMembers)
    })
  }

  function handleRemove(memberId: string) {
    // Atualização otimista: remove da lista
    setMembers((prev) => prev.filter((m) => m.id !== memberId))
    removeMember(memberId).catch(() => {
      setMembers(initialMembers)
    })
  }

  async function handleAccept(
    requestId: string,
    role: 'tenant_user' | 'tenant_admin',
  ) {
    await acceptMember(requestId, role)
    setPending((prev) => prev.filter((p) => p.id !== requestId))
  }

  async function handleReject(userId: string, requestId: string) {
    await rejectMember(userId)
    setPending((prev) => prev.filter((p) => p.id !== requestId))
  }

  return (
    <div>
      {/* Header: código da organização */}
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Convide novos membros compartilhando o código da organização.
        </p>
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-xs transition-colors hover:border-teal/50"
        >
          <span className="text-muted-foreground">Código:</span>
          <span className="font-mono font-semibold tracking-wider text-teal">
            {org?.code ?? '—'}
          </span>
          {copied ? (
            <Check className="h-3.5 w-3.5 text-[#10B981]" />
          ) : (
            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-lg border border-border bg-muted p-1">
        <button
          onClick={() => setTab('active')}
          className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
            tab === 'active'
              ? 'bg-surface text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Membros ativos ({members.length})
        </button>
        <button
          onClick={() => setTab('pending')}
          className={`relative flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
            tab === 'pending'
              ? 'bg-surface text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Pendentes
          {pending.length > 0 && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-copper px-1.5 py-0.5 text-[10px] font-bold text-background">
              {pending.length}
            </span>
          )}
        </button>
      </div>

      {/* Conteúdo da aba ativa */}
      {tab === 'active' ? (
        members.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-surface px-4 py-16 text-center text-sm text-muted-foreground">
            Nenhum membro na organização
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {members.map((m) => (
              <MemberCard
                key={m.id}
                member={m}
                currentUserId={currentUserId}
                onPromote={handlePromote}
                onRemove={handleRemove}
              />
            ))}
          </div>
        )
      ) : pending.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface px-4 py-16 text-center text-sm text-muted-foreground">
          Nenhum pedido pendente
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {pending.map((p) => (
            <PendingRow
              key={p.id}
              request={p}
              onAccept={handleAccept}
              onReject={handleReject}
            />
          ))}
        </div>
      )}
    </div>
  )
}
```

---

## Checklist de verificação manual

### Aba "Membros ativos"
- [ ] Cards exibem avatar real (ou iniciais corretamente geradas)
- [ ] Badge "Admin" para `tenant_admin` e `master`, "Membro" para `tenant_user`
- [ ] Data "desde" formatada em pt-BR (ex: "3 de jan. de 2025")
- [ ] Hover no card revela botão MoreVertical
- [ ] Clicar MoreVertical abre dropdown; clicar fora fecha
- [ ] "Promover a Admin" aparece apenas para membros com role `tenant_user`
- [ ] Próprio usuário não tem dropdown (sem possibilidade de se remover)
- [ ] Promoção atualiza badge do card imediatamente (otimista)
- [ ] Remoção remove o card imediatamente (otimista)

### Aba "Pendentes"
- [ ] Badge numérico na tab aparece quando há pedidos
- [ ] Botões "Membro" e "Admin" ficam disabled durante operação
- [ ] Clicar "Membro" → `acceptMember(id, 'tenant_user')` → row desaparece
- [ ] Clicar "Admin" → `acceptMember(id, 'tenant_admin')` → row desaparece
- [ ] Clicar "Rejeitar" → `rejectMember(userId)` (Edge Function) → row desaparece
- [ ] Estado vazio exibe mensagem correta

### Código da organização
- [ ] Código correto carregado via `getMyOrganization`
- [ ] Clicar botão copia para clipboard e exibe ícone `Check` por 1.5s

### Guard de admin
- [ ] Acessar `/admin/membros` como `tenant_user` redireciona para `/dashboard`

---

## O que não fazer

- **Não** editar `src/routes/admin.membros.tsx` diretamente — criar o arquivo novo em `_authenticated.admin.membros.tsx` e depois deletar o antigo
- **Não** implementar a Edge Function `reject-member` aqui — ela será criada no passo 22 junto com a infraestrutura de Edge Functions. Neste passo, o botão "Rejeitar" pode exibir um erro temporário até que a Edge Function exista
- **Não** deletar arquivos de Storage ao remover membro — apenas o banco é limpo neste passo; limpeza do Storage fica para o cron do passo 22
- **Não** usar `supabase.auth.admin.listUsers()` para obter e-mails — requer `service_role`; e-mail não está disponível na chave anon e não foi armazenado em `profiles` por decisão de schema. Se e-mail for necessário, criar RPC com SECURITY DEFINER como melhoria futura
- **Não** adicionar modal de confirmação para remoção de membro — por consistência com o padrão de deleção otimista do resto do app. Se quiser, pode adicionar um estado `removing` no `MemberCard` que exige segundo clique, sem bloquear o passo
- **Não** fazer `window.location.reload()` após aceitar/rejeitar — a atualização otimista da lista (`setPending`) é suficiente

---

## Próximo passo

**Passo 17 — Notificações em tempo real:** implementar o sino no `AppShell` com Supabase Realtime, listando notificações e marcando como lidas.
