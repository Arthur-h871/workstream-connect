DELETE FROM note_connections;
DELETE FROM note_drawings;
DELETE FROM note_blocks;
DELETE FROM note_canvases;

ALTER TABLE note_canvases
  DROP CONSTRAINT IF EXISTS note_canvases_user_id_key;

ALTER TABLE note_canvases
  ADD COLUMN IF NOT EXISTS parent_canvas_id UUID REFERENCES note_canvases(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_root BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT 'Canvas',
  ADD COLUMN IF NOT EXISTS icon_type TEXT NOT NULL DEFAULT 'preset',
  ADD COLUMN IF NOT EXISTS icon_value TEXT,
  ADD COLUMN IF NOT EXISTS icon_asset_url TEXT,
  ADD COLUMN IF NOT EXISTS last_opened_at TIMESTAMPTZ;

ALTER TABLE note_blocks
  ADD COLUMN IF NOT EXISTS child_canvas_id UUID REFERENCES note_canvases(id) ON DELETE CASCADE;

ALTER TABLE note_connections
  ADD COLUMN IF NOT EXISTS source_target_type TEXT NOT NULL DEFAULT 'block',
  ADD COLUMN IF NOT EXISTS source_target_id TEXT,
  ADD COLUMN IF NOT EXISTS source_side TEXT NOT NULL DEFAULT 'right',
  ADD COLUMN IF NOT EXISTS source_position_ratio DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS target_target_type TEXT NOT NULL DEFAULT 'block',
  ADD COLUMN IF NOT EXISTS target_target_id TEXT,
  ADD COLUMN IF NOT EXISTS target_side TEXT NOT NULL DEFAULT 'left',
  ADD COLUMN IF NOT EXISTS target_position_ratio DOUBLE PRECISION NOT NULL DEFAULT 0.5;

UPDATE note_connections
SET
  source_target_id = COALESCE(source_target_id, source_block_id::text),
  target_target_id = COALESCE(target_target_id, target_block_id::text)
WHERE source_target_id IS NULL
   OR target_target_id IS NULL;

CREATE INDEX IF NOT EXISTS note_canvases_parent_canvas_id_idx ON note_canvases(parent_canvas_id);
CREATE UNIQUE INDEX IF NOT EXISTS note_canvases_one_root_per_user_idx
  ON note_canvases(user_id)
  WHERE is_root = TRUE;
CREATE INDEX IF NOT EXISTS note_blocks_child_canvas_id_idx ON note_blocks(child_canvas_id);

INSERT INTO storage.buckets (id, name, public)
VALUES ('note-assets', 'note-assets', TRUE)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'note_assets_select'
  ) THEN
    CREATE POLICY note_assets_select
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'note-assets'
        AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'note_assets_insert'
  ) THEN
    CREATE POLICY note_assets_insert
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'note-assets'
        AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'note_assets_update'
  ) THEN
    CREATE POLICY note_assets_update
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'note-assets'
        AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
      )
      WITH CHECK (
        bucket_id = 'note-assets'
        AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'note_assets_delete'
  ) THEN
    CREATE POLICY note_assets_delete
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'note-assets'
        AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
      );
  END IF;
END $$;
