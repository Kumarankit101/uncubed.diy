import { json, type ActionFunction } from '@remix-run/cloudflare';
import { createClient } from '@supabase/supabase-js';
import { uploadSnapshotFiles } from '~/lib/services/storageService';
import type { FileMap } from '~/lib/stores/files';

interface ChatPayload {
  id: string;
  url_id?: string;
  description?: string;
  messages: any[];
  timestamp: string;
  updated_at: string;
  metadata?: Record<string, unknown>;
  project_id?: string;
  is_deleted?: boolean;
}

interface SnapshotPayload {
  chat_id: string;
  chat_index: string;
  files?: FileMap; // Temporary: for receiving files from client during transition
  file_references?: Record<string, string>;
  storage_bucket?: string;
  summary?: string;
  updated_at: string;
  project_id?: string;
  is_deleted?: boolean;
}
interface SyncRequest {
  chats: ChatPayload[];
  snapshots: SnapshotPayload[];
  lastSyncedAt?: string;
  localChatIds?: string[];
  localSnapshotIds?: string[];
}

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export const action: ActionFunction = async ({ request }) => {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  interface SyncResponse {
    success: boolean;
    serverTimestamp: string;
    newChats: ChatPayload[];
    newSnapshots: SnapshotPayload[];
  }

  try {
    const { chats, snapshots, lastSyncedAt, localChatIds, localSnapshotIds } = (await request.json()) as SyncRequest;

    // Sync chats
    for (const chat of chats) {
      // Fetch existing updated_at
      const { data: existing } = await supabase.from('chats').select('updated_at').eq('id', chat.id).single();

      const shouldUpsert = !existing || new Date(chat.updated_at) > new Date(existing.updated_at as string);

      if (shouldUpsert) {
        await supabase.from('chats').upsert({
          id: chat.id,
          url_id: chat.url_id,
          description: chat.description,
          messages: chat.messages,
          timestamp: chat.timestamp,
          updated_at: chat.updated_at,
          metadata: chat.metadata,
          project_id: chat.project_id,
          is_deleted: chat.is_deleted,
        });
      }
    }

    // Sync snapshots
    for (const snap of snapshots) {
      const { data: existing } = await supabase
        .from('snapshots')
        .select('updated_at')
        .eq('chat_id', snap.chat_id)
        .single();

      const shouldUpsert = !existing || new Date(snap.updated_at) > new Date(existing.updated_at as string);

      if (shouldUpsert) {
        let fileReferences = snap.file_references || {};
        let storageBucket = snap.storage_bucket || 'snapshot-files';

        // If snapshot has files, upload only changed files to storage
        if (snap.files && Object.keys(snap.files).length > 0) {
          try {
            const uploadResult = await uploadSnapshotFiles(snap.files, snap.chat_id, snap.file_references);
            fileReferences = uploadResult.fileReferences;
            storageBucket = uploadResult.storageBucket;
          } catch (error) {
            console.error(`Failed to upload files for snapshot ${snap.chat_id}:`, error);

            // Continue with sync but log error - don't fail the entire sync
          }
        }

        await supabase.from('snapshots').upsert({
          chat_id: snap.chat_id,
          chat_index: snap.chat_index,
          file_references: fileReferences,
          storage_bucket: storageBucket,
          summary: snap.summary,
          updated_at: snap.updated_at,
          project_id: snap.project_id,
          is_deleted: snap.is_deleted,
        });
      }
    }

    const serverTimestamp = new Date().toISOString();

    let newChats: ChatPayload[] = [];

    if (lastSyncedAt) {
      const { data } = await supabase.from('chats').select('*').gt('updated_at', lastSyncedAt).eq('is_deleted', false);
      newChats = data ?? [];
    } else {
      const { data } = await supabase.from('chats').select('*').eq('is_deleted', false);
      newChats = data ?? [];
    }

    // Include any chats missing locally
    if (localChatIds && localChatIds.length > 0) {
      const notIn = localChatIds.map((id) => `'${id}'`).join(',');
      const { data: missing } = await supabase
        .from('chats')
        .select('*')
        .not('id', 'in', `(${notIn})`)
        .eq('is_deleted', false);
      newChats = [...newChats, ...(missing ?? [])];
    }

    let newSnapshots: SnapshotPayload[] = [];

    if (lastSyncedAt) {
      const { data } = await supabase
        .from('snapshots')
        .select('*')
        .gt('updated_at', lastSyncedAt)
        .eq('is_deleted', false);
      newSnapshots = data ?? [];
    } else {
      const { data } = await supabase.from('snapshots').select('*').eq('is_deleted', false);
      newSnapshots = data ?? [];
    }

    // Include any snapshots missing locally
    if (localSnapshotIds && localSnapshotIds.length > 0) {
      const notInIds = localSnapshotIds.map((id) => `'${id}'`).join(',');
      const { data: missingSnaps } = await supabase
        .from('snapshots')
        .select('*')
        .not('chat_id', 'in', `(${notInIds})`)
        .eq('is_deleted', false);
      newSnapshots = [...newSnapshots, ...(missingSnaps ?? [])];
    }

    return json<SyncResponse>({ success: true, serverTimestamp, newChats, newSnapshots }, { status: 200 });
  } catch (error: any) {
    console.error('Sync error:', error);
    return json({ error: error.message || 'Sync failed' }, { status: 500 });
  }
};
