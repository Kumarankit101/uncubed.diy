import type { FileMap } from '~/lib/stores/files';

export interface Snapshot {
  chatIndex: string;
  files?: FileMap; // Temporary: for backward compatibility during transition
  file_references?: Record<string, string>; // Maps file paths to storage keys/URLs
  storage_bucket?: string;
  summary?: string;
  projectId?: string;
}
