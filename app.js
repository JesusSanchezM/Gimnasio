/* ============================================================
   app.js — router, pantallas y lógica de interfaz
   ============================================================ */

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function fmtNum(n) {
  if (n == null || isNaN(n)) return '—';
  return new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 }).format(Math.round(n * 10) / 10);
}
function fmtMoney(n) {
  if (n == null || isNaN(n)) return '—';
  return new Intl.NumberFormat('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    .format(Math.round(n * 100) / 100);
}

function fileToDataURL(file, options = {}) {
  const { maxSize = 1000, quality = 0.82, aspect = 4 / 3 } = options;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let sw = img.width, sh = img.height, sx = 0, sy = 0;
      if (aspect) {
        const cur = sw / sh;
        if (cur > aspect) {
          const newW = sh * aspect;
          sx = (sw - newW) / 2;
          sw = newW;
        } else if (cur < aspect) {
          const newH = sw / aspect;
          sy = (sh - newH) / 2;
          sh = newH;
        }
      }
      const scale = Math.min(1, maxSize / Math.max(sw, sh));
      const w = Math.round(sw * scale);
      const h = Math.round(sh * scale);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

const ICONS = {
  supp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6v3l1 3v11a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V9l1-3V3z"/><line x1="9" y1="12" x2="15" y2="12"/></svg>`,
  dance: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="17" r="2.5"/><circle cx="17" cy="15" r="2.5"/><path d="M10.5 17V7l9-2v10"/></svg>`,
  pencil: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l4-1 11-11-3-3L5 16l-1 4z"/><line x1="14" y1="6" x2="17" y2="9"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/></svg>`,
  cardio: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l2-6 4 12 2-6h6"/></svg>`,
  scale: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 11a4 4 0 0 1 8 0"/><line x1="12" y1="11" x2="12" y2="8"/></svg>`,
};

const App = {
  state: {
    groups: [], exercises: [], sessions: [], weightLogs: [],
    user: null,
    lastBackupAt: null,
  },
  _onboardingName: null,
  progressWeekOffset: 0,
  cal: {
    dance:       { year: new Date().getFullYear(), month: new Date().getMonth() },
    practice:    { year: new Date().getFullYear(), month: new Date().getMonth() },
    supplements: { year: new Date().getFullYear(), month: new Date().getMonth() },
    cardio:      { year: new Date().getFullYear(), month: new Date().getMonth() },
    weight:      { year: new Date().getFullYear(), month: new Date().getMonth() },
    finance:     { year: new Date().getFullYear(), month: new Date().getMonth() },
  },

  async init() {
    await DB.seed();
    await this.refresh();

    const appSettings = await DB.get('settings', 'app');
    this.state.lastBackupAt = appSettings?.lastBackupAt || null;

    const user = await DB.get('settings', 'user');
    if (!user?.name) {
      this.renderOnboarding();
      return;
    }
    this.state.user = user;
    this._bootstrapRouter();
  },

  _bootstrapRouter() {
    window.addEventListener('hashchange', () => this.route());
    this.route();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  },

  async refresh() {
    this.state.groups     = (await DB.getAll('groups')).sort((a, b) => a.order - b.order);
    this.state.exercises  = await DB.getAll('exercises');
    this.state.sessions   = await DB.getAll('sessions');
    this.state.weightLogs = await DB.getAll('weightLogs');
  },

  groupById(id)    { return this.state.groups.find(g => g.id === id); },
  exerciseById(id) { return this.state.exercises.find(e => e.id === id); },
  exercisesOf(gid) { return this.state.exercises.filter(e => e.groupId === gid); },
  sessionsOf(eid)  { return this.state.sessions.filter(s => s.exerciseId === eid).sort((a, b) => a.date.localeCompare(b.date)); },

  /* ---------- Peso ---------- */
  latestWeight() {
    if (this.state.weightLogs.length) {
      const sorted = [...this.state.weightLogs].sort((a, b) => b.date.localeCompare(a.date));
      return sorted[0].weight;
    }
    return this.state.user?.weight || 0;
  },
  weightOn(date) {
    return this.state.weightLogs.find(w => w.date === date)?.weight || null;
  },
  async setWeight(date, weight) {
    const existing = this.state.weightLogs.find(w => w.date === date);
    if (existing) {
      await DB.put('weightLogs', { ...existing, weight });
    } else {
      await DB.put('weightLogs', { id: crypto.randomUUID(), date, weight });
    }
    await this.refresh();
  },
  async deleteWeight(date) {
    const existing = this.state.weightLogs.find(w => w.date === date);
    if (existing) {
      await DB.delete('weightLogs', existing.id);
      await this.refresh();
    }
  },

  route() {
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    window.scrollTo(0, 0);
    if (parts.length === 0)                    return this.renderHome();
    if (parts[0] === 'g'       && parts[1])    return this.renderGroup(parts[1]);
    if (parts[0] === 'e'       && parts[1])    return this.renderExercise(parts[1]);
    if (parts[0] === 'edit-ex' && parts[1])    return this.renderEditExercise(parts[1]);
    if (parts[0] === 'log'     && parts[1])    return this.renderLog(parts[1]);
    if (parts[0] === 'progress')               return this.renderProgress();
    if (parts[0] === 'report')                 return this.renderReport();
    if (parts[0] === 'data')                   return this.renderData();
    if (parts[0] === 'suplements')             return this.renderSupplements();
    if (parts[0] === 'dance')                  return this.renderDance();
    if (parts[0] === 'practice')               return this.renderPractice();
    if (parts[0] === 'cardio')                 return this.renderCardio();
    if (parts[0] === 'weight')                 return this.renderWeight();
    if (parts[0] === 'finance')                return this.renderFinance();
    if (parts[0] === 'groups-manage')          return this.renderGroupsManage();
    this.renderHome();
  },

  mount(html) { $('#app').innerHTML = html; },

  /* ============================================================
     ONBOARDING (2 pasos)
     ============================================================ */
  renderOnboarding() {
    document.body.classList.add('onboarding-mode');
    this._renderOnboardingStep1();
  },

  _renderOnboardingStep1() {
    this.mount(`
      <div class="onboarding">
        <div class="onboarding-eyebrow">GYM TRACKER · v1.6</div>
        <div class="onb-step">Paso 1 de 2</div>
        <h1 class="onboarding-title">¿Cómo te<br>llamas?</h1>
        <form id="onboardForm1" class="onboarding-form">
          <input type="text" name="name" required maxlength="30" placeholder="Tu nombre" autofocus autocomplete="off" value="${escapeHTML(this._onboardingName || '')}">
          <button type="submit">Continuar →</button>
        </form>
        <p class="onboarding-hint">Tus datos viven solo en este dispositivo. Puedes exportarlos desde "Datos".</p>
      </div>
    `);
    $('#onboardForm1').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = e.target.name.value.trim();
      if (!name) return;
      this._onboardingName = name;
      this._renderOnboardingStep2();
    });
  },

  _renderOnboardingStep2() {
    this.mount(`
      <div class="onboarding">
        <div class="onboarding-eyebrow">GYM TRACKER · v1.6</div>
        <div class="onb-step">Paso 2 de 2 · ${escapeHTML(this._onboardingName)}</div>
        <h1 class="onboarding-title">Tu peso,<br>tu meta.</h1>
        <form id="onboardForm2" class="onboarding-form">
          <div class="onboarding-row">
            <label>
              <span>Peso actual (kg)</span>
              <input type="number" name="weight" min="30" max="300" step="0.1" placeholder="75" inputmode="decimal" autofocus>
            </label>
            <label>
              <span>Meta (kg)</span>
              <input type="number" name="goalWeight" min="30" max="300" step="0.1" placeholder="70" inputmode="decimal">
            </label>
          </div>
          <label class="onboarding-wide">
            <span>Estatura (cm) — opcional</span>
            <input type="number" name="height" min="100" max="250" step="1" placeholder="175" inputmode="numeric">
          </label>
          <button type="submit">Empezar →</button>
          <button type="button" class="onb-back" id="onbBack">← Atrás</button>
        </form>
        <p class="onboarding-hint">Puedes editar todo esto después en "Datos".</p>
      </div>
    `);
    $('#onboardForm2').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const user = {
        name: this._onboardingName,
        weight: parseFloat(f.weight.value) || null,
        goalWeight: parseFloat(f.goalWeight.value) || null,
        height: parseFloat(f.height.value) || null,
        createdAt: new Date().toISOString(),
      };
      await DB.put('settings', { key: 'user', ...user });
      if (user.weight) {
        await DB.put('weightLogs', {
          id: crypto.randomUUID(), date: todayISO(), weight: user.weight,
        });
      }
      this.state.user = user;
      await this.refresh();
      document.body.classList.remove('onboarding-mode');
      this._bootstrapRouter();
    });
    $('#onbBack').addEventListener('click', () => this._renderOnboardingStep1());
  },

  /* ============================================================
     HOME
     ============================================================ */
  renderHome() {
    const counts = {};
    for (const e of this.state.exercises) counts[e.groupId] = (counts[e.groupId] || 0) + 1;
    const nameUpper = (this.state.user?.name || '').toUpperCase();
    const romans = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];

    const curWeight = this.latestWeight();
    const goalWeight = this.state.user?.goalWeight || 0;

    let weightCard = '';
    if (curWeight > 0) {
      const delta = goalWeight ? curWeight - goalWeight : 0;
      const deltaTxt = !goalWeight
        ? ''
        : Math.abs(delta) < 0.1
          ? 'Meta alcanzada'
          : delta > 0
            ? `${delta.toFixed(1)} kg por bajar`
            : `${Math.abs(delta).toFixed(1)} kg por subir`;
      weightCard = `
        <a href="#/weight" class="weight-card">
          <div class="weight-card-icon">${ICONS.scale}</div>
          <div class="weight-card-main">
            <div class="weight-card-label">PESO ACTUAL</div>
            <div class="weight-card-value">${curWeight.toFixed(1)}<span class="unit">kg</span></div>
            ${goalWeight ? `<div class="weight-card-goal">Meta ${goalWeight.toFixed(1)} kg · ${deltaTxt}</div>` : ''}
          </div>
          <span class="weight-card-arrow">→</span>
        </a>
      `;
    } else {
      weightCard = `
        <a href="#/weight" class="weight-card weight-card-empty">
          <div class="weight-card-icon">${ICONS.scale}</div>
          <div class="weight-card-main">
            <div class="weight-card-label">PESO</div>
            <div class="weight-card-value-sm">Registra tu peso →</div>
          </div>
        </a>
      `;
    }

    let backupHTML = '';
    if (this.state.lastBackupAt) {
      const days = Math.floor((Date.now() - new Date(this.state.lastBackupAt).getTime()) / 86400000);
      const txt = days === 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days} días`;
      const warn = days > 7;
      backupHTML = `<p class="backup-hint ${warn ? 'warn' : ''}">Último respaldo: ${txt}${warn ? ' — conviene exportar' : ''}</p>`;
    } else {
      backupHTML = `<p class="backup-hint warn">Sin respaldos aún — exporta uno desde "Datos"</p>`;
    }

    this.mount(`
      <header class="masthead">
        <div class="wordmark">GYM&nbsp;TRACKER.</div>
        <div class="tagline">${escapeHTML(nameUpper)} · PERSONAL SYSTEM</div>
      </header>

      <section class="hero-v2">
        <div class="hero-eyebrow">
          <span>PERSONAL TRAINING LOG</span>
          <span>EST. 2026</span>
        </div>
        <h1 class="hero-title"><em>Train</em><br>with purpose.</h1>
        <p class="hero-sub">Registra. Analiza. Evoluciona.</p>
      </section>

      <section class="block">
        ${weightCard}
      </section>

      <section class="block">
        <div class="label">Días de entrenamiento</div>
        <div class="group-grid">
          ${this.state.groups.map((g, i) => {
            const n = counts[g.id] || 0;
            return `<a class="group-card" href="#/g/${g.id}">
              <span class="group-card-number">DÍA ${romans[i] || (i + 1)}</span>
              <span class="group-name">${escapeHTML(g.name)}</span>
              ${g.sub ? `<span class="group-sub">${escapeHTML(g.sub)}</span>` : ''}
              <span class="group-meta">
                <span>${n} ejercicio${n === 1 ? '' : 's'}</span>
                <span class="arrow">→</span>
              </span>
            </a>`;
          }).join('')}
        </div>
        <button class="btn small ghost" id="manageGroupsBtn" style="margin-top: 12px;">Gestionar días</button>
        <div class="hero-actions" style="margin-top: 10px;">
          <a class="btn ghost" href="#/progress">Mi progreso</a>
          <a class="btn ghost" href="#/report">Reporte mensual</a>
        </div>
      </section>

      <section class="block">
        <div class="label">Sistema personal</div>
        <ul class="module-list-v2">
          <li><a href="#/suplements">
            <div class="module-icon">${ICONS.supp}</div>
            <div class="module-info">
              <div class="module-name">Suplementos</div>
              <div class="module-sub">Creatina, vitaminas</div>
            </div>
            <span class="chev">›</span>
          </a></li>
          <li><a href="#/cardio">
            <div class="module-icon">${ICONS.cardio}</div>
            <div class="module-info">
              <div class="module-name">Cardio</div>
              <div class="module-sub">Bici, caminadora, remo</div>
            </div>
            <span class="chev">›</span>
          </a></li>
          <li><a href="#/dance">
            <div class="module-icon">${ICONS.dance}</div>
            <div class="module-info">
              <div class="module-name">Baile</div>
              <div class="module-sub">${Lifestyle.state.danceTypes.map(t => t.label).join(' · ') || 'Sin tipos'}</div>
            </div>
            <span class="chev">›</span>
          </a></li>
          <li><a href="#/practice">
            <div class="module-icon">${ICONS.pencil}</div>
            <div class="module-info">
              <div class="module-name">Práctica creativa</div>
              <div class="module-sub">${Lifestyle.state.practiceTypes.map(t => t.label).join(' · ') || 'Sin tipos'}</div>
            </div>
            <span class="chev">›</span>
          </a></li>
          <li><a href="#/finance">
            <div class="module-icon">${ICONS.shield}</div>
            <div class="module-info">
              <div class="module-name">Dinero</div>
              <div class="module-sub">Fondo de seguridad</div>
            </div>
            <span class="chev">›</span>
          </a></li>
        </ul>
      </section>

      <section class="block">
        <a class="btn ghost" href="#/data">Datos y respaldo</a>
        ${backupHTML}
      </section>

      <footer class="colophon">
        <span>${escapeHTML(nameUpper)}</span><span>·</span><span>EST. 2026</span>
      </footer>
    `);

    $('#manageGroupsBtn').addEventListener('click', () => { location.hash = '#/groups-manage'; });
    if (!Lifestyle.state.loaded) Lifestyle.load();
  },

  /* ============================================================
     GESTIÓN DE GRUPOS
     ============================================================ */
  renderGroupsManage() {
    this.mount(`
      <header class="topbar">
        <a class="back" href="#/">Inicio</a>
        <div class="topbar-title">Días de entrenamiento</div>
      </header>

      <section class="block">
        <div class="label">Tus días</div>
        <ul class="module-list">
          ${this.state.groups.map(g => `
            <li>
              <span>${escapeHTML(g.name)}${g.sub ? ' ' + escapeHTML(g.sub) : ''}</span>
              <button class="row-del" data-delgroup="${g.id}">×</button>
            </li>
          `).join('') || '<li class="muted small">Sin días configurados</li>'}
        </ul>
        <button class="btn small ghost" id="addGroupBtn" style="margin-top: 12px;">+ Añadir día</button>
        <form id="addGroupForm" class="add-form">
          <label class="field">
            <span class="field-label">Nombre</span>
            <input type="text" name="name" required maxlength="30" placeholder="Ej. Pierna">
          </label>
          <label class="field">
            <span class="field-label">Subtítulo (opcional)</span>
            <input type="text" name="sub" maxlength="30" placeholder="Ej. + Core">
          </label>
          <button type="submit" class="btn">Añadir día</button>
        </form>
      </section>
    `);

    $('#addGroupBtn').addEventListener('click', () => $('#addGroupForm').classList.toggle('open'));
    $('#addGroupForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const name = f.name.value.trim();
      const sub = f.sub.value.trim();
      if (!name) return;
      const maxOrder = Math.max(0, ...this.state.groups.map(g => g.order || 0));
      await DB.put('groups', {
        id: 'g-' + crypto.randomUUID().slice(0, 8),
        name, sub, order: maxOrder + 1,
      });
      await this.refresh();
      this.renderGroupsManage();
    });

    $$('[data-delgroup]').forEach(btn => btn.addEventListener('click', async () => {
      const id = btn.dataset.delgroup;
      const group = this.groupById(id);
      const exCount = this.exercisesOf(id).length;
      const msg = exCount > 0
        ? `"${group.name}" tiene ${exCount} ejercicio(s). Se eliminarán también. ¿Continuar?`
        : `¿Eliminar "${group.name}"?`;
      if (!confirm(msg)) return;
      for (const ex of this.exercisesOf(id)) {
        for (const s of this.sessionsOf(ex.id)) await DB.delete('sessions', s.id);
        await DB.delete('exercises', ex.id);
      }
      await DB.delete('groups', id);
      await this.refresh();
      this.renderGroupsManage();
    }));
  },

  /* ============================================================
     GRUPO
     ============================================================ */
  renderGroup(groupId) {
    const g = this.groupById(groupId);
    if (!g) return this.renderHome();
    const list = this.exercisesOf(groupId);
    const title = g.sub ? `${g.name} ${g.sub}` : g.name;

    this.mount(`
      <header class="topbar">
        <a class="back" href="#/">Inicio</a>
        <div class="topbar-title">${escapeHTML(title)}</div>
      </header>

      <section class="block">
        <div class="label">Ejercicios</div>
        ${list.length
          ? `<ul class="exercise-list">${list.map(e => this.exerciseRow(e)).join('')}</ul>`
          : `<p class="empty">No hay ejercicios todavía. Añade el primero abajo.</p>`}
      </section>

      <section class="block">
        <button id="toggleAdd" class="btn small ghost">+ Añadir ejercicio</button>
        <form id="addForm" class="add-form">
          <label class="field">
            <span class="field-label">Nombre del ejercicio</span>
            <input type="text" name="name" required placeholder="Ej. Press de banca" maxlength="60">
          </label>
          <label class="field">
            <span class="field-label">Fotografía (opcional)</span>
            <input type="file" name="photo" accept="image/*">
          </label>
          <div class="photo-preview" id="preview"></div>
          <button type="submit" class="btn">Crear ejercicio</button>
        </form>
      </section>
    `);

    const form = $('#addForm'), preview = $('#preview');
    $('#toggleAdd').addEventListener('click', () => form.classList.toggle('open'));
    $('input[name="photo"]', form).addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) { preview.innerHTML = ''; return; }
      try {
        const dataUrl = await fileToDataURL(f, { aspect: 4 / 3, maxSize: 1000 });
        preview.innerHTML = `<img src="${dataUrl}" alt="">`;
      } catch { preview.innerHTML = ''; }
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = form.name.value.trim();
      if (!name) return;
      const file = form.photo.files[0];
      let photo = null;
      if (file) { try { photo = await fileToDataURL(file, { aspect: 4 / 3, maxSize: 1000 }); } catch {} }
      await DB.put('exercises', {
        id: crypto.randomUUID(), groupId, name, photo,
        createdAt: new Date().toISOString(),
      });
      await this.refresh();
      this.renderGroup(groupId);
    });
  },

  exerciseRow(e) {
    return `<li class="exercise-row">
      <a href="#/e/${e.id}">
        <div class="thumb">${e.photo ? `<img src="${e.photo}" alt="">` : ''}</div>
        <div class="exercise-info"><div class="name">${escapeHTML(e.name)}</div></div>
        <span class="chev">›</span>
      </a>
    </li>`;
  },

  /* ============================================================
     EJERCICIO
     ============================================================ */
  renderExercise(exerciseId) {
    const ex = this.exerciseById(exerciseId);
    if (!ex) return this.renderHome();
    const group    = this.groupById(ex.groupId);
    const sessions = this.sessionsOf(exerciseId);

    const pointsRM = sessions.map(s => {
      const top = Reports.sessionTopSet(s);
      return top ? { x: s.date, y: Reports.epley1RM(top.weight, top.reps) } : null;
    }).filter(Boolean);
    const pointsW = sessions.map(s => {
      const top = Reports.sessionTopSet(s);
      return top ? { x: s.date, y: top.weight } : null;
    }).filter(Boolean);

    const rows = [...sessions].reverse().map(s => {
      const totalSets = s.sets.length;
      const topReps   = Math.max(...s.sets.map(x => x.reps));
      const topW      = Math.max(...s.sets.map(x => x.weight));
      return `<tr>
        <td>${Reports.fmtHuman(s.date)}</td>
        <td class="num">${totalSets}</td>
        <td class="num">${topReps}</td>
        <td class="num">${fmtNum(topW)} kg</td>
        <td class="num"><button class="row-del" data-del="${s.id}" aria-label="Eliminar">×</button></td>
      </tr>`;
    }).join('');

    this.mount(`
      <header class="topbar">
        <a class="back" href="#/g/${ex.groupId}">${escapeHTML(group?.name || 'Grupo')}</a>
        <div class="topbar-title">${escapeHTML(ex.name)}</div>
        <a href="#/edit-ex/${ex.id}" class="topbar-action">Editar</a>
      </header>

      ${ex.photo ? `<div class="photo-large"><img src="${ex.photo}" alt=""></div>` : ''}

      <section class="block">
        <div class="label">Historial</div>
        ${sessions.length ? `
          <table>
            <thead><tr>
              <th>Fecha</th><th class="num">Series</th><th class="num">Reps</th>
              <th class="num">Peso</th><th></th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>` : `<p class="empty">Aún no hay sesiones registradas.</p>`}
      </section>

      <section class="block">
        <a href="#/log/${ex.id}" class="btn">Registrar sesión</a>
      </section>

      <section class="block">
        <div class="label">Fuerza estimada (1RM)</div>
        ${Charts.line(pointsRM, { fmtX: Reports.fmtHuman, fmtY: v => `${Math.round(v)}` })}
      </section>

      <section class="block">
        <div class="label">Peso máximo por sesión</div>
        ${Charts.line(pointsW, { fmtX: Reports.fmtHuman, fmtY: v => `${Math.round(v)}` })}
      </section>
    `);

    $$('[data-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Eliminar esta sesión?')) return;
        await DB.delete('sessions', btn.dataset.del);
        await this.refresh();
        this.renderExercise(exerciseId);
      });
    });
  },

  renderEditExercise(id) {
    const ex = this.exerciseById(id);
    if (!ex) return this.renderHome();

    this.mount(`
      <header class="topbar">
        <a class="back" href="#/e/${ex.id}">${escapeHTML(ex.name)}</a>
        <div class="topbar-title">Editar ejercicio</div>
      </header>

      <form id="editForm">
        <label class="field">
          <span class="field-label">Nombre</span>
          <input type="text" name="name" required maxlength="60" value="${escapeHTML(ex.name)}">
        </label>
        <label class="field">
          <span class="field-label">Grupo</span>
          <select name="groupId">
            ${this.state.groups.map(g =>
              `<option value="${g.id}" ${g.id === ex.groupId ? 'selected' : ''}>${escapeHTML(g.name)}${g.sub ? ' ' + escapeHTML(g.sub) : ''}</option>`
            ).join('')}
          </select>
        </label>

        ${ex.photo ? `
          <div class="field">
            <span class="field-label">Foto actual</span>
            <div class="photo-preview"><img src="${ex.photo}" alt=""></div>
            <label style="display:flex;align-items:center;gap:8px;margin-top:8px;font-size:13px;color:var(--muted);">
              <input type="checkbox" name="removePhoto" style="width:auto;min-height:auto;"> Quitar foto
            </label>
          </div>` : ''}

        <label class="field">
          <span class="field-label">${ex.photo ? 'Reemplazar foto' : 'Añadir foto'} (opcional)</span>
          <input type="file" name="photo" accept="image/*">
        </label>

        <div class="stack">
          <button type="submit" class="btn">Guardar cambios</button>
          <a href="#/e/${ex.id}" class="btn ghost">Cancelar</a>
          <button type="button" class="btn ghost" id="deleteExBtn"
                  style="border-color:#B00020;color:#B00020;margin-top:24px;">Eliminar ejercicio</button>
        </div>
      </form>
    `);

    $('#editForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const name = f.name.value.trim();
      if (!name) return;
      let photo = ex.photo;
      if (f.removePhoto?.checked) photo = null;
      const file = f.photo.files[0];
      if (file) { try { photo = await fileToDataURL(file, { aspect: 4 / 3, maxSize: 1000 }); } catch {} }
      await DB.put('exercises', { ...ex, name, groupId: f.groupId.value, photo });
      await this.refresh();
      location.hash = `#/e/${ex.id}`;
    });

    $('#deleteExBtn').addEventListener('click', async () => {
      if (!confirm('¿Eliminar este ejercicio y TODAS sus sesiones?')) return;
      if (!confirm('Segunda confirmación: irreversible.')) return;
      const gid = ex.groupId;
      for (const s of this.sessionsOf(ex.id)) await DB.delete('sessions', s.id);
      await DB.delete('exercises', ex.id);
      await this.refresh();
      location.hash = `#/g/${gid}`;
    });
  },

  /* ============================================================
     REGISTRAR SESIÓN
     ============================================================ */
  renderLog(exerciseId) {
    const ex = this.exerciseById(exerciseId);
    if (!ex) return this.renderHome();
    const today = todayISO();

    this.mount(`
      <header class="topbar">
        <a class="back" href="#/e/${ex.id}">${escapeHTML(ex.name)}</a>
        <div class="topbar-title">Registrar sesión</div>
      </header>

      <form id="logForm">
        <label class="field">
          <span class="field-label">Fecha</span>
          <input type="date" name="date" value="${today}" required>
        </label>

        <div class="label">Series</div>
        <div class="sets-head">
          <div>Peso (kg)</div><div>Reps</div><div>RIR</div><div></div>
        </div>
        <div id="sets"></div>
        <button type="button" id="addSet" class="btn small ghost" style="margin: 10px 0 24px;">+ Añadir serie</button>
        <button type="submit" class="btn">Guardar sesión</button>
      </form>
    `);

    const container = $('#sets');
    const addRow = () => {
      const row = document.createElement('div');
      row.className = 'set-row';
      row.innerHTML = `
        <input type="number" name="weight" min="0" step="0.5" inputmode="decimal" placeholder="0">
        <input type="number" name="reps"   min="1" step="1"   inputmode="numeric" placeholder="0">
        <input type="number" name="rir"    min="0" max="10" step="1" placeholder="—">
        <button type="button" class="set-remove">×</button>`;
      row.querySelector('.set-remove').addEventListener('click', () => {
        if ($$('.set-row', container).length > 1) row.remove();
      });
      container.appendChild(row);
    };
    addRow(); addRow(); addRow();
    $('#addSet').addEventListener('click', addRow);

    $('#logForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const sets = $$('.set-row', container).map(r => {
        const w  = parseFloat(r.querySelector('[name="weight"]').value);
        const rp = parseInt(r.querySelector('[name="reps"]').value, 10);
        const rr = parseInt(r.querySelector('[name="rir"]').value, 10);
        if (!w || !rp) return null;
        return { weight: w, reps: rp, rir: isNaN(rr) ? null : rr };
      }).filter(Boolean);
      if (!sets.length) { alert('Añade al menos una serie.'); return; }
      await DB.put('sessions', {
        id: crypto.randomUUID(), exerciseId, date: f.date.value, sets,
        createdAt: new Date().toISOString(),
      });
      await this.refresh();
      location.hash = `#/e/${exerciseId}`;
    });
  },

  /* ============================================================
     PROGRESO
     ============================================================ */
  renderProgress() {
    const baseMonday = Reports.mondayOf(new Date());
    const weekStart  = Reports.addDays(baseMonday, this.progressWeekOffset * 7);
    const weekEnd    = Reports.addDays(weekStart, 6);
    const report = Reports.buildWeeklyReport(this.state.sessions, this.state.exercises, weekStart);
    const label  = `${Reports.fmtHuman(Reports.fmtISO(weekStart))} – ${Reports.fmtHuman(Reports.fmtISO(weekEnd))}`;
    const curBests  = Reports.weekExerciseBests(this.state.sessions, weekStart);
    const prevBests = Reports.weekExerciseBests(this.state.sessions, Reports.addDays(weekStart, -7));

    const trendRows = [];
    for (const [exId, cur] of curBests) {
      const ex = this.exerciseById(exId);
      if (!ex) continue;
      if (!prevBests.has(exId)) {
        trendRows.push(`<li><span class="trend-name">${escapeHTML(ex.name)}</span><span class="trend-delta flat">nuevo</span></li>`);
        continue;
      }
      const prev = prevBests.get(exId);
      const d = prev ? ((cur - prev) / prev) * 100 : 0;
      const cls   = d >  2 ? 'up'   : d < -2 ? 'down' : 'flat';
      const arrow = d >  2 ? '↑'    : d < -2 ? '↓'    : '→';
      trendRows.push(`<li>
        <span class="trend-name">${escapeHTML(ex.name)}</span>
        <span class="trend-val">${Math.round(cur)} kg 1RM</span>
        <span class="trend-delta ${cls}">${arrow} ${Math.abs(d).toFixed(0)}%</span>
      </li>`);
    }

    this.mount(`
      <header class="topbar">
        <a class="back" href="#/">Inicio</a>
        <div class="topbar-title">Mi progreso</div>
      </header>

      <div class="weeknav">
        <button class="weekbtn" id="prevWeek">←</button>
        <div class="weeklabel">${label}</div>
        <button class="weekbtn" id="nextWeek" ${this.progressWeekOffset >= 0 ? 'disabled' : ''}>→</button>
      </div>

      <div class="stats">
        <div class="stat"><div class="stat-label">Entrenamientos</div>
          <div class="stat-value">${report.current.workouts}</div></div>
        <div class="stat"><div class="stat-label">Ejercicios</div>
          <div class="stat-value">${report.current.exercises}</div></div>
        <div class="stat"><div class="stat-label">Volumen total</div>
          <div class="stat-value">${fmtNum(report.current.volume)}<span class="unit">kg</span></div></div>
        <div class="stat"><div class="stat-label">Sesiones</div>
          <div class="stat-value">${report.current.sessions.length}</div></div>
      </div>

      <section class="block">
        <div class="label">Observaciones</div>
        ${report.observations.length
          ? `<ul class="observations">${report.observations.map(o => `<li>${escapeHTML(o)}</li>`).join('')}</ul>`
          : `<p class="empty">Sin observaciones esta semana.</p>`}
      </section>

      <section class="block">
        <div class="label">Tendencias por ejercicio</div>
        ${trendRows.length
          ? `<ul class="trend-list">${trendRows.join('')}</ul>`
          : `<p class="empty">Sin datos suficientes todavía.</p>`}
      </section>
    `);

    $('#prevWeek').addEventListener('click', () => { this.progressWeekOffset -= 1; this.renderProgress(); });
    $('#nextWeek').addEventListener('click', () => {
      if (this.progressWeekOffset >= 0) return;
      this.progressWeekOffset += 1; this.renderProgress();
    });
  },

  /* ============================================================
     PESO
     ============================================================ */
  renderWeight() {
    const cal = this.cal.weight;
    const curWeight = this.latestWeight();
    const goalWeight = this.state.user?.goalWeight || 0;
    const startWeight = this.state.user?.weight || 0;
    const monthPrefix = `${cal.year}-${String(cal.month + 1).padStart(2, '0')}`;

    const monthLogs = this.state.weightLogs
      .filter(w => w.date.startsWith(monthPrefix))
      .sort((a, b) => a.date.localeCompare(b.date));

    const markersForDate = (iso) => {
      const w = this.weightOn(iso);
      if (w == null) return null;
      return { markers: [`<span class="cal-marker type-weight">${w.toFixed(1)}</span>`] };
    };

    const allPoints = [...this.state.weightLogs]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(l => ({ x: l.date, y: l.weight }));

    let deltaFromStart = null;
    if (startWeight && curWeight) deltaFromStart = curWeight - startWeight;
    const deltaStartTxt = deltaFromStart == null
      ? ''
      : Math.abs(deltaFromStart) < 0.1
        ? 'sin cambios'
        : deltaFromStart > 0
          ? `+${deltaFromStart.toFixed(1)} kg`
          : `${deltaFromStart.toFixed(1)} kg`;

    const goalTxt = !goalWeight || !curWeight
      ? ''
      : Math.abs(curWeight - goalWeight) < 0.1
        ? 'Meta alcanzada ✓'
        : curWeight > goalWeight
          ? `Faltan ${(curWeight - goalWeight).toFixed(1)} kg`
          : `Faltan ${(goalWeight - curWeight).toFixed(1)} kg por subir`;

    this.mount(`
      <header class="topbar">
        <a class="back" href="#/">Inicio</a>
        <div class="topbar-title">Peso</div>
      </header>

      <section class="runway-hero weight-hero">
        <div class="runway-eyebrow">PESO ACTUAL</div>
        <div class="runway-number">${curWeight ? curWeight.toFixed(1) : '—'}<span class="hero-unit">kg</span></div>
        <div class="weight-meta">
          ${goalWeight ? `<span>Meta ${goalWeight.toFixed(1)} kg</span>` : '<span>Sin meta</span>'}
          ${deltaStartTxt ? `<span>Desde inicio ${deltaStartTxt}</span>` : ''}
        </div>
        ${goalTxt ? `<p class="runway-caption">${goalTxt}</p>` : ''}
      </section>

      <section class="block">
        <div class="label">Evolución</div>
        ${allPoints.length >= 2
          ? Charts.line(allPoints, { fmtX: Reports.fmtHuman, fmtY: v => `${v.toFixed(0)}` })
          : `<p class="empty">Registra al menos dos pesos para ver la tendencia.</p>`}
      </section>

      <section class="block">
        <div class="label">Calendario</div>
        <div class="monthnav">
          <button class="weekbtn" id="calPrev">←</button>
          <div class="weeklabel">${Calendar.monthLabel(cal.year, cal.month)}</div>
          <button class="weekbtn" id="calNext">→</button>
        </div>
        <div id="calRoot">${Calendar.build({ year: cal.year, month: cal.month, markersForDate })}</div>
        <div id="dayPanel"></div>
        <p class="hint" style="margin-top:16px;">Toca un día para registrar o ajustar tu peso.</p>
      </section>

      <section class="block">
        <div class="label">Últimos registros</div>
        ${monthLogs.length ? `
          <table>
            <thead><tr><th>Fecha</th><th class="num">Peso</th><th></th></tr></thead>
            <tbody>
              ${[...monthLogs].reverse().map(l => `
                <tr>
                  <td>${Reports.fmtHuman(l.date)}</td>
                  <td class="num">${l.weight.toFixed(1)} kg</td>
                  <td class="num"><button class="row-del" data-delw="${l.date}">×</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : `<p class="empty">Sin registros este mes.</p>`}
      </section>
    `);

    $('#calPrev').addEventListener('click', () => { this._shiftMonth('weight', -1); this.renderWeight(); });
    $('#calNext').addEventListener('click', () => { this._shiftMonth('weight',  1); this.renderWeight(); });

    $$('[data-delw]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('¿Eliminar este registro?')) return;
      await this.deleteWeight(b.dataset.delw);
      this.renderWeight();
    }));

    Calendar.attach($('#calRoot'), (iso) => {
      const panel = $('#dayPanel');
      const w = this.weightOn(iso);
      panel.innerHTML = `
        <div class="day-panel">
          <div class="day-panel-head">
            <div class="day-panel-date">${Reports.fmtHuman(iso)}</div>
            <button class="day-panel-close" id="dpClose">×</button>
          </div>
          <form id="weightForm" class="action-form" style="margin-top:0;">
            <div class="field-row">
              <input type="number" name="weight" min="30" max="300" step="0.1" required inputmode="decimal"
                     value="${w != null ? w : ''}" placeholder="kg" autofocus>
              <button type="submit" class="btn">Guardar</button>
            </div>
            ${w != null ? `<button type="button" class="adjust-btn" id="delWeightBtn" style="width:100%;margin-top:8px;">Eliminar registro</button>` : ''}
          </form>
        </div>`;
      $('#dpClose').addEventListener('click', () => { panel.innerHTML = ''; });
      $('#weightForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const val = parseFloat(e.target.weight.value);
        if (!val) return;
        await this.setWeight(iso, val);
        this.renderWeight();
      });
      if (w != null) {
        $('#delWeightBtn').addEventListener('click', async () => {
          await this.deleteWeight(iso);
          this.renderWeight();
        });
      }
    });
  },

  /* ============================================================
     SUPLEMENTOS
     ============================================================ */
  async renderSupplements() {
    if (!Lifestyle.state.loaded) await Lifestyle.load();
    const today = todayISO();
    const cal = this.cal.supplements;
    const monthPrefix = `${cal.year}-${String(cal.month + 1).padStart(2, '0')}`;

    const monthlyCounts = {};
    for (const log of Lifestyle.state.supplementLogs) {
      if (!log.date.startsWith(monthPrefix)) continue;
      monthlyCounts[log.supplementId] = (monthlyCounts[log.supplementId] || 0) + 1;
    }
    const barItems = Lifestyle.state.supplements
      .map(s => ({
        label: s.name,
        value: monthlyCounts[s.id] || 0,
        display: `${monthlyCounts[s.id] || 0}d`,
      }))
      .filter(i => i.value > 0);

    const markersForDate = (iso) => {
      const taken = Lifestyle.supplementsTakenOn(iso);
      if (!taken.length) return null;
      const shown = taken.slice(0, 2);
      const remaining = taken.length - 2;
      const html = shown.map(s =>
        `<span class="cal-marker type-accent">${s.name.slice(0, 2).toUpperCase()}</span>`
      ).join('') + (remaining > 0 ? `<span class="cal-marker type-ink">+${remaining}</span>` : '');
      return { markers: [html] };
    };

    const todayList = Lifestyle.state.supplements.map(s => {
      const taken = Lifestyle.isTaken(s.id, today);
      return `<li><button class="supp-toggle ${taken ? 'taken' : ''}" data-toggle="${s.id}">
        <span>${escapeHTML(s.name)}</span>
        <span class="supp-state">${taken ? 'tomado' : 'marcar'}</span>
      </button></li>`;
    }).join('');

    this.mount(`
      <header class="topbar">
        <a class="back" href="#/">Inicio</a>
        <div class="topbar-title">Suplementos</div>
      </header>

      <section class="block">
        <div class="label">Hoy</div>
        ${Lifestyle.state.supplements.length
          ? `<ul class="supp-list">${todayList}</ul>`
          : `<p class="empty">Añade tu primer suplemento abajo.</p>`}
        <button class="btn small ghost" id="addSuppBtn" style="margin-top: 12px;">+ Añadir suplemento</button>
        <form id="addSuppForm" class="add-form">
          <label class="field">
            <span class="field-label">Nombre</span>
            <input type="text" name="name" required maxlength="40" placeholder="Ej. Creatina">
          </label>
          <button type="submit" class="btn">Añadir</button>
        </form>
      </section>

      <section class="block">
        <div class="label">Este mes</div>
        ${barItems.length
          ? Charts.bars(barItems)
          : `<p class="empty">Sin tomas registradas este mes.</p>`}
      </section>

      <section class="block">
        <div class="label">Calendario</div>
        <div class="monthnav">
          <button class="weekbtn" id="calPrev">←</button>
          <div class="weeklabel">${Calendar.monthLabel(cal.year, cal.month)}</div>
          <button class="weekbtn" id="calNext">→</button>
        </div>
        <div id="calRoot">${Calendar.build({ year: cal.year, month: cal.month, markersForDate })}</div>
        <div id="dayPanel"></div>
      </section>

      <section class="block">
        <div class="label">Administrar</div>
        <ul class="module-list">
          ${Lifestyle.state.supplements.map(s => `<li>
            <span>${escapeHTML(s.name)}</span>
            <button class="row-del" data-remove="${s.id}">×</button>
          </li>`).join('') || '<li class="muted small">—</li>'}
        </ul>
      </section>
    `);

    $('#addSuppBtn').addEventListener('click', () => $('#addSuppForm').classList.toggle('open'));
    $('#addSuppForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = e.target.name.value.trim();
      if (!name) return;
      await DB.put('supplements', { id: crypto.randomUUID(), name, createdAt: new Date().toISOString() });
      await Lifestyle.load();
      this.renderSupplements();
    });
    $$('[data-toggle]').forEach(b => b.addEventListener('click', async () => {
      await Lifestyle.toggleSupplement(b.dataset.toggle, today);
      this.renderSupplements();
    }));
    $$('[data-remove]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('¿Eliminar suplemento y su historial?')) return;
      const id = b.dataset.remove;
      await DB.delete('supplements', id);
      for (const l of Lifestyle.state.supplementLogs.filter(x => x.supplementId === id)) {
        await DB.delete('supplementLogs', l.id);
      }
      await Lifestyle.load();
      this.renderSupplements();
    }));
    $('#calPrev').addEventListener('click', () => { this._shiftMonth('supplements', -1); this.renderSupplements(); });
    $('#calNext').addEventListener('click', () => { this._shiftMonth('supplements',  1); this.renderSupplements(); });

    Calendar.attach($('#calRoot'), (iso) => {
      const panel = $('#dayPanel');
      const taken = new Set(Lifestyle.supplementsTakenOn(iso).map(s => s.id));
      panel.innerHTML = `
        <div class="day-panel">
          <div class="day-panel-head">
            <div class="day-panel-date">${Reports.fmtHuman(iso)}</div>
            <button class="day-panel-close" id="dpClose">×</button>
          </div>
          ${Lifestyle.state.supplements.length ? `
            <div class="day-options">
              ${Lifestyle.state.supplements.map(s => `<button class="opt-btn ${taken.has(s.id) ? 'active' : ''}" data-pick="${s.id}">${escapeHTML(s.name)}</button>`).join('')}
            </div>` : `<p class="hint">Sin suplementos configurados.</p>`}
        </div>`;
      $('#dpClose').addEventListener('click', () => { panel.innerHTML = ''; });
      panel.querySelectorAll('[data-pick]').forEach(btn => btn.addEventListener('click', async () => {
        await Lifestyle.toggleSupplement(btn.dataset.pick, iso);
        this.renderSupplements();
      }));
    });
  },

  /* ============================================================
     BAILE
     ============================================================ */
  async renderDance() {
    if (!Lifestyle.state.loaded) await Lifestyle.load();
    const cal = this.cal.dance;
    const typeMap = Object.fromEntries(Lifestyle.state.danceTypes.map(t => [t.code, t]));
    const monthPrefix = `${cal.year}-${String(cal.month + 1).padStart(2, '0')}`;

    const monthlyCounts = {};
    for (const log of Lifestyle.state.danceLogs) {
      if (!log.date.startsWith(monthPrefix)) continue;
      monthlyCounts[log.type] = (monthlyCounts[log.type] || 0) + 1;
    }
    const barItems = Lifestyle.state.danceTypes
      .map(t => ({
        label: t.label,
        value: monthlyCounts[t.code] || 0,
        display: String(monthlyCounts[t.code] || 0),
      }))
      .filter(i => i.value > 0);

    const markersForDate = (iso) => {
      const codes = Lifestyle.danceTypesOn(iso);
      if (!codes.length) return null;
      const shown = codes.slice(0, 2);
      const remaining = codes.length - 2;
      const html = shown.map(code => {
        const t = typeMap[code];
        if (!t) return '';
        return `<span class="cal-marker type-${t.color}">${escapeHTML(t.code)}</span>`;
      }).join('') + (remaining > 0 ? `<span class="cal-marker type-ink">+${remaining}</span>` : '');
      return { markers: [html] };
    };

    this.mount(`
      <header class="topbar">
        <a class="back" href="#/">Inicio</a>
        <div class="topbar-title">Baile</div>
      </header>

      <section class="block">
        <div class="label">Este mes</div>
        ${barItems.length
          ? Charts.bars(barItems)
          : `<p class="empty">Sin registros este mes.</p>`}
      </section>

      <section class="block">
        <div class="label">Calendario</div>
        <div class="monthnav">
          <button class="weekbtn" id="calPrev">←</button>
          <div class="weeklabel">${Calendar.monthLabel(cal.year, cal.month)}</div>
          <button class="weekbtn" id="calNext">→</button>
        </div>
        <div id="calRoot">${Calendar.build({ year: cal.year, month: cal.month, markersForDate })}</div>
        <div id="dayPanel"></div>
        <p class="hint" style="margin-top:16px;">Toca un día para marcar tus tipos de baile.</p>
      </section>

      <section class="block">
        <div class="label">Tipos</div>
        <ul class="module-list">
          ${Lifestyle.state.danceTypes.map(t => `
            <li>
              <span><span class="cal-marker type-${t.color}" style="margin-right:10px;">${escapeHTML(t.code)}</span>${escapeHTML(t.label)}</span>
              <button class="row-del" data-deltype="${escapeHTML(t.code)}">×</button>
            </li>
          `).join('') || '<li class="muted small">Sin tipos</li>'}
        </ul>
        <button class="btn small ghost" id="addDanceTypeBtn" style="margin-top:12px;">+ Añadir tipo</button>
        <form id="addDanceTypeForm" class="add-form">
          <label class="field">
            <span class="field-label">Nombre</span>
            <input type="text" name="name" required maxlength="20" placeholder="Ej. Cumbia">
          </label>
          <button type="submit" class="btn">Añadir</button>
        </form>
      </section>
    `);

    $('#calPrev').addEventListener('click', () => { this._shiftMonth('dance', -1); this.renderDance(); });
    $('#calNext').addEventListener('click', () => { this._shiftMonth('dance',  1); this.renderDance(); });

    $('#addDanceTypeBtn').addEventListener('click', () => $('#addDanceTypeForm').classList.toggle('open'));
    $('#addDanceTypeForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = e.target.name.value.trim();
      if (!name) return;
      const existing = Lifestyle.state.danceTypes;
      const code = Lifestyle.generateCode(name, existing.map(t => t.code));
      const color = Lifestyle.nextColor(existing.map(t => t.color));
      const types = [...existing, { code, label: name, color }];
      await Lifestyle.saveDanceTypes(types);
      this.renderDance();
    });
    $$('[data-deltype]').forEach(btn => btn.addEventListener('click', async () => {
      const code = btn.dataset.deltype;
      const type = Lifestyle.state.danceTypes.find(t => t.code === code);
      if (!type) return;
      const logs = Lifestyle.state.danceLogs.filter(l => l.type === code);
      const msg = logs.length
        ? `"${type.label}" tiene ${logs.length} registro(s). Se eliminarán también. ¿Continuar?`
        : `¿Eliminar "${type.label}"?`;
      if (!confirm(msg)) return;
      for (const l of logs) await DB.delete('danceLogs', l.id);
      const types = Lifestyle.state.danceTypes.filter(t => t.code !== code);
      await Lifestyle.saveDanceTypes(types);
      await Lifestyle.load();
      this.renderDance();
    }));

    Calendar.attach($('#calRoot'), (iso) => {
      const panel = $('#dayPanel');
      const codes = new Set(Lifestyle.danceTypesOn(iso));
      panel.innerHTML = `
        <div class="day-panel">
          <div class="day-panel-head">
            <div class="day-panel-date">${Reports.fmtHuman(iso)}</div>
            <button class="day-panel-close" id="dpClose">×</button>
          </div>
          <div class="day-options">
            ${Lifestyle.state.danceTypes.map(t => `
              <button class="opt-btn ${codes.has(t.code) ? 'active' : ''}" data-pick="${escapeHTML(t.code)}">${escapeHTML(t.label)}</button>
            `).join('') || '<p class="hint">Sin tipos configurados.</p>'}
          </div>
        </div>`;
      $('#dpClose').addEventListener('click', () => { panel.innerHTML = ''; });
      panel.querySelectorAll('[data-pick]').forEach(btn => btn.addEventListener('click', async () => {
        await Lifestyle.toggleDance(iso, btn.dataset.pick);
        this.renderDance();
      }));
    });
  },

  /* ============================================================
     PRÁCTICA
     ============================================================ */
  async renderPractice() {
    if (!Lifestyle.state.loaded) await Lifestyle.load();
    const cal = this.cal.practice;
    const typeMap = Object.fromEntries(Lifestyle.state.practiceTypes.map(t => [t.code, t]));
    const monthPrefix = `${cal.year}-${String(cal.month + 1).padStart(2, '0')}`;

    const monthlyCounts = {};
    for (const log of Lifestyle.state.practiceLogs) {
      if (!log.date.startsWith(monthPrefix)) continue;
      monthlyCounts[log.type] = (monthlyCounts[log.type] || 0) + 1;
    }
    const barItems = Lifestyle.state.practiceTypes
      .map(t => ({
        label: t.label,
        value: monthlyCounts[t.code] || 0,
        display: String(monthlyCounts[t.code] || 0),
      }))
      .filter(i => i.value > 0);

    const markersForDate = (iso) => {
      const codes = Lifestyle.practiceTypesOn(iso);
      if (!codes.length) return null;
      const shown = codes.slice(0, 2);
      const remaining = codes.length - 2;
      const html = shown.map(code => {
        const t = typeMap[code];
        if (!t) return '';
        return `<span class="cal-marker type-${t.color}">${escapeHTML(t.code)}</span>`;
      }).join('') + (remaining > 0 ? `<span class="cal-marker type-ink">+${remaining}</span>` : '');
      return { markers: [html] };
    };

    const monday = Reports.mondayOf(new Date());
    const count  = Lifestyle.weeklyPracticeCount(Reports.fmtISO(monday));
    const goalMet = count >= 1;

    this.mount(`
      <header class="topbar">
        <a class="back" href="#/">Inicio</a>
        <div class="topbar-title">Práctica creativa</div>
      </header>

      <section class="block">
        <div class="label">Esta semana</div>
        <div class="stats">
          <div class="stat"><div class="stat-label">Prácticas</div>
            <div class="stat-value">${count}</div></div>
          <div class="stat"><div class="stat-label">Meta</div>
            <div class="stat-value">${goalMet ? '✓' : '—'}<span class="unit">${goalMet ? 'cumplida' : 'pendiente'}</span></div></div>
        </div>
      </section>

      <section class="block">
        <div class="label">Este mes</div>
        ${barItems.length
          ? Charts.bars(barItems)
          : `<p class="empty">Sin registros este mes.</p>`}
      </section>

      <section class="block">
        <div class="label">Calendario</div>
        <div class="monthnav">
          <button class="weekbtn" id="calPrev">←</button>
          <div class="weeklabel">${Calendar.monthLabel(cal.year, cal.month)}</div>
          <button class="weekbtn" id="calNext">→</button>
        </div>
        <div id="calRoot">${Calendar.build({ year: cal.year, month: cal.month, markersForDate })}</div>
        <div id="dayPanel"></div>
        <p class="hint" style="margin-top:16px;">Toca un día para marcar tus tipos de práctica.</p>
      </section>

      <section class="block">
        <div class="label">Tipos</div>
        <ul class="module-list">
          ${Lifestyle.state.practiceTypes.map(t => `
            <li>
              <span><span class="cal-marker type-${t.color}" style="margin-right:10px;">${escapeHTML(t.code)}</span>${escapeHTML(t.label)}</span>
              <button class="row-del" data-deltype="${escapeHTML(t.code)}">×</button>
            </li>
          `).join('') || '<li class="muted small">Sin tipos</li>'}
        </ul>
        <button class="btn small ghost" id="addPracticeTypeBtn" style="margin-top:12px;">+ Añadir tipo</button>
        <form id="addPracticeTypeForm" class="add-form">
          <label class="field">
            <span class="field-label">Nombre</span>
            <input type="text" name="name" required maxlength="20" placeholder="Ej. Pintar">
          </label>
          <button type="submit" class="btn">Añadir</button>
        </form>
      </section>
    `);

    $('#calPrev').addEventListener('click', () => { this._shiftMonth('practice', -1); this.renderPractice(); });
    $('#calNext').addEventListener('click', () => { this._shiftMonth('practice',  1); this.renderPractice(); });

    $('#addPracticeTypeBtn').addEventListener('click', () => $('#addPracticeTypeForm').classList.toggle('open'));
    $('#addPracticeTypeForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = e.target.name.value.trim();
      if (!name) return;
      const existing = Lifestyle.state.practiceTypes;
      const code = Lifestyle.generateCode(name, existing.map(t => t.code));
      const color = Lifestyle.nextColor(existing.map(t => t.color));
      const types = [...existing, { code, label: name, color }];
      await Lifestyle.savePracticeTypes(types);
      this.renderPractice();
    });
    $$('[data-deltype]').forEach(btn => btn.addEventListener('click', async () => {
      const code = btn.dataset.deltype;
      const type = Lifestyle.state.practiceTypes.find(t => t.code === code);
      if (!type) return;
      const logs = Lifestyle.state.practiceLogs.filter(l => l.type === code);
      const msg = logs.length
        ? `"${type.label}" tiene ${logs.length} registro(s). Se eliminarán también. ¿Continuar?`
        : `¿Eliminar "${type.label}"?`;
      if (!confirm(msg)) return;
      for (const l of logs) await DB.delete('practiceLogs', l.id);
      const types = Lifestyle.state.practiceTypes.filter(t => t.code !== code);
      await Lifestyle.savePracticeTypes(types);
      await Lifestyle.load();
      this.renderPractice();
    }));

    Calendar.attach($('#calRoot'), (iso) => {
      const panel = $('#dayPanel');
      const codes = new Set(Lifestyle.practiceTypesOn(iso));
      panel.innerHTML = `
        <div class="day-panel">
          <div class="day-panel-head">
            <div class="day-panel-date">${Reports.fmtHuman(iso)}</div>
            <button class="day-panel-close" id="dpClose">×</button>
          </div>
          <div class="day-options">
            ${Lifestyle.state.practiceTypes.map(t => `
              <button class="opt-btn ${codes.has(t.code) ? 'active' : ''}" data-pick="${escapeHTML(t.code)}">${escapeHTML(t.label)}</button>
            `).join('') || '<p class="hint">Sin tipos configurados.</p>'}
          </div>
        </div>`;
      $('#dpClose').addEventListener('click', () => { panel.innerHTML = ''; });
      panel.querySelectorAll('[data-pick]').forEach(btn => btn.addEventListener('click', async () => {
        await Lifestyle.togglePractice(iso, btn.dataset.pick);
        this.renderPractice();
      }));
    });
  },

  /* ============================================================
     CARDIO
     ============================================================ */
  async renderCardio() {
    if (!Lifestyle.state.loaded) await Lifestyle.load();
    const cal = this.cal.cardio;
    const monthPrefix = `${cal.year}-${String(cal.month + 1).padStart(2, '0')}`;

    const byLocation = {};
    let totalMinutes = 0;
    let sessionCount = 0;
    for (const l of Lifestyle.state.cardioLogs) {
      if (!l.date.startsWith(monthPrefix)) continue;
      byLocation[l.location] = (byLocation[l.location] || 0) + l.minutes;
      totalMinutes += l.minutes;
      sessionCount++;
    }
    const barItems = Object.entries(byLocation)
      .sort((a, b) => b[1] - a[1])
      .map(([loc, mins]) => ({ label: loc, value: mins, display: `${mins}m` }));

    const markersForDate = (iso) => {
      const mins = Lifestyle.cardioMinutesOn(iso);
      if (!mins) return null;
      return { markers: [`<span class="cal-marker type-ink">${mins}</span>`] };
    };

    const recent = [...Lifestyle.state.cardioLogs]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 12);

    this.mount(`
      <header class="topbar">
        <a class="back" href="#/">Inicio</a>
        <div class="topbar-title">Cardio</div>
      </header>

      <section class="block">
        <div class="label">Este mes</div>
        <div class="stats">
          <div class="stat"><div class="stat-label">Sesiones</div>
            <div class="stat-value">${sessionCount}</div></div>
          <div class="stat"><div class="stat-label">Minutos</div>
            <div class="stat-value">${totalMinutes}</div></div>
        </div>
        ${barItems.length
          ? `<div style="margin-top:20px;">${Charts.bars(barItems)}</div>`
          : `<p class="empty">Sin registros este mes.</p>`}
      </section>

      <section class="block">
        <div class="label">Calendario</div>
        <div class="monthnav">
          <button class="weekbtn" id="calPrev">←</button>
          <div class="weeklabel">${Calendar.monthLabel(cal.year, cal.month)}</div>
          <button class="weekbtn" id="calNext">→</button>
        </div>
        <div id="calRoot">${Calendar.build({ year: cal.year, month: cal.month, markersForDate })}</div>
        <div id="dayPanel"></div>
        <p class="hint" style="margin-top:16px;">Toca un día para registrar cardio.</p>
      </section>

      <section class="block">
        <div class="label">Recientes</div>
        ${recent.length ? `<ul class="trend-list">
          ${recent.map(r => `
            <li>
              <span class="trend-name">${escapeHTML(r.location)}${r.resistance ? ` · ${escapeHTML(r.resistance)}` : ''}</span>
              <span class="trend-val">${Reports.fmtHuman(r.date)}</span>
              <span class="trend-delta flat">${r.minutes} min</span>
            </li>
          `).join('')}
        </ul>` : `<p class="empty">Sin sesiones todavía.</p>`}
      </section>
    `);

    $('#calPrev').addEventListener('click', () => { this._shiftMonth('cardio', -1); this.renderCardio(); });
    $('#calNext').addEventListener('click', () => { this._shiftMonth('cardio',  1); this.renderCardio(); });

    Calendar.attach($('#calRoot'), (iso) => {
      const panel = $('#dayPanel');
      const entries = Lifestyle.cardioOn(iso);
      const entriesHTML = entries.length ? entries.map(e => `
        <li class="tx-item">
          <span class="tx-main">
            <span class="tx-amount">${escapeHTML(e.location)} · ${e.minutes} min</span>
            ${e.resistance ? `<span class="tx-cat">${escapeHTML(e.resistance)}</span>` : ''}
          </span>
          <button class="row-del" data-delcardio="${e.id}">×</button>
        </li>
      `).join('') : `<li class="hint">Sin entradas este día.</li>`;

      panel.innerHTML = `
        <div class="day-panel">
          <div class="day-panel-head">
            <div class="day-panel-date">${Reports.fmtHuman(iso)}</div>
            <button class="day-panel-close" id="dpClose">×</button>
          </div>
          <ul class="tx-list">${entriesHTML}</ul>
          <form id="cardioForm" class="action-form cardio-form" style="margin-top:12px;">
            <label class="field">
              <span class="field-label">Ubicación</span>
              <select name="location" required>
                ${CARDIO_LOCATIONS.map(l => `<option>${l}</option>`).join('')}
              </select>
            </label>
            <label class="field">
              <span class="field-label">Tiempo del ejercicio (min)</span>
              <input type="number" name="minutes" required min="1" max="600" step="1" placeholder="30" inputmode="numeric">
            </label>
            <label class="field">
              <span class="field-label">Resistencia (opcional)</span>
              <input type="text" name="resistance" maxlength="30" placeholder="Nivel, inclinación, velocidad…">
            </label>
            <button type="submit" class="btn">+ Añadir sesión</button>
          </form>
        </div>`;
      $('#dpClose').addEventListener('click', () => { panel.innerHTML = ''; });
      $('#cardioForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target;
        await Lifestyle.addCardio({
          date: iso,
          location: f.location.value,
          minutes: parseInt(f.minutes.value, 10),
          resistance: f.resistance.value.trim() || null,
        });
        this.renderCardio();
        setTimeout(() => {
          const el = document.querySelector(`[data-date="${iso}"]`);
          el?.click();
        }, 0);
      });
      panel.querySelectorAll('[data-delcardio]').forEach(b => b.addEventListener('click', async () => {
        if (!confirm('¿Eliminar entrada?')) return;
        await Lifestyle.deleteCardio(b.dataset.delcardio);
        this.renderCardio();
      }));
    });
  },

  /* ============================================================
     DINERO
     ============================================================ */
  async renderFinance() {
    await Finance.loadSettings();
    if (!Finance.state.hasPassword)          return this.renderFinanceSetup();
    if (!Finance.state.unlocked)             return this.renderFinanceGate();
    await Finance.load();
    if (!Finance.state.settings.monthlyIncome) return this.renderFinanceConfig();
    return this.renderFinanceMain();
  },

  renderFinanceSetup() {
    this.mount(`
      <header class="topbar">
        <a class="back" href="#/">Inicio</a>
        <div class="topbar-title">Configurar dinero</div>
      </header>

      <section class="block">
        <p class="hint">Configura tu fondo de seguridad. Toma 2 minutos.</p>
        <form id="setupForm">
          <div class="label">1 · Contraseña</div>
          <label class="field">
            <span class="field-label">Contraseña (mín. 4 caracteres)</span>
            <input type="password" name="pw" required minlength="4" autocomplete="new-password">
          </label>
          <label class="field">
            <span class="field-label">Confirmar</span>
            <input type="password" name="pw2" required minlength="4" autocomplete="new-password">
          </label>

          <div class="label" style="margin-top:32px;">2 · Ingreso mensual</div>
          <label class="field">
            <input type="number" name="income" required min="0" step="1" placeholder="9500" inputmode="decimal">
          </label>

          <div class="label" style="margin-top:32px;">3 · Gastos fijos mensuales</div>
          <p class="hint" style="margin-top:0;margin-bottom:12px;">
            Lo que pagas sí o sí: gym, bachata, suscripciones, deudas.
          </p>
          <div id="fixedList"></div>
          <button type="button" id="addFixedBtn" class="btn small ghost">+ Añadir gasto fijo</button>

          <div class="label" style="margin-top:32px;">4 · Meta de runway</div>
          <label class="field">
            <select name="runwayGoal">
              <option value="3">3 meses — básico</option>
              <option value="6" selected>6 meses — prudente</option>
              <option value="12">12 meses — libertad</option>
            </select>
          </label>
          <p class="hint" style="margin-top:0;">Runway = meses que podrías vivir sin ingreso. 6 meses = cambiar de trabajo sin pánico.</p>

          <button type="submit" class="btn" style="margin-top:16px;">Guardar configuración</button>
        </form>
      </section>
    `);

    const fixedList = $('#fixedList');
    const addRow = (name = '', amount = '') => {
      const row = document.createElement('div');
      row.className = 'set-row';
      row.style.gridTemplateColumns = '1fr 110px 28px';
      row.innerHTML = `
        <input type="text" name="fixedName" placeholder="Gym, Bachata..." value="${name}">
        <input type="number" name="fixedAmount" placeholder="0" step="1" min="0" inputmode="decimal" value="${amount}">
        <button type="button" class="set-remove">×</button>`;
      row.querySelector('.set-remove').addEventListener('click', () => row.remove());
      fixedList.appendChild(row);
    };
    addRow('Gym', '350');
    addRow('Bachata', '1200');
    addRow('', '');
    $('#addFixedBtn').addEventListener('click', () => addRow());

    $('#setupForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      if (f.pw.value !== f.pw2.value) { alert('Las contraseñas no coinciden.'); return; }
      const names   = $$('[name="fixedName"]', fixedList);
      const amounts = $$('[name="fixedAmount"]', fixedList);
      const fixed = [];
      for (let i = 0; i < names.length; i++) {
        const n = names[i].value.trim();
        const a = parseFloat(amounts[i].value);
        if (n && a > 0) fixed.push({ name: n, amount: a });
      }
      await Finance.setPassword(f.pw.value);
      await Finance.saveSettings({
        monthlyIncome: parseFloat(f.income.value),
        monthlyFixed: fixed,
        runwayGoal: parseInt(f.runwayGoal.value),
      });
      await Finance.load();
      location.hash = '#/finance';
    });
  },

  renderFinanceGate() {
    this.mount(`
      <header class="topbar">
        <a class="back" href="#/">Inicio</a>
        <div class="topbar-title">Dinero</div>
      </header>
      <section class="block">
        <div class="label">Protegido</div>
        <form id="gateForm">
          <label class="field">
            <span class="field-label">Contraseña</span>
            <input type="password" name="pw" required autofocus autocomplete="current-password">
          </label>
          <button type="submit" class="btn">Entrar</button>
        </form>
        <p class="hint" style="margin-top:20px;">
          ¿Olvidaste tu contraseña?
          <a href="#" id="forgotLink" style="color:var(--ink);text-decoration:underline;">Restablecer</a> (borra todos los datos de dinero).
        </p>
      </section>
    `);
    $('#gateForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const ok = await Finance.checkPassword(e.target.pw.value);
      if (ok) this.renderFinance();
      else { e.target.pw.value = ''; alert('Contraseña incorrecta.'); }
    });
    $('#forgotLink').addEventListener('click', async (e) => {
      e.preventDefault();
      if (!confirm('Borrar TODOS los datos de dinero. ¿Continuar?')) return;
      if (!confirm('Segunda confirmación: irreversible.')) return;
      await Finance.resetAll();
      this.renderFinance();
    });
  },

  renderFinanceConfig() {
    const s = Finance.state.settings;
    this.mount(`
      <header class="topbar">
        <a class="back" href="#/">Inicio</a>
        <div class="topbar-title">Configuración</div>
      </header>
      <form id="configForm">
        <div class="label">Ingreso mensual</div>
        <label class="field">
          <input type="number" name="income" required min="0" step="1" value="${s.monthlyIncome || ''}" inputmode="decimal">
        </label>
        <div class="label" style="margin-top:24px;">Gastos fijos</div>
        <div id="fixedList"></div>
        <button type="button" id="addFixedBtn" class="btn small ghost">+ Añadir gasto fijo</button>
        <div class="label" style="margin-top:24px;">Meta de runway</div>
        <label class="field">
          <select name="runwayGoal">
            <option value="3"  ${s.runwayGoal === 3  ? 'selected' : ''}>3 meses</option>
            <option value="6"  ${s.runwayGoal === 6  ? 'selected' : ''}>6 meses</option>
            <option value="12" ${s.runwayGoal === 12 ? 'selected' : ''}>12 meses</option>
          </select>
        </label>
        <button type="submit" class="btn">Guardar</button>
      </form>
    `);

    const fixedList = $('#fixedList');
    const addRow = (name = '', amount = '') => {
      const row = document.createElement('div');
      row.className = 'set-row';
      row.style.gridTemplateColumns = '1fr 110px 28px';
      row.innerHTML = `
        <input type="text" name="fixedName" placeholder="Gym, Bachata..." value="${name}">
        <input type="number" name="fixedAmount" placeholder="0" step="1" min="0" value="${amount}">
        <button type="button" class="set-remove">×</button>`;
      row.querySelector('.set-remove').addEventListener('click', () => row.remove());
      fixedList.appendChild(row);
    };
    for (const f of s.monthlyFixed || []) addRow(f.name, f.amount);
    if (!s.monthlyFixed?.length) addRow();
    $('#addFixedBtn').addEventListener('click', () => addRow());

    $('#configForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const names   = $$('[name="fixedName"]', fixedList);
      const amounts = $$('[name="fixedAmount"]', fixedList);
      const fixed = [];
      for (let i = 0; i < names.length; i++) {
        const n = names[i].value.trim();
        const a = parseFloat(amounts[i].value);
        if (n && a > 0) fixed.push({ name: n, amount: a });
      }
      await Finance.saveSettings({
        monthlyIncome: parseFloat(f.income.value),
        monthlyFixed: fixed,
        runwayGoal: parseInt(f.runwayGoal.value),
      });
      await Finance.load();
      location.hash = '#/finance';
    });
  },

  async renderFinanceMain() {
    const cal = this.cal.finance;
    const runway      = Finance.runwayMonths();
    const goal        = Finance.runwayGoal();
    const fund        = Finance.emergencyFundTotal();
    const targetAmt   = Finance.runwayTargetAmount();
    const monthlyFixed = Finance.monthlyFixedTotal();
    const totals = Finance.monthlyTotals(cal.year, cal.month);
    const remaining = Math.max(0, targetAmt - fund);

    const markersForDate = (iso) => {
      const txs = Finance.transactionsOn(iso);
      if (!txs.length) return null;
      const inc = txs.some(t => t.type === 'income');
      const exp = txs.some(t => t.type === 'expense' || t.type === 'card-summary');
      const sav = txs.some(t => t.type === 'savings');
      const parts = [
        inc ? '<span class="cal-dot inc"></span>' : '',
        exp ? '<span class="cal-dot exp"></span>' : '',
        sav ? '<span class="cal-dot sav"></span>' : '',
      ].filter(Boolean).join('');
      return { markers: [parts] };
    };

    this.mount(`
      <header class="topbar">
        <a class="back" href="#/">Inicio</a>
        <div class="topbar-title">Tu dinero</div>
        <button class="topbar-action" id="lockBtn">Bloquear</button>
      </header>

      <section class="runway-hero">
        <div class="runway-eyebrow">MESES DE RUNWAY</div>
        <div class="runway-number">${runway.toFixed(1)}</div>
        <div class="runway-blocks">
          ${Array.from({ length: goal }).map((_, i) =>
            `<span class="runway-block ${i < Math.floor(runway) ? 'filled' : ''}"></span>`
          ).join('')}
        </div>
        <div class="runway-meta">
          <span>${fmtMoney(fund)} de ${fmtMoney(targetAmt)}</span>
          <span>${Math.min(100, targetAmt ? (fund / targetAmt) * 100 : 0).toFixed(0)}%</span>
        </div>
        <p class="runway-caption">
          Si pierdes tu ingreso hoy, tienes <strong>${runway.toFixed(1)} meses</strong>
          de gastos fijos (${fmtMoney(monthlyFixed)}/mes) cubiertos.
          ${remaining > 0 ? `Te faltan ${fmtMoney(remaining)} para llegar a ${goal} meses.` : 'Meta alcanzada.'}
        </p>
      </section>

      <section class="block">
        <div class="label">Acciones rápidas</div>
        <div class="quick-actions">
          <button class="quick-btn" data-action="income">
            <span class="quick-icon">+</span><span class="quick-label">Ingreso</span>
          </button>
          <button class="quick-btn" data-action="expense">
            <span class="quick-icon">−</span><span class="quick-label">Gasto</span>
          </button>
          <button class="quick-btn" data-action="card">
            <span class="quick-icon">▤</span><span class="quick-label">Tarjeta</span>
          </button>
          <button class="quick-btn quick-accent" data-action="savings">
            <span class="quick-icon">◆</span><span class="quick-label">Ahorro</span>
          </button>
        </div>
        <div class="adjust-row">
          <button class="adjust-btn" data-action="adjust-income">Ajuste ingreso</button>
          <button class="adjust-btn" data-action="adjust-expense">Ajuste gasto</button>
        </div>
        <div id="actionPanel"></div>
      </section>

      <section class="block">
        <div class="label">${Calendar.monthLabel(cal.year, cal.month)}</div>
        <div class="monthnav">
          <button class="weekbtn" id="calPrev">←</button>
          <button class="weekbtn" id="calNext">→</button>
        </div>
        <div class="stats">
          <div class="stat"><div class="stat-label">Ingresos</div>
            <div class="stat-value">+${fmtMoney(totals.income)}</div></div>
          <div class="stat"><div class="stat-label">Gastos</div>
            <div class="stat-value">−${fmtMoney(totals.expense)}</div></div>
          <div class="stat"><div class="stat-label">Ahorro</div>
            <div class="stat-value">${fmtMoney(totals.savings)}</div></div>
          <div class="stat"><div class="stat-label">Libre</div>
            <div class="stat-value">${totals.balance >= 0 ? '+' : '−'}${fmtMoney(Math.abs(totals.balance))}</div></div>
        </div>
        <div id="calRoot">${Calendar.build({ year: cal.year, month: cal.month, markersForDate })}</div>
        <div id="dayPanel"></div>
      </section>

      <section class="block">
        <div class="label">Gastos fijos mensuales</div>
        <ul class="fixed-list">
          ${Finance.state.settings.monthlyFixed.map(f => `
            <li><span>${escapeHTML(f.name)}</span><span class="num">${fmtMoney(f.amount)}</span></li>
          `).join('')}
          <li class="fixed-total"><span>Total mensual</span><span class="num">${fmtMoney(monthlyFixed)}</span></li>
        </ul>
        <button class="btn small ghost" id="editConfigBtn" style="margin-top:12px;">Editar configuración</button>
      </section>

      <section class="block">
        <button class="btn ghost" id="resetFinance" style="border-color:#B00020;color:#B00020;">Borrar todos los datos de dinero</button>
      </section>
    `);

    $('#lockBtn').addEventListener('click', () => { Finance.lock(); this.renderFinance(); });
    $('#calPrev').addEventListener('click', () => { this._shiftMonth('finance', -1); this.renderFinanceMain(); });
    $('#calNext').addEventListener('click', () => { this._shiftMonth('finance',  1); this.renderFinanceMain(); });
    $$('[data-action]').forEach(btn => btn.addEventListener('click', () => this._openActionPanel(btn.dataset.action)));
    $('#editConfigBtn').addEventListener('click', () => this.renderFinanceConfig());
    $('#resetFinance').addEventListener('click', async () => {
      if (!confirm('Borrar TODOS los datos de dinero. ¿Continuar?')) return;
      await Finance.resetAll();
      this.renderFinance();
    });
    Calendar.attach($('#calRoot'), (iso) => this._openDayPanel(iso));
  },

  _openActionPanel(action) {
    const panel = $('#actionPanel');
    const today = todayISO();
    let config;
    if (action === 'income') {
      config = { type: 'income', verb: 'ingreso', placeholder: 'Monto',
        categories: INCOME_CATEGORIES, hint: 'Registra un ingreso.' };
    } else if (action === 'expense') {
      config = { type: 'expense', verb: 'gasto', placeholder: 'Monto',
        categories: EXPENSE_CATEGORIES, hint: 'Registra un gasto.' };
    } else if (action === 'adjust-income') {
      config = { type: 'income', verb: 'ajuste de ingreso', placeholder: 'Monto',
        forceCategory: 'Ajuste',
        hint: 'Para corregir un ingreso que olvidaste registrar.' };
    } else if (action === 'adjust-expense') {
      config = { type: 'expense', verb: 'ajuste de gasto', placeholder: 'Monto',
        forceCategory: 'Ajuste',
        hint: 'Para corregir un gasto que olvidaste registrar.' };
    } else if (action === 'card') {
      config = { type: 'card-summary', verb: 'resumen de tarjeta', placeholder: 'Total tarjeta',
        categories: null, noteField: 'Semana',
        hint: 'Anota el total acumulado de tu tarjeta esta semana. No registres cada compra suelta.' };
    } else if (action === 'savings') {
      config = { type: 'savings', verb: 'ahorro', placeholder: 'Monto al fondo',
        categories: null, noteField: 'Concepto',
        hint: 'Mueve dinero al fondo. Aumenta tus meses de runway.' };
    } else return;

    const catField = config.categories
      ? `<label class="field" style="margin-bottom:8px;">
          <span class="field-label">Categoría</span>
          <select name="category" required>
            <option value="">Selecciona...</option>
            ${config.categories.map(c => `<option>${c}</option>`).join('')}
          </select>
        </label>`
      : config.forceCategory
        ? `<input type="hidden" name="category" value="${config.forceCategory}">`
        : config.noteField
          ? `<label class="field" style="margin-bottom:8px;">
              <span class="field-label">${config.noteField}</span>
              <input type="text" name="category" maxlength="40" placeholder="opcional">
            </label>`
          : '';

    panel.innerHTML = `
      <form class="action-form" id="actionForm">
        <p class="hint" style="margin:0 0 12px;">${config.hint}</p>
        <div class="field-row">
          <input type="number" name="amount" required min="0.01" step="0.01" placeholder="${config.placeholder}" inputmode="decimal" autofocus>
          <input type="date" name="date" value="${today}" required>
        </div>
        ${catField}
        <button type="submit" class="btn">Guardar ${config.verb}</button>
      </form>
    `;
    $('#actionForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const catVal = config.forceCategory
        ? config.forceCategory
        : (f.category ? (f.category.value.trim() || null) : null);
      await Finance.addTransaction({
        date: f.date.value,
        type: config.type,
        amount: parseFloat(f.amount.value),
        category: catVal,
      });
      panel.innerHTML = '';
      this.renderFinanceMain();
    });
  },

  _openDayPanel(iso) {
    const panel = $('#dayPanel');
    const txs = Finance.transactionsOn(iso).sort((a, b) =>
      (a.createdAt || '').localeCompare(b.createdAt || '')
    );
    const txHTML = txs.length ? txs.map(t => {
      const icon = t.type === 'income' ? '+' : t.type === 'savings' ? '◆' : '−';
      const cls  = t.type === 'income' ? 'in'  : t.type === 'savings' ? 'sav' : 'out';
      const cat  = t.category || (t.type === 'income' ? 'Ingreso' : t.type === 'savings' ? 'Fondo' : t.type === 'card-summary' ? 'Tarjeta' : 'Gasto');
      return `<li class="tx-item">
        <span class="tx-sign ${cls}">${icon}</span>
        <span class="tx-main">
          <span class="tx-amount">${fmtMoney(t.amount)}</span>
          <span class="tx-cat">${escapeHTML(cat)}</span>
        </span>
        <button class="row-del" data-deltx="${t.id}">×</button>
      </li>`;
    }).join('') : `<li class="hint">Sin movimientos este día.</li>`;

    panel.innerHTML = `
      <div class="day-panel">
        <div class="day-panel-head">
          <div class="day-panel-date">${Reports.fmtHuman(iso)}</div>
          <button class="day-panel-close" id="dpClose">×</button>
        </div>
        <ul class="tx-list">${txHTML}</ul>
      </div>`;
    $('#dpClose').addEventListener('click', () => { panel.innerHTML = ''; });
    panel.querySelectorAll('[data-deltx]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('¿Eliminar transacción?')) return;
      await Finance.deleteTransaction(b.dataset.deltx);
      this.renderFinanceMain();
    }));
  },

  /* ============================================================
     REPORTE MENSUAL
     ============================================================ */
  async renderReport() {
    if (!Lifestyle.state.loaded) await Lifestyle.load();
    await Finance.loadSettings();
    if (Finance.state.hasPassword && Finance.state.unlocked) await Finance.load();

    const now = new Date();
    const year = now.getFullYear(), month = now.getMonth();
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    const monthLabel = Calendar.monthLabel(year, month);

    const monthSessions = this.state.sessions.filter(s => s.date.startsWith(prefix));
    const uniqueDays = new Set(monthSessions.map(s => s.date)).size;
    const uniqueExercises = new Set(monthSessions.map(s => s.exerciseId)).size;
    const volume = monthSessions.reduce((acc, s) =>
      acc + s.sets.reduce((a, set) => a + (set.weight || 0) * (set.reps || 0), 0), 0);

    const cardioLogs = Lifestyle.state.cardioLogs.filter(l => l.date.startsWith(prefix));
    const cardioMinutes = cardioLogs.reduce((a, l) => a + (l.minutes || 0), 0);
    const cardioByLocation = {};
    for (const l of cardioLogs) cardioByLocation[l.location] = (cardioByLocation[l.location] || 0) + l.minutes;
    const cardioTop = Object.entries(cardioByLocation).sort((a, b) => b[1] - a[1]);

    const weightLogs = this.state.weightLogs
      .filter(w => w.date.startsWith(prefix))
      .sort((a, b) => a.date.localeCompare(b.date));
    const startW = weightLogs[0]?.weight;
    const endW = weightLogs[weightLogs.length - 1]?.weight;
    const weightDelta = (startW != null && endW != null) ? endW - startW : null;

    const suppCounts = {};
    for (const log of Lifestyle.state.supplementLogs) {
      if (!log.date.startsWith(prefix)) continue;
      suppCounts[log.supplementId] = (suppCounts[log.supplementId] || 0) + 1;
    }
    const suppRows = Lifestyle.state.supplements
      .map(s => ({ name: s.name, days: suppCounts[s.id] || 0 }))
      .filter(r => r.days > 0)
      .sort((a, b) => b.days - a.days);

    const danceCounts = {};
    for (const log of Lifestyle.state.danceLogs) {
      if (!log.date.startsWith(prefix)) continue;
      danceCounts[log.type] = (danceCounts[log.type] || 0) + 1;
    }
    const danceRows = Lifestyle.state.danceTypes
      .map(t => ({ label: t.label, count: danceCounts[t.code] || 0 }))
      .filter(r => r.count > 0);

    const pracCounts = {};
    for (const log of Lifestyle.state.practiceLogs) {
      if (!log.date.startsWith(prefix)) continue;
      pracCounts[log.type] = (pracCounts[log.type] || 0) + 1;
    }
    const pracRows = Lifestyle.state.practiceTypes
      .map(t => ({ label: t.label, count: pracCounts[t.code] || 0 }))
      .filter(r => r.count > 0);

    let financeHTML = `<p class="hint">Sección de dinero bloqueada. Ábrela y vuelve aquí.</p>`;
    if (Finance.state.hasPassword && Finance.state.unlocked) {
      const totals = Finance.monthlyTotals(year, month);
      const byCat  = Finance.expensesByCategory(year, month);
      const catItems = Object.entries(byCat)
        .sort((a, b) => b[1] - a[1])
        .map(([cat, val]) => ({ label: cat, value: val, display: `$${fmtMoney(val)}` }));

      const history = Finance.monthlyHistory(6);
      const incomeSeries = { name: 'Ingresos', color: '#A14B2C',
        points: history.map(h => ({ x: h.date, y: h.income })) };
      const expenseSeries = { name: 'Gastos', color: '#202020',
        points: history.map(h => ({ x: h.date, y: h.expense })) };

      const runway = Finance.runwayMonths();
      const goal = Finance.runwayGoal();

      financeHTML = `
        <div class="stats">
          <div class="stat"><div class="stat-label">Ingresos</div>
            <div class="stat-value">+${fmtMoney(totals.income)}</div></div>
          <div class="stat"><div class="stat-label">Gastos</div>
            <div class="stat-value">−${fmtMoney(totals.expense)}</div></div>
          <div class="stat"><div class="stat-label">Ahorro</div>
            <div class="stat-value">${fmtMoney(totals.savings)}</div></div>
          <div class="stat"><div class="stat-label">Libre</div>
            <div class="stat-value">${totals.balance >= 0 ? '+' : '−'}${fmtMoney(Math.abs(totals.balance))}</div></div>
        </div>

        <div class="label" style="margin-top:24px;">Gasto por categoría</div>
        ${catItems.length ? Charts.bars(catItems) : '<p class="empty">Sin gastos este mes.</p>'}

        <div class="label" style="margin-top:32px;">Ingresos vs gastos (últimos 6 meses)</div>
        ${Charts.multiLine([incomeSeries, expenseSeries], {
          fmtX: Reports.fmtHuman,
          fmtY: v => `${Math.round(v / 1000)}k`
        })}
        <div class="chart-legend">
          <span><span class="lg-dot" style="background:#A14B2C"></span>Ingresos</span>
          <span><span class="lg-dot" style="background:#202020"></span>Gastos</span>
        </div>

        <div class="label" style="margin-top:32px;">Runway actual</div>
        <p class="runway-caption-inline">
          <strong>${runway.toFixed(1)} meses</strong> cubiertos · meta ${goal} meses
        </p>
      `;
    }

    const weightDeltaTxt = weightDelta == null
      ? '<p class="empty">Sin registros este mes.</p>'
      : Math.abs(weightDelta) < 0.1
        ? '<p class="hint">Sin cambios significativos.</p>'
        : `<p class="hint">${weightDelta > 0 ? '+' : ''}${weightDelta.toFixed(1)} kg ${weightDelta > 0 ? 'ganados' : 'perdidos'} este mes (${startW.toFixed(1)} → ${endW.toFixed(1)}).</p>`;

    this.mount(`
      <header class="topbar">
        <a class="back" href="#/">Inicio</a>
        <div class="topbar-title">Reporte · ${monthLabel}</div>
      </header>

      <section class="block">
        <div class="label">Entrenamiento</div>
        <div class="stats">
          <div class="stat"><div class="stat-label">Días</div>
            <div class="stat-value">${uniqueDays}</div></div>
          <div class="stat"><div class="stat-label">Ejercicios</div>
            <div class="stat-value">${uniqueExercises}</div></div>
          <div class="stat"><div class="stat-label">Volumen</div>
            <div class="stat-value">${fmtNum(volume)}<span class="unit">kg</span></div></div>
          <div class="stat"><div class="stat-label">Sesiones</div>
            <div class="stat-value">${monthSessions.length}</div></div>
        </div>
      </section>

      <section class="block">
        <div class="label">Peso</div>
        ${weightDeltaTxt}
      </section>

      <section class="block">
        <div class="label">Cardio</div>
        ${cardioLogs.length ? `
          <div class="stats">
            <div class="stat"><div class="stat-label">Sesiones</div>
              <div class="stat-value">${cardioLogs.length}</div></div>
            <div class="stat"><div class="stat-label">Minutos</div>
              <div class="stat-value">${cardioMinutes}</div></div>
          </div>
          ${cardioTop.length ? `
            <div class="label" style="margin-top:20px;">Por ubicación</div>
            <ul class="trend-list">
              ${cardioTop.map(([loc, mins]) => `<li>
                <span class="trend-name">${escapeHTML(loc)}</span>
                <span class="trend-val">${mins} min</span>
              </li>`).join('')}
            </ul>` : ''}
        ` : `<p class="empty">Sin registros este mes.</p>`}
      </section>

      <section class="block">
        <div class="label">Suplementos</div>
        ${suppRows.length
          ? `<ul class="trend-list">${suppRows.map(r => `<li>
              <span class="trend-name">${escapeHTML(r.name)}</span>
              <span class="trend-val">${r.days} día${r.days === 1 ? '' : 's'}</span>
            </li>`).join('')}</ul>`
          : `<p class="empty">Sin registros este mes.</p>`}
      </section>

      <section class="block">
        <div class="label">Baile</div>
        ${danceRows.length
          ? `<ul class="trend-list">${danceRows.map(r => `<li>
              <span class="trend-name">${escapeHTML(r.label)}</span>
              <span class="trend-val">${r.count}</span>
            </li>`).join('')}</ul>`
          : `<p class="empty">Sin registros este mes.</p>`}
      </section>

      <section class="block">
        <div class="label">Práctica creativa</div>
        ${pracRows.length
          ? `<ul class="trend-list">${pracRows.map(r => `<li>
              <span class="trend-name">${escapeHTML(r.label)}</span>
              <span class="trend-val">${r.count}</span>
            </li>`).join('')}</ul>`
          : `<p class="empty">Sin registros este mes.</p>`}
      </section>

      <section class="block">
        <div class="label">Dinero</div>
        ${financeHTML}
      </section>

      <footer class="colophon">
        <span>${monthLabel.toUpperCase()}</span><span>·</span><span>REPORTE</span>
      </footer>
    `);
  },

  /* ============================================================
     DATOS Y RESPALDO
     ============================================================ */
  renderData() {
    const u = this.state.user || {};
    this.mount(`
      <header class="topbar">
        <a class="back" href="#/">Inicio</a>
        <div class="topbar-title">Datos y respaldo</div>
      </header>

      <section class="block">
        <div class="label">Tu perfil</div>
        <form id="profileForm">
          <label class="field">
            <span class="field-label">Nombre</span>
            <input type="text" name="name" maxlength="30" value="${escapeHTML(u.name || '')}">
          </label>
          <div class="two-col">
            <label class="field">
              <span class="field-label">Estatura (cm)</span>
              <input type="number" name="height" min="100" max="250" step="1" inputmode="numeric" value="${u.height || ''}">
            </label>
            <label class="field">
              <span class="field-label">Peso inicial (kg)</span>
              <input type="number" name="weight" min="30" max="300" step="0.1" inputmode="decimal" value="${u.weight || ''}">
            </label>
          </div>
          <label class="field">
            <span class="field-label">Meta de peso (kg)</span>
            <input type="number" name="goalWeight" min="30" max="300" step="0.1" inputmode="decimal" value="${u.goalWeight || ''}">
          </label>
          <button class="btn" type="submit">Guardar perfil</button>
        </form>
      </section>

      <section class="block">
        <p class="hint">
          Tus datos viven solo en este navegador. Exporta respaldo con regularidad.
          El respaldo incluye entrenamiento, cardio, peso, suplementos, baile, práctica y finanzas.
        </p>
        <div class="stack">
          <button class="btn" id="exportBtn">Exportar respaldo (JSON)</button>
          <label class="btn ghost file-btn">
            Importar respaldo
            <input type="file" id="importFile" accept="application/json" style="position:absolute;inset:0;opacity:0;cursor:pointer;">
          </label>
        </div>
        <p class="hint" style="margin-top:20px;">
          ${this.state.exercises.length} ejercicio${this.state.exercises.length === 1 ? '' : 's'} ·
          ${this.state.sessions.length} sesión${this.state.sessions.length === 1 ? '' : 'es'} guardada${this.state.sessions.length === 1 ? '' : 's'}.
        </p>
      </section>

      <section class="block">
        <div class="label">Zona peligrosa</div>
        <button class="btn ghost" id="clearBtn" style="border-color:#B00020;color:#B00020;">Borrar entrenamientos</button>
      </section>

      <section class="block">
        <div class="label">Desarrollador</div>
        <p class="dev-hint">
          Borra TODA la base de datos local: entrenamiento, cardio, peso, suplementos, baile,
          práctica, finanzas y perfil. La app vuelve al onboarding como recién instalada.
          Úsalo para probar la experiencia inicial.
        </p>
        <button class="btn-danger-giant" id="resetAllBtn">
          Borrar TODO y reiniciar
        </button>
      </section>
    `);

    $('#profileForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const user = {
        ...this.state.user,
        name: f.name.value.trim() || this.state.user?.name,
        height: parseFloat(f.height.value) || null,
        weight: parseFloat(f.weight.value) || null,
        goalWeight: parseFloat(f.goalWeight.value) || null,
      };
      await DB.put('settings', { key: 'user', ...user });
      this.state.user = user;
      alert('Perfil actualizado.');
    });

    $('#exportBtn').addEventListener('click', async () => {
      await Backup.exportJSON();
      const s = await DB.get('settings', 'app');
      this.state.lastBackupAt = s?.lastBackupAt || null;
      this.renderData();
    });
    $('#importFile').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const r = await Backup.importJSON(f);
        alert(`Importado:\n${r.groups} grupos\n${r.exercises} ejercicios\n${r.sessions} sesiones`);
        await this.refresh();
        await Lifestyle.load();
        this.route();
      } catch (err) { alert('Error al importar: ' + err.message); }
    });
    $('#clearBtn').addEventListener('click', async () => {
      if (!confirm('Borrar TODOS tus entrenamientos. ¿Continuar?')) return;
      if (!confirm('Segunda confirmación.')) return;
      await Backup.clearAll();
      await this.refresh();
      location.hash = '#/';
    });

    $('#resetAllBtn').addEventListener('click', async () => {
      if (!confirm('Esto borrará TODOS los datos de la app: entrenamiento, cardio, peso, suplementos, baile, práctica, finanzas y tu perfil.\n\n¿Continuar?')) return;
      if (!confirm('Segunda confirmación: NO se puede deshacer. La app se reiniciará al onboarding.\n\n¿Estás seguro?')) return;

      const stores = [
        'groups', 'exercises', 'sessions',
        'supplements', 'supplementLogs', 'danceLogs', 'practiceLogs',
        'cardioLogs', 'weightLogs',
        'financeTransactions', 'financeGoals', 'settings',
      ];
      for (const s of stores) {
        try { await DB.clear(s); } catch {}
      }
      try { sessionStorage.clear(); } catch {}
      location.hash = '';
      location.reload();
    });
  },

  _shiftMonth(key, delta) {
    const c = this.cal[key];
    let m = c.month + delta, y = c.year;
    if (m < 0)  { m = 11; y--; }
    if (m > 11) { m = 0;  y++; }
    c.month = m; c.year = y;
  },
};

App.init();