# Suporte a múltiplos provedores de LLM (Claude + Gemini) — Design

Status: aprovado (2026-07-02). Implementação NÃO iniciada — aguardando plano.

## Contexto

A edge function `monitoramento` (ver [2026-07-01-monitoramento-prints-design.md](./2026-07-01-monitoramento-prints-design.md))
fala direto com o SDK da Anthropic, hardcoded para `claude-haiku-4-5-20251001`. Não
existe camada de abstração — trocar de provedor hoje exigiria reescrever a função.

Esta feature vai adicionar suporte ao Gemini como segundo provedor, configurável
por organização, sem duplicar a lógica de orquestração (autenticação, carregamento
de sessão/histórico, parsing/fallback de draft, persistência em `session_messages`).

**Nada abaixo está implementado ainda** — todo o resto deste documento descreve o
estado proposto (pós-implementação), não o comportamento atual do código.

## Seleção do provedor

Nova coluna em `organizations`:

```sql
ALTER TABLE organizations
  ADD COLUMN ai_provider TEXT NOT NULL DEFAULT 'gemini'
    CHECK (ai_provider IN ('anthropic', 'gemini'));
```

`DEFAULT 'gemini'` — decisão explícita do usuário: todas as orgs (existentes e
novas) vão passar a usar Gemini assim que a migration rodar, inclusive orgs que já
geraram apontamentos com Claude anteriormente. Um admin vai poder trocar de volta
pra `anthropic` a qualquer momento pela UI (seção "UI de administração").

A seleção será por organização inteira, não por sessão/usuário — todas as sessões
de monitoramento daquela org vão usar o mesmo provedor até o admin trocar.

## Arquitetura: adapter por provedor

```
supabase/functions/monitoramento/
  index.ts              -- orquestração: auth, load session, parsing/fallback,
                            persistência em session_messages (inalterado na essência)
  providers/
    types.ts            -- NormalizedMessage, Draft, interface LLMProvider
    anthropic.ts         -- adapter atual, extraído de index.ts sem mudança de comportamento
    gemini.ts            -- novo adapter
    resolve.ts           -- resolveProvider(orgAiProvider: "anthropic" | "gemini") => LLMProvider
```

Interface comum:

```ts
type NormalizedMessage = {
  role: "user" | "assistant";
  text: string;
  imageUrls?: string[]; // apenas na primeira mensagem (action: "start")
};

interface LLMProvider {
  generate(systemPrompt: string, messages: NormalizedMessage[]): Promise<string>;
}
```

`index.ts` vai montar a lista de `NormalizedMessage` a partir do histórico de
`session_messages` (do mesmo jeito que já faz hoje pro formato da Anthropic) e
chamar `provider.generate(...)`. O parsing do JSON de resposta (`parseDraft`) e o
fallback determinístico vão continuar genéricos em `index.ts`, fora dos adapters —
os dois modelos vão receber o mesmo `SYSTEM_PROMPT` pedindo JSON puro
`{ content, hours_worked }`.

`resolveProvider` vai ser chamado uma vez por request, usando
`organizations.ai_provider` carregado junto com `loadSession` (que já faz join
implícito via `capture_sessions.organization_id`).

## Diferença crítica: imagens

O adapter Anthropic manda `source: { type: "url", url }` — a signed URL do Storage
direto, sem baixar a imagem no servidor (comportamento atual, inalterado).

O Gemini **não aceita URLs arbitrárias de terceiros** — só `inlineData` (base64) ou
arquivos pré-carregados no Google File API. O adapter Gemini vai precisar:

1. Buscar cada signed URL via `fetch()` dentro da própria edge function.
2. Converter o corpo da resposta pra base64.
3. Montar `inlineData: { mimeType: "image/png", data: base64 }` por imagem.

Esse custo extra (uma requisição HTTP + encode por imagem) só vai acontecer quando
`ai_provider = 'gemini'` — o caminho do Claude continua sem essa etapa (comportamento
atual do adapter Anthropic, inalterado).

## Modelo e SDK

- Modelo: `gemini-2.5-flash` — equivalente de custo/velocidade ao Haiku, multimodal,
  adequado ao loop de chat iterativo (múltiplas chamadas por sessão).
- SDK: `@google/generative-ai`, a ser importado via `esm.sh` no mesmo padrão do
  SDK da Anthropic (`https://esm.sh/@google/generative-ai@<versão>`) — a versão
  exata a pinar é resolvida na implementação (ver Riscos).
- Secret novo: `GEMINI_API_KEY`, a ser configurado como secret da edge function
  (mesmo mecanismo já usado para `ANTHROPIC_API_KEY`).

## Fallback e erros

Vai manter o padrão já existente: se a chamada ao provedor (Claude ou Gemini)
falhar ou retornar JSON inválido, `index.ts` cai no fallback determinístico (texto
genérico + horas estimadas pela duração da sessão) — esse comportamento não muda,
só passa a cobrir falhas de qualquer um dos dois provedores.

Não vai haver fallback automático entre provedores (ex: tentar Gemini e cair pro
Claude se falhar) — está fora do escopo desta entrega. Cada org vai usar
exclusivamente o provedor configurado.

## UI de administração

Nova seção a ser adicionada em `/admin/membros`
(`src/routes/_authenticated.admin.membros.tsx`), visível apenas para
`tenant_admin`/`master` (mesma guarda de rota já existente): um seletor "Modelo de
IA para relatórios: Claude / Gemini", persistido via novo
`updateOrgAiProvider(orgId, provider)` em `backend/api/services/organizations.service.ts`.

## Compatibilidade com dados existentes

`session_messages` já armazena conteúdo normalizado (texto/JSON de draft), não o
formato de wire de nenhum provedor específico — isso já é verdade hoje, antes
mesmo desta feature. Por causa disso, trocar o `ai_provider` de uma org no meio do
uso não vai quebrar sessões antigas nem vai exigir migração de dados históricos.

## Riscos / pontos a verificar durante a implementação

- **Custo/latência do download de imagens no adapter Gemini**: sessões com muitos
  screenshots multiplicam o número de fetches síncronos antes de montar o prompt —
  avaliar se cabe paralelizar com `Promise.all` (o adapter Anthropic já faz algo
  similar para gerar as signed URLs).
- **Formato de resposta do Gemini**: confirmar experimentalmente que o modelo
  respeita "responda apenas com JSON" com a mesma confiabilidade que o Haiku —
  se não, pode ser necessário usar o modo de saída estruturada nativo do Gemini
  (`responseSchema`) em vez de confiar só no prompt.
- **Nome exato do pacote/versão do SDK**: confirmar a versão estável mais recente
  de `@google/generative-ai` disponível no esm.sh no momento da implementação.
