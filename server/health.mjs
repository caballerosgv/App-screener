/**
 * Semáforo de las fuentes de datos.
 *
 * Cada llamada a una fuente apunta si respondió, cuánto tardó y cuál fue el
 * último error. `/api/status` lo expone para que la app pueda decir si un
 * precio viene de la fuente principal o de un respaldo, y si algo lleva rato
 * caído en vez de fallar en silencio.
 */

export function createSourceHealth({ now = () => Date.now() } = {}) {
  const sources = new Map();

  function record(name, { ok, ms = null, error = null } = {}) {
    const entry = sources.get(name) || {
      name,
      checks: 0,
      failures: 0,
      lastAt: null,
      lastOkAt: null,
      latencyMs: null,
      error: null
    };
    entry.checks += 1;
    entry.lastAt = new Date(now()).toISOString();
    if (ok) {
      entry.lastOkAt = entry.lastAt;
      entry.latencyMs = Number.isFinite(ms) ? ms : null;
      entry.error = null;
    } else {
      entry.failures += 1;
      entry.error = {
        code: (error && error.code) || 'error',
        message: (error && error.message) || 'La fuente no respondió',
        at: entry.lastAt
      };
    }
    sources.set(name, entry);
    return entry;
  }

  /** `degraded` = falló la última vez pero ya había respondido antes. */
  function statusOf(entry) {
    if (!entry.error) return 'ok';
    return entry.lastOkAt ? 'degraded' : 'down';
  }

  function snapshot() {
    return [...sources.values()]
      .map((entry) => ({
        name: entry.name,
        status: statusOf(entry),
        lastAt: entry.lastAt,
        lastOkAt: entry.lastOkAt,
        latencyMs: entry.latencyMs,
        checks: entry.checks,
        failures: entry.failures,
        error: entry.error
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  return { record, snapshot, statusOf };
}
