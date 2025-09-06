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
}

interface SnapshotPayload {
  chat_id: string;
  chat_index: string;
  files: Record<string, unknown>;
  summary?: string;
  updated_at: string;
}

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export const action: ActionFunction = async ({ request }) => {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const { chats, snapshots } = (await request.json()) as {
      chats: ChatPayload[];
      snapshots: SnapshotPayload[];
    };

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

    return json({ success: true, timestamp: new Date().toISOString() }, { status: 200 });
  } catch (error: any) {
    console.error('Sync error:', error);
    return json({ error: error.message || 'Sync failed' }, { status: 500 });
  }
};
