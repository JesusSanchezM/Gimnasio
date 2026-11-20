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

    if (parts.length === 0)               return this.renderHome();
    if (parts[0] === 'g' && parts[1])     return this.renderGroup(parts[1]);
    if (parts[0] === 'e' && parts[1])     return this.renderExercise(parts[1]);
    if (parts[0] === 'log' && parts[1])   return this.renderLog(parts[1]);
    if (parts[0] === 'progress')          return this.renderProgress();
    if (parts[0] === 'data')              return this.renderData();
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
          : `<p class="empty">No hay ejercicios todavía. Añade el primero abajo.</p>`
        }
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
            <input type="file" name="photo" accept="image/*" capture="environment">
          </label>
          <div class="photo-preview" id="preview"></div>
          <button type="submit" class="btn">Crear ejercicio</button>
        </form>
      </section>
    `);

    const form    = $('#addForm');
    const toggle  = $('#toggleAdd');
    const preview = $('#preview');

    toggle.addEventListener('click', () => form.classList.toggle('open'));

    $('input[name="photo"]', form).addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) { preview.innerHTML = ''; return; }
      try {
        const dataUrl = await fileToDataURL(f);
        preview.innerHTML = `<img src="${dataUrl}" alt="">`;
      } catch { preview.innerHTML = ''; }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = form.name.value.trim();
      if (!name) return;

      const file = form.photo.files[0];
      let photo = null;
      if (file) {
        try { photo = await fileToDataURL(file); } catch {}
      }

      const exercise = {
        id: crypto.randomUUID(),
        groupId,
        name,
        photo,
        createdAt: new Date().toISOString(),
      };

      await DB.put('exercises', exercise);
      await this.refresh();
      this.renderGroup(groupId);
    });
  },

  exerciseRow(e) {
    return `<li class="exercise-row">
      <a href="#/e/${e.id}">
        <div class="thumb">${e.photo ? `<img src="${e.photo}" alt="">` : ''}</div>
        <div class="exercise-info">
          <div class="name">${escapeHTML(e.name)}</div>
        </div>
        <span class="chev">›</span>
      </a>
    </li>`;
  },

  /* ============================================================
     EJERCICIO (detalle + historial + gráficas)
     ============================================================ */
  renderExercise(exerciseId) {
    const ex = this.exerciseById(exerciseId);
    if (!ex) return this.renderHome();
    const group    = this.groupById(ex.groupId);
    const sessions = this.sessionsOf(exerciseId);

    const pointsRM = sessions
      .map(s => {
        const top = Reports.sessionTopSet(s);
        return top ? { x: s.date, y: Reports.epley1RM(top.weight, top.reps) } : null;
      })
      .filter(Boolean);

    const pointsW = sessions
      .map(s => {
        const top = Reports.sessionTopSet(s);
        return top ? { x: s.date, y: top.weight } : null;
      })
      .filter(Boolean);

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
      </header>

      ${ex.photo ? `<div class="photo-large"><img src="${ex.photo}" alt=""></div>` : ''}

      <section class="block">
        <div class="label">Historial</div>
        ${sessions.length ? `
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th class="num">Series</th>
                <th class="num">Reps</th>
                <th class="num">Peso</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        ` : `<p class="empty">Aún no hay sesiones registradas.</p>`}
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

  /* ============================================================
     REGISTRAR SESIÓN
     ============================================================ */
  renderLog(exerciseId) {
    const ex = this.exerciseById(exerciseId);
    if (!ex) return this.renderHome();
    const today = Reports.fmtISO(new Date());

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
          <div>Peso (kg)</div>
          <div>Reps</div>
          <div>RIR</div>
          <div></div>
        </div>
        <div id="sets"></div>
        <button type="button" id="addSet" class="btn small ghost" style="margin: 10px 0 24px;">+ Añadir serie</button>

        <div class="two-col">
          <label class="field">
            <span class="field-label">Esfuerzo (RPE 1–10)</span>
            <input type="number" name="rpe" min="1" max="10" step="0.5" placeholder="opcional">
          </label>
          <label class="field">
            <span class="field-label">Fatiga (1–10)</span>
            <input type="number" name="fatigue" min="1" max="10" step="1" placeholder="opcional">
          </label>
        </div>

        <label class="field">
          <span class="field-label">Notas (opcional)</span>
          <textarea name="notes" rows="2" maxlength="240" placeholder="Cómo te sentiste, qué notaste..."></textarea>
        </label>

        <button type="submit" class="btn">Guardar sesión</button>
      </form>
    `);

    const setsContainer = $('#sets');

    const addSetRow = (weight = '', reps = '', rir = '') => {
      const row = document.createElement('div');
      row.className = 'set-row';
      row.innerHTML = `
        <input type="number" name="weight" min="0" step="0.5" inputmode="decimal" value="${weight}" placeholder="0">
        <input type="number" name="reps"   min="1" step="1"   inputmode="numeric" value="${reps}" placeholder="0">
        <input type="number" name="rir"    min="0" max="10" step="1" value="${rir}" placeholder="—">
        <button type="button" class="set-remove" aria-label="Eliminar">×</button>
      `;
      row.querySelector('.set-remove').addEventListener('click', () => {
        if ($$('.set-row', setsContainer).length > 1) row.remove();
      });
      setsContainer.appendChild(row);
    };

    addSetRow(); addSetRow(); addSetRow();
    $('#addSet').addEventListener('click', () => addSetRow());

    $('#logForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const date = f.date.value;
      const sets = $$('.set-row', setsContainer).map(r => {
        const w  = parseFloat(r.querySelector('[name="weight"]').value);
        const rp = parseInt(r.querySelector('[name="reps"]').value, 10);
        const rr = parseInt(r.querySelector('[name="rir"]').value, 10);
        if (!w || !rp) return null;
        return { weight: w, reps: rp, rir: isNaN(rr) ? null : rr };
      }).filter(Boolean);

      if (sets.length === 0) {
        alert('Añade al menos una serie con peso y repeticiones.');
        return;
      }

      const session = {
        id: crypto.randomUUID(),
        exerciseId,
        date,
        sets,
        rpe: f.rpe.value ? parseFloat(f.rpe.value) : null,
        fatigue: f.fatigue.value ? parseFloat(f.fatigue.value) : null,
        notes: f.notes.value.trim() || null,
        createdAt: new Date().toISOString(),
      };

      await DB.put('sessions', session);
      await this.refresh();
      location.hash = `#/e/${exerciseId}`;
    });
  },

  /* ============================================================
     MI PROGRESO
     ============================================================ */
  renderProgress() {
    const baseMonday = Reports.mondayOf(new Date());
    const weekStart  = Reports.addDays(baseMonday, this.progressWeekOffset * 7);
    const weekEnd    = Reports.addDays(weekStart, 6);

    const report = Reports.buildWeeklyReport(
      this.state.sessions,
      this.state.exercises,
      weekStart
    );

    const label = `${Reports.fmtHuman(Reports.fmtISO(weekStart))} – ${Reports.fmtHuman(Reports.fmtISO(weekEnd))}`;

    const curBests  = Reports.weekExerciseBests(this.state.sessions, weekStart);
    const prevBests = Reports.weekExerciseBests(this.state.sessions, Reports.addDays(weekStart, -7));

    const trendRows = [];
    for (const [exId, cur] of curBests) {
      const ex = this.exerciseById(exId);
      if (!ex) continue;
      if (!prevBests.has(exId)) {
        trendRows.push(`<li>
          <span class="trend-name">${escapeHTML(ex.name)}</span>
          <span class="trend-delta flat">nuevo</span>
        </li>`);
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
        <button class="weekbtn" id="prevWeek" aria-label="Semana anterior">←</button>
        <div class="weeklabel">${label}</div>
        <button class="weekbtn" id="nextWeek" aria-label="Semana siguiente" ${this.progressWeekOffset >= 0 ? 'disabled' : ''}>→</button>
      </div>

      <div class="stats">
        <div class="stat">
          <div class="stat-label">Entrenamientos</div>
          <div class="stat-value">${report.current.workouts}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Ejercicios</div>
          <div class="stat-value">${report.current.exercises}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Volumen total</div>
          <div class="stat-value">${fmtNum(report.current.volume)}<span class="unit">kg</span></div>
        </div>
        <div class="stat">
          <div class="stat-label">Esfuerzo medio</div>
          <div class="stat-value">${report.current.avgRpe != null ? report.current.avgRpe.toFixed(1) : '—'}</div>
        </div>
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

    $('#prevWeek').addEventListener('click', () => {
      this.progressWeekOffset -= 1;
      this.renderProgress();
    });
    $('#nextWeek').addEventListener('click', () => {
      if (this.progressWeekOffset >= 0) return;
      this.progressWeekOffset += 1;
      this.renderProgress();
    });
  },

  /* ============================================================
     DATOS Y RESPALDO
     ============================================================ */
  renderData() {
    const totalEx = this.state.exercises.length;
    const totalSe = this.state.sessions.length;

    this.mount(`
      <header class="topbar">
        <a class="back" href="#/">Inicio</a>
        <div class="topbar-title">Datos y respaldo</div>
      </header>

      <section class="block">
        <p class="hint">
          Tus datos viven solo en este navegador. Exporta un respaldo con regularidad
          por si borras datos del navegador, cambias de dispositivo o reinstalas la app.
        </p>
        <div class="stack">
          <button class="btn" id="exportBtn">Exportar respaldo (JSON)</button>
          <label class="btn ghost file-btn">
            Importar respaldo
            <input type="file" id="importFile" accept="application/json" style="position:absolute;inset:0;opacity:0;cursor:pointer;">
          </label>
        </div>
        <p class="hint" style="margin-top: 20px;">
          ${totalEx} ejercicio${totalEx === 1 ? '' : 's'} · ${totalSe} sesión${totalSe === 1 ? '' : 'es'} guardada${totalSe === 1 ? '' : 's'}.
        </p>
      </section>

      <section class="block">
        <div class="label">Zona peligrosa</div>
        <button class="btn ghost" id="clearBtn" style="border-color:#B00020;color:#B00020;">Borrar todos los datos</button>
      </section>
    `);

    $('#exportBtn').addEventListener('click', () => Backup.exportJSON());

    $('#importFile').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const r = await Backup.importJSON(f);
        alert(`Importado:\n${r.groups} grupos\n${r.exercises} ejercicios\n${r.sessions} sesiones`);
        await this.refresh();
        this.route();
      } catch (err) {
        alert('Error al importar: ' + err.message);
      }
    });

    $('#clearBtn').addEventListener('click', async () => {
      if (!confirm('Esto borrará TODOS tus ejercicios y sesiones. ¿Continuar?')) return;
      if (!confirm('Segunda confirmación: acción irreversible. ¿Seguro?')) return;
      await Backup.clearAll();
      await this.refresh();
      location.hash = '#/';
    });
  },
};

/* ---------- boot ---------- */
App.init();