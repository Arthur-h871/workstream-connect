# Guia da Documentação — Marco

Como encontrar informações dentro de `docs2/`.

---

## Estrutura

```
docs2/
├── plans/                          # Planejamentos de implementação
│   ├── implementacao_backend/      # Plano da integração backend (23 passos)
│   └── cadastro-org/               # Plano do fluxo de cadastro de organização
│
├── info/                           # Documentação permanente do sistema
│   ├── features/
│   │   └── features.md             # O que o sistema faz (implementado vs. pendente)
│   ├── pages/
│   │   └── pages.md                # Cada página do frontend: rota, arquivo, funcionalidades
│   └── organization/
│       ├── backend/
│       │   └── backend.md          # Como o backend está organizado (services, banco, Edge Functions)
│       ├── frontend/
│       │   └── frontend.md         # Como o frontend está organizado (rotas, componentes, stack)
│       └── docs/
│           └── guide.md            # Este arquivo — mapa da documentação
│
└── new/                            # Itens abertos / não implementados
    ├── ideias/
    │   └── features.md             # Ideias de funcionalidades futuras
    └── bugs&problems/
        └── erros_listados.md       # Problemas conhecidos que precisam de correção
```

---

## Onde encontrar cada tipo de informação

| Quero saber... | Onde está |
|----------------|-----------|
| O que o sistema faz | `info/features/features.md` |
| O que cada página exibe e faz | `info/pages/pages.md` |
| Como o backend está estruturado | `info/organization/backend/backend.md` |
| Como o frontend está estruturado | `info/organization/frontend/frontend.md` |
| O schema do banco de dados | `docs/DATABASE_SCHEMA.md` *(docs legada)* |
| Um planejamento de implementação | `plans/<nome-do-plano>/main.md` |
| Ideias para o futuro | `new/ideias/features.md` |
| Bugs conhecidos | `new/bugs&problems/erros_listados.md` |

---

## Convenções

- **`info/`** — documentação viva do estado atual do sistema. Deve ser atualizada quando features são implementadas ou a arquitetura muda.
- **`plans/`** — planejamentos de implementação. Cada plano tem sua pasta com `main.md` e arquivos `passo_N.md`.
- **`new/`** — backlog não estruturado. Ideias e bugs anotados para revisão futura.

---

## Legenda de Status (usada em `features.md` e `pages.md`)

| Símbolo | Significado |
|---------|-------------|
| ✅ | Implementado e funcionando |
| ⚙️ | Parcialmente implementado |
| ⏳ | Pendente — não implementado ainda |
