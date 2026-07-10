-- Allow org admins to update ai_provider for their own organization.
-- Without this policy, updateOrgAiProvider silently no-ops even for authorized users.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organizations'
      AND policyname = 'Admin atualiza ai_provider da org'
  ) THEN
    CREATE POLICY "Admin atualiza ai_provider da org"
      ON organizations
      FOR UPDATE
      USING (id = get_my_org_id() AND is_admin())
      WITH CHECK (id = get_my_org_id() AND is_admin());
  END IF;
END $$;
