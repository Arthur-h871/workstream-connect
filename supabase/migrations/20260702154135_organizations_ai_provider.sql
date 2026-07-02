-- supabase/migrations/20260702154135_organizations_ai_provider.sql
-- Torna o provedor de LLM usado pra gerar apontamentos configurável por
-- organização. Default 'gemini' vale pra orgs existentes e novas — decisão
-- explícita do produto, não um valor de transição.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS ai_provider TEXT NOT NULL DEFAULT 'gemini'
    CHECK (ai_provider IN ('anthropic', 'gemini'));
