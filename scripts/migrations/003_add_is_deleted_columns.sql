-- 003_add_is_deleted_columns.sql
-- Add soft-delete flag to chats and snapshots tables

ALTER TABLE IF EXISTS chats
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_chats_is_deleted ON chats (is_deleted);

ALTER TABLE IF EXISTS snapshots
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_snapshots_is_deleted ON snapshots (is_deleted);