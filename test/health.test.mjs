import test from 'node:test';
import assert from 'node:assert/strict';
import { makeChecks } from './helpers.mjs';
import { createSourceHealth } from '../server/health.mjs';

test('semáforo: verde, degradado y caído', () => {
  const { check, failures } = makeChecks();
  let clock = Date.parse('2026-11-25T10:00:00Z');
  const health = createSourceHealth({ now: () => clock });

  check('al principio no hay fuentes', health.snapshot().length === 0);

  health.record('TradingView', { ok: true, ms: 120 });
  let [tv] = health.snapshot();
  check('una respuesta buena deja la fuente en verde', tv.status === 'ok' && tv.lastOkAt === '2026-11-25T10:00:00.000Z', tv.status);
  check('guarda la latencia', tv.latencyMs === 120, String(tv.latencyMs));
  check('cuenta las comprobaciones', tv.checks === 1 && tv.failures === 0);

  clock += 60_000;
  health.record('TradingView', { ok: false, ms: 80, error: Object.assign(new Error('límite'), { code: 'market_rate_limit' }) });
  [tv] = health.snapshot();
  check('un fallo tras responder deja la fuente degradada', tv.status === 'degraded', tv.status);
  check('conserva la última respuesta buena', tv.lastOkAt === '2026-11-25T10:00:00.000Z', tv.lastOkAt);
  check('guarda el último error con su código', tv.error.code === 'market_rate_limit' && tv.error.at === '2026-11-25T10:01:00.000Z', JSON.stringify(tv.error));

  clock += 60_000;
  health.record('Yahoo Finance', { ok: false, error: null });
  const yahoo = health.snapshot().find((source) => source.name === 'Yahoo Finance');
  check('sin respuesta buena previa está caída', yahoo.status === 'down', yahoo.status);
  check('un error sin código no rompe el informe', yahoo.error.code === 'error', yahoo.error.code);

  clock += 60_000;
  health.record('TradingView', { ok: true, ms: 90 });
  [tv] = health.snapshot();
  check('se recupera al volver a responder', tv.status === 'ok' && tv.error === null && tv.latencyMs === 90, tv.status);
  check('acumula comprobaciones y fallos', tv.checks === 3 && tv.failures === 1, `${tv.checks}/${tv.failures}`);

  check('el informe va ordenado por nombre', health.snapshot().map((s) => s.name).join(',') === 'TradingView,Yahoo Finance', health.snapshot().map((s) => s.name).join(','));

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});
