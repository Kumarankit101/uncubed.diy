import { useEffect, useState, useCallback, useRef } from 'react';
import { openDatabase, getAll as getAllChats, type IChatMetadata } from '~/lib/persistence/db';
import type { ChatHistoryItem } from '~/lib/persistence/useChatHistory';
import type { Snapshot } from '~/lib/persistence/types';
import { projectStore } from '~/lib/stores/project';

interface ChatPayload {
  id: string;
  url_id?: string;
  description?: string;
  messages: any[];
  timestamp: string;
  updated_at: string;
  metadata?: IChatMetadata;
  project_id?: string;
  is_deleted?: boolean;
}

interface SnapshotPayload {
  chat_id: string;
  chat_index: string;
  files?: Record<string, unknown>; // Temporary: for sending files to server during transition
  file_references?: Record<string, string>;
  storage_bucket?: string;
  summary?: string;
  updated_at: string;
  project_id?: string;
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
  const lastProjectIdRef = useRef<string | null>(null);

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
    const currentProjectId = projectStore.get() ?? undefined;
    const chats: ChatHistoryItem[] = await getAllChats(db, currentProjectId);
    const chatPayloads: ChatPayload[] = chats.map((c) => ({
      id: c.id,
      url_id: c.urlId,
      description: c.description,
      messages: c.messages,
      timestamp: c.timestamp,
      updated_at: (c as any).updatedAt,
      metadata: c.metadata,
      project_id: c.projectId,
      is_deleted: false,
    }));

    // Gather snapshots
    const tx = db.transaction('snapshots', 'readonly');
    const store = tx.objectStore('snapshots');
    const getAllReq = store.getAll();
    const rawSnaps: Array<{ chatId: string; snapshot: Snapshot; updatedAt: string; projectId?: string }> =
      await new Promise((res, rej) => {
        getAllReq.onsuccess = () => res(getAllReq.result as any);
        getAllReq.onerror = () => rej(getAllReq.error);
      });
    const snapshotPayloads: SnapshotPayload[] = rawSnaps.map((s) => ({
      chat_id: s.chatId,
      chat_index: s.snapshot.chatIndex,
      files: s.snapshot.files, // Temporary: send files to server for upload
      file_references: s.snapshot.file_references,
      storage_bucket: s.snapshot.storage_bucket,
      summary: s.snapshot.summary,
      updated_at: s.updatedAt,
      project_id: s.projectId,
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
          projectId: currentProjectId,
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
                projectId: chat.project_id,
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
                  file_references: snap.file_references,
                  storage_bucket: snap.storage_bucket,
                  summary: snap.summary,
                  projectId: snap.project_id,
                },
                updatedAt: newTs,
                projectId: snap.project_id,
              });
            });
        };
      }
    } catch (err) {
      console.error('Sync failed:', err);

      // will retry on next interval
    }
  }, []);

  // Watch for projectId changes and trigger sync
  useEffect(() => {
    // Set initial projectId
    lastProjectIdRef.current = projectStore.get();

    const unsubscribe = projectStore.subscribe((projectId) => {
      const previousProjectId = lastProjectIdRef.current;

      if (projectId !== previousProjectId) {
        console.log('ProjectId changed from', previousProjectId, 'to', projectId, '- triggering immediate sync');

        lastProjectIdRef.current = projectId;

        // Sync if we have a projectId, or if projectId changed from a value to null/undefined
        if (projectId || (previousProjectId && !projectId)) {
          sync();
        }
      }
    });

    return unsubscribe;
  }, [sync]);

  useEffect(() => {
    sync();

    const id = setInterval(sync, 30000);

    return () => clearInterval(id);
  }, [sync]);

  return { lastSyncedAt, sync };
}
