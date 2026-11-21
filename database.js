/* ============================================================
   database.js — IndexedDB, sin dependencias
   ============================================================ */

const DB_NAME    = 'gym-tracker';
const DB_VERSION = 3;

const DEFAULT_GROUPS = [
  { id: 'chest-triceps',  name: 'Pecho',   sub: '+ Tríceps', order: 1 },
  { id: 'back-biceps',    name: 'Espalda', sub: '+ Bíceps',  order: 2 },
  { id: 'legs',           name: 'Pierna',  sub: '',          order: 3 },
  { id: 'shoulders-arms', name: 'Hombro',  sub: '+ Brazo',   order: 4 },
];

let _db = null;

function open() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      const tx = e.target.transaction;

      if (e.oldVersion < 2 && e.oldVersion > 0) {
        if (db.objectStoreNames.contains('exercises')) tx.objectStore('exercises').clear();
        if (db.objectStoreNames.contains('sessions'))  tx.objectStore('sessions').clear();
        if (db.objectStoreNames.contains('groups')) {
          const gs = tx.objectStore('groups');
          gs.clear();
          for (const g of DEFAULT_GROUPS) gs.put(g);
        }
      }

      if (!db.objectStoreNames.contains('groups')) {
        const gs = db.createObjectStore('groups', { keyPath: 'id' });
        for (const g of DEFAULT_GROUPS) gs.put(g);
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
      if (!db.objectStoreNames.contains('supplements')) {
        db.createObjectStore('supplements', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('supplementLogs')) {
        const s = db.createObjectStore('supplementLogs', { keyPath: 'id' });
        s.createIndex('date', 'date');
        s.createIndex('supplementId', 'supplementId');
      }
      if (!db.objectStoreNames.contains('danceLogs')) {
        const s = db.createObjectStore('danceLogs', { keyPath: 'id' });
        s.createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains('practiceLogs')) {
        const s = db.createObjectStore('practiceLogs', { keyPath: 'id' });
        s.createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains('cardioLogs')) {
        const s = db.createObjectStore('cardioLogs', { keyPath: 'id' });
        s.createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains('financeTransactions')) {
        const s = db.createObjectStore('financeTransactions', { keyPath: 'id' });
        s.createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains('financeGoals')) {
        db.createObjectStore('financeGoals', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
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
    if (count === 0) await DB.putMany('groups', DEFAULT_GROUPS);
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