/* ============================================================
   reports.js — métricas, 1RM estimado y reporte semanal
   ============================================================ */

const Reports = (() => {
  const MONTHS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

  function parseDate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function fmtISO(date) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }
  function fmtHuman(iso) {
    const [, m, d] = iso.split('-').map(Number);
    return `${d} ${MONTHS[m-1]}`;
  }
  function mondayOf(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = (d.getDay() + 6) % 7; // lunes = 0
    d.setDate(d.getDate() - day);
    return d;
  }
  function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }

  /* ---------- Epley ---------- */
  function epley1RM(weight, reps) {
    if (!weight || !reps) return 0;
    return weight * (1 + reps / 30);
  }

  function sessionVolume(s) {
    return (s.sets || []).reduce((a, st) => a + (st.weight || 0) * (st.reps || 0), 0);
  }

  function sessionTopSet(s) {
    let best = null, bestVal = -1;
    for (const st of (s.sets || [])) {
      const v = epley1RM(st.weight, st.reps);
      if (v > bestVal) { bestVal = v; best = st; }
    }
    return best;
  }

  function sessionBest1RM(s) {
    const t = sessionTopSet(s);
    return t ? epley1RM(t.weight, t.reps) : 0;
  }

  /* ---------- Semanas ---------- */
  function sessionsInRange(sessions, start, end) {
    const a = start.getTime(), b = end.getTime();
    return sessions.filter(s => {
      const t = parseDate(s.date).getTime();
      return t >= a && t < b;
    });
  }

  function weeklyStats(sessions, weekStart) {
    const end  = addDays(weekStart, 7);
    const list = sessionsInRange(sessions, weekStart, end);
    const workouts  = new Set(list.map(s => s.date)).size;
    const exercises = new Set(list.map(s => s.exerciseId)).size;
    const volume    = list.reduce((a, s) => a + sessionVolume(s), 0);
    const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

    return {
      sessions: list,
      workouts,
      exercises,
      volume,
      avgRpe:     avg(list.map(s => s.rpe).filter(v => v != null)),
      avgFatigue: avg(list.map(s => s.fatigue).filter(v => v != null)),
    };
  }

  /* Mejor 1RM estimado medio por ejercicio dentro de una semana */
  function weekExerciseBests(sessions, weekStart) {
    const end  = addDays(weekStart, 7);
    const list = sessionsInRange(sessions, weekStart, end);
    const map  = new Map();
    for (const s of list) {
      const v = sessionBest1RM(s);
      if (!v) continue;
      if (!map.has(s.exerciseId)) map.set(s.exerciseId, []);
      map.get(s.exerciseId).push(v);
    }
    const out = new Map();
    for (const [k, arr] of map) out.set(k, arr.reduce((a, b) => a + b, 0) / arr.length);
    return out;
  }

  function pctChange(a, b) {
    if (!a || !b) return null;
    return ((b - a) / a) * 100;
  }

  /* ---------- Reporte semanal ---------- */
  function buildWeeklyReport(sessions, exercises, weekStart) {
    const current  = weeklyStats(sessions, weekStart);
    const previous = weeklyStats(sessions, addDays(weekStart, -7));

    const curBests  = weekExerciseBests(sessions, weekStart);
    const prevBests = weekExerciseBests(sessions, addDays(weekStart, -7));

    const deltas = [];
    for (const [exId, cur] of curBests) {
      if (prevBests.has(exId)) {
        const d = pctChange(prevBests.get(exId), cur);
        if (d != null) deltas.push(d);
      }
    }
    const avgDelta = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : null;

    /* Tendencia general: pendiente normalizada de las últimas 6 semanas */
    const pts = [];
    for (let i = 5; i >= 0; i--) {
      const ws    = addDays(weekStart, -7 * i);
      const bests = weekExerciseBests(sessions, ws);
      const vals  = [...bests.values()];
      if (vals.length) {
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        pts.push({ x: 5 - i, y: mean });
      }
    }

    let trend = 0;
    if (pts.length >= 2) {
      const n   = pts.length;
      const sx  = pts.reduce((a, p) => a + p.x, 0);
      const sy  = pts.reduce((a, p) => a + p.y, 0);
      const sxy = pts.reduce((a, p) => a + p.x * p.y, 0);
      const sxx = pts.reduce((a, p) => a + p.x * p.x, 0);
      const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
      const meanY = sy / n;
      trend = meanY ? slope / meanY : 0;
    }

    return {
      weekStart,
      current,
      previous,
      avgDelta,
      trend,
      observations: buildObservations(current, previous, avgDelta, trend),
    };
  }

  function buildObservations(current, previous, avgDelta, trend) {
    const obs = [];

    if (current.workouts === 0) {
      obs.push('No registraste entrenamientos esta semana.');
      return obs;
    }

    const volDelta = pctChange(previous.volume, current.volume);
    if (volDelta != null) {
      if (volDelta > 5)        obs.push('Aumentaste tu volumen total respecto a la semana anterior.');
      else if (volDelta < -5)  obs.push('Tu volumen total fue inferior al de la semana anterior.');
      else                     obs.push('Mantuviste un volumen de entrenamiento similar al de la semana anterior.');
    } else {
      obs.push('Esta es la primera semana con registros en este periodo.');
    }

    if (avgDelta != null) {
      if (avgDelta > 3) {
        obs.push('Mejoraste tu rendimiento estimado en la mayoría de los ejercicios.');
      } else if (avgDelta < -3) {
        if (trend > 0.005) {
          obs.push('Esta semana tu rendimiento fue inferior al de la anterior, pero tu tendencia general sigue siendo positiva.');
        } else {
          obs.push('Esta semana tu rendimiento fue inferior al de la anterior. Revisa descanso y alimentación.');
        }
      } else {
        obs.push('Mantuviste tu rendimiento respecto a la semana anterior.');
      }
    }

    if (current.avgRpe != null && previous.avgRpe != null) {
      const d = current.avgRpe - previous.avgRpe;
      if (d > 0.5)       obs.push('Tu esfuerzo percibido fue mayor que la semana anterior.');
      else if (d < -0.5) obs.push('Tu esfuerzo percibido fue menor que la semana anterior.');
    }

    if (current.avgFatigue != null && current.avgFatigue <= 4) {
      obs.push('Registraste una fatiga baja. Buen momento para mantener o subir cargas.');
    } else if (current.avgFatigue != null && current.avgFatigue >= 7) {
      obs.push('Registraste fatiga alta. Reducir la carga esta semana es una decisión inteligente.');
    }

    if (current.workouts >= 4) {
      obs.push(`Buena consistencia: entrenaste ${current.workouts} días esta semana.`);
    }

    return obs;
  }

  return {
    parseDate, fmtISO, fmtHuman, mondayOf, addDays,
    epley1RM, sessionVolume, sessionTopSet, sessionBest1RM,
    weeklyStats, weekExerciseBests, buildWeeklyReport,
  };
})();