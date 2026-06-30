# Organização do Frontend — Marco

React 19 + TypeScript com TanStack Router (file-based routing) e TanStack Start (SSR/server functions). UI com Tailwind CSS v4 e componentes Radix UI via shadcn/ui.

---

## Estrutura de Pastas

```
src/
├── components/
│   ├── AppShell.tsx         # layout autenticado (sidebar + notificações)
│   └── ui/                  # componentes shadcn/ui (Radix UI + Tailwind)
├── hooks/
│   └── use-mobile.tsx       # detecção de viewport mobile
├── lib/
│   ├── api/
│   │   └── example.functions.ts
│   ├── config.server.ts     # configurações server-side
│   ├── error-capture.ts     # captura de erros Lovable
│   ├── error-page.ts        # utilitários de página de erro
│   ├── lovable-error-reporting.ts
│   └── utils.ts             # `cn()` (clsx + tailwind-merge)
├── routes/                  # rotas file-based (TanStack Router)
│   ├── __root.tsx           # raiz: QueryClient, head, error boundary
│   ├── index.tsx            # redireciona para /login ou /dashboard
│   ├── login.tsx
│   ├── cadastro.tsx
│   ├── cadastro-organizacao.tsx
│   ├── aguardando.tsx
│   ├── _authenticated.tsx   # layout guard: verifica sessão + profile
│   ├── _authenticated.dashboard.tsx
│   ├── _authenticated.apontamentos.tsx
│   ├── _authenticated.tarefas.tsx
│   ├── _authenticated.tarefas-org.tsx
│   ├── _authenticated.tarefas-org_.$projectId.tsx
│   ├── _authenticated.perfil.tsx
│   ├── _authenticated.admin.membros.tsx
│   └── README.md
├── routeTree.gen.ts         # gerado automaticamente pelo TanStack Router
├── router.tsx               # instância do router com QueryClient
├── server.ts                # entry point do servidor (Nitro)
├── start.ts                 # entry point do cliente
├── styles.css               # Tailwind CSS v4 (global)
└── types/
    └── supabase.ts          # tipos gerados do banco de dados
```

---

## Camadas

### Rotas (`src/routes/`)

File-based routing do TanStack Router. Cada arquivo exporta `Route` criado com `createFileRoute(path)`.

**Convenções de nomenclatura:**
- `_authenticated.*.tsx` — rotas protegidas, aninhadas sob o layout `_authenticated.tsx`
- `_authenticated.admin.*.tsx` — sub-rotas de admin
- `_authenticated.tarefas-org_.$projectId.tsx` — rota com parâmetro dinâmico (`$projectId`), sem layout aninhado (`_` no sufixo)
- `__root.tsx` — raiz com providers globais

**Padrão por rota:**
```ts
export const Route = createFileRoute("/caminho")({
  loader: async ({ context }) => { /* busca dados */ },
  component: () => <AppShell><PaginaComponent /></AppShell>,
})
```

Os loaders chamam diretamente os services do backend — sem hooks de fetching intermediários.

---

### Layout (`src/components/AppShell.tsx`)

Envolve todas as páginas autenticadas. Contém:

- Sidebar com navegação principal (`navItems`)
- Perfil do usuário no rodapé da sidebar (nome + avatar)
- `NotificationBell` — sino com badge de não lidas, painel de notificações em tempo real (Supabase Realtime)
- Botão de logout

**Itens de navegação:**

| Rota | Label | Visível para |
|------|-------|-------------|
| `/dashboard` | Dashboard | Todos |
| `/apontamentos` | Apontamentos | Todos |
| `/tarefas-org` | Tarefas da Org | Todos |
| `/tarefas` | Minhas Tarefas | Todos |
| `/perfil` | Perfil | Todos |
| `/admin/membros` | Membros | `tenant_admin` e `master` |

---

### Componentes UI (`src/components/ui/`)

Componentes do shadcn/ui: wrappers finos sobre Radix UI primitives com estilização Tailwind. Não contêm lógica de negócio. Lista completa em [src/components/ui/](../../../../../src/components/ui/).

Componentes-chave usados nas páginas:
- `Button`, `Input`, `Textarea`, `Select`, `Checkbox`
- `Dialog`, `Sheet`, `Popover`, `DropdownMenu`
- `Table`, `Card`, `Badge`, `Avatar`
- `Sonner` (toasts), `Tooltip`

---

### Drag-and-drop

Usado em `/tarefas` para reordenação de tarefas pessoais:

- `@dnd-kit/core` — motor de D&D
- `@dnd-kit/sortable` — lista ordenável
- `@dnd-kit/utilities` — helpers CSS

Ao soltar, chama `reorderPersonalTasks()` no service.

---

### Estado Global

Sem store global (Redux, Zustand). Estado gerenciado por:

- **TanStack Query** — caching e revalidação de queries (configurado no `__root.tsx`)
- **useState** — estado local de componentes
- **Context API** — `ProfileContext` em `_authenticated.tsx` para passar o perfil para toda a árvore autenticada

---

### Utilitários

| Arquivo | Exporta |
|---------|---------|
| `src/lib/utils.ts` | `cn(...classes)` — combina clsx + tailwind-merge |
| `src/hooks/use-mobile.tsx` | `useIsMobile()` — breakpoint mobile detection |

---

## Stack Resumida

| Categoria | Tecnologia |
|-----------|-----------|
| Framework | React 19 + TanStack Start |
| Roteamento | TanStack Router (file-based) |
| Estilização | Tailwind CSS v4 |
| Componentes | shadcn/ui (Radix UI) |
| Formulários | react-hook-form + @hookform/resolvers |
| Drag-and-drop | @dnd-kit |
| Gráficos | recharts |
| Datas | date-fns + react-day-picker |
| Ícones | lucide-react |
| Build | Vite + Nitro |
| Runtime | Bun |
