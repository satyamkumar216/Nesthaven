// frontend/lib/offlineSync.ts

const DB_NAME = 'NestHaven_POS';
const STORE   = 'offline_sales';
const API     = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'; // Corrected default fallback to port 3001

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e: any) => {
      const db: IDBDatabase = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'idempotencyKey' });
      }
    };
    req.onsuccess  = (e: any) => resolve(e.target.result);
    req.onerror    = ()      => reject(req.error);
  });
}

export async function saveOfflineSale(data: any): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    store.put({ ...data, savedAt: new Date().toISOString() });
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

export async function syncPendingSales(): Promise<{ synced: number; failed: number }> {
  const db = await openDb();
  const pending: any[] = await new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE, 'readonly');
    const req   = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });

  let synced = 0;
  let failed = 0;

  for (const sale of pending) {
    try {
      const res = await fetch(`${API}/v1/pos/checkout`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(sale),
      });
      if (res.ok) {
        // Remove from IndexedDB on success
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).delete(sale.idempotencyKey);
          tx.oncomplete = () => resolve();
          tx.onerror    = () => reject(tx.error);
        });
        synced++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }
  return { synced, failed };
}

export async function getPendingCount(): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}