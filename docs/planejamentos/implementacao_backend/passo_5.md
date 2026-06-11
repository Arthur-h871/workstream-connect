# Passo 5 — Autenticação: cadastro com código de organização

## Objetivo
Conectar o formulário de cadastro ao Supabase Auth, implementando o fluxo completo: validação do código da organização → confirmação → criação da conta → tela de "aguardando aprovação". Inclui tratamento do re-cadastro com e-mail pendente.

---

## Estado após o Passo 4

- `backend/api/supabase.ts` — cliente Supabase instanciado com anon key
- `backend/api/services/auth.service.ts` — exporta `signIn(email, password)` e `getSession()`
- `src/routes/login.tsx` — wired ao `signIn`
- `src/routes/cadastro.tsx` — formulário existente, `onSubmit` navega direto para `/dashboard` sem validação

---

## Contexto técnico

O fluxo de cadastro (documentado em `docs/planejamentos/implementacao_backend/fluxo_cadastro.md`) passa por estas etapas:

1. Usuário preenche nome, e-mail, senha e código da organização
2. Frontend chama `getOrgByCode(orgCode)` para validar e obter o nome da org
3. Modal de confirmação: "Entrar na [Nome da Org]?"
4. Usuário confirma → frontend chama `signUp(email, senha, fullName, orgCode)`
5. O trigger `handle_new_user()` no banco cria o `member_request` e notifica os admins
6. Frontend exibe tela inline de "aguardando aprovação" (a rota `/aguardando` será criada no Passo 6)

**Problema de RLS:** O usuário não está autenticado ao fazer o cadastro. A tabela `organizations` tem RLS que bloqueia leitura por não-membros. Para `getOrgByCode` e `checkPendingSignup` funcionarem sem autenticação, são necessárias funções `SECURITY DEFINER` no banco (chamadas via `supabase.rpc()`).

O trigger `handle_new_user()` já está no banco (Passo 2) e espera `raw_user_meta_data.organization_code` e `raw_user_meta_data.full_name`.

**Re-cadastro:** Se o e-mail já tem um `member_request` pendente, o `signUp` do Supabase Auth retornará erro porque o usuário já existe em `auth.users`. O frontend deve detectar isso, oferecer cancelar o pedido anterior (via Edge Function `cancel-pending-signup`) e tentar novamente.

---

## Implementação

### 5.1 — Aplicar migration com funções auxiliares de cadastro

Aplicar via MCP Supabase (`apply_migration`) ou diretamente no SQL Editor do projeto.

**Nome da migration:** `signup_helpers`

```sql
-- Lookup público de org por código (sem autenticação)
-- Usado no cadastro para confirmar o nome da organização antes do signUp
CREATE OR REPLACE FUNCTION get_org_name_by_code(p_code text)
RETURNS text
LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT name FROM organizations WHERE code = p_code
$$;

-- Verifica se e-mail já tem um member_request pendente (sem autenticação)
-- Usado para detectar re-cadastro com e-mail já usado
CREATE OR REPLACE FUNCTION has_pending_signup(p_email text)
RETURNS boolean
LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    JOIN member_requests mr ON mr.user_id = u.id
    WHERE u.email = p_email
  )
$$;

-- Busca o user_id de auth.users pelo e-mail (usada pela Edge Function cancel-pending-signup)
CREATE OR REPLACE FUNCTION get_user_id_by_email(p_email text)
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT id FROM auth.users WHERE email = p_email
$$;
```

**Verificação:**

- [ ] As 3 funções aparecem em Database → Functions no painel Supabase
- [ ] Testar no SQL Editor:
  ```sql
  SELECT get_org_name_by_code('CODIGO_VALIDO');  -- deve retornar o nome da org
  SELECT get_org_name_by_code('INVALIDO');        -- deve retornar NULL
  SELECT has_pending_signup('email@inexistente.com'); -- deve retornar false
  ```

---

### 5.2 — Criar `backend/api/services/organizations.service.ts`

**Arquivo:** `backend/api/services/organizations.service.ts` (arquivo novo)

- [ ] Criar o arquivo

```ts
import { supabase } from '../supabase'

export async function getOrgByCode(code: string): Promise<{ name: string } | null> {
  const { data, error } = await supabase.rpc('get_org_name_by_code', { p_code: code })
  if (error || !data) return null
  return { name: data as string }
}
```

---

### 5.3 — Adicionar funções ao `auth.service.ts`

**Arquivo:** `backend/api/services/auth.service.ts` (existente — adicionar ao final)

Estado atual do arquivo (após Passo 4):
```ts
import { supabase } from '../supabase'

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: error.message }
  return { error: null, session: data.session }
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}
```

- [ ] Adicionar `signUp` ao arquivo

```ts
export async function signUp(
  email: string,
  password: string,
  fullName: string,
  orgCode: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        organization_code: orgCode,
      },
    },
  })
  if (error) return { error: error.message }
  return { error: null }
}
```

- [ ] Adicionar `checkPendingSignup` ao arquivo

```ts
export async function checkPendingSignup(email: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('has_pending_signup', { p_email: email })
  if (error) return false
  return data as boolean
}
```

- [ ] Adicionar `cancelPendingSignup` ao arquivo

```ts
export async function cancelPendingSignup(email: string): Promise<{ error: string | null }> {
  const { error } = await supabase.functions.invoke('cancel-pending-signup', {
    body: { email },
  })
  if (error) return { error: error.message }
  return { error: null }
}
```

---

### 5.4 — Criar Edge Function `cancel-pending-signup`

A Edge Function deleta o usuário anterior de `auth.users` (requer `service_role`), o que via CASCADE deleta o `member_request` associado.

**Arquivo:** `supabase/functions/cancel-pending-signup/index.ts` (arquivo novo — criar a pasta `supabase/functions/cancel-pending-signup/` se não existir)

- [ ] Criar a pasta e o arquivo

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const { email } = await req.json() as { email?: string }
  if (!email) {
    return new Response(JSON.stringify({ error: 'email required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  )

  // Busca o user_id pelo e-mail via função SECURITY DEFINER
  const { data: userId, error: rpcError } = await supabaseAdmin.rpc('get_user_id_by_email', {
    p_email: email,
  })
  if (rpcError || !userId) {
    return new Response(JSON.stringify({ error: 'user not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Confirma que existe member_request (não deleta user que já foi aceito na org)
  const { data: request } = await supabaseAdmin
    .from('member_requests')
    .select('id')
    .eq('user_id', userId as string)
    .single()

  if (!request) {
    return new Response(JSON.stringify({ error: 'no pending request for this user' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Deleta auth.users → CASCADE deleta member_requests
  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId as string)
  if (deleteError) {
    return new Response(JSON.stringify({ error: deleteError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
```

- [ ] Fazer deploy da Edge Function via MCP Supabase (`deploy_edge_function`) ou Supabase CLI:
  ```bash
  supabase functions deploy cancel-pending-signup
  ```

---

### 5.5 — Atualizar `src/routes/cadastro.tsx`

**Arquivo:** `src/routes/cadastro.tsx` (substituir completamente)

Estado atual (linhas 1–102): formulário com `onSubmit` que navega direto para `/dashboard`. Sem chamadas reais.

- [ ] Substituir o conteúdo do arquivo

```tsx
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { useState } from "react";
import { getOrgByCode } from "backend/api/services/organizations.service";
import {
  signUp,
  checkPendingSignup,
  cancelPendingSignup,
} from "backend/api/services/auth.service";

export const Route = createFileRoute("/cadastro")({
  head: () => ({
    meta: [
      { title: "Criar conta — Marco" },
      { name: "description", content: "Crie sua conta Marco e junte-se à sua organização." },
    ],
  }),
  component: Cadastro,
});

type Step =
  | "form"           // formulário inicial
  | "confirm"        // modal de confirmação da org
  | "pending"        // modal: e-mail já tem pedido pendente
  | "submitted";     // sucesso — aguardando aprovação

function Cadastro() {
  const nav = useNavigate();
  const [form, setForm] = useState({ nome: "", email: "", senha: "", orgId: "" });
  const [step, setStep] = useState<Step>("form");
  const [orgName, setOrgName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const org = await getOrgByCode(form.orgId);
      if (!org) {
        setError("Código de organização inválido. Peça o código correto ao administrador.");
        return;
      }
      setOrgName(org.name);
      setStep("confirm");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleConfirm() {
    setError(null);
    setIsLoading(true);
    try {
      const isPending = await checkPendingSignup(form.email);
      if (isPending) {
        setStep("pending");
        return;
      }
      await doSignUp();
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCancelAndResend() {
    setError(null);
    setIsLoading(true);
    try {
      const { error: cancelError } = await cancelPendingSignup(form.email);
      if (cancelError) {
        setError("Não foi possível cancelar o pedido anterior. Tente novamente.");
        setStep("confirm");
        return;
      }
      await doSignUp();
    } finally {
      setIsLoading(false);
    }
  }

  async function doSignUp() {
    const { error: signUpError } = await signUp(form.email, form.senha, form.nome, form.orgId);
    if (signUpError) {
      setError("Não foi possível criar a conta. Verifique os dados e tente novamente.");
      setStep("form");
      return;
    }
    setStep("submitted");
  }

  if (step === "submitted") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
        <div className="w-full max-w-sm text-center">
          <div className="mb-6 flex flex-col items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-copper">
              <div className="h-3 w-3 rounded-sm bg-background" />
            </div>
            <span className="text-lg font-semibold tracking-tight">Marco</span>
          </div>
          <div className="rounded-lg border border-border bg-surface p-6">
            <h1 className="text-lg font-semibold">Pedido enviado</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Seu pedido de entrada em <span className="font-medium text-foreground">{orgName}</span> foi enviado.
              Um administrador vai revisá-lo em breve.
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              Quando aceito, você receberá acesso e poderá entrar com seu e-mail e senha.
            </p>
            <button
              onClick={() => nav({ to: "/login" })}
              className="mt-5 w-full rounded-md bg-copper px-3 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Ir para o login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-copper">
            <div className="h-3 w-3 rounded-sm bg-background" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Marco</span>
        </div>

        {/* Modal: confirmação da org */}
        {step === "confirm" && (
          <div className="mb-4 rounded-lg border border-border bg-surface p-5">
            <p className="text-sm text-foreground">
              Você vai entrar em <span className="font-semibold">{orgName}</span>. Confirmar?
            </p>
            {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => { setStep("form"); setError(null); }}
                disabled={isLoading}
                className="flex-1 rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-background disabled:opacity-50"
              >
                Voltar
              </button>
              <button
                onClick={handleConfirm}
                disabled={isLoading}
                className="flex-1 rounded-md bg-copper px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {isLoading ? "Aguarde..." : "Confirmar"}
              </button>
            </div>
          </div>
        )}

        {/* Modal: e-mail já tem pedido pendente */}
        {step === "pending" && (
          <div className="mb-4 rounded-lg border border-border bg-surface p-5">
            <p className="text-sm text-foreground">
              Este e-mail já tem um pedido de cadastro pendente. Deseja cancelar o pedido anterior e enviar um novo?
            </p>
            {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => { setStep("form"); setError(null); }}
                disabled={isLoading}
                className="flex-1 rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-background disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleCancelAndResend}
                disabled={isLoading}
                className="flex-1 rounded-md bg-copper px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {isLoading ? "Aguarde..." : "Sim, reenviar"}
              </button>
            </div>
          </div>
        )}

        {/* Formulário principal */}
        <div className="rounded-lg border border-border bg-surface p-6">
          <h1 className="text-lg font-semibold">Criar conta</h1>
          <p className="mt-1 text-sm text-muted-foreground">Junte-se à sua organização.</p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-3">
            <Field
              label="Nome"
              value={form.nome}
              onChange={set("nome")}
              placeholder="Seu nome completo"
              disabled={step !== "form" || isLoading}
            />
            <Field
              label="E-mail"
              type="email"
              value={form.email}
              onChange={set("email")}
              placeholder="voce@empresa.com"
              disabled={step !== "form" || isLoading}
            />
            <Field
              label="Senha"
              type="password"
              value={form.senha}
              onChange={set("senha")}
              placeholder="Mínimo 8 caracteres"
              disabled={step !== "form" || isLoading}
            />

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                ID da organização
              </span>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={form.orgId}
                  onChange={(e) => set("orgId")(e.target.value.toUpperCase())}
                  placeholder="Código de 6 dígitos"
                  maxLength={6}
                  disabled={step !== "form" || isLoading}
                  className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 font-mono text-sm uppercase tracking-widest text-foreground placeholder:text-muted-foreground/60 placeholder:tracking-normal focus:border-copper focus:outline-none disabled:opacity-50"
                />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Peça este código ao administrador da sua organização.
              </p>
            </label>

            {error && step === "form" && (
              <p className="text-xs text-red-500">{error}</p>
            )}

            <button
              type="submit"
              disabled={step !== "form" || isLoading}
              className="mt-2 w-full rounded-md bg-copper px-3 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {isLoading ? "Verificando..." : "Criar conta"}
            </button>
          </form>

          <div className="mt-5 text-center text-xs text-muted-foreground">
            Já tem uma conta?{" "}
            <Link to="/login" className="text-copper hover:underline">
              Entrar
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-copper focus:outline-none disabled:opacity-50"
      />
    </label>
  );
}
```

---

## Verificação manual

Antes de verificar, criar um usuário de teste no Supabase → Authentication → Users para confirmar que o ambiente está funcional.

### Cenário 1 — Código de organização inválido

1. Acessar `/cadastro`
2. Preencher o formulário com qualquer código de 6 letras que NÃO existe no banco
3. Clicar em "Criar conta"
4. **Esperado:** mensagem de erro "Código de organização inválido..." aparece inline no formulário

### Cenário 2 — Cadastro bem-sucedido (happy path)

1. Acessar `/cadastro`
2. Preencher nome, e-mail novo (não cadastrado), senha válida, código válido de uma org existente
3. Clicar em "Criar conta"
4. **Esperado:** modal de confirmação com o nome da organização
5. Clicar em "Confirmar"
6. **Esperado:** tela de "Pedido enviado" com nome da org
7. Verificar no Supabase → Table Editor → `member_requests`: deve ter um registro para o novo usuário
8. Verificar no Supabase → Authentication → Users: usuário criado

### Cenário 3 — Re-cadastro com e-mail pendente

1. Usar o mesmo e-mail do cenário 2 (que tem pedido pendente)
2. Preencher o formulário com o mesmo e-mail, nova senha, mesmo código de org
3. Clicar em "Criar conta" → modal de confirmação
4. Clicar em "Confirmar"
5. **Esperado:** modal "Este e-mail já tem um pedido pendente..."
6. Clicar em "Sim, reenviar"
7. **Esperado:** tela de "Pedido enviado"
8. Verificar no Supabase: o `member_request` antigo foi deletado e um novo foi criado

---

## Requisitos para considerar concluído

- [ ] Migration aplicada: as 3 funções (`get_org_name_by_code`, `has_pending_signup`, `get_user_id_by_email`) existem no banco
- [ ] `backend/api/services/organizations.service.ts` criado com `getOrgByCode`
- [ ] `auth.service.ts` tem `signUp`, `checkPendingSignup` e `cancelPendingSignup`
- [ ] Edge Function `cancel-pending-signup` criada e deployada
- [ ] `cadastro.tsx` atualizado com o fluxo completo
- [ ] Código inválido exibe erro inline (não alert, não console)
- [ ] Código válido abre modal de confirmação com nome real da org
- [ ] Após confirmar: usuário aparece em `auth.users` e `member_requests` no Supabase
- [ ] Após confirmar: frontend exibe tela de "Pedido enviado"
- [ ] Re-cadastro com e-mail pendente oferece opção de reenviar e funciona corretamente
- [ ] Nenhuma credencial hardcoded no código

---

## O que não fazer

- Não navegar para `/dashboard` após o cadastro — o usuário está autenticado mas sem profile, isso será tratado no Passo 6
- Não criar a rota `/aguardando` neste passo — ela pertence ao Passo 6 (guard de rotas)
- Não importar `supabase` diretamente em `cadastro.tsx` — apenas funções dos services
- Não chamar `supabase.auth.admin.*` no frontend — esses métodos requerem service_role e só devem ser chamados na Edge Function
- Não ignorar o caso de re-cadastro — se `cancel-pending-signup` falhar, o erro deve aparecer na UI

---

## Próximo Passo

Após concluir: executar `passo_6.md` — guard de rotas, criação de `_authenticated.tsx`, renomeio dos arquivos de rotas protegidas e criação da rota `/aguardando`.
