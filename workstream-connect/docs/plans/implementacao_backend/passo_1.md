# Passo 1 — Criar projeto Supabase e configurar variáveis de ambiente

## Objetivo
Ter um projeto Supabase ativo e o repositório local conectado a ele via variáveis de ambiente, pronto para receber a migration.

---

## Passo a passo

1. Acessar [supabase.com](https://supabase.com) e criar uma conta (ou fazer login)
2. Criar uma nova organização (se ainda não existir)
3. Criar um novo projeto dentro da organização
   - Escolher região mais próxima (ex: South America - São Paulo)
   - Definir senha do banco de dados e guardar em local seguro
4. Aguardar o projeto ficar ativo (pode levar ~2 minutos)
5. No painel do projeto, acessar **Project Settings → API**
6. Copiar:
   - `Project URL`
   - `anon public` key
7. Na raiz do repositório, criar o arquivo `.env.local` com as variáveis:
   ```
   VITE_SUPABASE_URL=<Project URL copiado>
   VITE_SUPABASE_ANON_KEY=<anon public key copiada>
   ```
8. Verificar que `.env.local` está listado no `.gitignore` (já está por padrão)

---

## Requisitos para considerar concluído

- [ ] Projeto Supabase criado e com status **Active**
- [ ] Arquivo `.env.local` criado na raiz com as duas variáveis preenchidas
- [ ] `.env.local` **não** commitado no repositório

---

## O que não fazer

- Não usar a `service_role` key no frontend — ela bypassa RLS e expõe dados de todos os usuários
- Não commitar `.env.local` nem as chaves em nenhum arquivo versionado
- Não criar o projeto na região errada (latência alta para usuários brasileiros)
