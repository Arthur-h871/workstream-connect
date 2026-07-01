# Passo 22 — Edge Function: cleanup-screenshots (cron)

## Objetivo

Criar a Edge Function `cleanup-screenshots` que roda periodicamente (cron diário) e deleta do Storage e do banco:
1. Screenshots soft-deletados pelo usuário (`deleted_at IS NOT NULL`)
2. Screenshots de sessões encerradas há mais de `retention_days` da organização (limpeza automática por política de retenção)

Também lida com a remoção de avatares de membros removidos da organização.

---

## Estado após o Passo 21

- `supabase/functions/cleanup-screenshots/` — **não existe**
- `supabase/functions/generate-report/` — criado no passo 21
- Screenshots podem ter `deleted_at` preenchido (soft delete pelo usuário, passo 19)
- Membros podem ter sido removidos (passo 16), mas seus avatares no Storage ainda existem
- `organizations.retention_days` define por quantos dias os screenshots são mantidos (padrão: 30)

---

## Estrutura de pastas

```
supabase/
└── functions/
    └── cleanup-screenshots/
        └── index.ts
```

---

## Contexto técnico

**Duas categorias de limpeza:**

1. **Soft-deletados:** `screenshots WHERE deleted_at IS NOT NULL` — o usuário pediu para remover. Deletar imediatamente (qualquer idade).

2. **Expirados por retenção:** `screenshots` de sessões cuja `stopped_at < NOW() - INTERVAL '<retention_days> days'`. O campo `retention_days` é por organização. Screenshots de sessões ainda ativas/pausadas nunca expiram por esta regra.

**Por que Edge Function e não pg_cron?** O `pg_cron` executa SQL puro no banco, sem acesso ao Storage. A deleção de arquivos do Storage requer chamadas à API Supabase Storage (não SQL). Portanto, a limpeza do Storage deve ser feita via Edge Function.

**Scheduling via Supabase Cron.** Supabase oferece cron scheduling nativo para Edge Functions via `supabase/config.toml` (configuração local) ou via Dashboard → Edge Functions → Schedule. O cron é definido no mesmo projeto.

**Lote de deleção.** O Storage aceita até 1000 arquivos por chamada de `remove()`. A limpeza processa em lotes para evitar timeouts.

**Limpeza de avatares.** Membros removidos da organização têm seu profile deletado (passo 16), mas a imagem no Storage permanece em `avatars/<userId>.<ext>`. A função de cleanup identifica arquivos órfãos no bucket `avatars` comparando com profiles existentes. Essa parte é opcional e pode ser executada separadamente ou adicionada ao mesmo cron.

---

## Implementação

### 22.1 — Criar `supabase/functions/cleanup-screenshots/index.ts`

**Arquivo:** `supabase/functions/cleanup-screenshots/index.ts`

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const BATCH_SIZE = 500

interface CleanupResult {
  softDeleted: number
  expired: number
  errors: string[]
}

async function deleteBatch(storagePaths: string[]): Promise<{ count: number; errors: string[] }> {
  if (storagePaths.length === 0) return { count: 0, errors: [] }

  const errors: string[] = []
  let deleted = 0

  // Processar em lotes de BATCH_SIZE
  for (let i = 0; i < storagePaths.length; i += BATCH_SIZE) {
    const batch = storagePaths.slice(i, i + BATCH_SIZE)
    const { error } = await supabase.storage.from('screenshots').remove(batch)
    if (error) {
      errors.push(`Storage batch error: ${error.message}`)
    } else {
      deleted += batch.length
    }
  }

  return { count: deleted, errors }
}

async function cleanupSoftDeleted(): Promise<{ count: number; errors: string[] }> {
  // Buscar todos os screenshots soft-deletados
  const { data, error } = await supabase
    .from('screenshots')
    .select('id, storage_path')
    .not('deleted_at', 'is', null)
    .limit(5000)  // máximo por execução; cron diário nunca deve acumular mais que isso

  if (error) {
    return { count: 0, errors: [`Query error: ${error.message}`] }
  }
  if (!data || data.length === 0) return { count: 0, errors: [] }

  const storagePaths = data.map((s) => s.storage_path)
  const ids = data.map((s) => s.id)

  // Deletar arquivos do Storage
  const { count, errors } = await deleteBatch(storagePaths)

  // Deletar registros do banco (mesmo que Storage falhe parcialmente — evitar acúmulo)
  const { error: dbError } = await supabase
    .from('screenshots')
    .delete()
    .in('id', ids)

  if (dbError) {
    errors.push(`DB delete error: ${dbError.message}`)
  }

  return { count, errors }
}

async function cleanupExpired(): Promise<{ count: number; errors: string[] }> {
  // Buscar screenshots de sessões encerradas fora do período de retenção da org
  // A query faz JOIN com capture_sessions e organizations para calcular a data de expiração
  const { data, error } = await supabase
    .from('screenshots')
    .select(`
      id,
      storage_path,
      capture_sessions!inner (
        stopped_at,
        organizations!inner (
          retention_days
        )
      )
    `)
    .is('deleted_at', null)
    .not('capture_sessions.stopped_at', 'is', null)
    .limit(5000)

  if (error) {
    return { count: 0, errors: [`Query error: ${error.message}`] }
  }
  if (!data || data.length === 0) return { count: 0, errors: [] }

  const now = Date.now()

  // Filtrar apenas os expirados conforme retention_days de cada org
  const expired = data.filter((s: any) => {
    const retentionDays = s.capture_sessions.organizations.retention_days ?? 30
    const stoppedAt = new Date(s.capture_sessions.stopped_at).getTime()
    const expiresAt = stoppedAt + retentionDays * 24 * 60 * 60 * 1000
    return now > expiresAt
  })

  if (expired.length === 0) return { count: 0, errors: [] }

  const storagePaths = expired.map((s: any) => s.storage_path)
  const ids = expired.map((s: any) => s.id)

  const { count, errors } = await deleteBatch(storagePaths)

  const { error: dbError } = await supabase
    .from('screenshots')
    .delete()
    .in('id', ids)

  if (dbError) {
    errors.push(`DB delete error: ${dbError.message}`)
  }

  return { count, errors }
}

Deno.serve(async (req) => {
  // A função pode ser chamada via HTTP (por teste manual) ou por cron interno
  // Aceitar GET e POST
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }

  console.log('[cleanup-screenshots] Iniciando limpeza...')

  const result: CleanupResult = {
    softDeleted: 0,
    expired: 0,
    errors: [],
  }

  try {
    const softResult = await cleanupSoftDeleted()
    result.softDeleted = softResult.count
    result.errors.push(...softResult.errors)

    const expiredResult = await cleanupExpired()
    result.expired = expiredResult.count
    result.errors.push(...expiredResult.errors)
  } catch (e) {
    result.errors.push(`Unexpected error: ${String(e)}`)
  }

  console.log(
    `[cleanup-screenshots] Concluído — soft-deleted: ${result.softDeleted}, expired: ${result.expired}, errors: ${result.errors.length}`
  )

  return new Response(JSON.stringify(result), {
    status: result.errors.length > 0 ? 207 : 200,  // 207 = partial success
    headers: { 'Content-Type': 'application/json' },
  })
})
```

---

### 22.2 — Configurar cron no Supabase

#### Opção A — Via `supabase/config.toml` (local dev + deploy)

Adicionar ao `supabase/config.toml`:

```toml
[functions.cleanup-screenshots]
enabled = true

[functions.cleanup-screenshots.cron]
schedule = "0 3 * * *"   # todo dia às 03:00 UTC
```

#### Opção B — Via SQL (pg_cron chamando Edge Function)

Criar via SQL Editor no Supabase (requer extensão `pg_cron` + `pg_net`):

```sql
-- Requer pg_net para chamar URL HTTP
SELECT cron.schedule(
  'cleanup-screenshots-daily',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT 'https://' || (SELECT value FROM vault.secrets WHERE name = 'SUPABASE_PROJECT_REF') || '.supabase.co/functions/v1/cleanup-screenshots'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT value FROM vault.secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY')
    ),
    body := '{}'::jsonb
  );
  $$
);
```

> **Recomendado:** Usar a Opção A com `config.toml` se disponível na versão do Supabase CLI em uso. A Opção B é um fallback manual.

---

### 22.3 — Edge Function `reject-member` (complemento do passo 16)

O passo 16 referenciou uma Edge Function `reject-member` que ainda não foi criada. Criar agora junto com as Edge Functions:

**Arquivo:** `supabase/functions/reject-member/index.ts`

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }

  // Validar que o chamador é admin (verificar JWT)
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  // Verificar role do chamador
  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!callerProfile || !['master', 'tenant_admin'].includes(callerProfile.role)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
  }

  const { user_id } = await req.json()
  if (!user_id) {
    return new Response(JSON.stringify({ error: 'user_id required' }), { status: 400 })
  }

  // Usar service_role para deletar de auth.users → ON DELETE CASCADE deleta member_request
  const { error } = await supabase.auth.admin.deleteUser(user_id)
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
```

Deploy junto:

```bash
supabase functions deploy cleanup-screenshots
supabase functions deploy reject-member
```

---

## Checklist de verificação manual

### `cleanup-screenshots`

### Cenário 1 — Limpeza manual (teste)
1. Fazer soft delete de 2-3 screenshots via frontend (passo 19)
2. Verificar no banco: `deleted_at IS NOT NULL` nesses registros; arquivos ainda existem no Storage
3. Chamar a Edge Function manualmente:
   ```bash
   curl -X POST https://<project>.supabase.co/functions/v1/cleanup-screenshots \
     -H "Authorization: Bearer <service_role_key>"
   ```
4. **Esperado:** resposta `{ "softDeleted": N, "expired": 0, "errors": [] }`
5. Verificar no banco: registros deletados; verificar no Storage: arquivos removidos

### Cenário 2 — Retenção expirada (simulação)
1. Criar no banco um screenshot com `session_id` de uma sessão com `stopped_at = NOW() - INTERVAL '31 days'`
2. Org com `retention_days = 30`
3. Chamar a Edge Function
4. **Esperado:** `{ "expired": 1 }`; registro e arquivo deletados

### Cenário 3 — Cron agendado
1. Verificar no Dashboard → Edge Functions → `cleanup-screenshots` que o cron está ativo
2. Aguardar a próxima execução às 03:00 UTC (ou avançar manualmente)
3. Verificar logs da Edge Function

### `reject-member`

### Cenário 4 — Rejeitar pedido pendente
1. No frontend, na aba "Pendentes" da página de membros, clicar "Rejeitar"
2. **Esperado:** linha desaparece imediatamente
3. Verificar no Supabase: `auth.users` do `user_id` deletado; `member_requests` deletado (cascade)

---

## O que não fazer

- **Não** deletar arquivos do Storage diretamente via SQL — o banco não tem acesso ao Storage; apenas Edge Functions e API calls conseguem deletar arquivos físicos
- **Não** deletar screenshots de sessões `active` ou `paused` — a query de expirados filtra apenas sessões com `stopped_at IS NOT NULL`
- **Não** configurar cron com frequência menor que diária — a limpeza não precisa ser em tempo real; uma vez por dia às 03:00 UTC é suficiente
- **Não** colocar limite de `100` na query de soft-deletados — com um app em produção podem acumular mais; usar `5000` como limite conservador que cabe em um timeout de Edge Function
- **Não** fazer rollback do banco se o Storage falhar — logs de erro são suficientes; na próxima execução os registros com `deleted_at` serão tentados novamente

---

## Próximo Passo

**Passo 23 — Tipos TypeScript gerados pelo Supabase CLI:** gerar `src/types/supabase.ts` com os tipos end-to-end do banco e atualizar os services para usar tipagem gerada.
