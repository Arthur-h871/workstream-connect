# Passo 17 — Notificações em tempo real

## Objetivo

Implementar o sino de notificações do `AppShell` com dados reais: carregar notificações do banco na abertura do painel, receber novas notificações via Supabase Realtime (INSERT), marcar como lidas individualmente ou em lote. Aproveitar a visita ao `AppShell` para também corrigir o nome/avatar do usuário no rodapé da sidebar e o filtro do link "Membros" (atualmente visível a todos).

---

## Arquivos envolvidos

| Ação | Arquivo |
|------|---------|
| Criar | `backend/api/services/notifications.service.ts` |
| Modificar | `src/components/AppShell.tsx` |

---

## Estado atual antes do passo

### `AppShell.tsx`

- `NotificationBell` sempre exibe "Nenhuma notificação" — sem queries reais
- Rodapé da sidebar exibe `—` para nome e role do usuário
- Link "Membros" visível para todos os roles (incluindo `tenant_user`)

### `backend/api/services/notifications.service.ts`

Arquivo não existe.

---

## 17.1 — Criar `notifications.service.ts`

```ts
import { supabase } from 'backend/api/supabase'

export type Notification = {
  id: string
  user_id: string
  type: 'new_org_task' | 'task_assigned' | 'member_request' | 'member_accepted'
  title: string
  body: string
  reference_id: string | null
  reference_type: string | null
  read_at: string | null
  created_at: string
}
```

### `getNotifications(userId)`

Retorna as 30 notificações mais recentes do usuário, ordenadas da mais nova para a mais antiga.

```ts
export async function getNotifications(userId: string): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(30)

  if (error) return []
  return data ?? []
}
```

### `markAsRead(id)`

```ts
export async function markAsRead(id: string): Promise<void> {
  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
}
```

### `markAllAsRead(userId)`

Atualiza apenas as notificações com `read_at IS NULL` (não lidas).

```ts
export async function markAllAsRead(userId: string): Promise<void> {
  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null)
}
```

### `subscribeToNotifications(userId, onNew)`

Assina eventos `INSERT` na tabela `notifications` filtrado pelo `user_id`. Retorna a função de cancelamento para uso em `useEffect` cleanup.

```ts
export function subscribeToNotifications(
  userId: string,
  onNew: (notification: Notification) => void
): () => void {
  const channel = supabase
    .channel(`notifications-${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        onNew(payload.new as Notification)
      },
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
```

> **Por que apenas INSERT?** Notificações nunca são editadas — só criadas e marcadas como lidas. Escutar `UPDATE` seria desnecessário e aumentaria o tráfego do canal.

---

## 17.2 — Modificar `AppShell.tsx`

### Alterações de imports

```tsx
// Adicionar ao import do @tanstack/react-router:
import { Link, useRouterState, useRouteContext } from '@tanstack/react-router'

// Adicionar import do service:
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  subscribeToNotifications,
  type Notification,
} from 'backend/api/services/notifications.service'

// Adicionar ao import do react:
import { useState, useEffect, type ReactNode } from 'react'
```

### Helper `formatTimeAgo`

Adicionar antes dos componentes:

```ts
function formatTimeAgo(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min} min atrás`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h atrás`
  const d = Math.floor(h / 24)
  return `${d}d atrás`
}
```

### `NotificationBell` — reescrita completa

A função acessa o contexto da rota `/_authenticated` para obter o `profile` sem exigir prop drilling por cada rota.

```tsx
function NotificationBell() {
  const { profile } = useRouteContext({ from: '/_authenticated' })
  const userId = profile.id

  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  // Carga inicial
  useEffect(() => {
    setLoading(true)
    getNotifications(userId).then((data) => {
      setNotifications(data)
      setLoading(false)
    })
  }, [userId])

  // Realtime: nova notificação chega → prepend na lista
  useEffect(() => {
    return subscribeToNotifications(userId, (incoming) => {
      setNotifications((prev) => [incoming, ...prev])
    })
  }, [userId])

  const unreadCount = notifications.filter((n) => !n.read_at).length

  async function handleMarkRead(id: string) {
    // Otimista: marca localmente imediatamente
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, read_at: new Date().toISOString() } : n,
      ),
    )
    await markAsRead(id)
  }

  async function handleMarkAllRead() {
    const now = new Date().toISOString()
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? now })))
    await markAllAsRead(userId)
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-muted-foreground transition-colors hover:text-foreground"
        aria-label="Notificações"
      >
        <Bell className="h-4 w-4" />
        {/* Badge: ponto vermelho quando há não lidas */}
        {unreadCount > 0 && (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-copper" />
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-lg border border-border bg-surface shadow-2xl">
            {/* Cabeçalho do painel */}
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <p className="section-label">Notificações</p>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs text-teal hover:underline"
                >
                  Marcar todas como lidas
                </button>
              )}
            </div>

            {/* Lista */}
            <div className="max-h-80 overflow-y-auto">
              {loading ? (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                  Carregando…
                </div>
              ) : notifications.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                  Nenhuma notificação
                </div>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => { if (!n.read_at) handleMarkRead(n.id) }}
                    className={`w-full border-b border-border/50 px-3 py-3 text-left transition-colors last:border-0 hover:bg-background ${
                      !n.read_at ? 'bg-copper-soft/20' : ''
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {/* Indicador de não lida */}
                      <span
                        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                          !n.read_at ? 'bg-copper' : 'bg-transparent'
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-xs leading-snug ${
                            !n.read_at ? 'font-semibold text-foreground' : 'text-muted-foreground'
                          }`}
                        >
                          {n.title}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{n.body}</p>
                        <p className="mt-1 text-[10px] text-muted-foreground/60">
                          {formatTimeAgo(n.created_at)}
                        </p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}
```

### `SidebarUser` — novo subcomponente

Extrair o rodapé da sidebar para um componente separado que usa `useRouteContext` para mostrar dados reais:

```tsx
function SidebarUser() {
  const { profile } = useRouteContext({ from: '/_authenticated' })

  const initials = profile.full_name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p: string) => p[0]?.toUpperCase() ?? '')
    .join('')

  const roleLabel =
    profile.role === 'tenant_admin' || profile.role === 'master' ? 'Admin' : 'Membro'

  return (
    <Link
      to="/perfil"
      className="flex items-center gap-3 rounded-md p-2 hover:bg-background"
    >
      {profile.avatar_url ? (
        <img
          src={profile.avatar_url}
          alt={profile.full_name}
          className="h-8 w-8 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-copper-soft text-xs font-semibold text-copper">
          {initials}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{profile.full_name}</p>
        <p className="truncate text-xs text-muted-foreground">{roleLabel}</p>
      </div>
    </Link>
  )
}
```

### Filtro do link "Admin" na nav

Dentro de `AppShell`, antes do `.map` da nav, adicionar o filtro de role. O `profile` é acessado localmente:

```tsx
export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const location = useRouterState({ select: (s) => s.location.pathname })
  const { profile } = useRouteContext({ from: '/_authenticated' })

  const visibleNav = nav.filter(
    (item) => !item.admin || profile.role !== 'tenant_user',
  )

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-border bg-surface">
        {/* Logo */}
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-copper">
            <div className="h-2.5 w-2.5 rounded-sm bg-background" />
          </div>
          <span className="text-base font-semibold tracking-tight">Marco</span>
        </div>

        {/* Nav — filtrada por role */}
        <nav className="flex-1 space-y-0.5 px-3 py-2">
          {visibleNav.map((item) => {
            const active = location.startsWith(item.to)
            const Icon = item.icon
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                  active
                    ? 'bg-copper-soft text-copper'
                    : 'text-muted-foreground hover:bg-background hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                <span className="truncate">{item.label}</span>
                {item.admin && (
                  <span className="ml-auto rounded bg-teal-soft px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-teal">
                    Admin
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* Rodapé: usuário autenticado */}
        <div className="border-t border-border p-3">
          <SidebarUser />
        </div>
      </aside>

      {/* Main */}
      <main className="ml-60 flex-1">
        <div className="relative mx-auto max-w-[1400px] px-8 py-8">
          {title && (
            <div className="mb-8 flex items-center justify-between">
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              <div className="relative">
                <NotificationBell />
              </div>
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  )
}
```

> **Por que `useRouteContext({ from: '/_authenticated' })`?** `AppShell` não é um route component, então não tem acesso ao `loader` data diretamente. `useRouteContext` acessa o contexto acumulado pela rota `/_authenticated` (via `beforeLoad` return) que fica disponível para qualquer componente dentro da árvore. Como `AppShell` é usado exclusivamente em rotas filhas de `/_authenticated`, o hook sempre encontra o contexto correto.

---

## Requisito no banco: Realtime habilitado para `notifications`

Para que o canal `postgres_changes` funcione, a tabela `notifications` precisa ter Realtime habilitado no projeto Supabase. No painel do Supabase:

**Database → Replication → Tables → notifications → habilitar**

Ou via SQL:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
```

> Sem isso, o `subscribe()` conecta mas nunca dispara eventos.

---

## Checklist de verificação manual

### Sino de notificações
- [ ] Ícone `Bell` sem badge quando não há notificações não lidas
- [ ] Ponto `bg-copper` aparece no sino quando há não lidas
- [ ] Clicar no sino abre o painel (overlay fecha ao clicar fora)
- [ ] Painel mostra "Carregando…" brevemente e depois a lista
- [ ] Notificação não lida: fundo levemente cobre, fonte semibold
- [ ] Clicar em notificação não lida → marca como lida (fundo some, fonte fica muted)
- [ ] "Marcar todas como lidas" aparece apenas quando há não lidas e funciona
- [ ] `formatTimeAgo` exibe "agora", "5 min atrás", "2h atrás", "3d atrás" conforme o tempo

### Realtime
- [ ] Abrir painel de notificações em uma aba; inserir notificação manualmente pelo Supabase Studio com o `user_id` do usuário logado → row aparece no painel sem recarregar página
- [ ] Ponto no sino aparece imediatamente após o INSERT via Realtime
- [ ] Trocar de aba e voltar não duplica a notificação (canal é criado uma única vez)

### Sidebar
- [ ] Nome e role do usuário corretos no rodapé da sidebar
- [ ] Avatar real exibido se `avatar_url` não for null; iniciais caso contrário
- [ ] Link "Membros" não aparece para usuário com role `tenant_user`

---

## O que não fazer

- **Não** importar `supabase` diretamente no `AppShell` — usar apenas as funções do `notifications.service.ts` (incluindo `subscribeToNotifications`)
- **Não** usar `useLoaderData` no `AppShell` — `AppShell` não é um route component. Usar `useRouteContext({ from: '/_authenticated' })`
- **Não** criar um segundo canal Realtime para `notifications` em outro lugar — o canal ativo no `AppShell` é suficiente enquanto o usuário está logado
- **Não** esquecer de retornar a função de cleanup no `useEffect` do `subscribeToNotifications` — sem cleanup, o canal fica ativo mesmo após logout ou remount, causando memory leak
- **Não** escutar `UPDATE` no canal Realtime — o `markAsRead` é operação local (otimista) e não precisa sync do banco. Escutar UPDATE duplicaria a lógica sem benefício

---

## Próximo passo

**Passo 18 — Sessões de captura: controle Start / Pause / Stop:** conectar os botões do dashboard ao banco para criar e atualizar `capture_sessions`, que serão monitoradas pelo agente Python via Realtime.
