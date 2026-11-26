// On-device storage (IndexedDB). Nothing ever leaves the device.
// The rest of the app only talks to this module, so sync could be added here later.

const DB_NAME = 'money-atlas';
const DB_VERSION = 1;
const STORES = ['entries', 'categories', 'recurring', 'kv'];

let dbPromise;

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('entries')) db.createObjectStore('entries', { keyPath: 'id' }).createIndex('date', 'date');
      if (!db.objectStoreNames.contains('categories')) db.createObjectStore('categories', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('recurring')) db.createObjectStore('recurring', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(stores, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let result;
    Promise.resolve(fn(t)).then((r) => { result = r; }, reject);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const req2p = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

export const getAll = (store) => tx([store], 'readonly', (t) => req2p(t.objectStore(store).getAll()));
export const put = (store, value) => tx([store], 'readwrite', (t) => { t.objectStore(store).put(value); });
export const putMany = (store, values) => tx([store], 'readwrite', (t) => { const s = t.objectStore(store); for (const v of values) s.put(v); });
export const remove = (store, key) => tx([store], 'readwrite', (t) => { t.objectStore(store).delete(key); });

export const getKV = (key) => tx(['kv'], 'readonly', (t) => req2p(t.objectStore('kv').get(key)));
export const setKV = (key, value) => tx(['kv'], 'readwrite', (t) => { t.objectStore('kv').put(value, key); });

/** Everything, for a backup file. */
export async function exportAll() {
  const [entries, categories, recurring] = await Promise.all(['entries', 'categories', 'recurring'].map(getAll));
  const kv = await tx(['kv'], 'readonly', async (t) => {
    const s = t.objectStore('kv');
    const [keys, values] = await Promise.all([req2p(s.getAllKeys()), req2p(s.getAll())]);
    return Object.fromEntries(keys.map((k, i) => [k, values[i]]));
  });
  return { entries, categories, recurring, kv };
}

/** Replace everything with a backup's contents, in one transaction. */
export function importAll(data) {
  return tx(STORES, 'readwrite', (t) => {
    for (const name of STORES) t.objectStore(name).clear();
    for (const name of ['entries', 'categories', 'recurring']) {
      const s = t.objectStore(name);
      for (const v of data[name] ?? []) s.put(v);
    }
    const kv = t.objectStore('kv');
    for (const [k, v] of Object.entries(data.kv ?? {})) kv.put(v, k);
  });
}

export function wipe() {
  return tx(STORES, 'readwrite', (t) => { for (const name of STORES) t.objectStore(name).clear(); });
}

/** Ask the browser not to evict our data when storage runs low. */
export async function persist() {
  try { return await navigator.storage?.persist?.(); } catch { return false; }
}
