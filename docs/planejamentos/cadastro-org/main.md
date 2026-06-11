# Planejamento: Cadastro de Nova Organização

## O Problema / Objetivo

Atualmente só é possível entrar em uma organização existente pelo código de 6 chars. Não há como criar uma nova organização pelo sistema. Precisamos adicionar um fluxo self-service para que um usuário se torne líder/admin de uma nova org.

## Estado Atual

**Fluxo existente:**
- `/cadastro` → usuário entra com orgCode + dados pessoais → `signUp()` dispara trigger `handle_new_user` → trigger cria `member_requests` → admin aprova → profile criado com `tenant_user`
- Trigger `handle_new_user` levanta `RAISE EXCEPTION` se `organization_code` for nulo/inválido

**Arquivos-chave:**
- `src/routes/cadastro.tsx` — página de cadastro de usuário (única existente)
- `backend/api/services/organizations.service.ts` — funções CRUD de organizações
- `backend/api/services/auth.service.ts` — `signUp()` atual
- `src/types/supabase.ts` — tipos do banco (fonte de verdade do schema real)
- `supabase/functions/cancel-pending-signup/index.ts` — referência de Edge Function com service_role

**Schema organizations atual:** `id, name, code (CHAR 6 UNIQUE), retention_days, removed_member_retention_days, created_at`
- Sem campo `password` ainda
- **Não há `owner_id`** — confirmado em `src/types/supabase.ts`

**Trigger `handle_new_user`:** falha se `organization_code` ausente no metadata → impede criar admin de org pelo fluxo normal de signUp

## Decisões de Arquitetura

### Separação de responsabilidades (3 camadas)

```
cadastro.tsx (UI)
  → validação de formulário, steps, loading/erro inline
  → uma única chamada de negócio: createOrganization()

organizations.service.ts (integração)
  → invoke Edge Function + auto-login (signIn)
  → retorna { orgCode, error } para a UI

create-organization Edge Function (server_role)
  → cria auth user + org + profile tenant_admin atomicamente
```

A página de cadastro **não** chama Supabase diretamente. No modo org, ela só coleta dados do formulário e delega tudo a `createOrganization()` — o mesmo padrão do modo usuário, que já usa `getOrgByCode()` + `signUp()` dos services.

1. **`createOrganization` em `organizations.service.ts`** — ponto único de integração no frontend. Encapsula invoke da Edge Function e `signIn` subsequente. Qualquer outra tela que precise criar org no futuro reutiliza a mesma função.

2. **Edge Function `create-organization`** (service_role) — única forma de criar auth user + org + profile atomicamente sem passar pelo trigger de membro pendente. Consistente com padrão já existente (`cancel-pending-signup`, `reject-member`). A UI e o service **nunca** replicam essa lógica.

3. **Trigger modificado** — `handle_new_user` passa a ser no-op quando `organization_code` é ausente, em vez de lançar exceção. A Edge Function cuida da criação do profile para admins.

4. **Org tem senha própria** — coluna `password TEXT NOT NULL` adicionada em `organizations`. Membros usam `code + password` para entrar (o update do fluxo de join é **fora do escopo** deste planejamento — apenas armazenar o campo).

5. **Token 6 chars = `organizations.code`** — gerado aleatoriamente na Edge Function com retry em caso de colisão UNIQUE.

6. **Auto-login após criação** — responsabilidade do **service** (`createOrganization` chama `signIn` após sucesso). A UI só navega para `/dashboard` — sessão já está ativa.

7. **UI inline em `cadastro.tsx`** — switch toggle troca entre `mode: "usuario" | "org"`. Fluxo de org: state machine local com 3 steps (`admin-form` → `org-form` → `token`). Sem lógica de banco/auth na rota.

---

## Fluxo de Implementação

### Passo 1: Migração de banco — adicionar `password` em `organizations` e corrigir trigger
**Objetivo:** Preparar o banco para suportar senha da org e remover o bloqueio do trigger para criação de admin.

- [ ] **Verificar trigger real primeiro:** `SELECT prosrc FROM pg_proc WHERE proname = 'handle_new_user'` via Supabase MCP — o `database_schema_example.md` está desatualizado e o trigger real pode diferir
- [ ] Via Supabase MCP (`apply_migration`): adicionar coluna `password TEXT NOT NULL DEFAULT ''` em `organizations` (default temporário para não quebrar rows existentes)
- [ ] Via Supabase MCP: alterar `handle_new_user` — se `organization_code` IS NULL ou não encontrado, fazer `RETURN NEW` em vez de `RAISE EXCEPTION` (skip silencioso; Edge Function cria o profile)
- [ ] Atualizar `src/types/supabase.ts`: adicionar `password: string` em `organizations.Row` e `organizations.Insert`
- [ ] Verificar via `list_tables` e `execute_sql` que coluna existe e trigger compila

### Passo 2: Edge Function `create-organization`
**Objetivo:** Operação atômica server-side que cria auth user + org + profile sem passar pelo fluxo de aprovação.

> Contexto expandido: [`passo_2.md`](./passo_2.md) · Regra inline: `.cursor/rules/cadastro-org.mdc`

- [ ] Criar `supabase/functions/create-organization/index.ts`
- [ ] Recebe body: `{ adminName, adminEmail, adminPassword, orgName, orgPassword }`
- [ ] Valida campos obrigatórios (retorna 400 se faltando)
- [ ] Gera `code` = 6 chars aleatório (A-Z0-9), retry até 3x em caso de UNIQUE violation
- [ ] `supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: adminName } })`
- [ ] Insere em `organizations`: `{ name: orgName, code, password: orgPassword }` (sem `owner_id` — campo não existe na tabela)
- [ ] Insere em `profiles`: `{ id: user.id, organization_id: org.id, full_name: adminName, role: 'tenant_admin' }`
- [ ] Insere em `user_settings`: `{ user_id: user.id }`
- [ ] Retorna `{ orgCode: code }` com status 200
- [ ] Em caso de erro: deletar auth user criado (rollback via `supabaseAdmin.auth.admin.deleteUser`) para evitar usuário órfão
- [ ] Deploy via Supabase MCP (`deploy_edge_function`)

### Passo 3: `createOrganization` em `organizations.service.ts`
**Objetivo:** Função única de integração — invoke da Edge Function + auto-login. A UI não conhece detalhes de Supabase.

> Contexto expandido: [`passo_3.md`](./passo_3.md) · Regra inline: `.cursor/rules/cadastro-org.mdc`

- [ ] Adicionar em `backend/api/services/organizations.service.ts` (não em `auth.service.ts`, não na rota):
  ```typescript
  export async function createOrganization(data: {
    adminName: string; adminEmail: string; adminPassword: string;
    orgName: string; orgPassword: string;
  }): Promise<{ orgCode: string | null; error: string | null }>
  ```
- [ ] Chama `supabase.functions.invoke("create-organization", { body: data })`
- [ ] Se sucesso: chama `signIn(adminEmail, adminPassword)` de `auth.service.ts` para estabelecer sessão
- [ ] Retorna `{ orgCode, error: null }` ou `{ orgCode: null, error: mensagem }`
- [ ] `cadastro.tsx` **não é alterado neste passo** — só consome a função no passo 5

### Passo 4: UI — Switch toggle e layout da página de cadastro
**Objetivo:** Adicionar o controle de alternância entre os dois modos na `cadastro.tsx`.

- [ ] Adicionar state `mode: "usuario" | "org"` em `Cadastro()`
- [ ] Renderizar switch toggle acima do card (dois botões pill: "Entrar em uma organização" / "Criar minha organização")
- [ ] Quando `mode === "usuario"`: renderizar o formulário existente (sem alterações)
- [ ] Quando `mode === "org"`: renderizar `<CadastroOrgFlow />`
- [ ] Trocar `mode` reseta states internos do fluxo ativo

### Passo 5: UI — Formulário multi-step de cadastro de org (`CadastroOrgFlow`)
**Objetivo:** Formulário multi-step que **só** valida inputs e chama `createOrganization()` — sem lógica de Supabase na rota.

- [ ] Componente `CadastroOrgFlow` dentro de `cadastro.tsx` (mesmo arquivo)
- [ ] Import único de negócio: `import { createOrganization } from "backend/api/services/organizations.service"`
- [ ] State machine: `step: "admin-form" | "org-form" | "token"`
- [ ] **Step `admin-form`**: campos nome, email, senha, confirmar senha — validar senhas iguais (≥8 chars)
- [ ] **Step `org-form`**: campos nome da org, senha da org, confirmar senha da org — validar senhas iguais
- [ ] Botão "Próximo" avança etapa; botão "Voltar" retorna
- [ ] Submit no step `org-form` → **única chamada de backend:**
  ```ts
  const { orgCode, error } = await createOrganization({ adminName, adminEmail, adminPassword, orgName, orgPassword });
  ```
- [ ] **Step `token`**: exibe `orgCode` retornado pelo service; botão "Acessar o dashboard" → `navigate("/dashboard")`
- [ ] Estados de loading e erro inline — exibir `error` do service, sem reinterpretar mensagens
- [ ] **Não:** `supabase.functions.invoke`, `signIn`, `signUp` ou `createClient` em `cadastro.tsx`

---

## Critério de Sucesso

- [ ] Admin consegue criar uma nova org pelo fluxo completo: dados pessoais → dados da org → token exibido → acesso ao dashboard
- [ ] O token gerado (6 chars) aparece na tela de exibição
- [ ] Após clicar "Acessar o dashboard", o usuário está logado com role `tenant_admin`
- [ ] O fluxo de cadastro de usuário existente continua funcionando normalmente
- [ ] O switch toggle alterna corretamente entre os dois modos
- [ ] Org aparece na tabela `organizations` com `password` e `code` corretos
- [ ] Profile do admin tem `role = 'tenant_admin'` e `organization_id` correto
- [ ] Nenhum registro em `member_requests` para o admin criado

## Arquivos Afetados

### Criados
- `supabase/functions/create-organization/index.ts` — lógica server-side (service_role)
- `docs/planejamentos/cadastro-org/passo_2.md`, `passo_3.md` — contexto expandido

### Modificados
- `backend/api/services/organizations.service.ts` — **`createOrganization`** (passo 3): ponto único de integração frontend
- `src/routes/cadastro.tsx` — UI fina (passos 4–5): formulário + chamada a `createOrganization()`
- `src/types/supabase.ts` — `password` em organizations (passo 1)

### Banco (via Supabase MCP)
- Coluna `organizations.password TEXT NOT NULL`
- Trigger `handle_new_user` — skip silencioso quando `organization_code` ausente

## Dependências e Riscos

- **Dependência:** Supabase MCP autenticado e com permissão de DDL para aplicar migrations e deploy de Edge Functions
- **Risco:** Colisão de código 6 chars em banco com muitas orgs — mitigado com retry (3x)
- **Risco:** Usuário criado sem org/profile em caso de erro parcial — mitigado com rollback via `deleteUser` no Edge Function
- **Fora de escopo:** Atualizar o fluxo de join (`cadastro.tsx` modo usuário) para exigir `orgPassword` além do `orgCode` — campo está no banco mas a UI de join ainda usa só o código
- **Nota:** `src/types/supabase.ts` é mantido manualmente neste projeto — atualizar junto com a migration
