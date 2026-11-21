/* ============================================================
   finance.js — Configuración, runway y movimientos
   ============================================================ */

const EXPENSE_CATEGORIES = [
  'Comida', 'Transporte', 'Hogar', 'Servicios', 'Salud',
  'Ocio', 'Ropa', 'Deudas', 'Suscripciones',
  'Retiro de efectivo', 'Ajuste', 'Otro',
];

const INCOME_CATEGORIES = [
  'Sueldo', 'Otros', 'Venta', 'Regalo', 'Ajuste', 'Otro',
];

const Finance = {
  state: {
    transactions: [],
    goals: [],
    settings: { monthlyIncome: 0, monthlyFixed: [], runwayGoal: 6 },
    unlocked: false,
    hasPassword: false,
  },

  async sha256(str) {
    const buf  = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
  },

  async loadSettings() {
    const s = await DB.get('settings', 'finance');
    this.state.hasPassword = !!(s && s.passwordHash);
    this.state.unlocked   = sessionStorage.getItem('finance-unlocked') === '1';
    this.state.settings = {
      monthlyIncome: s?.monthlyIncome || 0,
      monthlyFixed:  s?.monthlyFixed  || [],
      runwayGoal:    s?.runwayGoal    || 6,
    };
  },

  async saveSettings(patch) {
    const s = await DB.get('settings', 'finance') || { key: 'finance' };
    Object.assign(s, patch);
    s.key = 'finance';
    await DB.put('settings', s);
    this.state.settings = { ...this.state.settings, ...patch };
  },

  async setPassword(pw) {
    const hash = await this.sha256(pw);
    await this.saveSettings({ passwordHash: hash });
    sessionStorage.setItem('finance-unlocked', '1');
    this.state.hasPassword = true;
    this.state.unlocked   = true;
  },

  async checkPassword(pw) {
    const s = await DB.get('settings', 'finance');
    if (!s || !s.passwordHash) return false;
    const hash = await this.sha256(pw);
    if (hash === s.passwordHash) {
      sessionStorage.setItem('finance-unlocked', '1');
      this.state.unlocked = true;
      return true;
    }
    return false;
  },

  lock() {
    sessionStorage.removeItem('finance-unlocked');
    this.state.unlocked = false;
  },

  async load() {
    this.state.transactions = await DB.getAll('financeTransactions');
    this.state.goals        = await DB.getAll('financeGoals');
  },

  /* ---------- Cómputos ---------- */
  monthlyFixedTotal() {
    return (this.state.settings.monthlyFixed || []).reduce((a, f) => a + (f.amount || 0), 0);
  },

  emergencyFundTotal() {
    return this.state.transactions
      .filter(t => t.type === 'savings')
      .reduce((a, t) => a + t.amount, 0);
  },

  runwayMonths() {
    const fixed = this.monthlyFixedTotal();
    return fixed ? this.emergencyFundTotal() / fixed : 0;
  },

  runwayGoal() {
    return this.state.settings.runwayGoal || 6;
  },

  runwayTargetAmount() {
    return this.monthlyFixedTotal() * this.runwayGoal();
  },

  /* ---------- Transacciones ---------- */
  transactionsOn(date) {
    return this.state.transactions.filter(t => t.date === date);
  },

  dailyNet(date) {
    return this.transactionsOn(date).reduce((a, t) => {
      if (t.type === 'income') a += t.amount;
      else if (t.type === 'expense' || t.type === 'card-summary') a -= t.amount;
      return a;
    }, 0);
  },

  monthlyTotals(year, month) {
    const prefix = `${year}-${String(month+1).padStart(2, '0')}`;
    let income = 0, expense = 0, savings = 0;
    for (const t of this.state.transactions) {
      if (!t.date.startsWith(prefix)) continue;
      if      (t.type === 'income')                                    income  += t.amount;
      else if (t.type === 'expense' || t.type === 'card-summary')      expense += t.amount;
      else if (t.type === 'savings')                                   savings += t.amount;
    }
    return { income, expense, savings, balance: income - expense - savings };
  },

    /* ---------- Categorías ---------- */
  expensesByCategory(year, month) {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    const map = {};
    for (const t of this.state.transactions) {
      if (!t.date.startsWith(prefix)) continue;
      if (t.type !== 'expense' && t.type !== 'card-summary') continue;
      const cat = t.category || 'Otro';
      map[cat] = (map[cat] || 0) + t.amount;
    }
    return map;
  },

  monthlyHistory(count = 6) {
    const now = new Date();
    const months = [];
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const t = this.monthlyTotals(d.getFullYear(), d.getMonth());
      months.push({
        date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-15`,
        income: t.income,
        expense: t.expense,
        savings: t.savings,
      });
    }
    return months;
  },

  async addTransaction(tx) {
    await DB.put('financeTransactions', {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ...tx,
    });
    await this.load();
  },

  async deleteTransaction(id) {
    await DB.delete('financeTransactions', id);
    await this.load();
  },

  async addGoal(name, target) {
    await DB.put('financeGoals', {
      id: crypto.randomUUID(), name, target, saved: 0,
      createdAt: new Date().toISOString(),
    });
    await this.load();
  },

  async updateGoalSaved(id, delta) {
    const g = this.state.goals.find(x => x.id === id);
    if (!g) return;
    g.saved = Math.max(0, (g.saved || 0) + delta);
    await DB.put('financeGoals', g);
    await this.load();
  },

  async deleteGoal(id) {
    await DB.delete('financeGoals', id);
    await this.load();
  },

  async resetAll() {
    await DB.clear('financeTransactions');
    await DB.clear('financeGoals');
    await DB.delete('settings', 'finance');
    sessionStorage.removeItem('finance-unlocked');
    this.state.transactions = [];
    this.state.goals = [];
    this.state.settings = { monthlyIncome: 0, monthlyFixed: [], runwayGoal: 6 };
    this.state.hasPassword = false;
    this.state.unlocked = false;
  },
};