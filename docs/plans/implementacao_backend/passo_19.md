# Passo 19 — Screenshots: galeria e curação

## Objetivo

Dentro da tela de apontamento (`/apontamentos`), exibir os screenshots capturados na sessão vinculada ao apontamento, permitir que o usuário faça soft delete de prints indesejados antes que o relatório seja gerado, e exibir URLs assinadas temporárias para visualização das imagens.

---

## Estado após o Passo 18

- `backend/api/services/screenshots.service.ts` — **não existe**
- `src/routes/_authenticated.apontamentos.tsx` — seção de screenshots mostra hardcoded "Nenhum print capturado" e "Prints capturados · 0"; sem dados reais
- Tabela `screenshots` existe com: `id`, `session_id`, `user_id`, `organization_id`, `captured_at`, `storage_path`, `file_size_bytes`, `deleted_at`
- Tabela `apontamentos` tem coluna `session_id UUID REFERENCES capture_sessions(id) ON DELETE SET NULL`
- Bucket `screenshots` no Storage existe e é privado (arquivos não são públicos — precisam de URL assinada)

### Seção de screenshots atual em `_authenticated.apontamentos.tsx`

```tsx
<div className="mt-7 border-t border-border pt-5">
  <p className="section-label mb-3">Prints capturados · 0</p>
  <div className="rounded-md border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
    Nenhum print capturado
  </div>
</div>
```

---

## Contexto técnico

**Apontamentos com e sem sessão.** Um apontamento pode ter `session_id = null` (criado manualmente, sem sessão). Nesses casos, a seção de screenshots exibe apenas "Nenhum print capturado" sem tentar buscar dados.

**URLs assinadas.** O bucket `screenshots` é privado — os arquivos não têm URL pública. Para exibir as imagens, é necessário gerar URLs assinadas com tempo de expiração (`getSignedUrl`). As URLs expiram em 1 hora e são geradas no momento em que o usuário abre o apontamento. Não são cacheadas no banco.

**Soft delete.** O campo `deleted_at` marca o screenshot como "a ser deletado". O arquivo no Storage não é removido aqui — isso é feito pelo cron do passo 22. A galeria refiltra o estado local ao fazer soft delete (otimista).

**Carregamento lazy dos screenshots.** Screenshots só são buscados quando o usuário seleciona um apontamento (não no loader da rota, que carregaria todos de todos os apontamentos). O carregamento é feito com `useEffect` ao mudar o `selectedId`.

**`getSignedUrl` direto no service.** A URL assinada é gerada dentro de `getScreenshots`, junto com os dados do screenshot. O componente não precisa chamar uma função separada por imagem.

---

## Implementação

### 19.1 — Criar `screenshots.service.ts`

**Arquivo:** `backend/api/services/screenshots.service.ts` (criar novo)

- [ ] Definir tipo `Screenshot`
- [ ] Implementar `getScreenshots` (inclui URL assinada por item)
- [ ] Implementar `softDeleteScreenshot`

```ts
import { supabase } from '../supabase'

export type Screenshot = {
  id: string
  session_id: string
  captured_at: string
  storage_path: string
  file_size_bytes: number
  deleted_at: string | null
  signedUrl: string | null   // gerada no momento da busca; não está no banco
}

export async function getScreenshots(sessionId: string): Promise<Screenshot[]> {
  const { data, error } = await supabase
    .from('screenshots')
    .select('id, session_id, captured_at, storage_path, file_size_bytes, deleted_at')
    .eq('session_id', sessionId)
    .is('deleted_at', null)
    .order('captured_at', { ascending: true })

  if (error || !data) return []

  // Gerar URLs assinadas em paralelo (expiram em 3600s)
  const withUrls = await Promise.all(
    data.map(async (s) => {
      const { data: urlData } = await supabase.storage
        .from('screenshots')
        .createSignedUrl(s.storage_path, 3600)
      return { ...s, signedUrl: urlData?.signedUrl ?? null }
    })
  )

  return withUrls
}

export async function softDeleteScreenshot(id: string): Promise<void> {
  const { error } = await supabase
    .from('screenshots')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw error
}
```

> **Performance:** A geração de URLs assinadas em paralelo com `Promise.all` é aceitável para sessões típicas (< 50 screenshots). Para sessões com centenas de screenshots, considerar `createSignedUrls` (batch API) — melhoria futura.

---

### 19.2 — Atualizar a seção de screenshots em `_authenticated.apontamentos.tsx`

**Arquivo:** `src/routes/_authenticated.apontamentos.tsx`

A seção de screenshots está dentro do painel direito, no componente `ApontamentoDetail` (ou inline no `Apontamentos`). A mudança é:

- [ ] Adicionar import de `getScreenshots`, `softDeleteScreenshot` e tipo `Screenshot`
- [ ] Adicionar `useEffect` para carregar screenshots ao selecionar apontamento (se tiver `session_id`)
- [ ] Substituir a seção hardcoded por `ScreenshotsGallery`

#### Novo import no topo do arquivo

```tsx
import {
  getScreenshots,
  softDeleteScreenshot,
  type Screenshot,
} from 'backend/api/services/screenshots.service'
```

#### Estado adicional no componente `Apontamentos` (ou onde `selected` é controlado)

```tsx
const [screenshots, setScreenshots] = useState<Screenshot[]>([])
const [screenshotsLoading, setScreenshotsLoading] = useState(false)

// Disparado quando um apontamento é selecionado
useEffect(() => {
  const current = items.find((i) => i.id === selected)
  if (!current?.session_id) {
    setScreenshots([])
    return
  }

  setScreenshotsLoading(true)
  getScreenshots(current.session_id)
    .then((data) => setScreenshots(data))
    .finally(() => setScreenshotsLoading(false))
}, [selected])
```

#### Função de soft delete

```tsx
async function handleSoftDelete(screenshotId: string) {
  await softDeleteScreenshot(screenshotId)
  setScreenshots((prev) => prev.filter((s) => s.id !== screenshotId))
}
```

#### Componente `ScreenshotsGallery`

Substitui a `<div>` hardcoded da seção de screenshots:

```tsx
function ScreenshotsGallery({
  screenshots,
  loading,
  onDelete,
}: {
  screenshots: Screenshot[]
  loading: boolean
  onDelete: (id: string) => void
}) {
  if (loading) {
    return (
      <div className="mt-7 border-t border-border pt-5">
        <p className="section-label mb-3">Prints capturados</p>
        <div className="rounded-md border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
          Carregando...
        </div>
      </div>
    )
  }

  return (
    <div className="mt-7 border-t border-border pt-5">
      <p className="section-label mb-3">
        Prints capturados · {screenshots.length}
      </p>
      {screenshots.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
          Nenhum print capturado
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {screenshots.map((s) => (
            <ScreenshotThumb
              key={s.id}
              screenshot={s}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ScreenshotThumb({
  screenshot,
  onDelete,
}: {
  screenshot: Screenshot
  onDelete: (id: string) => void
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className="group relative aspect-video overflow-hidden rounded-md border border-border bg-muted"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {screenshot.signedUrl ? (
        <img
          src={screenshot.signedUrl}
          alt={`Screenshot ${new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(screenshot.captured_at))}`}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
          Sem preview
        </div>
      )}

      {hovered && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60">
          <button
            onClick={() => onDelete(screenshot.id)}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-destructive text-background hover:opacity-90"
            aria-label="Excluir screenshot"
            title="Excluir screenshot"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 bg-background/70 px-1.5 py-0.5">
        <span className="font-mono text-[9px] text-muted-foreground">
          {new Intl.DateTimeFormat('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }).format(new Date(screenshot.captured_at))}
        </span>
      </div>
    </div>
  )
}
```

#### Uso no painel direito

Onde antes estava a seção hardcoded, substituir por:

```tsx
<ScreenshotsGallery
  screenshots={screenshots}
  loading={screenshotsLoading}
  onDelete={handleSoftDelete}
/>
```

Adicionar import de `Trash2` do lucide-react ao topo do arquivo se ainda não houver.

---

## Checklist de verificação manual

### Cenário 1 — Apontamento sem sessão
1. Selecionar um apontamento criado manualmente (sem `session_id`)
2. **Esperado:** seção "Prints capturados · 0" com texto "Nenhum print capturado"

### Cenário 2 — Apontamento com sessão e screenshots
1. Selecionar apontamento que tem `session_id` e screenshots no banco
2. **Esperado:** "Carregando..." briefly → grid com thumbnails; contador "Prints capturados · N" correto
3. Passar o mouse sobre um thumbnail → botão vermelho de delete aparece

### Cenário 3 — Soft delete de screenshot
1. Passar o mouse sobre um screenshot → clicar no botão trash
2. **Esperado:** thumbnail desaparece imediatamente (update otimista)
3. Verificar no banco: `deleted_at` preenchido no registro; `storage_path` intacto
4. Recarregar a página → screenshot não reaparece (filtrado pelo `getScreenshots`)

### Cenário 4 — URLs assinadas
1. Abrir apontamento com screenshots
2. Abrir o DevTools → Network → verificar que as imagens carregam via URLs do Supabase Storage (não URLs públicas)
3. **Esperado:** URLs contêm `/object/sign/screenshots/` (URL assinada)

### Cenário 5 — Trocar de apontamento
1. Selecionar apontamento A (com screenshots) → screenshots carregam
2. Selecionar apontamento B (sem screenshots) → galeria limpa
3. Selecionar apontamento A novamente → screenshots recarregam (nova chamada ao backend)

---

## O que não fazer

- **Não** deletar o arquivo do Storage ao fazer soft delete — isso é responsabilidade do cron do passo 22; o soft delete apenas marca `deleted_at`
- **Não** cachear URLs assinadas no banco — URLs expiram em 1 hora e são regeneradas a cada abertura do apontamento; armazenar no banco criaria dados stale
- **Não** carregar screenshots no loader da rota para todos os apontamentos — o carregamento é lazy por `useEffect` ao selecionar cada apontamento; carregar tudo de uma vez seria caro e desnecessário
- **Não** mostrar screenshots soft-deletados como riscados — eles são filtrados na query (`is('deleted_at', null)`) e sumem imediatamente da UI
- **Não** implementar preview em modal/lightbox aqui — thumbnails clicáveis com zoom são uma melhoria futura; o foco deste passo é a galeria básica e o delete

---

## Próximo Passo

**Passo 20 — Agente Python:** criar o agente local que escuta mudanças em `capture_sessions` via Realtime, captura screenshots periodicamente quando a sessão está `active`, faz redação de dados sensíveis e upload para o Storage.
