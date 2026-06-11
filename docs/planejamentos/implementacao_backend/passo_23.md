# Passo 23 — Tipos TypeScript gerados pelo Supabase CLI

## Objetivo

Gerar o arquivo `src/types/supabase.ts` com os tipos TypeScript derivados do schema do banco (tabelas, ENUMs, funções RPC), e atualizar os services para usar esses tipos gerados em vez de tipos manuais — garantindo tipagem end-to-end sincronizada com o banco.

---

## Estado após o Passo 22

- Todos os services existem com tipos manuais (`type Profile = { id: string; ... }`)
- `src/types/supabase.ts` — **não existe**
- O Supabase CLI está instalado (foi usado nos passos iniciais para a migration)
- O banco está completamente migrado com todas as tabelas, ENUMs e funções

---

## Contexto técnico

**`supabase gen types typescript`.** O comando gera um arquivo com:
- Interface `Database` com todas as tabelas (columns, row types, insert types, update types)
- Tipos de ENUMs como union types TypeScript
- Tipos para funções RPC

**Onde salvar.** O arquivo gerado vai para `src/types/supabase.ts`. Os services importam os tipos de lá em vez de defini-los manualmente.

**Atualização dos services.** Os services já têm tipos manuais que funcionam. A migração para tipos gerados é um `sed` de imports + ajuste das assinaturas onde necessário. O principal benefício é que, ao adicionar uma coluna no banco e rodar `gen types`, o TypeScript imediatamente mostra onde o código precisa ser atualizado.

**Nem todos os tipos manuais serão deletados.** Tipos que combinam dados de múltiplas tabelas (ex: `AdminOrgMember` com JOIN) ou tipos de apresentação (ex: `Screenshot` com campo `signedUrl` que não existe no banco) continuam como tipos manuais nos services — os tipos gerados cobrem apenas a estrutura 1:1 com as tabelas.

**O cliente Supabase deve ser tipado.** Após gerar os tipos, o cliente em `backend/api/supabase.ts` deve ser atualizado para `createClient<Database>(...)`. Isso ativa o autocomplete e validação de nomes de tabela/coluna em todas as queries.

---

## Implementação

### 23.1 — Gerar os tipos

```bash
supabase gen types typescript --project-id <PROJECT_ID> > src/types/supabase.ts
```

Substituir `<PROJECT_ID>` pelo ID do projeto Supabase (encontrado em Settings → General ou na URL `https://supabase.com/dashboard/project/<PROJECT_ID>`).

O arquivo gerado terá esta estrutura:

```ts
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      apontamento_org_tasks: {
        Row: {
          apontamento_id: string
          id: string
          org_task_id: string
          status: Database['public']['Enums']['linked_task_status']
        }
        Insert: { ... }
        Update: { ... }
        Relationships: [ ... ]
      }
      // ... todas as outras tabelas
    }
    Views: { [_ in never]: never }
    Functions: {
      get_my_org_id: { Args: Record<PropertyKey, never>; Returns: string }
      get_my_role: { Args: Record<PropertyKey, never>; Returns: Database['public']['Enums']['user_role'] }
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean }
    }
    Enums: {
      linked_task_status: 'started' | 'concluded'
      notification_type: 'new_org_task' | 'task_assigned'
      project_status: 'active' | 'closed'
      session_status: 'active' | 'paused' | 'stopped'
      task_status: 'queued' | 'in_progress' | 'completed'
      user_role: 'master' | 'tenant_admin' | 'tenant_user'
    }
    CompositeTypes: { [_ in never]: never }
  }
}

// Helper types comumente usados
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']

export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']

export type Enums<T extends keyof Database['public']['Enums']> =
  Database['public']['Enums'][T]
```

> O arquivo acima é uma **amostra** da estrutura esperada. O arquivo real gerado pelo CLI será completo com todos os campos e constraints de cada tabela.

---

### 23.2 — Tipar o cliente Supabase

**Arquivo:** `backend/api/supabase.ts` (modificar)

```ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/supabase'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
```

Antes era `createClient(...)` sem o tipo genérico. Com `createClient<Database>`, todas as queries nos services ganham autocomplete e validação de tipos em tempo de compilação.

---

### 23.3 — Atualizar tipos nos services

Substituir os tipos manuais que mapeiam 1:1 com tabelas pelos tipos gerados. Tipos compostos ou com campos extras permanecem manuais.

#### `users.service.ts`

```ts
// ANTES
export type UserProfile = {
  id: string
  full_name: string
  avatar_url: string | null
  role: 'master' | 'tenant_admin' | 'tenant_user'
  organization_id: string
  created_at: string
}

// DEPOIS
import type { Tables, Enums } from '../../src/types/supabase'
export type UserProfile = Tables<'profiles'>
// Se quiser manter apenas campos relevantes, usar Pick:
// export type UserProfile = Pick<Tables<'profiles'>, 'id' | 'full_name' | 'avatar_url' | 'role' | 'organization_id'>
```

#### `sessions.service.ts`

```ts
// ANTES
export type CaptureSession = {
  id: string
  status: 'active' | 'paused' | 'stopped'
  // ...
}

// DEPOIS
import type { Tables } from '../../src/types/supabase'
export type CaptureSession = Tables<'capture_sessions'>
```

#### `notifications.service.ts`

```ts
// ANTES
export type Notification = {
  id: string
  type: string
  // ...
}

// DEPOIS
import type { Tables } from '../../src/types/supabase'
export type Notification = Tables<'notifications'>
```

#### Tipos que NÃO devem ser substituídos

```ts
// organizations.service.ts — AdminOrgMember combina profiles com lógica de apresentação
// Manter como tipo manual (é um subconjunto + campos calculados)

// screenshots.service.ts — Screenshot tem campo `signedUrl` que não existe no banco
// Manter como tipo manual com interseção se quiser:
import type { Tables } from '../../src/types/supabase'
type ScreenshotRow = Tables<'screenshots'>
export type Screenshot = ScreenshotRow & { signedUrl: string | null }
```

---

### 23.4 — Uso dos ENUMs gerados

Em vez de strings literais repetidas, usar os tipos gerados:

```ts
import type { Enums } from '../../src/types/supabase'

// ANTES
type Role = 'master' | 'tenant_admin' | 'tenant_user'

// DEPOIS
type Role = Enums<'user_role'>  // inferred from Database

// Exemplo de uso em uma função
export async function promoteToAdmin(memberId: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ role: 'tenant_admin' satisfies Enums<'user_role'> })
    .eq('id', memberId)
  if (error) throw error
}
```

---

### 23.5 — Adicionar script ao `package.json`

**Arquivo:** `package.json` (adicionar ao objeto `"scripts"`)

```json
"db:types": "supabase gen types typescript --project-id <PROJECT_ID> > src/types/supabase.ts"
```

Uso:

```bash
npm run db:types
```

Deve ser executado sempre que o schema do banco mudar (nova migration rodada).

---

### 23.6 — Verificar compilação TypeScript

```bash
npx tsc --noEmit
```

**Esperado:** zero erros de tipo. Se houver erros, são indicadores de incompatibilidades reais entre o código e o schema gerado — corrigi-los é o valor principal deste passo.

---

## Checklist de verificação manual

- [ ] `src/types/supabase.ts` existe e contém a interface `Database` completa
- [ ] `backend/api/supabase.ts` usa `createClient<Database>(...)`
- [ ] Em VSCode/IDE: ao fazer `supabase.from('profiles').select(...)`, o autocomplete sugere os campos corretos da tabela `profiles`
- [ ] Tentar fazer `.select('campo_inexistente')` → TypeScript mostra erro em tempo de compilação
- [ ] `npx tsc --noEmit` passa sem erros
- [ ] `npm run db:types` executa e regenera o arquivo sem erros

---

## Quando re-executar

Rodar `npm run db:types` (ou o comando direto) nas seguintes situações:

1. Após aplicar uma migration que adiciona/remove coluna
2. Após adicionar um novo ENUM value
3. Após criar uma nova tabela
4. Após modificar uma função RPC

---

## O que não fazer

- **Não** editar manualmente `src/types/supabase.ts` — o arquivo é gerado; edições manuais serão sobrescritas na próxima geração
- **Não** deletar os tipos manuais de todos os services de uma vez — fazer o update service por service, verificando com `tsc --noEmit` a cada mudança
- **Não** usar `any` para contornar erros de tipo após a mudança — cada erro de tipo é um bug real a ser corrigido
- **Não** commitar `src/types/supabase.ts` junto com mudanças de feature — idealmente é commitado separadamente (ou gerado em CI) para ter histórico claro de quando o schema mudou
- **Não** usar `Tables<'profiles'>` onde o tipo inclui campos que não devem estar acessíveis na camada de apresentação — usar `Pick<>` para expor apenas o necessário

---

## Plano completo concluído

Este é o último passo do plano de implementação backend. Com o passo 23 concluído, o projeto tem:

- ✅ Banco de dados completo com RLS (passo 2)
- ✅ Autenticação completa (passos 4, 5, 6, 7)
- ✅ Perfil e organização carregados (passos 8, 16)
- ✅ CRUD de tarefas pessoais e da org (passos 9, 10, 11)
- ✅ Apontamentos com vínculos (passos 12, 13)
- ✅ Dashboard com dados reais (passo 14)
- ✅ Perfil editável (passo 15)
- ✅ Notificações em tempo real (passo 17)
- ✅ Sessões de captura controladas pelo frontend (passo 18)
- ✅ Galeria de screenshots com curação (passo 19)
- ✅ Agente Python de captura (passo 20)
- ✅ Geração automática de apontamentos via IA (passo 21)
- ✅ Limpeza automática de arquivos (passo 22)
- ✅ Tipagem end-to-end com tipos gerados (passo 23)
