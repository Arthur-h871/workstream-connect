# Passo 4 — Autenticação: login

## Objetivo
Conectar o formulário de login existente ao Supabase Auth via `auth.service.ts`. O usuário deve conseguir entrar com e-mail e senha reais e ser redirecionado ao dashboard. Erros de credenciais devem ser exibidos no formulário.

---

## Contexto

O formulário em `src/routes/login.tsx` já existe com os campos de e-mail e senha. Hoje o `onSubmit` apenas navega para `/dashboard` sem validar nada. Este passo substitui esse comportamento por uma chamada real ao Supabase Auth.

---

## Passo a passo

1. Criar `backend/api/supabase.ts` com a instância do cliente Supabase
   - Ler `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` das variáveis de ambiente
   - Exportar a instância como `supabase`

2. Criar `backend/api/services/auth.service.ts`
   - Implementar e exportar a função `signIn(email: string, password: string)`
   - A função chama `supabase.auth.signInWithPassword` e retorna o resultado

3. Atualizar `src/routes/login.tsx`
   - Adicionar estado de loading (`isLoading`) e erro (`error`)
   - No `onSubmit`: chamar `signIn(email, senha)`
   - Se houver erro: exibir mensagem no formulário (não alert, não console)
   - Se sucesso: navegar para `/dashboard`
   - Desabilitar o botão e os campos enquanto `isLoading` for true

4. Testar manualmente:
   - Criar um usuário de teste no Supabase (Authentication → Users → Invite user)
   - Tentar login com credenciais corretas → deve ir ao dashboard
   - Tentar login com senha errada → deve exibir erro no formulário
   - Tentar login com e-mail inexistente → deve exibir erro no formulário

---

## Requisitos para considerar concluído

- [ ] `backend/api/supabase.ts` criado e exportando o cliente
- [ ] `backend/api/services/auth.service.ts` criado com a função `signIn`
- [ ] Login com credenciais válidas redireciona para `/dashboard`
- [ ] Login com credenciais inválidas exibe mensagem de erro visível no formulário
- [ ] Botão fica desabilitado durante o loading
- [ ] Nenhuma credencial hardcoded no código

---

## O que não fazer

- Não usar `alert()` ou `console.error()` para exibir erros — a mensagem deve aparecer na UI
- Não navegar para `/dashboard` antes de confirmar que o login teve sucesso
- Não importar `supabase` diretamente no componente — usar apenas `signIn` do service
- Não tratar "Esqueci minha senha" neste passo — fica para o Passo 15
