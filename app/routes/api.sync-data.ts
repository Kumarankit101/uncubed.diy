import { json, type ActionFunction } from '@remix-run/cloudflare';
import { createClient } from '@supabase/supabase-js';

interface ChatPayload {
  id: string;
  url_id?: string;
  description?: string;
  messages: any[];
  timestamp: string;
  updated_at: string;
  metadata?: Record<string, unknown>;
  is_deleted?: boolean;
}

interface SnapshotPayload {
  chat_id: string;
  chat_index: string;
  files: Record<string, unknown>;
  summary?: string;
  updated_at: string;
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
        await supabase.from('chats').upsert(chat);
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
        await supabase.from('snapshots').upsert(snap);
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
