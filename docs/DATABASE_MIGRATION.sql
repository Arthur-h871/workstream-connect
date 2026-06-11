-- ============================================================
-- WORKSTREAM CONNECT — Migration inicial
-- Supabase / PostgreSQL
-- ============================================================

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE user_role          AS ENUM ('master', 'tenant_admin', 'tenant_user');
CREATE TYPE session_status     AS ENUM ('active', 'paused', 'stopped');
CREATE TYPE task_status        AS ENUM ('queued', 'in_progress', 'completed');
CREATE TYPE project_status     AS ENUM ('active', 'closed');
CREATE TYPE linked_task_status AS ENUM ('started', 'concluded');
CREATE TYPE notification_type  AS ENUM ('new_org_task', 'task_assigned', 'member_request', 'member_accepted');

-- member_request  → enviada aos admins quando novo usuário pede entrada
-- member_accepted → enviada ao usuário quando admin aceita o pedido

-- ============================================================
-- 1. ORGANIZATIONS
-- Criada pelo master antes de qualquer usuário.
-- code (6 chars) é compartilhado pelo tenant_admin com novos membros.
-- ============================================================
CREATE TABLE organizations (
  id                            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                          TEXT        NOT NULL,
  code                          CHAR(6)     NOT NULL UNIQUE,
  retention_days                INT         NOT NULL DEFAULT 30,
  removed_member_retention_days INT         NOT NULL DEFAULT 30,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. MEMBER_REQUESTS
-- Pedido de entrada pendente. Usuário autenticado mas sem profile.
-- Deletado quando admin aceita (profile é criado) ou rejeita (auth.users deletado via Edge Function).
-- ============================================================
CREATE TABLE member_requests (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name       TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

-- ============================================================
-- 3. PROFILES  (extends auth.users)
-- Criado pelo admin ao aceitar um member_request.
-- ============================================================
CREATE TABLE profiles (
  id              UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  role            user_role   NOT NULL DEFAULT 'tenant_user',
  full_name       TEXT        NOT NULL,
  avatar_url      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3. USER SETTINGS  (configurações do agente Python por usuário)
-- ============================================================
CREATE TABLE user_settings (
  user_id               UUID        PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  capture_interval_sec  INT         NOT NULL DEFAULT 30,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 4. CAPTURE_SESSIONS
-- ============================================================
CREATE TABLE capture_sessions (
  id               UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID           NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  organization_id  UUID           NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status           session_status NOT NULL DEFAULT 'active',
  started_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  paused_at        TIMESTAMPTZ,
  stopped_at       TIMESTAMPTZ,
  screenshot_count INT            NOT NULL DEFAULT 0,

  CONSTRAINT valid_paused  CHECK (paused_at  IS NULL OR status IN ('paused', 'stopped')),
  CONSTRAINT valid_stopped CHECK (stopped_at IS NULL OR status = 'stopped')
);

-- ============================================================
-- 5. SCREENSHOTS
-- deleted_at: soft delete para curação antes de gerar apontamento.
-- ============================================================
CREATE TABLE screenshots (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id      UUID        NOT NULL REFERENCES capture_sessions(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  captured_at     TIMESTAMPTZ NOT NULL,
  storage_path    TEXT        NOT NULL,
  file_size_bytes INT         NOT NULL,
  deleted_at      TIMESTAMPTZ             -- NULL = ativo, NOT NULL = excluído
);

-- ============================================================
-- 6. APONTAMENTOS
-- session_id opcional: apontamento pode ser criado manualmente.
-- ============================================================
CREATE TABLE apontamentos (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  organization_id UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  session_id      UUID         REFERENCES capture_sessions(id) ON DELETE SET NULL,
  date            DATE         NOT NULL DEFAULT CURRENT_DATE,
  content         TEXT         NOT NULL DEFAULT '',
  hours_worked    NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 7. PERSONAL_TASKS
-- Tarefas privadas — ninguém além do usuário pode ver.
-- priority: menor valor = maior prioridade (drag-and-drop).
-- ============================================================
CREATE TABLE personal_tasks (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  description TEXT,
  status      task_status NOT NULL DEFAULT 'queued',
  priority    INT         NOT NULL DEFAULT 0,
  due_date    DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 8. PERSONAL_TASK_DEPENDENCIES
-- ============================================================
CREATE TABLE personal_task_dependencies (
  task_id       UUID NOT NULL REFERENCES personal_tasks(id) ON DELETE CASCADE,
  depends_on_id UUID NOT NULL REFERENCES personal_tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, depends_on_id),
  CONSTRAINT no_self_dep CHECK (task_id != depends_on_id)
);

-- ============================================================
-- 9. PROJECTS
-- Criados pelo tenant_admin.
-- ============================================================
CREATE TABLE projects (
  id              UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID           NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by      UUID           NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  name            TEXT           NOT NULL,
  description     TEXT,
  color           CHAR(7)        NOT NULL DEFAULT '#14B8A6',
  status          project_status NOT NULL DEFAULT 'active',
  due_date        DATE,
  created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 10. ORG_TASKS
-- Tarefas da organização — visíveis por todos os membros.
-- note: campo livre editável por qualquer membro.
-- ============================================================
CREATE TABLE org_tasks (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id      UUID        REFERENCES projects(id) ON DELETE SET NULL,
  created_by      UUID        NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  assigned_to     UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  title           TEXT        NOT NULL,
  description     TEXT,
  status          task_status NOT NULL DEFAULT 'queued',
  priority        INT         NOT NULL DEFAULT 0,
  due_date        DATE,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 11. ORG_TASK_DEPENDENCIES
-- ============================================================
CREATE TABLE org_task_dependencies (
  task_id       UUID NOT NULL REFERENCES org_tasks(id) ON DELETE CASCADE,
  depends_on_id UUID NOT NULL REFERENCES org_tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, depends_on_id),
  CONSTRAINT no_self_dep CHECK (task_id != depends_on_id)
);

-- ============================================================
-- 12. APONTAMENTO_PERSONAL_TASKS  (apontamento ↔ personal_task  N:M)
-- status: se a tarefa foi iniciada ou concluída naquele dia.
-- ============================================================
CREATE TABLE apontamento_personal_tasks (
  id               UUID               PRIMARY KEY DEFAULT uuid_generate_v4(),
  apontamento_id   UUID               NOT NULL REFERENCES apontamentos(id) ON DELETE CASCADE,
  personal_task_id UUID               NOT NULL REFERENCES personal_tasks(id) ON DELETE CASCADE,
  status           linked_task_status NOT NULL DEFAULT 'started',
  UNIQUE (apontamento_id, personal_task_id)
);

-- ============================================================
-- 13. APONTAMENTO_ORG_TASKS  (apontamento ↔ org_task  N:M)
-- ============================================================
CREATE TABLE apontamento_org_tasks (
  id             UUID               PRIMARY KEY DEFAULT uuid_generate_v4(),
  apontamento_id UUID               NOT NULL REFERENCES apontamentos(id) ON DELETE CASCADE,
  org_task_id    UUID               NOT NULL REFERENCES org_tasks(id) ON DELETE CASCADE,
  status         linked_task_status NOT NULL DEFAULT 'started',
  UNIQUE (apontamento_id, org_task_id)
);

-- ============================================================
-- 14. NOTIFICATIONS
-- reference_id: aponta para a entidade relacionada (ex: org_task.id).
-- read_at NULL = não lida.
-- ============================================================
CREATE TABLE notifications (
  id             UUID              PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID              NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type           notification_type NOT NULL,
  title          TEXT              NOT NULL,
  body           TEXT              NOT NULL,
  reference_id   UUID,
  reference_type TEXT,
  read_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

-- profiles
CREATE INDEX idx_profiles_org           ON profiles(organization_id);

-- capture_sessions
CREATE INDEX idx_sessions_user          ON capture_sessions(user_id);
CREATE INDEX idx_sessions_org           ON capture_sessions(organization_id);
CREATE INDEX idx_sessions_status        ON capture_sessions(status);

-- screenshots
CREATE INDEX idx_screenshots_session    ON screenshots(session_id);
CREATE INDEX idx_screenshots_user       ON screenshots(user_id);
CREATE INDEX idx_screenshots_org        ON screenshots(organization_id);
CREATE INDEX idx_screenshots_captured   ON screenshots(captured_at);
CREATE INDEX idx_screenshots_active     ON screenshots(deleted_at) WHERE deleted_at IS NULL;

-- apontamentos
CREATE INDEX idx_apontamentos_user      ON apontamentos(user_id);
CREATE INDEX idx_apontamentos_org       ON apontamentos(organization_id);
CREATE INDEX idx_apontamentos_date      ON apontamentos(date);
CREATE INDEX idx_apontamentos_session   ON apontamentos(session_id);

-- personal_tasks
CREATE INDEX idx_personal_tasks_user     ON personal_tasks(user_id);
CREATE INDEX idx_personal_tasks_priority ON personal_tasks(user_id, priority);

-- projects
CREATE INDEX idx_projects_org    ON projects(organization_id);
CREATE INDEX idx_projects_status ON projects(organization_id, status);

-- org_tasks
CREATE INDEX idx_org_tasks_org      ON org_tasks(organization_id);
CREATE INDEX idx_org_tasks_project  ON org_tasks(project_id);
CREATE INDEX idx_org_tasks_assigned ON org_tasks(assigned_to);
CREATE INDEX idx_org_tasks_priority ON org_tasks(organization_id, priority);
CREATE INDEX idx_org_tasks_due      ON org_tasks(due_date) WHERE due_date IS NOT NULL;

-- notifications
CREATE INDEX idx_notifications_user   ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, created_at) WHERE read_at IS NULL;

-- ============================================================
-- RLS HELPER FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION get_my_org_id()
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT organization_id FROM profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS user_role
LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT role IN ('tenant_admin', 'master') FROM profiles WHERE id = auth.uid()
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE organizations              ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_requests            ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings              ENABLE ROW LEVEL SECURITY;
ALTER TABLE capture_sessions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE screenshots                ENABLE ROW LEVEL SECURITY;
ALTER TABLE apontamentos               ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_tasks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_task_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_tasks                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_task_dependencies      ENABLE ROW LEVEL SECURITY;
ALTER TABLE apontamento_personal_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE apontamento_org_tasks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications              ENABLE ROW LEVEL SECURITY;

-- organizations
CREATE POLICY "Membros leem sua própria org"
  ON organizations FOR SELECT
  USING (id = get_my_org_id());

-- member_requests
CREATE POLICY "Usuário lê o próprio request"
  ON member_requests FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Admin lê requests da própria org"
  ON member_requests FOR SELECT
  USING (organization_id = get_my_org_id() AND is_admin());

CREATE POLICY "Inserção via trigger de signup"
  ON member_requests FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admin deleta request ao aceitar ou rejeitar"
  ON member_requests FOR DELETE
  USING (organization_id = get_my_org_id() AND is_admin());

-- profiles
CREATE POLICY "Membros leem perfis da mesma org"
  ON profiles FOR SELECT
  USING (organization_id = get_my_org_id());

CREATE POLICY "Usuário atualiza seu próprio perfil"
  ON profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND organization_id = get_my_org_id()
    AND role = (SELECT role FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Admin atualiza roles de membros da org"
  ON profiles FOR UPDATE
  USING (
    organization_id = get_my_org_id()
    AND is_admin()
    AND id != auth.uid()
  );

CREATE POLICY "Inserção via trigger de signup"
  ON profiles FOR INSERT
  WITH CHECK (true);

-- user_settings
CREATE POLICY "Usuário gerencia próprias configurações"
  ON user_settings FOR ALL
  USING (user_id = auth.uid());

-- capture_sessions
CREATE POLICY "Usuário gerencia suas próprias sessões"
  ON capture_sessions FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Admin lê sessões da org"
  ON capture_sessions FOR SELECT
  USING (organization_id = get_my_org_id() AND is_admin());

-- screenshots
CREATE POLICY "Usuário gerencia seus próprios prints"
  ON screenshots FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Admin lê prints da org"
  ON screenshots FOR SELECT
  USING (organization_id = get_my_org_id() AND is_admin());

-- apontamentos
CREATE POLICY "Usuário gerencia seus próprios apontamentos"
  ON apontamentos FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Admin lê apontamentos da org"
  ON apontamentos FOR SELECT
  USING (organization_id = get_my_org_id() AND is_admin());

-- personal_tasks
CREATE POLICY "Usuário gerencia apenas suas tarefas pessoais"
  ON personal_tasks FOR ALL
  USING (user_id = auth.uid());

-- personal_task_dependencies
CREATE POLICY "Usuário gerencia dependências das próprias tarefas"
  ON personal_task_dependencies FOR ALL
  USING (
    task_id IN (SELECT id FROM personal_tasks WHERE user_id = auth.uid())
  );

-- projects
CREATE POLICY "Membros leem projetos da org"
  ON projects FOR SELECT
  USING (organization_id = get_my_org_id());

CREATE POLICY "Admin gerencia projetos da org"
  ON projects FOR ALL
  USING (organization_id = get_my_org_id() AND is_admin());

-- org_tasks
CREATE POLICY "Membros leem tarefas da org"
  ON org_tasks FOR SELECT
  USING (organization_id = get_my_org_id());

CREATE POLICY "Admin gerencia tarefas da org"
  ON org_tasks FOR ALL
  USING (organization_id = get_my_org_id() AND is_admin());

CREATE POLICY "Membro atualiza status e nota de tarefas"
  ON org_tasks FOR UPDATE
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() = 'tenant_user'
  )
  WITH CHECK (
    organization_id = get_my_org_id()
    AND (
      assigned_to = auth.uid()
      OR assigned_to IS NOT DISTINCT FROM (SELECT assigned_to FROM org_tasks WHERE id = org_tasks.id)
    )
  );

-- org_task_dependencies
CREATE POLICY "Membros leem dependências das tarefas da org"
  ON org_task_dependencies FOR SELECT
  USING (
    task_id IN (SELECT id FROM org_tasks WHERE organization_id = get_my_org_id())
  );

CREATE POLICY "Admin gerencia dependências"
  ON org_task_dependencies FOR ALL
  USING (
    task_id IN (SELECT id FROM org_tasks WHERE organization_id = get_my_org_id())
    AND is_admin()
  );

-- apontamento_personal_tasks
CREATE POLICY "Usuário gerencia vínculos de tarefas pessoais"
  ON apontamento_personal_tasks FOR ALL
  USING (
    apontamento_id IN (SELECT id FROM apontamentos WHERE user_id = auth.uid())
  );

-- apontamento_org_tasks
CREATE POLICY "Usuário gerencia vínculos de tarefas da org"
  ON apontamento_org_tasks FOR ALL
  USING (
    apontamento_id IN (SELECT id FROM apontamentos WHERE user_id = auth.uid())
  );

CREATE POLICY "Admin lê todos os vínculos da org"
  ON apontamento_org_tasks FOR SELECT
  USING (
    apontamento_id IN (
      SELECT id FROM apontamentos WHERE organization_id = get_my_org_id()
    )
    AND is_admin()
  );

-- notifications
CREATE POLICY "Usuário lê e atualiza suas próprias notificações"
  ON notifications FOR ALL
  USING (user_id = auth.uid());

-- ============================================================
-- TRIGGER: criar member_request após signup
-- Resolve organization_id pelo code passado no metadata.
-- Usuário fica sem profile até o admin aceitar.
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  org_id UUID;
BEGIN
  SELECT id INTO org_id
  FROM organizations
  WHERE code = (NEW.raw_user_meta_data->>'organization_code');

  IF org_id IS NULL THEN
    RAISE EXCEPTION 'Código de organização inválido';
  END IF;

  INSERT INTO member_requests (user_id, organization_id, full_name)
  VALUES (
    NEW.id,
    org_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );

  -- Notifica todos os admins da organização sobre o novo pedido
  INSERT INTO notifications (user_id, type, title, body, reference_id, reference_type)
  SELECT
    p.id,
    'member_request',
    'Novo pedido de entrada',
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email) || ' quer entrar na organização',
    NEW.id,
    'member_request'
  FROM profiles p
  WHERE p.organization_id = org_id
    AND p.role IN ('tenant_admin', 'master');

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- TRIGGER: atualizar updated_at automaticamente
-- ============================================================
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER touch_profiles           BEFORE UPDATE ON profiles           FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER touch_user_settings      BEFORE UPDATE ON user_settings      FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER touch_apontamentos       BEFORE UPDATE ON apontamentos       FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER touch_personal_tasks     BEFORE UPDATE ON personal_tasks     FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER touch_projects           BEFORE UPDATE ON projects           FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER touch_org_tasks          BEFORE UPDATE ON org_tasks          FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ============================================================
-- TRIGGER: manter screenshot_count sincronizado
-- ============================================================
CREATE OR REPLACE FUNCTION update_session_screenshot_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER AS $$
DECLARE
  target_session_id UUID;
BEGIN
  target_session_id := COALESCE(NEW.session_id, OLD.session_id);
  UPDATE capture_sessions
  SET screenshot_count = (
    SELECT COUNT(*) FROM screenshots
    WHERE session_id = target_session_id AND deleted_at IS NULL
  )
  WHERE id = target_session_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER screenshots_count_update
  AFTER INSERT OR DELETE OR UPDATE OF deleted_at ON screenshots
  FOR EACH ROW EXECUTE FUNCTION update_session_screenshot_count();

-- ============================================================
-- STORAGE BUCKETS  (executar no dashboard ou via Supabase CLI)
-- ============================================================

-- Screenshots (privado)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('screenshots', 'screenshots', false);
--
-- CREATE POLICY "users upload own screenshots"
--   ON storage.objects FOR INSERT
--   WITH CHECK (bucket_id = 'screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);
--
-- CREATE POLICY "users read own screenshots"
--   ON storage.objects FOR SELECT
--   USING (bucket_id = 'screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);
--
-- CREATE POLICY "users delete own screenshots"
--   ON storage.objects FOR DELETE
--   USING (bucket_id = 'screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Avatars (público para leitura)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);
--
-- CREATE POLICY "users upload own avatar"
--   ON storage.objects FOR INSERT
--   WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = storage.filename(name));
--
-- CREATE POLICY "users update own avatar"
--   ON storage.objects FOR UPDATE
--   USING (bucket_id = 'avatars' AND auth.uid()::text = storage.filename(name));
