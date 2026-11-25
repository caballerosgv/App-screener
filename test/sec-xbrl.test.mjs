import test from 'node:test';
import assert from 'node:assert/strict';
import { makeChecks } from './helpers.mjs';
import { annualSeries, createSecXbrlClient, summarize } from '../server/sec-xbrl.mjs';
import { companyFacts, fakeSecXbrlFetch } from './fixtures/sec-xbrl.mjs';

test('XBRL: series anuales limpias y agregados', () => {
  const { check, failures } = makeChecks();
  const facts = companyFacts();

  const revenue = annualSeries(facts, ['RevenueFromContractWithCustomerExcludingAssessedTax'], { flow: true });
  check('un valor por ejercicio', revenue.length === 2, String(revenue.length));
  check('ignora los trimestres', revenue.every((row) => row.end.endsWith('-09-27') || row.end.endsWith('-09-28')), JSON.stringify(revenue.map((r) => r.end)));
  check('se queda con la última presentación', revenue[1].val === 416_000_000_000, String(revenue[1].val));
  check('ordena por fecha', revenue[0].end < revenue[1].end);

  const resumen = summarize(facts);
  check('calcula el CAGR', Math.abs(resumen.metrics.cagr - 6.4) < 0.1, String(resumen.metrics.cagr));
  check('margen neto medio', Math.abs(resumen.metrics.netMargin - 25.4) < 0.3, String(resumen.metrics.netMargin));
  check('ROE con el patrimonio del último ejercicio', Math.abs(resumen.metrics.roe - 151.9) < 0.5, String(resumen.metrics.roe));
  check('caja libre positiva los dos años', resumen.metrics.fcfPositiveYears === 2 && resumen.metrics.fcfYears === 2);
  check('margen de caja libre', Math.abs(resumen.metrics.fcfMargin - 23.7) < 0.2, String(resumen.metrics.fcfMargin));
  check('pasivo sobre patrimonio', Math.abs(resumen.metrics.debtToEquity - 3.87) < 0.05, String(resumen.metrics.debtToEquity));
  check('detecta la recompra de acciones', resumen.metrics.shareChange < 0, String(resumen.metrics.shareChange));
  check('une las series por fecha de cierre', resumen.years.length === 2 && resumen.years[1].equity === 73_733_000_000);

  check('sin ingresos anuales no hay resumen', summarize({ facts: { 'us-gaap': {} } }) === null);

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});

test('XBRL: cliente de la SEC con caché y sin datos fuera de EE. UU.', async () => {
  const { check, failures } = makeChecks();
  const sec = fakeSecXbrlFetch();
  const client = createSecXbrlClient({ fetchImpl: sec.fetchImpl });

  const apple = await client.series('AAPL.US');
  check('devuelve el CIK y las series', apple && apple.cik === '0000320193' && apple.years.length === 2, JSON.stringify(apple && apple.cik));
  check('pide el listado de tickers una sola vez', sec.calls.filter((url) => url.pathname.endsWith('company_tickers.json')).length === 1);

  const otra = await client.series('AAPL');
  check('la segunda consulta sale de la caché', otra === apple && sec.calls.filter((url) => url.pathname.includes('companyfacts')).length === 1, String(sec.calls.length));

  const europea = await client.series('ASML.AS');
  check('Europa no consulta la SEC', europea === null && sec.calls.filter((url) => url.pathname.includes('companyfacts')).length === 1);

  const desconocido = await client.series('NOEXISTE.US');
  check('un ticker que la SEC no conoce devuelve null', desconocido === null);

  const caida = createSecXbrlClient({ fetchImpl: fakeSecXbrlFetch({ status: 500 }).fetchImpl });
  check('un fallo de la SEC no rompe la nota', (await caida.series('MSFT.US')) === null);

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});
