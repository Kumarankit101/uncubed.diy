import { createClient } from '@supabase/supabase-js';
import type { FileMap } from '~/lib/stores/files';

// Simple hash function for file content
function hashString(str: string): string {
  let hash = 0;

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  return Math.abs(hash).toString(36);
}

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export interface FileReference {
  path: string;
  storageKey: string;
  url?: string;
}

export interface UploadResult {
  fileReferences: Record<string, string>;
  storageBucket: string;
}

/**
 * Upload only changed files to Supabase Storage and return references
 * Reuses existing references for unchanged files
 */
export async function uploadSnapshotFiles(
  files: FileMap,
  snapshotId: string,
  existingReferences?: Record<string, string>,
): Promise<UploadResult> {
  const fileReferences: Record<string, string> = { ...existingReferences };
  const bucketName = 'snapshot-files';

  // Ensure bucket exists
  const { data: buckets } = await supabase.storage.listBuckets();
  const bucketExists = buckets?.some((bucket) => bucket.name === bucketName);

  if (!bucketExists) {
    const { error: createError } = await supabase.storage.createBucket(bucketName, {
      public: false,
      allowedMimeTypes: ['*/*'],
      fileSizeLimit: 10485760, // 10MB per file
    });

    if (createError) {
      throw new Error(`Failed to create storage bucket: ${createError.message}`);
    }
  }

  // Upload only changed/new files
  for (const [filePath, fileData] of Object.entries(files)) {
    if (!fileData || fileData.type !== 'file') {
      continue;
    }

    const fileContent = fileData.content;
    const contentHash = hashString(fileContent);
    const storageKey = `${snapshotId}/${contentHash}/${filePath}`;

    // Check if file content has changed by comparing with existing reference
    const existingKey = existingReferences?.[filePath];

    if (existingKey) {
      // Extract hash from existing key to compare
      const existingHash = existingKey.split('/')[1];

      if (existingHash === contentHash) {
        // File hasn't changed, reuse existing reference
        fileReferences[filePath] = existingKey;
        continue;
      }
    }

    // File is new or changed, upload it
    const blob = new Blob([fileContent], {
      type: fileData.isBinary ? 'application/octet-stream' : 'text/plain',
    });

    const { error: uploadError } = await supabase.storage.from(bucketName).upload(storageKey, blob, {
      contentType: fileData.isBinary ? 'application/octet-stream' : 'text/plain',
      upsert: true,
    });

    if (uploadError) {
      console.error(`Failed to upload file ${filePath}:`, uploadError);
      throw new Error(`Failed to upload file ${filePath}: ${uploadError.message}`);
    }

    // Store reference to the new storage key
    fileReferences[filePath] = storageKey;
  }

  return {
    fileReferences,
    storageBucket: bucketName,
  };
}

/**
 * Download file from Supabase Storage (server-side only)
 * Note: For client-side usage, use the /api/snapshot-files/:storageKey endpoint
 */
export async function downloadSnapshotFile(storageKey: string, bucketName: string = 'snapshot-files'): Promise<string> {
  const { data, error } = await supabase.storage.from(bucketName).download(storageKey);

  if (error) {
    throw new Error(`Failed to download file: ${error.message}`);
  }

  const text = await data.text();

  return text;
}

/**
 * Delete files from Supabase Storage
 */
export async function deleteSnapshotFiles(
  fileReferences: Record<string, string>,
  bucketName: string = 'snapshot-files',
): Promise<void> {
  const filesToDelete = Object.values(fileReferences);

  if (filesToDelete.length === 0) {
    return;
  }

  const { error } = await supabase.storage.from(bucketName).remove(filesToDelete);

  if (error) {
    console.error('Failed to delete files from storage:', error);

    // Don't throw error for cleanup failures
  }
}
