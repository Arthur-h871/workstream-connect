# Passo 3 — Instalar e inicializar o cliente Supabase

## Objetivo
Ter o pacote `@supabase/supabase-js` instalado e uma instância do cliente disponível para toda a aplicação, pronta para ser usada nos próximos passos.

---

## Contexto

O cliente Supabase fica em `backend/api/supabase.ts` — junto aos services que o consomem. O frontend nunca instancia o cliente diretamente; ele acessa o Supabase apenas através dos services.

---

## Passo a passo

1. Instalar o pacote:
   ```bash
   npm install @supabase/supabase-js
   ```
2. Criar a pasta `backend/api/` na raiz do repositório
3. Criar o arquivo `backend/api/supabase.ts` com a instância do cliente
4. O cliente deve ler as variáveis de ambiente configuradas no Passo 1
5. Verificar que a aplicação ainda compila e roda normalmente após a instalação (`npm run dev`)

---

## Requisitos para considerar concluído

- [ ] `@supabase/supabase-js` listado em `dependencies` no `package.json`
- [ ] Pasta `backend/api/` criada na raiz do repositório
- [ ] Arquivo `backend/api/supabase.ts` criado e exportando o cliente
- [ ] `npm run dev` executa sem erros
- [ ] Nenhuma chave hardcoded no código — apenas leitura de variáveis de ambiente

---

## O que não fazer

- Não criar o cliente em `src/lib/supabase.ts` — a localização correta é `backend/api/supabase.ts`
- Não criar múltiplas instâncias do cliente em arquivos diferentes — um único `supabase.ts` importado por todos os services
- Não importar o cliente diretamente nos componentes do frontend — apenas os services fazem isso
- Não usar `SUPABASE_SERVICE_ROLE_KEY` neste cliente — somente a `anon key`
