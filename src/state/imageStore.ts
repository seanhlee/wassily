/**
 * IndexedDB storage for reference image blobs.
 *
 * Blobs are stored separately from localStorage because they're too large
 * for the 5MB localStorage cap. IndexedDB stores them natively (no base64
 * overhead) with generous limits (Chrome: 60% disk, Firefox: 10GB).
 *
 * Metadata (position, size) lives in localStorage alongside other objects.
 * Only the blob lives here, keyed by the canvas object ID.
 */

const DB_NAME = "wassily";
const DB_VERSION = 1;
const STORE_NAME = "images";

let dbPromise: Promise<IDBDatabase> | null = null;
let persistenceRequested = false;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

/** Request persistent storage to protect against Safari's 7-day ITP eviction. */
async function requestPersistence() {
  if (persistenceRequested) return;
  persistenceRequested = true;
  try {
    if (navigator.storage?.persist) {
      await navigator.storage.persist();
    }
  } catch {
    // Best effort — not critical
  }
}

/** Store an image blob keyed by canvas object ID. */
export async function storeImageBlob(id: string, blob: Blob): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(blob, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    requestPersistence();
  } catch {
    // IndexedDB unavailable (private mode, etc.) — silently degrade
  }
}

/** Load all stored image blobs. */
export async function loadAllImageBlobs(): Promise<
  Array<{ id: string; blob: Blob }>
> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const results: Array<{ id: string; blob: Blob }> = [];

      const cursorReq = store.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          results.push({ id: cursor.key as string, blob: cursor.value });
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    });
  } catch {
    return [];
  }
}

/** Delete a single image blob by ID. */
export async function deleteImageBlob(id: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Silently degrade
  }
}

/** Delete all blobs whose IDs are NOT in the active set. */
export async function cleanOrphanedBlobs(
  activeIds: Set<string>,
): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    const cursorReq = store.openCursor();
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        if (!activeIds.has(cursor.key as string)) {
          cursor.delete();
        }
        cursor.continue();
      }
    };

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Silently degrade
  }
}
