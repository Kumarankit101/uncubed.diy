-- Migration: Update snapshots table for file storage
-- Description: Remove files column and add file_references and storage_bucket columns

-- Add new columns
ALTER TABLE snapshots
ADD COLUMN IF NOT EXISTS file_references JSONB,
ADD COLUMN IF NOT EXISTS storage_bucket TEXT DEFAULT 'snapshot-files';

-- Create index on storage_bucket for performance
CREATE INDEX IF NOT EXISTS idx_snapshots_storage_bucket ON snapshots(storage_bucket);

-- Note: The files column will be dropped in a separate migration after data migration
-- For now, we keep it for backward compatibility during the transition period

-- Optional: Migrate existing data (run this after confirming the new system works)
-- UPDATE snapshots
-- SET file_references = '{}'::jsonb,
--     storage_bucket = 'snapshot-files'
-- WHERE file_references IS NULL AND storage_bucket IS NULL;

-- Future migration (after confirming everything works):
-- ALTER TABLE snapshots DROP COLUMN IF EXISTS files;