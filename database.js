/* ============================================================
   database.js — IndexedDB, sin dependencias
   ============================================================ */

const DB_NAME    = 'gym-tracker';
const DB_VERSION = 1;

const DEFAULT_GROUPS = [
  { id: 'chest',     name: 'Pecho',   order: 1 },
  { id: 'back',      name: 'Espalda', order: 2 },
  { id: 'arms',      name: 'Brazos',  order: 3 },
  { id: 'legs',      name: 'Pierna',  order: 4 },
  { id: 'shoulders', name: 'Hombros', order: 5 },
  { id: 'abs',       name: 'Abdomen', order: 6 },
];

let _db = null;

function open() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('groups')) {
        db.createObjectStore('groups', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('exercises')) {
        const s = db.createObjectStore('exercises', { keyPath: 'id' });
        s.createIndex('groupId', 'groupId');
      }
      if (!db.objectStoreNames.contains('sessions')) {
        const s = db.createObjectStore('sessions', { keyPath: 'id' });
        s.createIndex('exerciseId', 'exerciseId');
        s.createIndex('date', 'date');
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror   = () => reject(req.error);
  });
}

const p = (req) => new Promise((res, rej) => {
  req.onsuccess = () => res(req.result);
  req.onerror   = () => rej(req.error);
});

const DB = {
  async seed() {
    const db = await open();
    const count = await p(db.transaction('groups', 'readonly').objectStore('groups').count());
    if (count === 0) {
      await DB.putMany('groups', DEFAULT_GROUPS);
    }
  },

  async getAll(store) {
    const db = await open();
    return p(db.transaction(store, 'readonly').objectStore(store).getAll());
  },

  async get(store, key) {
    const db = await open();
    return p(db.transaction(store, 'readonly').objectStore(store).get(key));
  },

  async put(store, value) {
    const db = await open();
    const t = db.transaction(store, 'readwrite');
    t.objectStore(store).put(value);
    await new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); });
    return value;
  },

  async putMany(store, values) {
    const db = await open();
    const t = db.transaction(store, 'readwrite');
    const os = t.objectStore(store);
    for (const v of values) os.put(v);
    await new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); });
  },

  async delete(store, key) {
    const db = await open();
    const t = db.transaction(store, 'readwrite');
    t.objectStore(store).delete(key);
    await new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); });
  },

  async clear(store) {
    const db = await open();
    const t = db.transaction(store, 'readwrite');
    t.objectStore(store).clear();
    await new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); });
  },
};