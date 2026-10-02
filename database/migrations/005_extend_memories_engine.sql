-- Extend memories for full Memory Engine schema.
-- Vector dimensions are a deployment concern (must match EMBEDDING_DIMENSIONS /
-- EmbeddingProvider.dimensions). Business logic never hardcodes the size.

ALTER TABLE memories
  ADD COLUMN IF NOT EXISTS character_id TEXT,
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'fact',
  ADD COLUMN IF NOT EXISTS importance REAL NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS confidence REAL NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS source_message_id UUID REFERENCES messages(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'memories_type_check'
  ) THEN
    ALTER TABLE memories
      ADD CONSTRAINT memories_type_check
      CHECK (type IN (
        'fact',
        'preference',
        'event',
        'relationship',
        'character_state',
        'world_information',
        'important_event'
      ));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'memories_importance_check'
  ) THEN
    ALTER TABLE memories
      ADD CONSTRAINT memories_importance_check
      CHECK (importance >= 0 AND importance <= 1);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'memories_confidence_check'
  ) THEN
    ALTER TABLE memories
      ADD CONSTRAINT memories_confidence_check
      CHECK (confidence >= 0 AND confidence <= 1);
  END IF;
END $$;

-- pgvector HNSW requires explicit dimensions. Keep in sync with EMBEDDING_DIMENSIONS.
DROP INDEX IF EXISTS memories_embedding_hnsw_idx;

ALTER TABLE memories
  ALTER COLUMN embedding TYPE vector(384)
  USING CASE
    WHEN embedding IS NULL THEN NULL
    ELSE embedding::vector(384)
  END;

CREATE INDEX IF NOT EXISTS memories_embedding_hnsw_idx
  ON memories
  USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS memories_character_id_idx ON memories (character_id);
CREATE INDEX IF NOT EXISTS memories_type_idx ON memories (type);
CREATE INDEX IF NOT EXISTS memories_importance_idx ON memories (importance DESC);
CREATE INDEX IF NOT EXISTS memories_source_message_id_idx ON memories (source_message_id);
