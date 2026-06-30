# Passo 6 — Guard de rotas (proteção de páginas autenticadas)

## Objetivo
Impedir acesso a rotas protegidas sem sessão ativa. Redirecionar para `/login` se não autenticado. Redirecionar para `/aguardando` se autenticado mas sem profile (estado `member_request` pendente).

---

## Contexto

As rotas `dashboard`, `tarefas`, `tarefas-org`, `apontamentos`, `perfil` e `admin/membros` existem como arquivos planos em `src/routes/` sem nenhuma verificação de sessão. Qualquer pessoa pode acessá-las diretamente pela URL.

O TanStack Router suporta **layouts pathless** — arquivos com prefixo `_` que envolvem rotas filhas sem adicionar segmento à URL. O arquivo `_authenticated.tsx` com `beforeLoad` centraliza o guard em um único lugar, sem repetir a lógica em cada rota.

---

## Passo a passo

### 1. Adicionar `getProfile` ao `users.service.ts`

Criar `backend/api/services/users.service.ts` (ou adicionar se já existir) com:

```ts
import { supabase } from '../supabase'

export async function getProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  if (error) return null
  return data
}
```

### 2. Criar `src/routes/_authenticated.tsx`

```tsx
import { createFileRoute, redirect, Outlet } from '@tanstack/react-router'
import { getSession } from 'backend/api/services/auth.service'
import { getProfile } from 'backend/api/services/users.service'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async () => {
    const session = await getSession()
    if (!session) throw redirect({ to: '/login' })

    const profile = await getProfile(session.user.id)
    if (!profile) throw redirect({ to: '/aguardando' })
  },
  component: () => <Outlet />,
})
```

### 3. Renomear os arquivos de rotas protegidas

O prefixo `_authenticated.` faz o TanStack Router colocar a rota sob o layout `_authenticated.tsx`:

| Arquivo atual | Arquivo novo |
|---------------|-------------|
| `src/routes/dashboard.tsx` | `src/routes/_authenticated.dashboard.tsx` |
| `src/routes/tarefas.tsx` | `src/routes/_authenticated.tarefas.tsx` |
| `src/routes/tarefas-org.tsx` | `src/routes/_authenticated.tarefas-org.tsx` |
| `src/routes/apontamentos.tsx` | `src/routes/_authenticated.apontamentos.tsx` |
| `src/routes/perfil.tsx` | `src/routes/_authenticated.perfil.tsx` |
| `src/routes/admin.membros.tsx` | `src/routes/_authenticated.admin.membros.tsx` |

Dentro de cada arquivo renomeado, atualizar o `createFileRoute` para refletir o novo path:

```ts
// antes
export const Route = createFileRoute('/dashboard')({ ... })

// depois
export const Route = createFileRoute('/_authenticated/dashboard')({ ... })
```

Fazer o mesmo para todos os 6 arquivos.

### 4. Criar `src/routes/aguardando.tsx`

Tela simples exibida para usuários autenticados sem profile. Não precisa de `beforeLoad` — o guard do layout já garante que só usuários sem profile chegam aqui.

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/aguardando')({
  component: Aguardando,
})

function Aguardando() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">Pedido em análise</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Seu pedido de entrada foi enviado. Um administrador vai revisá-lo em breve.
        </p>
      </div>
    </div>
  )
}
```

### 5. Redirecionar usuário já autenticado em `/login` e `/cadastro`

Adicionar `beforeLoad` em `src/routes/login.tsx` e `src/routes/cadastro.tsx`:

```ts
beforeLoad: async () => {
  const session = await getSession()
  if (session) throw redirect({ to: '/dashboard' })
},
```

### 6. Verificar que os links internos ainda funcionam

Qualquer `<Link to="/dashboard">` no AppShell ou landing page continua funcionando — a URL pública não muda. Apenas o arquivo interno foi renomeado.

---

## Requisitos para considerar concluído

- [ ] `backend/api/services/users.service.ts` criado com `getProfile`
- [ ] `src/routes/_authenticated.tsx` criado com `beforeLoad` verificando sessão e profile
- [ ] 6 arquivos de rotas protegidas renomeados com prefixo `_authenticated.`
- [ ] `createFileRoute` atualizado em todos os 6 arquivos para o path correto
- [ ] `src/routes/aguardando.tsx` criado
- [ ] `/login` e `/cadastro` redirecionam usuário já autenticado para `/dashboard`
- [ ] `npm run dev` compila sem erros após os renomes

---

## O que não fazer

- Não adicionar `beforeLoad` individualmente em cada rota protegida — o layout `_authenticated.tsx` centraliza isso
- Não chamar `supabase.auth.getSession()` diretamente — usar `getSession()` do `auth.service.ts`
- Não esquecer de atualizar o `createFileRoute` path ao renomear — o path precisa coincidir com o nome do arquivo para o TanStack Router gerar as rotas corretamente
- Não redirecionar para `/aguardando` baseado em outro critério além da ausência de profile — é esse e só esse o indicador do estado pendente
