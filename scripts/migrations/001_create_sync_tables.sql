-- 001_create_sync_tables.sql
-- Create chats table
CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  url_id TEXT UNIQUE,
  description TEXT,
  messages JSONB NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB
);

-- Index on updated_at for efficient sync queries
CREATE INDEX IF NOT EXISTS idx_chats_updated_at ON chats (updated_at);

-- Create snapshots table
CREATE TABLE IF NOT EXISTS snapshots (
  chat_id TEXT PRIMARY KEY REFERENCES chats(id) ON DELETE CASCADE,
  chat_index TEXT NOT NULL,
  files JSONB NOT NULL,
  summary TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index on updated_at for efficient sync queries
CREATE INDEX IF NOT EXISTS idx_snapshots_updated_at ON snapshots (updated_at);