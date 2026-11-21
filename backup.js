/* ============================================================
   backup.js — exportar/importar completo
   ============================================================ */


const ALL_STORES = [
  'groups', 'exercises', 'sessions',
  'supplements', 'supplementLogs', 'danceLogs', 'practiceLogs', 'cardioLogs',
  'financeTransactions', 'financeGoals', 'settings',
];

const Backup = {
  async exportJSON() {
    const data = { app: 'gym-tracker', version: 2, exportedAt: new Date().toISOString() };
    for (const s of ALL_STORES) data[s] = await DB.getAll(s);

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `gym-tracker-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  async exportJSON() {
    const data = { app: 'gym-tracker', version: 2, exportedAt: new Date().toISOString() };
    for (const s of ALL_STORES) data[s] = await DB.getAll(s);

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `gym-tracker-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    // Guardar timestamp
    const existing = await DB.get('settings', 'app') || { key: 'app' };
    existing.lastBackupAt = new Date().toISOString();
    await DB.put('settings', existing);
  },

  async clearAll() {
    await DB.clear('sessions');
    await DB.clear('exercises');
    await DB.clear('groups');
    await DB.seed();
  },
};