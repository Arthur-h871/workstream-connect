# Passo 7 — Sessão persistida e logout

## Objetivo
Garantir que a sessão do usuário sobrevive a recarregamentos de página e implementar o botão de logout no AppShell com navegação para `/login`.

---

## Estado após o Passo 6

- `backend/api/services/auth.service.ts` — exporta `signIn`, `signUp`, `getSession`, `checkPendingSignup`, `cancelPendingSignup`
- `src/routes/_authenticated.tsx` — guard que chama `getSession()` no `beforeLoad`
- `src/components/AppShell.tsx` — sidebar com área de usuário no rodapé (placeholders `—`), sem botão de logout

---

## Contexto técnico

**Persistência é automática.** O cliente `@supabase/supabase-js` persiste a sessão em `localStorage` por padrão. Quando o usuário recarrega a página, `supabase.auth.getSession()` lê o token do `localStorage` e retorna a sessão — sem código adicional. A renovação automática do token (refresh) também é gerenciada internamente pelo cliente.

**O que este passo entrega de novo** é apenas:
1. A função `signOut()` no service
2. O botão de logout no AppShell que chama essa função e redireciona para `/login`

---

## Implementação

### 7.1 — Adicionar `signOut` ao `auth.service.ts`

**Arquivo:** `backend/api/services/auth.service.ts` (adicionar ao final do arquivo existente)

- [ ] Adicionar a função

```ts
export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}
```

---

### 7.2 — Atualizar `AppShell.tsx` com o botão de logout

**Arquivo:** `src/components/AppShell.tsx`

Estado atual das linhas relevantes (93–101):
```tsx
<div className="border-t border-border p-3">
  <Link to="/perfil" className="flex items-center gap-3 rounded-md p-2 hover:bg-background">
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-copper-soft text-sm font-semibold text-copper" />
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium text-muted-foreground">—</p>
      <p className="truncate text-xs text-muted-foreground">—</p>
    </div>
  </Link>
</div>
```

- [ ] Adicionar imports de `LogOut` (lucide-react), `useNavigate` (tanstack-router) e `signOut` (auth.service)
- [ ] Adicionar função `handleLogout` no componente `AppShell`
- [ ] Reorganizar o rodapé para acomodar o botão de logout ao lado do link de perfil

**Imports a adicionar** (no topo do arquivo, junto aos existentes):

```tsx
import { LogOut } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { signOut } from "backend/api/services/auth.service";
```

**Resultado final das linhas relevantes** — dentro do `AppShell`, logo antes do `return`:

```tsx
const nav = useNavigate();

async function handleLogout() {
  await signOut();
  nav({ to: "/login" });
}
```

**Rodapé da sidebar** — substituir o bloco `<div className="border-t border-border p-3">` inteiro por:

```tsx
<div className="border-t border-border p-3">
  <div className="flex items-center gap-1">
    <Link
      to="/perfil"
      className="flex flex-1 items-center gap-3 rounded-md p-2 hover:bg-background"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-copper-soft text-sm font-semibold text-copper" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-muted-foreground">—</p>
        <p className="truncate text-xs text-muted-foreground">—</p>
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

---

## Verificação manual

### Cenário 1 — Sessão persiste após reload

1. Fazer login com credenciais válidas → chega ao dashboard
2. Recarregar a página (F5 / Ctrl+R)
3. **Esperado:** continua no dashboard, não redireciona para `/login`
4. Abrir DevTools → Application → Local Storage → verificar que há uma chave `sb-<project>-auth-token` com o token

### Cenário 2 — Logout redireciona para login

1. Estar logado no dashboard
2. Clicar no ícone de logout (canto inferior do sidebar)
3. **Esperado:** redireciona para `/login`
4. Verificar DevTools → Application → Local Storage: chave `sb-<project>-auth-token` foi removida

### Cenário 3 — Sessão inválida redireciona para login

1. Estar logado
2. Limpar o localStorage manualmente (DevTools → Application → Local Storage → Clear all)
3. Recarregar a página
4. **Esperado:** guard do `_authenticated.tsx` detecta `session === null` e redireciona para `/login`

---

## Requisitos para considerar concluído

- [ ] `auth.service.ts` tem a função `signOut`
- [ ] `AppShell.tsx` importa `signOut`, `LogOut` e `useNavigate`
- [ ] Botão de logout visível no rodapé do sidebar
- [ ] Clicar em logout chama `signOut()` e navega para `/login`
- [ ] Sessão persiste após reload da página (verificado no localStorage)
- [ ] Limpar o localStorage + reload redireciona corretamente para `/login`

---

## O que não fazer

- Não criar context/provider global para guardar a sessão — o guard já chama `getSession()` no `beforeLoad` de cada navegação; estado React seria redundante neste passo
- Não confirmar o logout com modal ou dialog — ação imediata é o padrão esperado para este tipo de app
- Não usar `window.location.href = '/login'` após logout — usar `useNavigate` para manter o histórico do router
- Não lidar com `signOut` errors na UI — se falhar, o `localStorage` já foi limpo pelo cliente e o usuário efetivamente está deslogado

---

## Próximo Passo

Após concluir: executar `passo_8.md` — carregar o perfil real do usuário (nome, avatar, role) e a organização a partir do banco, substituindo os `—` do AppShell por dados reais.
