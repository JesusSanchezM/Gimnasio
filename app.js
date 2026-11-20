/* ============================================================
   app.js — router, pantallas y lógica de interfaz
   ============================================================ */

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ---------- helpers ---------- */
function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function fmtNum(n) {
  if (n == null || isNaN(n)) return '—';
  const r = Math.round(n * 10) / 10;
  return new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 }).format(r);
}

function fileToDataURL(file, maxSize = 1200, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.round(img.width  * scale);
      const h = Math.round(img.height * scale);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/* ============================================================
   App
   ============================================================ */
const App = {
  state: { groups: [], exercises: [], sessions: [] },
  progressWeekOffset: 0,

  async init() {
    await DB.seed();
    await this.refresh();
    window.addEventListener('hashchange', () => this.route());
    this.route();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  },

  async refresh() {
    this.state.groups    = (await DB.getAll('groups')).sort((a, b) => a.order - b.order);
    this.state.exercises = await DB.getAll('exercises');
    this.state.sessions  = await DB.getAll('sessions');
  },

  /* ---------- lookup ---------- */
  groupById(id)    { return this.state.groups.find(g => g.id === id); },
  exerciseById(id) { return this.state.exercises.find(e => e.id === id); },
  exercisesOf(gid) { return this.state.exercises.filter(e => e.groupId === gid); },
  sessionsOf(eid)  {
    return this.state.sessions
      .filter(s => s.exerciseId === eid)
      .sort((a, b) => a.date.localeCompare(b.date));
  },

  /* ---------- router ---------- */
  route() {
    const hash  = location.hash.replace(/^#\/?/, '');
    const parts = hash.split('/').filter(Boolean);
    window.scrollTo(0, 0);

    if (parts.length === 0)        return this.renderHome();
    if (parts[0] === 'g' && parts[1])        return this.renderGroup(parts[1]);
    if (parts[0] === 'e' && parts[1])        return this.renderExercise(parts[1]);
    if (parts[0] === 'log' && parts[1])      return this.renderLog(parts[1]);
    if (parts[0] === 'progress')             return this.renderProgress();
    if (parts[0] === 'data')                 return this.renderData();
    this.renderHome();
  },

  mount(html) { $('#app').innerHTML = html; },

  /* ============================================================
     HOME
     ============================================================ */
  renderHome() {
    const counts = {};
    for (const e of this.state.exercises) counts[e.groupId] = (counts[e.groupId] || 0) + 1;

    this.mount(`
      <header class="masthead">
        <div class="wordmark">GYM&nbsp;TRACKER.</div>
        <div class="tagline">PERSONAL TRAINING LOG</div>
      </header>

      <section class="hero">
        <h1>Train with purpose.</h1>
        <p class="muted">Registra. Analiza. Evoluciona.</p>
      </section>

      <section class="block">
        <div class="label">Selecciona tu entrenamiento</div>
        <div class="group-grid">
          ${this.state.groups.map(g => {
            const n = counts[g.id] || 0;
            return `<a class="group-card" href="#/g/${g.id}">
              <span class="group-name">${escapeHTML(g.name)}</span>
              <span class="group-meta">
                <span>${n} ejercicio${n === 1 ? '' : 's'}</span>
                <span class="arrow">→</span>
              </span>
            </a>`;
          }).join('')}
        </div>
      </section>

      <section class="block actions">
        <a class="btn" href="#/progress">Mi progreso</a>
        <a class="btn ghost" href="#/data">Datos y respaldo</a>
      </section>

      <footer class="colophon">
        <span>Versión 1.0</span><span>·</span><span>Uso personal</span>
      </footer>
    `);
  },

  /* ============================================================
     GRUPO MUSCULAR
     ============================================================ */
  renderGroup(groupId) {
    const g = this.groupById(groupId);
    if (!g) return this.renderHome();
    const list = this.exercisesOf(groupId);

    this.mount(`
      <header class="topbar">
        <a class="back" href="#/">Inicio</a>
        <div class="topbar-title">${escapeHTML(g.name)}</div>
      </header>

      <section class="block">
        <div class="label">Ejercicios</div>
        ${list.length
          ? `<ul class="exercise-list">${list.map(e => this.exerciseRow(e)).join('')}</ul>`
          : `<p class