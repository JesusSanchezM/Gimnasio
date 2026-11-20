/* ============================================================
   backup.js — exportar / importar / borrar
   ============================================================ */

const Backup = {
  async exportJSON() {
    const data = {
      app: 'gym-tracker',
      version: 1,
      exportedAt: new Date().toISOString(),
      groups:    await DB.getAll('groups'),
      exercises: await DB.getAll('exercises'),
      sessions:  await DB.getAll('sessions'),
    };
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

  async importJSON(file) {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data || data.app !== 'gym-tracker') {
      throw new Error('El archivo no parece un respaldo de GYM TRACKER.');
    }
    if (Array.isArray(data.groups))    await DB.putMany('groups', data.groups);
    if (Array.isArray(data.exercises)) await DB.putMany('exercises', data.exercises);
    if (Array.isArray(data.sessions))  await DB.putMany('sessions', data.sessions);
    return {
      groups: data.groups?.length || 0,
      exercises: data.exercises?.length || 0,
      sessions: data.sessions?.length || 0,
    };
  },

  async clearAll() {
    await DB.clear('sessions');
    await DB.clear('exercises');
    await DB.clear('groups');
    await DB.seed();
  },
};