-- Canvas (one per user)
CREATE TABLE note_canvases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Blocks on canvas
CREATE TABLE note_blocks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  canvas_id UUID NOT NULL REFERENCES note_canvases(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'text',
  content JSONB NOT NULL DEFAULT '{}',
  position_x FLOAT NOT NULL DEFAULT 0,
  position_y FLOAT NOT NULL DEFAULT 0,
  width FLOAT NOT NULL DEFAULT 280,
  height FLOAT NOT NULL DEFAULT 180,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Arrow connections between blocks
CREATE TABLE note_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  canvas_id UUID NOT NULL REFERENCES note_canvases(id) ON DELETE CASCADE,
  source_block_id UUID NOT NULL REFERENCES note_blocks(id) ON DELETE CASCADE,
  target_block_id UUID NOT NULL REFERENCES note_blocks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Free drawing paths
CREATE TABLE note_drawings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  canvas_id UUID NOT NULL REFERENCES note_canvases(id) ON DELETE CASCADE,
  path_data TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#000000',
  stroke_width FLOAT NOT NULL DEFAULT 2,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Triggers for updated_at
CREATE TRIGGER touch_note_canvases_updated_at
  BEFORE UPDATE ON note_canvases
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER touch_note_blocks_updated_at
  BEFORE UPDATE ON note_blocks
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Indexes
CREATE INDEX ON note_blocks(canvas_id);
CREATE INDEX ON note_blocks(user_id);
CREATE INDEX ON note_connections(canvas_id);
CREATE INDEX ON note_drawings(canvas_id);

-- RLS
ALTER TABLE note_canvases ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_drawings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_select" ON note_canvases FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "owner_insert" ON note_canvases FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "owner_update" ON note_canvases FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "owner_delete" ON note_canvases FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "owner_select" ON note_blocks FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "owner_insert" ON note_blocks FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "owner_update" ON note_blocks FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "owner_delete" ON note_blocks FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "owner_select" ON note_connections FOR SELECT
  USING (canvas_id IN (SELECT id FROM note_canvases WHERE user_id = auth.uid()));
CREATE POLICY "owner_insert" ON note_connections FOR INSERT
  WITH CHECK (canvas_id IN (SELECT id FROM note_canvases WHERE user_id = auth.uid()));
CREATE POLICY "owner_delete" ON note_connections FOR DELETE
  USING (canvas_id IN (SELECT id FROM note_canvases WHERE user_id = auth.uid()));

CREATE POLICY "owner_select" ON note_drawings FOR SELECT
  USING (canvas_id IN (SELECT id FROM note_canvases WHERE user_id = auth.uid()));
CREATE POLICY "owner_insert" ON note_drawings FOR INSERT
  WITH CHECK (canvas_id IN (SELECT id FROM note_canvases WHERE user_id = auth.uid()));
CREATE POLICY "owner_delete" ON note_drawings FOR DELETE
  USING (canvas_id IN (SELECT id FROM note_canvases WHERE user_id = auth.uid()));;
