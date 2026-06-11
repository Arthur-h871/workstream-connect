# Passo 3 — `createOrganization` em `organizations.service.ts`

## Objetivo

Implementar a **função única de integração** para criação de organização em `organizations.service.ts`. Ela encapsula invoke da Edge Function + auto-login. A página `cadastro.tsx` só chama essa função no submit — sem lógica de Supabase na rota.

---

## Estado após o Passo 2

- `supabase/functions/create-organization/index.ts` — Edge Function deployada (ver [`passo_2.md`](./passo_2.md)); recebe `{ adminName, adminEmail, adminPassword, orgName, orgPassword }`, cria auth user + org + profile (`tenant_admin`) + `user_settings`, retorna `{ orgCode }` (200) ou `{ error }` (4xx/5xx)
- `backend/api/supabase.ts` — cliente único com anon key (`import { supabase } from "backend/api/supabase"`)
- `backend/api/services/auth.service.ts` — exporta `signIn(email, password)` → `{ data, error }` via `signInWithPassword`
- `backend/api/services/organizations.service.ts` — exporta `getOrgByCode`, `getMyOrganization`, `getOrgMembers`, `acceptMember`, `rejectMember`, etc.; termina em `removeMember` (linha ~109); **ainda não** tem import de `signIn` nem função `createOrganization`
- `src/routes/cadastro.tsx` — fluxo modo `usuario` completo; integração com `createOrganization` é escopo do passo 5 (não alterar neste passo)

---

## Decisões de design

| Decisão | Escolha |
|---------|---------|
| Onde fica a função | `organizations.service.ts` — domínio de org, não `auth.service.ts` |
| Quem faz o auto-login | O service, logo após sucesso da Edge Function — a UI só navega para `/dashboard` |
| Formato de retorno | `{ orgCode: string \| null; error: string \| null }` — consistente com `signUp` e `cancelPendingSignup` |
| Reutilização de `signIn` | Importar de `auth.service.ts`; não duplicar `signInWithPassword` |
| Tratamento de erro da Edge Function | Ler `result?.error` do body JSON **e** `fnError?.message` do invoke |
| Sessão após criação | Obrigatória antes de navegar ao dashboard — `/_authenticated` redireciona para `/login` sem sessão |

---

## Contexto técnico

**Por que `organizations.service.ts` e não a rota.** O projeto segue `backend_architecture.md`: rotas em `src/routes/` nunca importam `supabase`. Toda comunicação passa por services. A criação de org é operação de domínio de organização — pertence ao mesmo service que já tem `getOrgByCode`, `acceptMember`, `rejectMember`.

**Papel de cada camada:**

| Camada | Responsabilidade | O que **não** faz |
|--------|------------------|-------------------|
| `cadastro.tsx` | Formulário, validação local, steps, loading/erro UI | invoke, signIn, signUp, createClient |
| `organizations.service.ts` | `createOrganization()` — invoke + signIn + retorno tipado | renderizar UI, validar confirmar-senha |
| Edge Function | Criar user + org + profile (service_role) | estabelecer sessão no browser |

**Analogia com modo usuário.** O fluxo de entrar em org existente já segue esse padrão: `cadastro.tsx` chama `getOrgByCode()` + `signUp()` dos services. O fluxo de criar org replica a mesma separação: `cadastro.tsx` chama apenas `createOrganization()`.

**Fluxo em duas etapas (Edge Function + signIn).** A Edge Function usa `service_role` para criar o usuário com `email_confirm: true`, mas isso **não** estabelece sessão no browser do cliente. O usuário fica autenticado apenas após `signInWithPassword` com as credenciais recém-criadas. Sem esse passo, o botão "Acessar o dashboard" falharia no guard de `/_authenticated`.

**Por que `signIn` e não `signUp`.** O usuário admin já foi criado pela Edge Function via `auth.admin.createUser`. Chamar `signUp` novamente retornaria erro de e-mail duplicado. O fluxo correto é login imediato com as mesmas credenciais informadas no formulário.

**Contrato da Edge Function (referência).** Body de entrada e respostas esperadas:

```ts
// Request body
{
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  orgName: string;
  orgPassword: string;
}

// Sucesso (200)
{ orgCode: string }  // 6 chars A-Z0-9

// Erro (400/500)
{ error: string }
```

**Padrão de invoke já usado no projeto.** `rejectMember` e `cancelPendingSignup` usam `supabase.functions.invoke(nome, { body })`. Seguir o mesmo padrão — sem headers extras; a anon key do client é suficiente para invocar Edge Functions públicas.

**Diferença do fluxo modo `usuario`.** No cadastro de membro, `signUp` dispara o trigger `handle_new_user` → `member_request` → aguarda aprovação. No fluxo de org, a Edge Function cria o profile diretamente com `role: 'tenant_admin'` e o trigger faz skip silencioso (sem `organization_code` no metadata). Nenhum `member_request` é criado.

---

## Implementação

> **Arquivo alvo único deste passo:** `backend/api/services/organizations.service.ts`  
> **Regra Cursor:** `.cursor/rules/cadastro-org.mdc`  
> **`cadastro.tsx`:** escopo do passo 5 — apenas consome `createOrganization()`

### 3.1 — Adicionar import de `signIn` em `organizations.service.ts`

**Arquivo:** `backend/api/services/organizations.service.ts` (modificar)

Estado atual do topo do arquivo — adicionar a segunda linha de import:

```ts
import { supabase } from "backend/api/supabase";
import { signIn } from "backend/api/services/auth.service";  // ← ADICIONAR
```

- [ ] Adicionar import de `signIn` logo após o import de `supabase`
- [ ] Não remover nem alterar o import existente de `supabase`
- [ ] Não criar novo client Supabase

---

### 3.2 — Implementar `createOrganization`

**Arquivo:** `backend/api/services/organizations.service.ts` (adicionar ao final, após `removeMember`)

Inserir **depois** desta função existente:

```ts
export async function removeMember(memberId: string): Promise<void> {
  const { error } = await supabase.from("profiles").delete().eq("id", memberId);
  if (error) throw error;
}
```

- [ ] Adicionar a função exportada abaixo de `removeMember`:

```ts
export async function createOrganization(data: {
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  orgName: string;
  orgPassword: string;
}): Promise<{ orgCode: string | null; error: string | null }> {
  const { data: result, error: fnError } = await supabase.functions.invoke(
    "create-organization",
    { body: data },
  );

  if (fnError || !result?.orgCode) {
    return {
      orgCode: null,
      error: result?.error ?? fnError?.message ?? "Erro ao criar organização",
    };
  }

  const { error: signInError } = await signIn(data.adminEmail, data.adminPassword);
  if (signInError) {
    return {
      orgCode: null,
      error: "Organização criada, mas não foi possível entrar automaticamente. Tente fazer login manualmente.",
    };
  }

  return { orgCode: result.orgCode, error: null };
}
```

**Notas de implementação para sugestões inline:**

1. `result` do invoke é o JSON parseado do body da resposta — acessar `result.orgCode` e `result.error` diretamente.
2. Se a Edge Function retornar status 400/500, `fnError` pode estar preenchido **ou** o body pode conter `{ error: "..." }` com `fnError` nulo — tratar ambos.
3. Em caso de falha no `signIn`, retornar `error` (não `{ orgCode, error: null }`). A org já existe no banco; a mensagem deve orientar login manual em `/login`.
4. Não fazer `throw` — o padrão deste service para operações de cadastro é retorno `{ ..., error }` para a UI exibir inline.

---

### 3.3 — Contrato com `cadastro.tsx` (implementado no passo 5)

Neste passo, **não** alterar `cadastro.tsx`. No passo 5, a rota será uma UI fina:

```ts
// único import de negócio para criação de org
import { createOrganization } from "backend/api/services/organizations.service";
```

No submit do step `org-form`, a rota **só** mapeia campos do formulário e repassa ao service:

```ts
setIsLoading(true);
try {
  const { orgCode: code, error: createError } = await createOrganization({
    adminName: adminForm.nome,
    adminEmail: adminForm.email,
    adminPassword: adminForm.senha,
    orgName: orgForm.orgNome,
    orgPassword: orgForm.orgSenha,
  });

  if (createError || !code) {
    setError(createError ?? "Erro ao criar organização. Tente novamente.");
    return;
  }

  setOrgCode(code);
  setStep("token");
} finally {
  setIsLoading(false);
}
```

A rota não interpreta erros do Supabase, não chama `signIn` e não sabe que existe Edge Function — tudo isso fica em `createOrganization`.

---

## Verificação manual

### Cenário 1 — Criação bem-sucedida com sessão ativa

1. No DevTools Console (ou teste temporário), chamar:
   ```ts
   import { createOrganization } from "backend/api/services/organizations.service";
   const r = await createOrganization({
     adminName: "Teste Admin",
     adminEmail: "teste-admin-unico@exemplo.com",
     adminPassword: "senha12345",
     orgName: "Org Teste",
     orgPassword: "org123",
   });
   ```
2. **Esperado:** `r.orgCode` com 6 caracteres; `r.error` é `null`
3. Verificar sessão: `supabase.auth.getSession()` retorna sessão ativa
4. Verificar banco: org com `code` e `password`; profile com `role = 'tenant_admin'`; sem `member_request`

### Cenário 2 — E-mail duplicado

1. Repetir chamada com o mesmo `adminEmail`
2. **Esperado:** `r.orgCode` é `null`; `r.error` contém mensagem do Supabase Auth (ex: "User already registered")

### Cenário 3 — Campos faltando

1. Chamar com `orgName: ""`
2. **Esperado:** `r.error` = "Todos os campos são obrigatórios" (400 da Edge Function)

### Cenário 4 — Lint

```bash
bun run lint
```

**Esperado:** sem erros em `organizations.service.ts`

---

## Requisitos para considerar concluído

- [ ] `createOrganization` exportada de `backend/api/services/organizations.service.ts`
- [ ] Função invoca `"create-organization"` com body completo
- [ ] Em sucesso, chama `signIn(adminEmail, adminPassword)` antes de retornar
- [ ] Retorno tipado: `Promise<{ orgCode: string | null; error: string | null }>`
- [ ] Falha no signIn retorna `error` (não sucesso silencioso)
- [ ] `bun run lint` passa
- [ ] Nenhuma alteração em `cadastro.tsx` neste passo

---

## O que não fazer

- **Não importar `supabase` em `cadastro.tsx`** — usar apenas o service
- **Não chamar `signUp`** após a Edge Function — o usuário já existe; usar `signIn`
- **Não colocar `createOrganization` em `auth.service.ts`** — é operação de domínio de organização
- **Não retornar `orgCode` com `error: null` quando o signIn falhar** — a UI assumiria sessão ativa e o guard bloquearia no dashboard
- **Não implementar UI neste passo** — switch toggle e `CadastroOrgFlow` são passos 4 e 5
- **Não usar `throw new Error`** — manter padrão `{ orgCode, error }` para exibição inline na UI

---

## Próximo Passo

Após concluir: executar **Passo 4** — adicionar switch toggle `mode: "usuario" | "org"` em `cadastro.tsx` (ver `main.md`).
