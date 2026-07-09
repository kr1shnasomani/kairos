// IndexedDB write queue — stores failed POSTs for offline replay.
// Only called client-side; no-ops when indexedDB is unavailable (SSR).
import { getToken, API_BASE } from "./api";

const DB = "kairos-queue";
const STORE = "write-queue";

interface QueuedWrite {
  id?: number;
  url: string;
  method: string;
  body: string;
}

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () =>
      r.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export async function enqueueWrite(path: string, method: string, body: unknown): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await open();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add({ url: `${API_BASE}${path}`, method, body: JSON.stringify(body) });
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export async function getQueueLength(): Promise<number> {
  if (typeof indexedDB === "undefined") return 0;
  const db = await open();
  return new Promise((res, rej) => {
    const r = db.transaction(STORE, "readonly").objectStore(STORE).count();
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export async function flushQueue(): Promise<{ replayed: number; failed: number }> {
  if (typeof indexedDB === "undefined") return { replayed: 0, failed: 0 };
  const db = await open();
  const items = await new Promise<QueuedWrite[]>((res, rej) => {
    const r = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    r.onsuccess = () => res(r.result as QueuedWrite[]);
    r.onerror = () => rej(r.error);
  });

  const token = getToken();
  let replayed = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const r = await fetch(item.url, {
        method: item.method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: item.body,
      });
      if (r.ok || r.status === 409) {
        await new Promise<void>((res2) => {
          const tx = db.transaction(STORE, "readwrite");
          tx.objectStore(STORE).delete(item.id!);
          tx.oncomplete = () => res2();
        });
        replayed++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }
  return { replayed, failed };
}
