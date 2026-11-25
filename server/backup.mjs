/**
 * Copias de seguridad en el servidor.
 *
 * El cliente ya valida antes de enviar, pero el servidor no se fía: aquí se
 * repiten las mismas reglas de forma, tamaño y versión, y se generan códigos
 * cortos sin caracteres ambiguos (sin 0/O ni 1/I/L) para dictarlos por teléfono.
 */
import { randomInt } from 'node:crypto';

export const BACKUP_VERSION = 1;
/** Días que una copia del servidor sigue viva antes de borrarse sola. */
export const BACKUP_TTL_DAYS = Math.max(1, Number(process.env.BACKUP_TTL_DAYS) || 30);
export const BACKUP_KEYS = ['watchlist', 'notes', 'checks', 'newsRead', 'auto', 'overrides', 'remote'];
export const MAX_BACKUP_BYTES = 1_000_000;

const ARRAY_KEYS = new Set(['watchlist', 'newsRead']);
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

/** "abcd efgh" → "ABCD-EFGH"; cualquier cosa que no sea un código válido → null. */
export function normalizeBackupCode(raw) {
  const clean = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length !== CODE_LENGTH) return null;
  if ([...clean].some((char) => !CODE_ALPHABET.includes(char))) return null;
  return `${clean.slice(0, 4)}-${clean.slice(4)}`;
}

/** Fecha de caducidad de una copia guardada ahora. */
export function expiresAt(from = new Date(), days = BACKUP_TTL_DAYS) {
  return new Date(from.getTime() + days * 86_400_000).toISOString();
}

/** ¿La copia ya caducó? Las copias antiguas sin `expiresAt` usan su fecha de creación. */
export function isExpired(record, now = new Date()) {
  if (!record || typeof record !== 'object') return true;
  const stamp = record.expiresAt || record.createdAt;
  if (!stamp) return true;
  const limit = record.expiresAt
    ? new Date(record.expiresAt).getTime()
    : new Date(stamp).getTime() + BACKUP_TTL_DAYS * 86_400_000;
  return !Number.isFinite(limit) || limit <= now.getTime();
}

export function createBackupCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** Valida la copia recibida. Nunca lanza: devuelve { ok, error } o { ok, data }. */
export function validateBackupPayload(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'La copia no tiene el formato esperado.' };
  }

  const version = Number(raw.version) || BACKUP_VERSION;
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
    const valid = ARRAY_KEYS.has(key)
      ? Array.isArray(value) && value.every((item) => typeof item === 'string')
      : value !== null && typeof value === 'object' && !Array.isArray(value);
    if (!valid) {
      return { ok: false, error: `La sección «${key}» no tiene el formato esperado.` };
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
