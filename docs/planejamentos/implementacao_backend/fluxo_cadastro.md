# Fluxo de Cadastro — Aprovação pelo Admin

## Visão geral

Todo novo usuário gera um `member_request`. Ele não tem profile nem acesso a dados da org até que um `tenant_admin` aceite o pedido. Ao aceitar, o profile é criado e o request é deletado.

---

## Fluxo completo

```
[Usuário]                          [Frontend]                    [Supabase]
    │                                  │                              │
    │── preenche form ────────────────▶│                              │
    │   (nome, email, senha, código)   │                              │
    │                                  │── busca org pelo código ────▶│
    │                                  │◀── retorna nome da org ──────│
    │                                  │                              │
    │◀── popup de confirmação ─────────│                              │
    │   "Entrar na Org X?"             │                              │
    │── confirma ──────────────────────│                              │
    │                                  │── signUp (email, senha, ────▶│
    │                                  │   full_name, org_code)       │
    │                                  │                              │── trigger: cria member_request
    │                                  │                              │── notifica admins da org
    │◀── tela "aguardando aprovação" ──│                              │   (INSERT notifications)
    │                                  │                              │
    │                                  │              [Admin]         │
    │                                  │                │             │
    │                                  │                │── vê badge ─┤ (Realtime)
    │                                  │                │   no sino   │
    │                                  │                │             │
    │                                  │                │── abre /admin/membros → aba "Pendentes"
    │                                  │                │── aceita + define role ──▶│
    │                                  │                │   (tenant_user ou         │── INSERT profiles
    │                                  │                │    tenant_admin)           │── INSERT user_settings
    │                                  │                │                           │── DELETE member_requests
    │                                  │                │                           │── INSERT notifications
    │                                  │                │                           │   (member_accepted → usuário)
    │◀── notificação "Bem-vindo!" ─────│◀──────────────────────────────────────────│ (Realtime)
    │── acessa o sistema ─────────────▶│                              │
```

---

## Estado "aguardando aprovação"

O usuário sem profile:
- Está autenticado (sessão Supabase Auth válida)
- Tem um `member_request` no banco com `organization_id` preenchido
- **Não tem acesso** a nenhum dado da org — `get_my_org_id()` retorna NULL, RLS bloqueia tudo automaticamente
- Vê apenas uma tela de espera informando que o pedido está em análise
- Pode fazer login novamente normalmente — a tela de espera é detectada pela ausência de profile

---

## Aceitação pelo admin

O service `acceptMember(requestId, role)` executa em sequência:
1. Lê o `member_request` para obter `user_id`, `organization_id` e `full_name`
2. `INSERT INTO profiles` com os dados e a role definida
3. `INSERT INTO user_settings` com valores padrão
4. `DELETE FROM member_requests WHERE id = requestId`
5. `INSERT INTO notifications` (tipo `member_accepted`) para o usuário

---

## Rejeição pelo admin

Exige Edge Function (`reject-member`) pois deletar de `auth.users` requer `service_role`:

1. Admin clica em "Rejeitar"
2. Frontend chama Edge Function `reject-member` com o `member_request.user_id`
3. Edge Function deleta `auth.users` → cascade deleta `member_requests`
4. Notificação do admin sobre aquele pedido é removida ou marcada como lida

---

## Re-cadastro

Se o usuário tentar se cadastrar novamente com o mesmo e-mail (pedido ainda pendente):

1. Frontend detecta: `checkPendingSignup(email)` retorna true
2. Exibe: *"Você já tem um pedido pendente. Deseja cancelar o anterior e enviar um novo?"*
3. Se confirmar: chama Edge Function `cancel-pending-signup` com o e-mail
4. Edge Function deleta `auth.users` do pedido anterior → cascade deleta `member_request`
5. Novo `signUp` prossegue normalmente

---

## Edge Functions necessárias

| Nome | Trigger | Responsabilidade |
|------|---------|-----------------|
| `reject-member` | Admin rejeita pedido | Deleta `auth.users` do `user_id` informado |
| `cancel-pending-signup` | Usuário re-cadastra e-mail pendente | Deleta `auth.users` do e-mail informado se request existe |

---

## Impacto no banco

| Item | Decisão |
|------|---------|
| `user_role` ENUM | Apenas 3 roles: `master`, `tenant_admin`, `tenant_user` — sem `waiting` |
| `notification_type` ENUM | `member_request` (para admins) e `member_accepted` (para usuário aceito) |
| `member_requests` | Nova tabela — ciclo de vida próprio, independente de `profiles` |
| `handle_new_user` trigger | Cria `member_request` (não `profile`); notifica admins |
| RLS | Sem alterações nas políticas existentes — ausência de profile bloqueia acesso automaticamente |
