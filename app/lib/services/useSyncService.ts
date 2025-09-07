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

interface SyncResponse {
  success: boolean;
  serverTimestamp: string;
  newChats: ChatPayload[];
  newSnapshots: SnapshotPayload[];
}

export function useSyncService() {
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const sync = useCallback(async () => {
    // Read and validate last sync timestamp from localStorage
    const rawLast = localStorage.getItem('lastSyncedAt');
    let last: string | undefined;

    if (rawLast && !isNaN(Date.parse(rawLast))) {
      last = rawLast;
    } else {
      if (rawLast) {
        console.warn('Invalid lastSyncedAt in localStorage, fetching all records');
      }

      last = undefined;
    }

    setLastSyncedAt(last ?? null);

    // Check if initial sync completed
    const initialSyncDone = localStorage.getItem('initialSyncDone') === 'true';
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
      is_deleted: false,
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
      is_deleted: false,
    }));

    // POST to server
    try {
      // If lastSyncedAt exists but no local chats, treat as initial sync to fetch all server records
      let effectiveLast: string | undefined;

      if (!initialSyncDone) {
        effectiveLast = undefined;
        console.info('Initial sync: fetching all server records, ignoring lastSyncedAt');
      } else {
        effectiveLast = last && chatPayloads.length > 0 ? last : undefined;

        if (last && chatPayloads.length === 0) {
          console.warn('No local chats found despite lastSyncedAt, fetching all server records');
        }
      }

      const response = await fetch('/api/sync-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chats: chatPayloads,
          snapshots: snapshotPayloads,
          lastSyncedAt: effectiveLast,
          localChatIds: chatPayloads.map((c) => c.id),
          localSnapshotIds: rawSnaps.map((s) => s.chatId),
        }),
      });
      const result = (await response.json()) as SyncResponse;

      if (result.success) {
        const { serverTimestamp: newTs, newChats, newSnapshots } = result;

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
          localStorage.setItem('initialSyncDone', 'true');

          // Synchronize deletions and merges from server into IndexedDB
          const mergeTx = db.transaction(['chats', 'snapshots'], 'readwrite');
          const mergeChatStore = mergeTx.objectStore('chats');

          // Remove locally any chats marked deleted on server
          newChats
            .filter((chat) => chat.is_deleted)
            .forEach((chat) => {
              mergeChatStore.delete(chat.id);
            });

          // Add or update chats not deleted
          newChats
            .filter((chat) => !chat.is_deleted)
            .forEach((chat) => {
              mergeChatStore.put({
                id: chat.id,
                messages: chat.messages,
                urlId: chat.url_id,
                description: chat.description,
                timestamp: chat.timestamp,
                updatedAt: newTs,
                metadata: chat.metadata,
              });
            });

          const mergeSnapStore = mergeTx.objectStore('snapshots');

          // Remove snapshots marked deleted
          newSnapshots
            .filter((snap) => snap.is_deleted)
            .forEach((snap) => {
              mergeSnapStore.delete(snap.chat_id);
            });

          // Add or update snapshots not deleted
          newSnapshots
            .filter((snap) => !snap.is_deleted)
            .forEach((snap) => {
              mergeSnapStore.put({
                chatId: snap.chat_id,
                snapshot: {
                  chatIndex: snap.chat_index,
                  files: snap.files,
                  summary: snap.summary,
                },
                updatedAt: newTs,
              });
            });
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
