# Passo 2 — Executar a migration do banco de dados

## Objetivo
Criar toda a estrutura do banco de dados no projeto Supabase: tabelas, ENUMs, funções, triggers, políticas RLS e buckets de Storage.

---

## Passo a passo

1. No painel do projeto Supabase, acessar **SQL Editor**
2. Abrir o arquivo `docs/DATABASE_MIGRATION.sql` do repositório
3. Copiar o conteúdo completo e colar no SQL Editor
4. Executar o script
5. Verificar no **Table Editor** que as tabelas foram criadas:
   - `organizations`, `profiles`, `user_settings`
   - `capture_sessions`, `screenshots`
   - `apontamentos`, `apontamento_personal_tasks`, `apontamento_org_tasks`
   - `personal_tasks`, `personal_task_dependencies`
   - `projects`, `org_tasks`, `org_task_dependencies`
   - `notifications`
6. Verificar em **Database → Functions** que as funções foram criadas:
   - `get_my_org_id`, `get_my_role`, `is_admin`
   - `handle_new_user`, `touch_updated_at`, `update_session_screenshot_count`
7. Verificar em **Storage** que os buckets foram criados:
   - `screenshots` (privado)
   - `avatars` (público)
8. Criar ao menos uma organização de teste via SQL Editor para uso nos próximos passos:
   ```sql
   INSERT INTO organizations (name, code) VALUES ('Org Teste', 'TEST01');
   ```

---

## Requisitos para considerar concluído

- [ ] Todas as 14 tabelas criadas sem erros
- [ ] Os 6 ENUMs criados (`user_role`, `session_status`, `task_status`, `project_status`, `linked_task_status`, `notification_type`)
- [ ] As 3 funções helper e os 3 triggers criados
- [ ] Os 2 buckets de Storage criados com as visibilidades corretas
- [ ] RLS habilitado em todas as tabelas (verificar via **Authentication → Policies**)
- [ ] Ao menos uma organização de teste no banco

---

## O que não fazer

- Não executar o script em partes — rodar completo de uma vez para evitar dependências faltando
- Não alterar o script antes de rodar; ajustes devem ser feitos via novas migrations
- Não desativar RLS em nenhuma tabela para "facilitar testes"
