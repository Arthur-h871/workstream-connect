# Passo 8 — Carregamento do perfil e organização

## Objetivo
Substituir os `—` do AppShell (nome do usuário e nome da organização) por dados reais vindos do banco.

---

## Estado após o Passo 7

- `backend/api/services/users.service.ts` — exporta `getProfile(userId)` com `select('*')` em `profiles` (sem join)
- `src/routes/_authenticated.tsx` — `beforeLoad` chama `getProfile(session.user.id)` para verificar existência do profile, mas **descarta o resultado**; componente é `() => <Outlet />`
- `src/components/AppShell.tsx` — rodapé do sidebar exibe `—` no lugar do nome e org do usuário

---

## Contexto técnico

**`beforeLoad` já busca o profile — só precisa retorná-lo.** O retorno do `beforeLoad` é mesclado ao contexto da rota no TanStack Router. Ao retornar `{ profile }`, esse dado fica disponível via `Route.useRouteContext()` na função componente do `_authenticated.tsx`.

**AppShell não é um componente de rota** — ele não pode chamar `Route.useRouteContext()` diretamente. A solução é exportar um React context (`ProfileContext`) do próprio `_authenticated.tsx`. O componente do layout envolve o `<Outlet />` com o provider; o AppShell importa o hook `useProfile`.

**O join `profiles → organizations` é feito dentro de `users.service.ts`**, retornando `org_name` junto com os demais dados do usuário. Isso evita uma chamada separada ao `organizations.service.ts` e mantém o passo interagindo com um único service.

**Nenhum re-fetch por navegação.** O `beforeLoad` do layout `/_authenticated` só re-executa quando o usuário entra na seção autenticada, não em cada troca de rota interna. O profile fica em contexto React enquanto o layout estiver montado.

---

## Implementação

### 8.1 — Atualizar `users.service.ts`

**Arquivo:** `backend/api/services/users.service.ts`

- [ ] Adicionar o tipo `UserProfile`
- [ ] Substituir o `select('*')` de `getProfile` pelo select com join em `organizations`

```ts
import { supabase } from '../supabase'

export type UserProfile = {
  id: string
  full_name: string
  avatar_url: string | null
  role: 'master' | 'tenant_admin' | 'tenant_user'
  organization_id: string
  org_name: string
}

export async function getProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, role, organization_id, organizations(name)')
    .eq('id', userId)
    .single()

  if (error || !data) return null

  return {
    id: data.id,
    full_name: data.full_name,
    avatar_url: data.avatar_url,
    role: data.role as UserProfile['role'],
    organization_id: data.organization_id,
    org_name: (data.organizations as { name: string }).name,
  }
}
```

> O campo `organizations(name)` usa a foreign key `organization_id` → `organizations.id` para trazer o nome da org na mesma query. O RLS de `organizations` permite leitura para membros da própria org — essa consulta é feita com a sessão do usuário autenticado, então passa normalmente.

---

### 8.2 — Atualizar `_authenticated.tsx`

**Arquivo:** `src/routes/_authenticated.tsx`

Mudanças:
- [ ] Importar `createContext`, `useContext` do React e `UserProfile` do users.service
- [ ] Definir e exportar `ProfileContext` e `useProfile`
- [ ] Retornar `{ profile }` do `beforeLoad`
- [ ] Substituir `() => <Outlet />` por `AuthenticatedLayout` que usa `Route.useRouteContext()` e fornece o contexto

```tsx
import { createFileRoute, redirect, Outlet } from '@tanstack/react-router'
import { createContext, useContext, type ReactNode } from 'react'
import { getSession } from 'backend/api/services/auth.service'
import { getProfile, type UserProfile } from 'backend/api/services/users.service'

const ProfileContext = createContext<UserProfile | null>(null)
export const useProfile = () => useContext(ProfileContext)

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async () => {
    const session = await getSession()
    if (!session) throw redirect({ to: '/login' })

    const profile = await getProfile(session.user.id)
    if (!profile) throw redirect({ to: '/aguardando' })

    return { profile }
  },
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  const { profile } = Route.useRouteContext()
  return (
    <ProfileContext.Provider value={profile}>
      <Outlet />
    </ProfileContext.Provider>
  )
}
```

---

### 8.3 — Atualizar `AppShell.tsx`

**Arquivo:** `src/components/AppShell.tsx`

- [ ] Importar `useProfile` de `../routes/_authenticated`
- [ ] Calcular `initials` a partir de `full_name`
- [ ] Substituir os `—` do rodapé por dados reais
- [ ] Preencher o círculo do avatar com as iniciais

**Import a adicionar** (junto aos existentes no topo):

```tsx
import { useProfile } from '../routes/_authenticated'
```

**No corpo do componente `AppShell`**, logo antes do `return`:

```tsx
const profile = useProfile()
const initials = profile?.full_name
  .split(' ')
  .map(n => n[0])
  .slice(0, 2)
  .join('')
  .toUpperCase() ?? '?'
```

**Rodapé da sidebar** — substituir o bloco `<div className="border-t border-border p-3">` inteiro (linhas 93–105 do estado pós-passo-7) por:

```tsx
<div className="border-t border-border p-3">
  <div className="flex items-center gap-1">
    <Link
      to="/perfil"
      className="flex flex-1 items-center gap-3 rounded-md p-2 hover:bg-background"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-copper-soft text-sm font-semibold text-copper">
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {profile?.full_name ?? '—'}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {profile?.org_name ?? '—'}
        </p>
      </div>
    </Link>
    <button
      onClick={handleLogout}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
      aria-label="Sair"
    >
      <LogOut className="h-4 w-4" />
    </button>
  </div>
</div>
```

> `handleLogout`, `LogOut` e `useNavigate` já foram adicionados no Passo 7.

---

## Verificação manual

### Cenário 1 — Dados reais aparecem no sidebar

1. Fazer login com um usuário que tem profile
2. Verificar sidebar: nome completo e nome da org aparecem no rodapé
3. Avatar exibe as duas primeiras iniciais do nome (ex: "Arthur Marcondes" → "AM")

### Cenário 2 — Fallback para `—`

1. Não aplicável em produção — `beforeLoad` já redireciona para `/aguardando` se profile não existir
2. Para testar: alterar temporariamente `getProfile` para retornar um objeto com `full_name: ''` e verificar que `initials` cai em `'?'`

### Cenário 3 — Sem re-fetch em navegação

1. Estar logado no dashboard
2. Navegar entre `/tarefas`, `/apontamentos`, `/perfil`
3. Abrir DevTools → Network: nenhuma request para `profiles` deve aparecer durante as navegações (o profile foi carregado uma vez no `beforeLoad`)

---

## Requisitos para considerar concluído

- [ ] `getProfile` retorna `org_name` junto com os dados do profile
- [ ] Tipo `UserProfile` exportado de `users.service.ts`
- [ ] `_authenticated.tsx` exporta `useProfile` e envolve o Outlet com `ProfileContext.Provider`
- [ ] `AppShell.tsx` importa e usa `useProfile`
- [ ] Nome e org real visíveis no sidebar após login
- [ ] Iniciais do usuário aparecem no círculo do avatar
- [ ] Sem regressão no guard — usuário sem profile ainda é redirecionado para `/aguardando`

---

## O que não fazer

- Não criar `getMyProfile()` que chama `auth.getUser()` internamente — o userId já vem da sessão obtida no `beforeLoad`, sem necessidade de uma segunda chamada ao Auth
- Não colocar `ProfileContext` em um arquivo separado `src/contexts/` — o contexto é criado e consumido apenas por `_authenticated.tsx` e `AppShell.tsx`; exportar do próprio arquivo de rota é suficiente
- Não esconder o item "Membros" do nav com base no `role` ainda — isso é escopo do Passo 16 (admin/membros), que verifica role com mais contexto
- Não usar `useEffect` + `useState` no AppShell para buscar o profile — o `beforeLoad` já garante que o profile está disponível antes de qualquer rota protegida renderizar

---

## Próximo Passo

Após concluir: executar `passo_9.md` — conectar `/tarefas` ao banco para listar, criar, atualizar status e deletar tarefas pessoais.
