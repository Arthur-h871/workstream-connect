# Passo 18 — Sessões de captura: controle Start / Pause / Stop

## Objetivo

Conectar os botões Play/Pause/Stop do dashboard ao banco — criar `capture_sessions`, atualizar status (active → paused → active → stopped), e persistir o estado da sessão entre recarregamentos. O agente Python (passo 20) escutará as mudanças via Realtime para iniciar/pausar/parar a captura de screenshots.

---

## Estado após o Passo 17

- `backend/api/services/sessions.service.ts` — **não existe**
- `src/routes/dashboard.tsx` — rota `/dashboard` sem autenticação no path, `Recorder` com estado local (`useState`) apenas, sem conexão com o banco
- Tabela `capture_sessions` existe com colunas: `id`, `user_id`, `organization_id`, `status` (active/paused/stopped), `started_at`, `paused_at`, `stopped_at`, `screenshot_count`

### `Recorder` atual em `dashboard.tsx` (linhas 34–83)

```tsx
function Recorder() {
  const [state, setState] = useState<"idle" | "recording" | "paused">("idle");
  // ... botões que apenas mudam estado local, sem chamar backend
}
```

---

## Contexto técnico

**Migração para `_authenticated.dashboard.tsx`.** O dashboard ainda está em `dashboard.tsx` (rota `/dashboard` sem guard). Assim como os passos anteriores, será migrado para `_authenticated.dashboard.tsx` (rota `/_authenticated/dashboard`) para ter acesso ao `context.profile`.

**Loader verifica sessão ativa.** No `loader`, chamamos `getActiveSession(userId)` para saber se há uma sessão `active` ou `paused` em andamento. Se houver, o `Recorder` começa no estado correto (não `idle`).

**Recorder com `sessionId` como estado.** Em vez de apenas `'idle' | 'recording' | 'paused'`, o `Recorder` mantém o objeto da sessão atual (`{ id, status } | null`). A ausência de sessão = idle.

**`stopSession` vs Trash.** O botão Trash (Trash2) exclui a sessão (delete, sem gerar apontamento). O botão Stop (Square) encerra a sessão (`status = 'stopped'`), que dispara o processo de geração de apontamento no passo 21. São operações diferentes.

**Sem Realtime no dashboard para sessões.** O próprio usuário é quem controla a sessão via botões. Não há necessidade de escutar mudanças externas na sessão — o estado do botão reflete diretamente as ações do usuário. O Realtime em `capture_sessions` será escutado pelo agente Python (passo 20), não pelo frontend.

**`deleteSession` não está na arquitetura original.** A arquitetura lista apenas `getActiveSession`, `createSession`, `pauseSession`, `stopSession`. Para o botão Trash, precisamos de `deleteSession`. Será adicionado ao service.

---

## Implementação

### 18.1 — Criar `sessions.service.ts`

**Arquivo:** `backend/api/services/sessions.service.ts` (criar novo)

- [ ] Definir tipo `CaptureSession`
- [ ] Implementar `getActiveSession`
- [ ] Implementar `createSession`
- [ ] Implementar `pauseSession`
- [ ] Implementar `resumeSession`
- [ ] Implementar `stopSession`
- [ ] Implementar `deleteSession`

```ts
import { supabase } from '../supabase'

export type CaptureSession = {
  id: string
  user_id: string
  organization_id: string
  status: 'active' | 'paused' | 'stopped'
  started_at: string
  paused_at: string | null
  stopped_at: string | null
  screenshot_count: number
}

export async function getActiveSession(
  userId: string
): Promise<CaptureSession | null> {
  const { data, error } = await supabase
    .from('capture_sessions')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['active', 'paused'])
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  return data
}

export async function createSession(
  userId: string,
  orgId: string
): Promise<CaptureSession> {
  const { data, error } = await supabase
    .from('capture_sessions')
    .insert({
      user_id: userId,
      organization_id: orgId,
      status: 'active',
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function pauseSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('capture_sessions')
    .update({ status: 'paused', paused_at: new Date().toISOString() })
    .eq('id', sessionId)

  if (error) throw error
}

export async function resumeSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('capture_sessions')
    .update({ status: 'active' })
    .eq('id', sessionId)

  if (error) throw error
}

export async function stopSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('capture_sessions')
    .update({ status: 'stopped', stopped_at: new Date().toISOString() })
    .eq('id', sessionId)

  if (error) throw error
}

export async function deleteSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('capture_sessions')
    .delete()
    .eq('id', sessionId)

  if (error) throw error
}
```

---

### 18.2 — Migrar e reescrever `dashboard.tsx`

**Arquivo:** `src/routes/_authenticated.dashboard.tsx` (criar novo)
**Arquivo:** `src/routes/dashboard.tsx` (deletar após criar o novo)

- [ ] Criar `_authenticated.dashboard.tsx` com loader e `Recorder` conectado ao banco
- [ ] Deletar `src/routes/dashboard.tsx`

```tsx
import { createFileRoute, Link } from '@tanstack/react-router'
import { Play, Pause, Square, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { AppShell } from '@/components/AppShell'
import {
  getActiveSession,
  createSession,
  pauseSession,
  resumeSession,
  stopSession,
  deleteSession,
  type CaptureSession,
} from 'backend/api/services/sessions.service'
import { getDashboardData } from 'backend/api/services/dashboard.service'

export const Route = createFileRoute('/_authenticated/dashboard')({
  head: () => ({
    meta: [
      { title: 'Dashboard — Marco' },
      { name: 'description', content: 'Resumo do seu trabalho, tarefas e produtividade.' },
    ],
  }),
  loader: async ({ context }) => {
    const { id: userId, organization_id: orgId } = context.profile
    const [session, dashboardData] = await Promise.all([
      getActiveSession(userId),
      getDashboardData(userId, orgId),
    ])
    return { session, dashboardData, userId, orgId }
  },
  component: () => (
    <AppShell>
      <Dashboard />
    </AppShell>
  ),
})
```

### `Recorder` — componente com estado real

Substitui o `Recorder` atual (linhas 34–83 do arquivo original):

```tsx
function Recorder() {
  const { session: initialSession, userId, orgId } = Route.useLoaderData()
  const [session, setSession] = useState<CaptureSession | null>(initialSession)
  const [loading, setLoading] = useState(false)

  const status = session?.status ?? 'idle'

  async function handlePlay() {
    if (loading) return
    setLoading(true)
    try {
      const newSession = await createSession(userId, orgId)
      setSession(newSession)
    } finally {
      setLoading(false)
    }
  }

  async function handlePauseResume() {
    if (!session || loading) return
    setLoading(true)
    try {
      if (session.status === 'active') {
        await pauseSession(session.id)
        setSession((s) => s ? { ...s, status: 'paused' } : s)
      } else {
        await resumeSession(session.id)
        setSession((s) => s ? { ...s, status: 'active' } : s)
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleStop() {
    if (!session || loading) return
    setLoading(true)
    try {
      await stopSession(session.id)
      setSession(null)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!session || loading) return
    setLoading(true)
    try {
      await deleteSession(session.id)
      setSession(null)
    } finally {
      setLoading(false)
    }
  }

  const isActive = session !== null

  return (
    <div className="flex items-center gap-3">
      {isActive && (
        <span className="font-mono text-xs text-muted-foreground">
          {status === 'active' ? (
            <>
              <span className="text-copper">●</span> gravando...
            </>
          ) : (
            <>
              <span className="text-muted-foreground">⏸</span> pausado
            </>
          )}
        </span>
      )}
      <div className="flex items-center gap-1 rounded-md border border-border bg-surface p-1">
        {!isActive && (
          <button
            onClick={handlePlay}
            disabled={loading}
            className="flex h-7 w-7 items-center justify-center rounded text-copper hover:bg-copper-soft disabled:opacity-40"
            aria-label="Iniciar gravação"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
          </button>
        )}
        {isActive && (
          <>
            <button
              onClick={handlePauseResume}
              disabled={loading}
              className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-40"
              aria-label={status === 'active' ? 'Pausar' : 'Retomar'}
            >
              {status === 'active' ? (
                <Pause className="h-3.5 w-3.5" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              onClick={handleDelete}
              disabled={loading}
              className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
              aria-label="Excluir sessão"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleStop}
              disabled={loading}
              className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-40"
              aria-label="Finalizar"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
```

### Restante do `Dashboard`

O resto do componente `Dashboard` (Heatmap, StatCards, Apontamentos recentes, Tarefas prioritárias, Prazos da org) é **idêntico ao Passo 14**, já com dados reais. Apenas o `Recorder` muda neste passo.

---

## Checklist de verificação manual

### Cenário 1 — Iniciar sessão
1. Abrir `/dashboard` — Recorder mostra apenas botão Play
2. Clicar Play
3. **Esperado:** botão desabilita brevemente → indicador "● gravando..." aparece → botões Pause/Trash/Stop aparecem
4. Verificar no Supabase: registro em `capture_sessions` com `status = 'active'`

### Cenário 2 — Pausar e retomar
1. Com sessão ativa, clicar Pause (ícone de pausa)
2. **Esperado:** indicador muda para "⏸ pausado" → botão muda para Play (retomar)
3. Verificar no banco: `status = 'paused'`, `paused_at` preenchido
4. Clicar Play (retomar)
5. **Esperado:** indicador volta para "● gravando..." → botão volta para Pause
6. Verificar no banco: `status = 'active'`

### Cenário 3 — Finalizar sessão
1. Com sessão ativa, clicar Stop (ícone quadrado)
2. **Esperado:** todos os botões desaparecem → apenas Play volta
3. Verificar no banco: `status = 'stopped'`, `stopped_at` preenchido

### Cenário 4 — Excluir sessão
1. Com sessão ativa, clicar Trash
2. **Esperado:** apenas Play volta
3. Verificar no banco: registro deletado

### Cenário 5 — Persistência entre recarregamentos
1. Iniciar sessão → recarregar página
2. **Esperado:** Recorder abre mostrando indicador "● gravando..." (não idle) — loader buscou sessão ativa

### Cenário 6 — Dois usuários não compartilham sessão
1. Usuário A inicia sessão
2. Usuário B (outra conta) abre o dashboard
3. **Esperado:** Recorder de B está idle (filtro por `user_id`)

---

## O que não fazer

- **Não** deletar screenshots ao excluir a sessão aqui — `capture_sessions` tem `ON DELETE CASCADE` para `screenshots`, então os registros do banco são deletados automaticamente; os arquivos físicos no Storage são limpos pelo cron do passo 22
- **Não** implementar Realtime no frontend para `capture_sessions` — o frontend não precisa receber atualizações externas; apenas o agente Python (passo 20) escuta mudanças
- **Não** usar `useNavigate` para redirecionar após stop — a página permanece no dashboard após finalizar
- **Não** bloquear os botões com `disabled` por longo tempo — a flag `loading` é apenas para a duração da chamada async (~200ms); não é um estado de bloqueio permanente
- **Não** mover `resumeSession` para dentro de `pauseSession` — são funções distintas, cada uma com update explícito no banco

---

## Próximo Passo

**Passo 19 — Screenshots: galeria e curação:** após a sessão ser encerrada (passo 18) e o agente Python fazer upload dos screenshots (passo 20), conectar a exibição e o soft delete dos screenshots dentro de um apontamento na rota `/apontamentos`.
