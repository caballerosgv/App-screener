import { FRAMEWORK, SCALE } from './data.js';

export const REGION_LABEL = { US: 'EE. UU.', EU: 'Europa' };

export const MOAT_ORDER = { Wide: 3, Narrow: 2, None: 1 };

/** Puntuación ponderada 0-100 a partir de las 8 notas (0-10) y sus pesos (suman 100). */
export function weightedScore(scores) {
  const total = FRAMEWORK.reduce((acc, f, i) => acc + (scores[i] || 0) * f.weight, 0);
  return total / 10;
}

export function band(score) {
  return SCALE.find((s) => score >= s.min) || SCALE[SCALE.length - 1];
}

export function avg(values) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

const nf = (min, max) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: min, maximumFractionDigits: max });

export function pct(v, digits = 1) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return nf(digits, digits).format(v) + ' %';
}

export function num(v, digits = 1) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return nf(digits, digits).format(v);
}

const compact = new Intl.NumberFormat('es-ES', { notation: 'compact', maximumFractionDigits: 2 });

/** Capitalización en miles de millones → formato compacto (3,48 B US$). */
export function cap(v) {
  if (!v) return '—';
  return compact.format(v * 1e9) + ' US$';
}

export function mult(v, digits = 1) {
  if (!v) return 'n/a';
  return nf(digits, digits).format(v) + '×';
}

export function dateLabel(iso) {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

export function esc(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Nivel visual de una nota 0-10. */
export function tone(score) {
  if (score >= 8.5) return 'great';
  if (score >= 7) return 'good';
  if (score >= 5.5) return 'warn';
  return 'bad';
}

const NS = 'moat.v1';

export const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(`${NS}.${key}`);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`${NS}.${key}`, JSON.stringify(value));
    } catch {
      /* almacenamiento no disponible */
    }
  }
};
