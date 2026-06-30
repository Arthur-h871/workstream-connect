# Passo 2 — Edge Function `create-organization`

## Objetivo

Criar operação atômica server-side (Deno Edge Function com `service_role`) que cria auth user + organização + profile `tenant_admin` + `user_settings` em uma única chamada, sem passar pelo fluxo de `member_requests`.

---

## Estado após o Passo 1

- Coluna `organizations.password TEXT NOT NULL` existe no banco
- Trigger `handle_new_user` faz **skip silencioso** quando `organization_code` é NULL ou inválido (`RETURN NEW` sem criar `member_request`)
- `src/types/supabase.ts` já tem `password: string` em `organizations.Row` e `organizations.Insert`
- **Não existe** `supabase/functions/create-organization/` ainda — criar neste passo
- Referências de padrão no projeto:
  - `supabase/functions/cancel-pending-signup/index.ts`
  - `supabase/functions/reject-member/index.ts`

---

## Decisões de design

| Decisão | Escolha |
|---------|---------|
| Runtime | Deno (`Deno.serve`) — igual às outras Edge Functions do projeto |
| Client admin | `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })` |
| Auth user | `auth.admin.createUser` com `email_confirm: true` — sem confirmação por e-mail |
| Metadata do user | Apenas `{ full_name: adminName }` — **sem** `organization_code` (trigger faz skip) |
| Código da org | 6 chars `A-Z0-9`, gerado no servidor, retry 3x em colisão UNIQUE (`23505`) |
| Role do admin | `tenant_admin` — não `master` |
| Campo `owner_id` | **Não existe** na tabela — não inserir |
| Rollback | Em qualquer falha após criar auth user: `deleteUser`; se org criada, deletar org também |
| Resposta sucesso | `{ orgCode: string }` status 200 |
| Resposta erro | `{ error: string }` status 400 ou 500 |
| CORS | Mesmo bloco `corsHeaders` das outras functions + handler `OPTIONS` |

---

## Contexto técnico

**Por que Edge Function e não RPC.** Criar auth user exige `service_role` (`auth.admin.createUser`). O frontend usa anon key — nunca deve ter acesso a essa operação. Edge Function é o padrão já estabelecido no projeto (`cancel-pending-signup`, `reject-member`).

**Ordem das operações (crítica).**

```
1. createUser (auth)           ← gera userId
2. insert organizations        ← gera orgId + orgCode (com retry)
3. insert profiles             ← vincula userId + orgId, role tenant_admin
4. insert user_settings        ← defaults do usuário
5. return { orgCode }
```

Se falhar no passo 2: `deleteUser(userId)`.  
Se falhar no passo 3: `delete organizations` + `deleteUser`.  
Passo 4 (`user_settings`) é best-effort — falha aqui não deve apagar tudo (settings não bloqueia login).

**Trigger `handle_new_user` após Passo 1.** Como o Edge Function **não** passa `organization_code` no metadata, o trigger executa mas retorna `NEW` sem criar `member_request`. O profile é criado explicitamente pela Edge Function.

**Colisão de código.** `organizations.code` é `CHAR(6) UNIQUE`. Com poucas orgs, colisão é rara; retry até 3 tentativas cobre o caso. Após 3 falhas, retornar 500 com mensagem clara.

---

## Implementação

### 2.1 — Criar o arquivo da Edge Function

**Arquivo:** `supabase/functions/create-organization/index.ts` (novo)

- [ ] Criar pasta `supabase/functions/create-organization/`
- [ ] Criar `index.ts` com o conteúdo completo abaixo

```ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function generateCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const { adminName, adminEmail, adminPassword, orgName, orgPassword } =
    (await req.json()) as {
      adminName?: string;
      adminEmail?: string;
      adminPassword?: string;
      orgName?: string;
      orgPassword?: string;
    };

  if (!adminName || !adminEmail || !adminPassword || !orgName || !orgPassword) {
    return new Response(
      JSON.stringify({ error: "Todos os campos são obrigatórios" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Sem organization_code no metadata — trigger handle_new_user faz skip
  const { data: authData, error: authError } =
    await supabaseAdmin.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: { full_name: adminName },
    });

  if (authError || !authData.user) {
    return new Response(
      JSON.stringify({ error: authError?.message ?? "Erro ao criar usuário" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const userId = authData.user.id;

  let orgId: string | null = null;
  let orgCode: string | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    const candidate = generateCode();
    const { data: org, error: orgError } = await supabaseAdmin
      .from("organizations")
      .insert({ name: orgName, code: candidate, password: orgPassword })
      .select("id")
      .single();

    if (orgError) {
      if (orgError.code === "23505") continue; // colisão UNIQUE — retry
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return new Response(
        JSON.stringify({ error: "Erro ao criar organização" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    orgId = org.id;
    orgCode = candidate;
    break;
  }

  if (!orgId || !orgCode) {
    await supabaseAdmin.auth.admin.deleteUser(userId);
    return new Response(
      JSON.stringify({
        error: "Não foi possível gerar um código único. Tente novamente.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const { error: profileError } = await supabaseAdmin.from("profiles").insert({
    id: userId,
    organization_id: orgId,
    full_name: adminName,
    role: "tenant_admin",
  });

  if (profileError) {
    await supabaseAdmin.from("organizations").delete().eq("id", orgId);
    await supabaseAdmin.auth.admin.deleteUser(userId);
    return new Response(JSON.stringify({ error: "Erro ao criar perfil" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  await supabaseAdmin.from("user_settings").insert({ user_id: userId });

  return new Response(JSON.stringify({ orgCode }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
```

**Notas para sugestões inline:**

1. Copiar estrutura de `cancel-pending-signup/index.ts` — imports, corsHeaders, OPTIONS, createClient com service_role.
2. Nomes dos campos do body são **camelCase em inglês** (`adminName`, não `nome`) — o service do passo 3 envia exatamente esses nomes.
3. `insert` em `organizations` precisa de `name`, `code`, `password` — `retention_days` usa default do banco.
4. Não usar `signUp` do client — usar apenas `auth.admin.createUser`.
5. Mensagens de erro em português onde definidas pelo código; erros do Supabase Auth vêm em inglês (ex: "User already registered") — repassar como estão.

---

### 2.2 — Deploy da Edge Function

- [ ] Deploy via Supabase MCP (`deploy_edge_function`) ou CLI:
  ```bash
  bunx supabase functions deploy create-organization --project-ref <project-id>
  ```
- [ ] Confirmar no painel Supabase → Edge Functions que `create-organization` aparece como ativa

---

### 2.3 — Teste manual via curl (antes do passo 3)

```bash
curl -X POST \
  'https://<project-ref>.supabase.co/functions/v1/create-organization' \
  -H 'Authorization: Bearer <anon-key>' \
  -H 'Content-Type: application/json' \
  -d '{
    "adminName": "Admin Teste",
    "adminEmail": "admin-teste-unico@exemplo.com",
    "adminPassword": "senha12345",
    "orgName": "Minha Org",
    "orgPassword": "org123"
  }'
```

**Esperado:** `200` com `{ "orgCode": "ABC123" }` (6 chars)

Verificar no banco:
- `organizations`: row com `name`, `code`, `password`
- `profiles`: row com `role = tenant_admin`, `organization_id` correto
- `user_settings`: row com `user_id`
- `member_requests`: **nenhum** registro para esse `user_id`

---

## Verificação manual

### Cenário 1 — Sucesso completo
1. Invocar com e-mail único e todos os campos preenchidos
2. **Esperado:** 200, `orgCode` com 6 caracteres alfanuméricos maiúsculos

### Cenário 2 — Campos faltando
1. Enviar body sem `orgName`
2. **Esperado:** 400, `{ "error": "Todos os campos são obrigatórios" }`

### Cenário 3 — E-mail duplicado
1. Repetir com mesmo `adminEmail`
2. **Esperado:** 400, erro do Supabase Auth (usuário já existe); nenhuma org órfã criada

### Cenário 4 — Rollback em falha de profile
1. (Opcional, ambiente de teste) Simular falha forçando constraint
2. **Esperado:** auth user e org removidos; nenhum dado órfão

---

## Requisitos para considerar concluído

- [ ] Arquivo `supabase/functions/create-organization/index.ts` criado
- [ ] Validação de campos obrigatórios retorna 400
- [ ] `createUser` sem `organization_code` no metadata
- [ ] Código 6 chars com retry em `23505`
- [ ] Profile criado com `role: 'tenant_admin'`
- [ ] `user_settings` inserido
- [ ] Rollback via `deleteUser` (+ delete org se profile falhar)
- [ ] Function deployada e testável via curl
- [ ] Nenhum `member_request` criado para admin

---

## O que não fazer

- **Não passar `organization_code` no `user_metadata`** — dispararia `member_request` via trigger
- **Não usar `signUp` do client anon** — não tem permissão para criar admin
- **Não inserir `owner_id`** — coluna não existe em `organizations`
- **Não retornar `session` ou JWT** — auto-login é responsabilidade do service no passo 3
- **Não criar `member_request`** — admin entra direto com profile
- **Não alterar `organizations.service.ts` neste passo** — `createOrganization` é escopo do passo 3
- **Não alterar `cadastro.tsx` neste passo** — a rota só chamará `createOrganization()` no passo 5

---

## Próximo Passo

Após concluir: executar **Passo 3** — adicionar `createOrganization` em `organizations.service.ts` (ver [`passo_3.md`](./passo_3.md)).
