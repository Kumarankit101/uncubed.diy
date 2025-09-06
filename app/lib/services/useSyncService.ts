import { useEffect, useState, useCallback } from 'react';
import { openDatabase, getAll as getAllChats, type IChatMetadata } from '~/lib/persistence/db';
import type { ChatHistoryItem } from '~/lib/persistence/useChatHistory';
import type { Snapshot } from '~/lib/persistence/types';

interface ChatPayload {
  id: string;
  url_id?: string;
  description?: string;
  messages: any[];
  timestamp: string;
  updated_at: string;
  metadata?: IChatMetadata;
}

interface SnapshotPayload {
  chat_id: string;
  chat_index: string;
  files: Record<string, unknown>;
  summary?: string;
  updated_at: string;
}

interface SyncResponse {
  success: boolean;
  timestamp: string;
}

export function useSyncService() {
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const sync = useCallback(async () => {
    const db = await openDatabase();

    if (!db) {
      return;
    }

    // Gather chats
    const chats: ChatHistoryItem[] = await getAllChats(db);
    const chatPayloads: ChatPayload[] = chats.map((c) => ({
      id: c.id,
      url_id: c.urlId,
      description: c.description,
      messages: c.messages,
      timestamp: c.timestamp,
      updated_at: (c as any).updatedAt,
      metadata: c.metadata,
    }));

    // Gather snapshots
    const tx = db.transaction('snapshots', 'readonly');
    const store = tx.objectStore('snapshots');
    const getAllReq = store.getAll();
    const rawSnaps: Array<{ chatId: string; snapshot: Snapshot; updatedAt: string }> = await new Promise((res, rej) => {
      getAllReq.onsuccess = () => res(getAllReq.result as any);
      getAllReq.onerror = () => rej(getAllReq.error);
    });
    const snapshotPayloads: SnapshotPayload[] = rawSnaps.map((s) => ({
      chat_id: s.chatId,
      chat_index: s.snapshot.chatIndex,
      files: s.snapshot.files,
      summary: s.snapshot.summary,
      updated_at: s.updatedAt,
    }));

    // POST to server
    try {
      const response = await fetch('/api/sync-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chats: chatPayloads, snapshots: snapshotPayloads }),
      });
      const result = (await response.json()) as SyncResponse;

      if (result.success) {
        const newTs = result.timestamp;

        // Update local updatedAt fields to server timestamp
        const writeTx = db.transaction(['chats', 'snapshots'], 'readwrite');
        const chatStore = writeTx.objectStore('chats');
        chatPayloads.forEach((c) => {
          chatStore.get(c.id).onsuccess = (e) => {
            const record = (e.target as IDBRequest).result;

            if (record) {
              record.updatedAt = newTs;
              chatStore.put(record);
            }
          };
        });

        const snapStore = writeTx.objectStore('snapshots');
        rawSnaps.forEach((s) => {
          snapStore.get(s.chatId).onsuccess = (e) => {
            const record = (e.target as IDBRequest).result;

            if (record) {
              record.updatedAt = newTs;
              snapStore.put(record);
            }
          };
        });

        writeTx.oncomplete = () => {
          localStorage.setItem('lastSyncedAt', newTs);
          setLastSyncedAt(newTs);
        };
      }
    } catch (err) {
      console.error('Sync failed:', err);

      // will retry on next interval
    }
  }, []);

  useEffect(() => {
    sync();

    const id = setInterval(sync, 30000);

    return () => clearInterval(id);
  }, [sync]);

  return { lastSyncedAt, sync };
}
