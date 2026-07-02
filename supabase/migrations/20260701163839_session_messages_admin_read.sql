-- session_messages só tinha a policy de dono (session_messages_owner_all).
-- As tabelas irmãs (capture_sessions, screenshots, apontamentos) também dão
-- leitura de admin da org; sem isso, um admin consegue ver os prints e o
-- apontamento gerado de uma sessão monitorada, mas não o chat que originou
-- o rascunho. Alinha o acesso ao mesmo padrão.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'session_messages'
      AND policyname = 'Admin lê mensagens de sessão da org'
  ) THEN
    CREATE POLICY "Admin lê mensagens de sessão da org"
      ON session_messages
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM capture_sessions cs
          WHERE cs.id = session_messages.session_id
            AND cs.organization_id = get_my_org_id()
        )
        AND is_admin()
      );
  END IF;
END $$;
