/* ============================================================
   charts.js — gráfica de línea SVG, sin dependencias
   ============================================================ */

const Charts = (() => {
  const W = 640, H = 220;
  const PL = 46, PR = 12, PT = 16, PB = 28;

  function line(points, { fmtX = String, fmtY = v => v.toFixed(0) } = {}) {
    if (!points || points.length < 2) {
      return `<div class="chart-empty">Necesitas al menos dos sesiones para ver la evolución.</div>`;
    }

    const ys = points.map(p => p.y);
    let minY = Math.min(...ys), maxY = Math.max(...ys);
    if (minY === maxY) { minY -= 1; maxY += 1; }
    const padY = (maxY - minY) * 0.12;
    minY -= padY; maxY += padY;

    const iw = W - PL - PR;
    const ih = H - PT - PB;
    const n  = points.length;
    const X  = i => PL + (i / (n - 1)) * iw;
    const Y  = v => PT + (1 - (v - minY) / (maxY - minY)) * ih;

    let grid = '';
    const TICKS = 3;
    for (let i = 0; i <= TICKS; i++) {
      const v  = minY + ((maxY - minY) * i) / TICKS;
      const yy = Y(v);
      grid += `<line x1="${PL}" x2="${W - PR}" y1="${yy}" y2="${yy}" stroke="#E8E8E5" stroke-width="1"/>`;
      grid += `<text x="${PL - 8}" y="${yy + 4}" text-anchor="end" font-size="11"
                     fill="#858585" font-family="-apple-system, Helvetica, sans-serif">${fmtY(v)}</text>`;
    }

    const path = points
      .map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`)
      .join(' ');

    const dots = points
      .map((p, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="3" fill="#202020"/>`)
      .join('');

    let labels = '';
    const idxs = new Set([0, n - 1]);
    if (n > 4) idxs.add(Math.floor((n - 1) / 2));
    for (const i of idxs) {
      const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
      labels += `<text x="${X(i).toFixed(1)}" y="${H - 8}" text-anchor="${anchor}"
                       font-size="11" fill="#858585" font-family="-apple-system, Helvetica, sans-serif">${fmtX(points[i].x)}</text>`;
    }

    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet"
                 class="chart-svg" role="img">
      ${grid}
      <path d="${path}" fill="none" stroke="#202020" stroke-width="1.75"
            stroke-linejoin="round" stroke-linecap="round"/>
      ${dots}${labels}
    </svg>`;
  }

    function bars(items) {
    if (!items.length) return `<div class="chart-empty">Sin datos.</div>`;
    const max = Math.max(...items.map(i => i.value), 1);
    return `<div class="bar-chart">${items.map(i => `
      <div class="bar-row">
        <div class="bar-label">${i.label}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(i.value / max) * 100}%"></div></div>
        <div class="bar-value">${i.display}</div>
      </div>
    `).join('')}</div>`;
  }

  function multiLine(series, { fmtX = String, fmtY = v => v.toFixed(0) } = {}) {
    const allPoints = series.flatMap(s => s.points);
    if (allPoints.length < 2) {
      return `<div class="chart-empty">Sin datos suficientes.</div>`;
    }
    const W = 640, H = 220;
    const PL = 52, PR = 12, PT = 20, PB = 28;
    const ys = allPoints.map(p => p.y);
    let minY = Math.min(...ys, 0), maxY = Math.max(...ys, 1);
    if (minY === maxY) { minY -= 1; maxY += 1; }
    const padY = (maxY - minY) * 0.12;
    minY -= padY; maxY += padY;
    const iw = W - PL - PR, ih = H - PT - PB;

    const xsMs = allPoints.map(p => new Date(p.x).getTime());
    const xMin = Math.min(...xsMs), xMax = Math.max(...xsMs);
    const xRange = (xMax - xMin) || 1;

    const X = x => PL + ((new Date(x).getTime() - xMin) / xRange) * iw;
    const Y = v => PT + (1 - (v - minY) / (maxY - minY)) * ih;

    let grid = '';
    for (let i = 0; i <= 3; i++) {
      const v  = minY + ((maxY - minY) * i) / 3;
      const yy = Y(v);
      grid += `<line x1="${PL}" x2="${W - PR}" y1="${yy}" y2="${yy}" stroke="#E8E8E5" stroke-width="1"/>`;
      grid += `<text x="${PL - 8}" y="${yy + 4}" text-anchor="end" font-size="11"
                     fill="#858585" font-family="-apple-system, Helvetica, sans-serif">${fmtY(v)}</text>`;
    }

    let lines = '';
    for (const s of series) {
      if (s.points.length < 2) continue;
      const path = s.points
        .map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`)
        .join(' ');
      lines += `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="1.75"
                      stroke-linejoin="round" stroke-linecap="round"/>`;
      lines += s.points.map(p =>
        `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="3" fill="${s.color}"/>`
      ).join('');
    }

    const sortedX = [...new Set(allPoints.map(p => p.x))].sort();
    let labels = '';
    if (sortedX.length >= 1) {
      labels += `<text x="${X(sortedX[0]).toFixed(1)}" y="${H - 8}" text-anchor="start"
                       font-size="11" fill="#858585" font-family="-apple-system, Helvetica, sans-serif">${fmtX(sortedX[0])}</text>`;
      if (sortedX.length > 1) {
        labels += `<text x="${X(sortedX[sortedX.length - 1]).toFixed(1)}" y="${H - 8}" text-anchor="end"
                         font-size="11" fill="#858585" font-family="-apple-system, Helvetica, sans-serif">${fmtX(sortedX[sortedX.length - 1])}</text>`;
      }
    }

    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" class="chart-svg">
      ${grid}${lines}${labels}
    </svg>`;
  }

  return { line, bars, multiLine };

})();