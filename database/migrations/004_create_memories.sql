-- Long-term memories with pgvector embeddings (384-dim local model).
CREATE TABLE IF NOT EXISTS memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chat_id UUID REFERENCES chats(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  embedding vector(384),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS memories_user_id_idx ON memories (user_id);
CREATE INDEX IF NOT EXISTS memories_chat_id_idx ON memories (chat_id);

-- HNSW index for cosine similarity search (works on empty tables).
CREATE INDEX IF NOT EXISTS memories_embedding_hnsw_idx
  ON memories
  USING hnsw (embedding vector_cosine_ops);
