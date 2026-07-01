-- Monitoramento por prints da tela (captura via navegador) — schema incremental.
-- As tabelas base (capture_sessions, screenshots, apontamentos, notifications, etc.)
-- já existem no remoto sem migration de criação local; este arquivo só adiciona
-- o que esta feature precisa.

ALTER TABLE screenshots
  ADD COLUMN IF NOT EXISTS monitor_index INTEGER NOT NULL DEFAULT 0;

ALTER TABLE capture_sessions
  ADD COLUMN IF NOT EXISTS pending_task_links JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS session_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES capture_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS session_messages_session_id_idx
  ON session_messages(session_id);

ALTER TABLE session_messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'session_messages'
      AND policyname = 'session_messages_owner_all'
  ) THEN
    CREATE POLICY session_messages_owner_all
      ON session_messages
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM capture_sessions cs
          WHERE cs.id = session_messages.session_id
            AND cs.user_id = auth.uid()
        )
      );
  END IF;
END $$;
