# Passo 21 — Edge Function: generate-report

## Objetivo

Criar a Edge Function `generate-report` que, ao ser invocada após uma sessão ser encerrada, busca os screenshots não deletados da sessão, gera URLs assinadas temporárias, chama a API Anthropic Vision (Claude) com as imagens, e cria automaticamente um apontamento com o relatório gerado.

---

## Estado após o Passo 20

- `supabase/functions/generate-report/` — **não existe**
- Sessões podem ser encerradas pelo frontend (passo 18) e pelo agente Python (passo 20)
- Screenshots estão no Storage com path `<orgId>/<userId>/<sessionId>/<timestamp>.png`
- Apontamentos existem mas são criados apenas manualmente (passo 12)

---

## Estrutura de pastas

```
supabase/
└── functions/
    └── generate-report/
        └── index.ts
```

---

## Contexto técnico

**Quem chama a Edge Function.** A função é chamada pelo **frontend** imediatamente após `stopSession` retornar com sucesso. O frontend passa apenas `{ session_id }` no body. A função usa a `service_role` para buscar dados sem restrições de RLS.

**Por que Edge Function e não service direto.** A Edge Function tem acesso à `service_role` key e à `ANTHROPIC_API_KEY` como variáveis de ambiente seguras — nunca expostas ao cliente. O frontend só tem a `anon key`.

**Fluxo da função:**
1. Receber `{ session_id }` no body
2. Buscar sessão e validar que está `stopped` e pertence ao usuário autenticado
3. Buscar screenshots não deletados da sessão
4. Gerar URLs assinadas (válidas por 5 minutos — tempo suficiente para a chamada à Anthropic)
5. Montar o prompt com as imagens em formato `image_url` (ou `base64`)
6. Chamar Claude Sonnet via Anthropic API
7. Parsear a resposta e criar o `apontamento` com `content` e `hours_worked` estimado
8. Inserir notificação para o usuário
9. Retornar `{ apontamento_id }`

**Autenticação da função.** A Edge Function extrai o JWT do header `Authorization: Bearer <token>` para identificar o usuário que disparou a chamada. Usa `supabase.auth.getUser(token)` para validar e obter o `user_id`.

**Estimativa de horas.** Claude estima as horas com base na duração da sessão (`stopped_at - started_at`) e no que observou nas telas. O prompt solicita que retorne um JSON estruturado com `content` e `hours_worked`.

**Sem screenshots = sem apontamento.** Se a sessão não tiver screenshots (sessão criada mas agente não capturou nada), a função retorna erro 422.

---

## Implementação

### 21.1 — Variáveis de ambiente no Supabase

Configurar via `supabase secrets set` ou via Dashboard → Edge Functions → Secrets:

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

A `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_URL` são injetadas automaticamente pelo Supabase em Edge Functions.

---

### 21.2 — Criar `supabase/functions/generate-report/index.ts`

**Arquivo:** `supabase/functions/generate-report/index.ts`

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.27.0'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const anthropic = new Anthropic({
  apiKey: Deno.env.get('ANTHROPIC_API_KEY')!,
})

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    })
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  // Validar JWT do usuário
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  // Ler body
  const { session_id } = await req.json()
  if (!session_id) {
    return new Response(JSON.stringify({ error: 'session_id required' }), { status: 400 })
  }

  // Buscar sessão e validar posse + status
  const { data: session, error: sessionError } = await supabase
    .from('capture_sessions')
    .select('id, user_id, organization_id, started_at, stopped_at, status')
    .eq('id', session_id)
    .single()

  if (sessionError || !session) {
    return new Response(JSON.stringify({ error: 'Session not found' }), { status: 404 })
  }
  if (session.user_id !== user.id) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
  }
  if (session.status !== 'stopped') {
    return new Response(JSON.stringify({ error: 'Session is not stopped' }), { status: 422 })
  }

  // Buscar screenshots não deletados
  const { data: screenshots, error: screenshotsError } = await supabase
    .from('screenshots')
    .select('id, storage_path, captured_at')
    .eq('session_id', session_id)
    .is('deleted_at', null)
    .order('captured_at', { ascending: true })

  if (screenshotsError) {
    return new Response(JSON.stringify({ error: 'Failed to fetch screenshots' }), { status: 500 })
  }
  if (!screenshots || screenshots.length === 0) {
    return new Response(JSON.stringify({ error: 'No screenshots to process' }), { status: 422 })
  }

  // Gerar URLs assinadas temporárias (5 minutos)
  const urlPromises = screenshots.map((s) =>
    supabase.storage.from('screenshots').createSignedUrl(s.storage_path, 300)
  )
  const urlResults = await Promise.all(urlPromises)
  const imageUrls = urlResults
    .map((r) => r.data?.signedUrl)
    .filter((u): u is string => Boolean(u))

  if (imageUrls.length === 0) {
    return new Response(JSON.stringify({ error: 'Failed to generate signed URLs' }), { status: 500 })
  }

  // Calcular duração da sessão
  const durationMs = session.stopped_at
    ? new Date(session.stopped_at).getTime() - new Date(session.started_at).getTime()
    : 0
  const durationMinutes = Math.round(durationMs / 60000)

  // Montar conteúdo de imagens para a API Anthropic
  const imageContent = imageUrls.map((url) => ({
    type: 'image' as const,
    source: {
      type: 'url' as const,
      url,
    },
  }))

  // Prompt
  const systemPrompt = `Você é um assistente de produtividade que analisa screenshots de trabalho e gera relatórios de apontamento profissionais em português brasileiro.

Ao analisar as imagens, identifique:
- O que o usuário estava fazendo (contexto de trabalho)
- Ferramentas e aplicações utilizadas
- Tarefas ou projetos visíveis

Retorne APENAS um JSON válido (sem markdown, sem texto extra) com esta estrutura:
{
  "content": "Descrição detalhada do trabalho realizado em 2-4 parágrafos",
  "hours_worked": <número decimal entre 0.25 e 24, estimado com base na duração>
}`

  const userMessage = `Analise os ${imageUrls.length} screenshots abaixo. A sessão de trabalho durou ${durationMinutes} minutos. Gere um apontamento profissional descrevendo o trabalho realizado.`

  let reportContent = ''
  let hoursWorked = 0.5

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: [
            ...imageContent,
            { type: 'text', text: userMessage },
          ],
        },
      ],
    })

    const responseText = response.content[0].type === 'text'
      ? response.content[0].text
      : ''

    const parsed = JSON.parse(responseText)
    reportContent = parsed.content ?? ''
    hoursWorked = Math.min(24, Math.max(0.25, Number(parsed.hours_worked) || 0.5))
  } catch (e) {
    console.error('Anthropic API error:', e)
    // Fallback: criar apontamento com conteúdo genérico
    reportContent = `Sessão de trabalho de ${durationMinutes} minutos. ${imageUrls.length} screenshot(s) capturado(s).`
    hoursWorked = Math.round((durationMinutes / 60) * 4) / 4  // arredonda para 0.25h
  }

  // Determinar data do apontamento (data local do started_at)
  const apontamentoDate = session.started_at.split('T')[0]

  // Criar o apontamento
  const { data: apontamento, error: apontamentoError } = await supabase
    .from('apontamentos')
    .insert({
      user_id: session.user_id,
      organization_id: session.organization_id,
      session_id: session.id,
      date: apontamentoDate,
      content: reportContent,
      hours_worked: hoursWorked,
    })
    .select('id')
    .single()

  if (apontamentoError || !apontamento) {
    return new Response(JSON.stringify({ error: 'Failed to create apontamento' }), { status: 500 })
  }

  // Notificar o usuário
  await supabase.from('notifications').insert({
    user_id: session.user_id,
    type: 'new_org_task',  // reutilizando tipo disponível; idealmente seria 'report_generated'
    title: 'Apontamento gerado',
    body: `Seu apontamento de ${durationMinutes} minutos foi criado com sucesso.`,
    reference_id: apontamento.id,
    reference_type: 'apontamento',
  })

  return new Response(
    JSON.stringify({ apontamento_id: apontamento.id }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    }
  )
})
```

> **Nota sobre `notification_type` ENUM:** O schema define apenas `'new_org_task' | 'task_assigned'`. Para notificação de relatório gerado, idealmente adicionaríamos `'report_generated'` ao ENUM via migration. Como alternativa temporária, `'new_org_task'` é reutilizado. Considerar adicionar o tipo novo no passo 2 da migration.

---

### 21.3 — Chamar a Edge Function no frontend após `stopSession`

**Arquivo:** `src/routes/_authenticated.dashboard.tsx`

Adicionar import da Edge Function no service (ou chamar diretamente):

No `handleStop` do `Recorder`, após `await stopSession(session.id)`:

```tsx
// No sessions.service.ts, adicionar:
export async function triggerGenerateReport(sessionId: string): Promise<{ apontamento_id: string }> {
  const { data, error } = await supabase.functions.invoke('generate-report', {
    body: { session_id: sessionId },
  })
  if (error) throw error
  return data
}
```

No `Recorder.handleStop`:

```tsx
async function handleStop() {
  if (!session || loading) return
  setLoading(true)
  try {
    await stopSession(session.id)
    setSession(null)
    // Disparar geração de relatório (sem await — não bloqueia a UI)
    triggerGenerateReport(session.id).catch((e) => {
      console.error('Erro ao gerar relatório:', e)
    })
  } finally {
    setLoading(false)
  }
}
```

> O usuário será notificado via Realtime quando o apontamento for criado (sino de notificações do passo 17).

---

## Deploy da Edge Function

```bash
supabase functions deploy generate-report
```

---

## Checklist de verificação manual

### Cenário 1 — Fluxo completo
1. Iniciar sessão → agente Python captura screenshots → encerrar sessão
2. **Esperado:** frontend chama `generate-report` em background
3. Após ~5–15 segundos, sino de notificações mostra "Apontamento gerado"
4. Em `/apontamentos`, novo apontamento aparece com conteúdo gerado pela IA e `hours_worked` correto
5. Apontamento tem `session_id` preenchido → screenshots aparecem na galeria

### Cenário 2 — Sessão sem screenshots
1. Criar sessão no frontend sem o agente Python rodando → encerrar sessão
2. **Esperado:** edge function retorna 422, nenhum apontamento criado; nenhuma notificação

### Cenário 3 — Falha da API Anthropic
1. Provocar erro de API (token errado no secret)
2. **Esperado:** fallback cria apontamento com conteúdo genérico ("Sessão de N minutos...")

### Cenário 4 — Validação de posse
1. Tentar chamar `generate-report` com `session_id` de outro usuário (via curl ou Supabase Functions UI)
2. **Esperado:** 403 Forbidden

---

## O que não fazer

- **Não** esperar o retorno da Edge Function na UI antes de soltar o botão — `triggerGenerateReport` é chamado sem `await` no `handleStop`; a UI não bloqueia
- **Não** colocar `ANTHROPIC_API_KEY` no `.env` do frontend — a key só existe como Supabase secret no ambiente da Edge Function
- **Não** usar `base64` para as imagens na API Anthropic — URLs assinadas são mais eficientes e evitam payload gigante; as imagens são fetchadas pelo servidor da Anthropic diretamente
- **Não** criar `notification_type = 'report_generated'` como ENUM aqui sem uma migration separada — ou adicionar uma migration explícita (recomendado), ou usar o tipo existente temporariamente
- **Não** fazer retry automático em caso de erro — o usuário pode criar o apontamento manualmente se o automático falhar

---

## Próximo Passo

**Passo 22 — Edge Function: cleanup-screenshots (cron):** criar a Edge Function de limpeza periódica que deleta do Storage os arquivos de screenshots expirados (soft-deletados + fora do período de retenção da organização).
