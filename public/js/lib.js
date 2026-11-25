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

/* ---------- copia de seguridad ---------- */

export const BACKUP_VERSION = 1;
export const BACKUP_KEYS = ['watchlist', 'notes', 'checks', 'newsRead', 'auto', 'overrides', 'remote'];

const BACKUP_LABELS = {
  watchlist: 'seguimiento',
  notes: 'notas',
  checks: 'checklists',
  newsRead: 'noticias leídas',
  auto: 'análisis automáticos',
  overrides: 'sobrescrituras',
  remote: 'perfiles remotos'
};

const BACKUP_SHAPES = {
  watchlist: 'array',
  newsRead: 'array',
  notes: 'object',
  checks: 'object',
  auto: 'object',
  overrides: 'object',
  remote: 'object'
};

const countOf = (value) => (Array.isArray(value) ? value.length : Object.keys(value || {}).length);

/** Copia exportable con versión y fecha, a partir del estado actual. */
export function buildBackup(data, { now = new Date() } = {}) {
  return {
    app: 'moat',
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    data: Object.fromEntries(
      BACKUP_KEYS.filter((key) => data && data[key] !== undefined).map((key) => [key, data[key]])
    )
  };
}

/** Resumen legible: [{ key, label, count }] de las secciones incluidas. */
export function describeBackup(backup) {
  const data = backup && backup.data ? backup.data : backup || {};
  return BACKUP_KEYS.filter((key) => data[key] !== undefined).map((key) => ({
    key,
    label: BACKUP_LABELS[key],
    count: countOf(data[key])
  }));
}

/** Valida y normaliza una copia importada. Nunca lanza: devuelve { ok, error } o { ok, data }. */
export function parseBackup(text) {
  let raw;
  try {
    raw = JSON.parse(String(text));
  } catch {
    return { ok: false, error: 'El archivo no es un JSON válido.' };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'El archivo no tiene el formato de una copia de MOAT.' };
  }

  const version = Number(raw.version) || 1;
  if (version > BACKUP_VERSION) {
    return { ok: false, error: `La copia es de una versión más nueva (v${version}).` };
  }

  const data = raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data) ? raw.data : raw;
  const keys = BACKUP_KEYS.filter((key) => data[key] !== undefined);
  if (!keys.length) {
    return { ok: false, error: 'La copia no contiene notas, sobrescrituras, perfiles ni seguimiento.' };
  }

  for (const key of keys) {
    const value = data[key];
    const valid =
      BACKUP_SHAPES[key] === 'array'
        ? Array.isArray(value) && value.every((item) => typeof item === 'string')
        : value !== null && typeof value === 'object' && !Array.isArray(value);
    if (!valid) {
      return { ok: false, error: `La sección «${BACKUP_LABELS[key]}» no tiene el formato esperado.` };
    }
  }

  return {
    ok: true,
    version,
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : null,
    keys,
    data: Object.fromEntries(keys.map((key) => [key, data[key]]))
  };
}
