/* ============================================================
   calendar.js — calendario mensual minimalista
   ============================================================ */

const Calendar = {
  MONTHS_ES: ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'],
  DAYS_ES:   ['L','M','X','J','V','S','D'],

  build({ year, month, markersForDate }) {
    const firstDay    = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startDow    = (firstDay.getDay() + 6) % 7;

    let cells = '';
    for (let i = 0; i < startDow; i++) cells += `<div class="cal-cell cal-empty"></div>`;

    const todayISO = new Date();
    const todayStr = `${todayISO.getFullYear()}-${String(todayISO.getMonth()+1).padStart(2,'0')}-${String(todayISO.getDate()).padStart(2,'0')}`;

    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const m   = markersForDate(iso) || {};
      const markers = (m.markers || []).map(x =>
        (typeof x === 'string' && x.trim().startsWith('<'))
            ? x
            : `<span class="cal-marker">${x}</span>`
        ).join('');
      const extra   = m.class ? ' ' + m.class : '';
      const today   = iso === todayStr ? ' cal-today' : '';
      cells += `<button class="cal-cell${extra}${today}" data-date="${iso}">
        <span class="cal-day">${d}</span>
        <span class="cal-markers">${markers}</span>
      </button>`;
    }

    const total = Math.ceil((startDow + daysInMonth) / 7) * 7;
    for (let i = startDow + daysInMonth; i < total; i++) cells += `<div class="cal-cell cal-empty"></div>`;

    return `
      <div class="calendar">
        <div class="cal-head">
          ${this.DAYS_ES.map(d => `<div class="cal-dow">${d}</div>`).join('')}
        </div>
        <div class="cal-grid">${cells}</div>
      </div>
    `;
  },

  monthLabel(year, month) {
    return `${this.MONTHS_ES[month]} ${year}`;
  },

  attach(root, onDayClick) {
    root.querySelectorAll('.cal-cell[data-date]').forEach(cell => {
      cell.addEventListener('click', () => onDayClick(cell.dataset.date));
    });
  },
};