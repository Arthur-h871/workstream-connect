p# Plano de Implementação — Backend Workstream Connect

## Contexto

O frontend está completo e funcional com dados mockados/vazios em todas as rotas. Nenhuma integração com Supabase existe ainda — não há cliente instalado, nem autenticação, nem queries reais. O banco de dados está totalmente projetado e documentado em `docs/`. Este plano cobre o caminho do estado atual até o backend completo e operacional.

---

## Passos

### Passo 1 — Criar projeto Supabase e configurar variáveis de ambiente
Criar o projeto no Supabase Cloud e conectar ao repositório via variáveis de ambiente locais.

---

### Passo 2 — Executar a migration do banco de dados
Rodar o SQL de `docs/DATABASE_MIGRATION.sql` no projeto Supabase para criar todas as tabelas, ENUMs, funções, triggers e políticas RLS.

---

### Passo 3 — Instalar e inicializar o cliente Supabase no frontend
Instalar o pacote e criar a instância do cliente que será usada por toda a aplicação.

---

### Passo 4 — Autenticação: login
Conectar o formulário de login existente ao Supabase Auth.

---

### Passo 5 — Autenticação: cadastro com código de organização
Conectar o formulário de cadastro ao Supabase Auth, passando o código da organização para o trigger criar o perfil corretamente.

---

### Passo 6 — Guard de rotas (proteção de páginas autenticadas)
Impedir acesso às rotas protegidas sem sessão ativa, redirecionando para `/login`.

---

### Passo 7 — Sessão persistida e logout
Manter a sessão do usuário entre recarregamentos de página e implementar o botão de logout no AppShell.

---

### Passo 8 — Carregamento do perfil e organização
Substituir os dados fixos do usuário (nome, avatar, role) pelos dados reais vindos do banco.

---

### Passo 9 — Tarefas pessoais: CRUD completo
Conectar a rota `/tarefas` ao banco — listar, criar, atualizar status, reordenar e deletar tarefas pessoais.

---

### Passo 10 — Projetos da organização: CRUD
Conectar a rota `/tarefas-org` para listar, criar e fechar projetos da organização.

---

### Passo 11 — Tarefas da organização: CRUD
Dentro de cada projeto, conectar criação, listagem, atualização de status e atribuição de responsável para `org_tasks`.

---

### Passo 12 — Apontamentos: listagem e criação manual
Conectar a rota `/apontamentos` para listar apontamentos existentes e permitir criação manual.

---

### Passo 13 — Apontamentos: vinculação de tarefas
Implementar o vínculo de tarefas (pessoais e da org) a um apontamento, com status `started`/`concluded`.

---

### Passo 14 — Dashboard: dados reais
Substituir os arrays vazios do dashboard por dados reais — heatmap, horas no mês, contadores, gravações recentes, tarefas prioritárias e prazos.

---

### Passo 15 — Perfil: edição de dados, avatar e senha
Conectar as ações de edição do perfil — atualizar nome, trocar avatar (upload Storage) e alterar senha.

---

### Passo 16 — Membros da organização (admin)
Conectar a rota `/admin/membros` para listar membros, exibir o código da org, promover admins e remover membros.

---

### Passo 17 — Notificações em tempo real
Implementar o sino de notificações do AppShell com Supabase Realtime, marcando notificações como lidas.

---

### Passo 18 — Sessões de captura: controle Start / Pause / Stop
Conectar os botões do dashboard ao banco para criar e atualizar sessões de captura, que serão escutadas pelo agente Python via Realtime.

---

### Passo 19 — Screenshots: galeria e curação
Dentro de um apontamento, listar os screenshots da sessão e permitir soft delete antes de gerar o relatório.

---

### Passo 20 — Agente Python
Criar o agente local (`agent/`) com os módulos de captura, redação de dados sensíveis, upload e controle via Realtime.

---

### Passo 21 — Edge Function: generate-report
Criar a Edge Function Supabase que recebe uma sessão encerrada, processa os screenshots com a API Anthropic Vision e gera o apontamento automaticamente.

---

### Passo 22 — Edge Function: cleanup-screenshots (cron)
Criar a Edge Function de limpeza periódica que deleta screenshots expirados do Storage e do banco conforme `retention_days` da organização.

---

### Passo 23 — Tipos TypeScript gerados pelo Supabase CLI
Gerar e integrar os tipos TypeScript do banco para tipagem end-to-end no frontend.
