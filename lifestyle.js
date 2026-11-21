/* ============================================================
   lifestyle.js — suplementos, baile, práctica, cardio
   ============================================================ */

const DEFAULT_DANCE_TYPES = [
  { code: 'B',  label: 'Bachata', color: 'accent' },
  { code: 'S',  label: 'Salsa',   color: 'ink' },
  { code: 'So', label: 'Social',  color: 'sage' },
];

const DEFAULT_PRACTICE_TYPES = [
  { code: 'D', label: 'Dibujo',    color: 'ink' },
  { code: 'E', label: 'Escritura', color: 'accent' },
];

const CARDIO_LOCATIONS = [
  'Caminadora', 'Bici', 'Elíptica', 'Remo', 'Escaleras', 'Cuerda', 'Natación', 'Otro',
];

const TYPE_PALETTE = ['accent', 'ink', 'sage', 'gold', 'slate', 'plum'];

const Lifestyle = {
  state: {
    supplements: [],
    supplementLogs: [],
    danceLogs: [],
    practiceLogs: [],
    cardioLogs: [],
    danceTypes: DEFAULT_DANCE_TYPES,
    practiceTypes: DEFAULT_PRACTICE_TYPES,
    loaded: false,
  },

  async load() {
    this.state.supplements    = await DB.getAll('supplements');
    this.state.supplementLogs = await DB.getAll('supplementLogs');
    this.state.danceLogs      = await DB.getAll('danceLogs');
    this.state.practiceLogs   = await DB.getAll('practiceLogs');
    this.state.cardioLogs     = await DB.getAll('cardioLogs');

    const dt = await DB.get('settings', 'danceTypes');
    this.state.danceTypes = (dt?.types && dt.types.length) ? dt.types : DEFAULT_DANCE_TYPES;
    const pt = await DB.get('settings', 'practiceTypes');
    this.state.practiceTypes = (pt?.types && pt.types.length) ? pt.types : DEFAULT_PRACTICE_TYPES;

    this.state.loaded = true;
  },

  /* --- Suplementos --- */
  supplementsTakenOn(date) {
    const ids = new Set(this.state.supplementLogs.filter(l => l.date === date).map(l => l.supplementId));
    return this.state.supplements.filter(s => ids.has(s.id));
  },
  isTaken(supplementId, date) {
    return this.state.supplementLogs.some(l => l.supplementId === supplementId && l.date === date);
  },
  async toggleSupplement(supplementId, date) {
    const existing = this.state.supplementLogs.find(l => l.supplementId === supplementId && l.date === date);
    if (existing) await DB.delete('supplementLogs', existing.id);
    else await DB.put('supplementLogs', { id: crypto.randomUUID(), supplementId, date });
    await this.load();
  },

  /* --- Baile --- */
  danceTypesOn(date) {
    return this.state.danceLogs.filter(l => l.date === date).map(l => l.type);
  },
  async toggleDance(date, code) {
    const existing = this.state.danceLogs.find(l => l.date === date && l.type === code);
    if (existing) await DB.delete('danceLogs', existing.id);
    else await DB.put('danceLogs', { id: crypto.randomUUID(), date, type: code });
    await this.load();
  },

  /* --- Práctica --- */
  practiceTypesOn(date) {
    return this.state.practiceLogs.filter(l => l.date === date).map(l => l.type);
  },
  async togglePractice(date, code) {
    const existing = this.state.practiceLogs.find(l => l.date === date && l.type === code);
    if (existing) await DB.delete('practiceLogs', existing.id);
    else await DB.put('practiceLogs', { id: crypto.randomUUID(), date, type: code });
    await this.load();
  },
  weeklyPracticeCount(weekStartISO) {
    const start = new Date(weekStartISO + 'T00:00:00');
    const end = new Date(start); end.setDate(end.getDate() + 7);
    return this.state.practiceLogs.filter(l => {
      const d = new Date(l.date + 'T00:00:00');
      return d >= start && d < end;
    }).length;
  },

  /* --- Cardio --- */
  cardioOn(date) {
    return this.state.cardioLogs.filter(l => l.date === date)
      .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  },
  cardioMinutesOn(date) {
    return this.cardioOn(date).reduce((a, l) => a + (l.minutes || 0), 0);
  },
  async addCardio(entry) {
    await DB.put('cardioLogs', {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ...entry,
    });
    await this.load();
  },
  async deleteCardio(id) {
    await DB.delete('cardioLogs', id);
    await this.load();
  },

  /* --- Tipos editables --- */
  async saveDanceTypes(types) {
    await DB.put('settings', { key: 'danceTypes', types });
    this.state.danceTypes = types;
  },
  async savePracticeTypes(types) {
    await DB.put('settings', { key: 'practiceTypes', types });
    this.state.practiceTypes = types;
  },
  generateCode(name, existingCodes) {
    const clean = name.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!clean) return 'X';
    for (let len = 1; len <= Math.min(3, clean.length); len++) {
      const code = clean.slice(0, len);
      if (!existingCodes.includes(code)) return code;
    }
    return clean.slice(0, 3) + existingCodes.length;
  },
  nextColor(existingColors) {
    const used = new Set(existingColors);
    for (const c of TYPE_PALETTE) if (!used.has(c)) return c;
    return 'ink';
  },
};