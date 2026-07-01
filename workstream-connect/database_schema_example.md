-- ============================================================
-- Monitorar — Schema inicial
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
CREATE TYPE notification_type  AS ENUM ('new_org_task', 'task_assigned');


-- ============================================================
-- TABELAS
-- ============================================================

-- ------------------------------------------------------------
-- organizations
-- Criada pelo master antes de qualquer usuário.
-- O code (6 chars) é compartilhado pelo tenant_admin com novos membros.
-- ------------------------------------------------------------
CREATE TABLE organizations (
  id                              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                            TEXT        NOT NULL,
  code                            CHAR(6)     NOT NULL UNIQUE,
  retention_days                  INT         NOT NULL DEFAULT 30,     -- retenção de prints em dias
  removed_member_retention_days   INT         NOT NULL DEFAULT 30,     -- dados de membro removido
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ------------------------------------------------------------
-- profiles
-- Estende auth.users do Supabase.
-- Criado via trigger após signup (ver abaixo).
-- ------------------------------------------------------------
CREATE TABLE profiles (
  id              UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  role            user_role   NOT NULL DEFAULT 'tenant_user',
  full_name       TEXT        NOT NULL,
  avatar_url      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ------------------------------------------------------------
-- capture_sessions
-- Uma sessão de captura de tela iniciada pelo agente Python.
-- ------------------------------------------------------------
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


-- ------------------------------------------------------------
-- screenshots
-- Prints individuais de uma sessão.
-- deleted_at = soft delete feito pelo usuário ao curar o conjunto
-- antes de gerar o apontamento.
-- ------------------------------------------------------------
CREATE TABLE screenshots (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id      UUID        NOT NULL REFERENCES capture_sessions(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  captured_at     TIMESTAMPTZ NOT NULL,
  storage_path    TEXT        NOT NULL,   -- path no Supabase Storage
  file_size_bytes INT         NOT NULL,
  deleted_at      TIMESTAMPTZ             -- NULL = ativo, NOT NULL = excluído pelo usuário
);


-- ------------------------------------------------------------
-- apontamentos
-- Registro de trabalho de um dia.
-- session_id é opcional (apontamento pode ser criado manualmente).
-- ------------------------------------------------------------
CREATE TABLE apontamentos (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  organization_id UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  session_id      UUID         REFERENCES capture_sessions(id) ON DELETE SET NULL,
  date            DATE         NOT NULL,
  content         TEXT         NOT NULL DEFAULT '',
  hours_worked    NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);


-- ------------------------------------------------------------
-- personal_tasks
-- Tarefas privadas do usuário — ninguém mais pode ver.
-- priority: inteiro crescente; menor valor = maior prioridade.
-- ------------------------------------------------------------
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


-- ------------------------------------------------------------
-- personal_task_dependencies
-- Uma tarefa pessoal pode depender de outras tarefas pessoais
-- do mesmo usuário.
-- ------------------------------------------------------------
CREATE TABLE personal_task_dependencies (
  task_id       UUID NOT NULL REFERENCES personal_tasks(id) ON DELETE CASCADE,
  depends_on_id UUID NOT NULL REFERENCES personal_tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, depends_on_id),
  CONSTRAINT no_self_dep CHECK (task_id != depends_on_id)
);


-- ------------------------------------------------------------
-- projects
-- Agrupamentos de tarefas da organização.
-- Criados pelo tenant_admin.
-- ------------------------------------------------------------
CREATE TABLE projects (
  id              UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID           NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by      UUID           NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  name            TEXT           NOT NULL,
  description     TEXT,
  color           CHAR(7)        NOT NULL DEFAULT '#14B8A6',  -- hex, ex: '#EA580C'
  status          project_status NOT NULL DEFAULT 'active',
  due_date        DATE,
  created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);


-- ------------------------------------------------------------
-- org_tasks
-- Tarefas da organização — visíveis por todos os membros.
-- Criadas pelo tenant_admin.
-- note: campo livre editável por qualquer membro.
-- priority: inteiro crescente; menor valor = maior prioridade.
-- ------------------------------------------------------------
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


-- ------------------------------------------------------------
-- org_task_dependencies
-- Uma tarefa da org pode depender de outras tarefas da mesma org.
-- ------------------------------------------------------------
CREATE TABLE org_task_dependencies (
  task_id       UUID NOT NULL REFERENCES org_tasks(id) ON DELETE CASCADE,
  depends_on_id UUID NOT NULL REFERENCES org_tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, depends_on_id),
  CONSTRAINT no_self_dep CHECK (task_id != depends_on_id)
);


-- ------------------------------------------------------------
-- apontamento_personal_tasks
-- Vínculo entre um apontamento e tarefas pessoais.
-- status: se a tarefa foi iniciada ou concluída naquele dia.
-- ------------------------------------------------------------
CREATE TABLE apontamento_personal_tasks (
  id               UUID               PRIMARY KEY DEFAULT uuid_generate_v4(),
  apontamento_id   UUID               NOT NULL REFERENCES apontamentos(id) ON DELETE CASCADE,
  personal_task_id UUID               NOT NULL REFERENCES personal_tasks(id) ON DELETE CASCADE,
  status           linked_task_status NOT NULL DEFAULT 'started',
  UNIQUE (apontamento_id, personal_task_id)
);


-- ------------------------------------------------------------
-- apontamento_org_tasks
-- Vínculo entre um apontamento e tarefas da organização.
-- ------------------------------------------------------------
CREATE TABLE apontamento_org_tasks (
  id             UUID               PRIMARY KEY DEFAULT uuid_generate_v4(),
  apontamento_id UUID               NOT NULL REFERENCES apontamentos(id) ON DELETE CASCADE,
  org_task_id    UUID               NOT NULL REFERENCES org_tasks(id) ON DELETE CASCADE,
  status         linked_task_status NOT NULL DEFAULT 'started',
  UNIQUE (apontamento_id, org_task_id)
);


-- ------------------------------------------------------------
-- notifications
-- Notificações in-app.
-- reference_id aponta para a entidade relacionada (ex: org_task).
-- ------------------------------------------------------------
CREATE TABLE notifications (
  id             UUID              PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID              NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type           notification_type NOT NULL,
  title          TEXT              NOT NULL,
  body           TEXT              NOT NULL,
  reference_id   UUID,             -- ID da entidade relacionada
  reference_type TEXT,             -- 'org_task', etc.
  read_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);


-- ============================================================
-- INDEXES
-- ============================================================

-- profiles
CREATE INDEX idx_profiles_org         ON profiles(organization_id);

-- capture_sessions
CREATE INDEX idx_sessions_user        ON capture_sessions(user_id);
CREATE INDEX idx_sessions_org         ON capture_sessions(organization_id);
CREATE INDEX idx_sessions_status      ON capture_sessions(status);

-- screenshots
CREATE INDEX idx_screenshots_session  ON screenshots(session_id);
CREATE INDEX idx_screenshots_user     ON screenshots(user_id);
CREATE INDEX idx_screenshots_org      ON screenshots(organization_id);
CREATE INDEX idx_screenshots_deleted  ON screenshots(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_screenshots_captured ON screenshots(captured_at);

-- apontamentos
CREATE INDEX idx_apontamentos_user    ON apontamentos(user_id);
CREATE INDEX idx_apontamentos_org     ON apontamentos(organization_id);
CREATE INDEX idx_apontamentos_date    ON apontamentos(date);
CREATE INDEX idx_apontamentos_session ON apontamentos(session_id);

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
CREATE INDEX idx_notifications_user    ON notifications(user_id);
CREATE INDEX idx_notifications_unread  ON notifications(user_id, created_at) WHERE read_at IS NULL;


-- ============================================================
-- FUNÇÕES AUXILIARES PARA RLS
-- ============================================================

-- Retorna o organization_id do usuário autenticado
CREATE OR REPLACE FUNCTION get_my_org_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT organization_id FROM profiles WHERE id = auth.uid()
$$;

-- Retorna o role do usuário autenticado
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS user_role
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$;

-- Verifica se o usuário autenticado é admin ou master na sua org
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT role IN ('tenant_admin', 'master') FROM profiles WHERE id = auth.uid()
$$;


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE organizations              ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles                   ENABLE ROW LEVEL SECURITY;
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


-- ------------------------------------------------------------
-- organizations
-- ------------------------------------------------------------
CREATE POLICY "Membros leem sua própria org"
  ON organizations FOR SELECT
  USING (id = get_my_org_id());

-- Apenas master insere/atualiza orgs (via service role ou funções privilegiadas)


-- ------------------------------------------------------------
-- profiles
-- ------------------------------------------------------------
CREATE POLICY "Membros leem perfis da mesma org"
  ON profiles FOR SELECT
  USING (organization_id = get_my_org_id());

CREATE POLICY "Usuário atualiza seu próprio perfil"
  ON profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND organization_id = get_my_org_id()  -- não pode mudar de org
    AND role = (SELECT role FROM profiles WHERE id = auth.uid())  -- não pode mudar próprio role
  );

CREATE POLICY "Admin atualiza roles de membros da org"
  ON profiles FOR UPDATE
  USING (
    organization_id = get_my_org_id()
    AND is_admin()
    AND id != auth.uid()  -- admin não se atualiza por aqui
  );

CREATE POLICY "Inserção via trigger de signup"
  ON profiles FOR INSERT
  WITH CHECK (true);  -- controlado pelo trigger


-- ------------------------------------------------------------
-- capture_sessions
-- ------------------------------------------------------------
CREATE POLICY "Usuário gerencia suas próprias sessões"
  ON capture_sessions FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Admin lê sessões da org"
  ON capture_sessions FOR SELECT
  USING (organization_id = get_my_org_id() AND is_admin());


-- ------------------------------------------------------------
-- screenshots
-- ------------------------------------------------------------
CREATE POLICY "Usuário gerencia suas próprias prints"
  ON screenshots FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Admin lê prints da org"
  ON screenshots FOR SELECT
  USING (organization_id = get_my_org_id() AND is_admin());


-- ------------------------------------------------------------
-- apontamentos
-- ------------------------------------------------------------
CREATE POLICY "Usuário gerencia seus próprios apontamentos"
  ON apontamentos FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Admin lê apontamentos da org"
  ON apontamentos FOR SELECT
  USING (organization_id = get_my_org_id() AND is_admin());


-- ------------------------------------------------------------
-- personal_tasks (estritamente privado)
-- ------------------------------------------------------------
CREATE POLICY "Usuário gerencia apenas suas tarefas pessoais"
  ON personal_tasks FOR ALL
  USING (user_id = auth.uid());


-- ------------------------------------------------------------
-- personal_task_dependencies
-- ------------------------------------------------------------
CREATE POLICY "Usuário gerencia dependências das próprias tarefas"
  ON personal_task_dependencies FOR ALL
  USING (
    task_id IN (SELECT id FROM personal_tasks WHERE user_id = auth.uid())
  );


-- ------------------------------------------------------------
-- projects
-- ------------------------------------------------------------
CREATE POLICY "Membros leem projetos da org"
  ON projects FOR SELECT
  USING (organization_id = get_my_org_id());

CREATE POLICY "Admin gerencia projetos da org"
  ON projects FOR ALL
  USING (organization_id = get_my_org_id() AND is_admin());


-- ------------------------------------------------------------
-- org_tasks
-- ------------------------------------------------------------
CREATE POLICY "Membros leem tarefas da org"
  ON org_tasks FOR SELECT
  USING (organization_id = get_my_org_id());

CREATE POLICY "Admin gerencia tarefas da org"
  ON org_tasks FOR ALL
  USING (organization_id = get_my_org_id() AND is_admin());

-- Tenant_user pode atualizar: status (se assigned_to = si), assigned_to (auto-atribuição), note
CREATE POLICY "Membro atualiza status e nota de tarefas"
  ON org_tasks FOR UPDATE
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() = 'tenant_user'
  )
  WITH CHECK (
    organization_id = get_my_org_id()
    -- Só pode mudar assigned_to se o campo está NULL (auto-atribuição)
    AND (
      assigned_to = auth.uid()
      OR assigned_to IS NOT DISTINCT FROM (SELECT assigned_to FROM org_tasks WHERE id = org_tasks.id)
    )
  );


-- ------------------------------------------------------------
-- org_task_dependencies
-- ------------------------------------------------------------
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


-- ------------------------------------------------------------
-- apontamento_personal_tasks
-- ------------------------------------------------------------
CREATE POLICY "Usuário gerencia vínculos de tarefas pessoais"
  ON apontamento_personal_tasks FOR ALL
  USING (
    apontamento_id IN (SELECT id FROM apontamentos WHERE user_id = auth.uid())
  );


-- ------------------------------------------------------------
-- apontamento_org_tasks
-- ------------------------------------------------------------
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


-- ------------------------------------------------------------
-- notifications
-- ------------------------------------------------------------
CREATE POLICY "Usuário lê e atualiza suas próprias notificações"
  ON notifications FOR ALL
  USING (user_id = auth.uid());


-- ============================================================
-- TRIGGER: criar profile após signup
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  org_id UUID;
BEGIN
  -- Busca org pelo code informado no metadata do signup
  SELECT id INTO org_id
  FROM organizations
  WHERE code = (NEW.raw_user_meta_data->>'organization_code');

  IF org_id IS NULL THEN
    RAISE EXCEPTION 'Código de organização inválido';
  END IF;

  INSERT INTO profiles (id, organization_id, full_name)
  VALUES (
    NEW.id,
    org_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );

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
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER touch_profiles           BEFORE UPDATE ON profiles           FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER touch_apontamentos       BEFORE UPDATE ON apontamentos       FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER touch_personal_tasks     BEFORE UPDATE ON personal_tasks     FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER touch_projects           BEFORE UPDATE ON projects           FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER touch_org_tasks          BEFORE UPDATE ON org_tasks          FOR EACH ROW EXECUTE FUNCTION touch_updated_at();