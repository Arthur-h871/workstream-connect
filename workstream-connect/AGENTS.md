# Marco — Guia de Onboarding para o Agente

## Projeto em uma linha

**Marco** é uma ferramenta de registro de trabalho com IA para equipes. Frontend React completo (dados mockados), backend Supabase a implementar.

---

## Como rodar

```bash
bun install         # instalar dependências
bun run dev         # dev server em http://localhost:3000
bun run build       # build de produção
bun run lint        # checar erros ESLint
bun run format      # formatar com Prettier
```

Usar sempre **bun** — nunca npm/yarn/pnpm.

---

## Estrutura rápida

```
src/routes/          → Uma rota = um arquivo (TanStack Router file-based)
src/components/      → AppShell.tsx (layout autenticado) + ui/ (shadcn, não editar)
src/lib/             → utils.ts, supabase.ts (a criar), api/ (chamadas por domínio)
src/hooks/           → hooks customizados
docs/                → documentação completa do projeto
.cursor/rules/       → regras persistentes para o agente
```

**Arquivo gerado automaticamente (não editar):** `src/routeTree.gen.ts`

---

## Estado atual do backend

**Nenhuma chamada real ao Supabase existe.** Todos os dados são arrays hardcoded nos arquivos de rota.

Ordem de implementação: `docs/BACKEND_INTEGRATION.md`  
Passos detalhados: `docs/planejamentos/implementacao_backend/`  
Schema do banco: `docs/DATABASE_SCHEMA.md`

---

## Regras críticas

1. **Nunca commitar** sem o usuário pedir.
2. **Nunca alterar** `src/routeTree.gen.ts` — é gerado automaticamente.
3. **Nunca alterar** arquivos em `src/components/ui/` diretamente — usar `bunx shadcn@latest add`.
4. **Sempre rodar `bun run lint`** após implementar algo.
5. **Escopo mínimo** — alterar apenas o necessário para a tarefa.

---

## Regras `.cursor/rules/`

| Arquivo | Sempre aplica? | Conteúdo |
|---------|---------------|----------|
| `project.mdc` | Sim | Stack, domínio, estrutura, docs |
| `conventions.mdc` | Sim | Padrões de código, nomenclatura, comportamento |
| `ui-design.mdc` | Em arquivos `.tsx`/`.css` | Design system, cores, componentes |
| `supabase.mdc` | Em `src/lib/`, `src/routes/`, `src/hooks/` | Padrões de integração Supabase |

---

## Stack resumida

| | |
|-|-|
| Framework | TanStack Start (SSR) + TanStack Router |
| UI | React 18 + TypeScript strict |
| Estilo | Tailwind CSS v4 + CSS variables |
| Componentes | Radix UI / shadcn |
| Server state | TanStack Query |
| Backend | Supabase (PostgreSQL + Auth + Storage + Realtime) |
| Ícones | Lucide React |
| Formulários | React Hook Form + Zod |

---

## Paths importantes

| Path | O que é |
|------|---------|
| `@/` | Alias para `src/` |
| `src/styles.css` | Tokens de design (cores, fontes, raios) |
| `src/lib/utils.ts` | `cn()` para merge de classes Tailwind |
| `.env` | `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` |

---

## Domínio resumido

- Usuário pertence a uma **Organization**
- Roles: `tenant_admin` > `tenant_user`
- Novo usuário → `member_request` → admin aprova → `profile` criado
- **Apontamento** = registro de trabalho (gerado por IA ou manual)
- **capture_session** = sessão do agente Python (start/pause/stop via Realtime)
- **personal_task** = tarefa privada do usuário
- **org_task** + **project** = tarefas da organização
