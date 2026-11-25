import test from 'node:test';
import assert from 'node:assert/strict';
import { makeChecks } from './helpers.mjs';
import { createYahooClient, parseChart, yahooSymbol } from '../server/yahoo.mjs';
import { MarketError } from '../server/free-market.mjs';

const CHART = {
  chart: {
    result: [
      {
        meta: {
          currency: 'USD',
          symbol: 'AAPL',
          exchangeName: 'NasdaqGS',
          regularMarketPrice: 355.58,
          chartPreviousClose: 354.07,
          regularMarketOpen: 354.5,
          regularMarketDayHigh: 357.2,
          regularMarketDayLow: 353.1,
          regularMarketVolume: 54215490,
          regularMarketTime: 1795000000
        }
      }
    ],
    error: null
  }
};

function fakeYahoo({ payload = CHART, status = 200, text = null } = {}) {
  const calls = [];
  const fetchImpl = async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    if (status !== 200) return { ok: false, status, json: async () => ({}) };
    return { ok: true, status, json: async () => (text ? JSON.parse(text) : payload) };
  };
  return { calls, fetchImpl };
}

test('símbolo y lectura del chart de Yahoo', async () => {
  const { check, failures } = makeChecks();
  check('quita el sufijo .US', yahooSymbol('AAPL.US') === 'AAPL', yahooSymbol('AAPL.US'));
  check('conserva el sufijo europeo', yahooSymbol('ASML.AS') === 'ASML.AS', yahooSymbol('ASML.AS'));

  const quote = parseChart(CHART, 'AAPL.US');
  check('precio', quote.price === 355.58, String(quote.price));
  check('cierre anterior', quote.previousClose === 354.07, String(quote.previousClose));
  check('cambio absoluto y porcentaje', Math.abs(quote.change - 1.51) < 0.001 && Math.abs(quote.changePercent - 0.4265) < 0.01, `${quote.change}/${quote.changePercent}`);
  check('apertura, máximo, mínimo y volumen', quote.open === 354.5 && quote.high === 357.2 && quote.low === 353.1 && quote.volume === 54215490);
  check('fecha en ISO', /^\d{4}-\d{2}-\d{2}T/.test(String(quote.asOf)), String(quote.asOf));
  check('identifica la fuente', quote.source === 'Yahoo Finance');
  check('sin resultado devuelve null', parseChart({ chart: { result: [] } }, 'AAPL.US') === null && parseChart(null, 'X') === null);

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});

test('cliente de Yahoo: petición y errores', async () => {
  const { check, failures } = makeChecks();
  const yahoo = fakeYahoo();
  const client = createYahooClient({ fetchImpl: yahoo.fetchImpl });

  const apple = await client.quote('AAPL.US');
  check('cotiza y marca la fuente', apple.price === 355.58 && apple.source === 'Yahoo Finance');
  check('pide el ticker sin sufijo', yahoo.calls[0].pathname.endsWith('/AAPL'), yahoo.calls[0].pathname);
  check('pide el rango del día', yahoo.calls[0].searchParams.get('range') === '1d' && yahoo.calls[0].searchParams.get('interval') === '1d');

  await client.quote('ASML.AS');
  check('en Europa pide el símbolo completo', yahoo.calls[1].pathname.endsWith('/ASML.AS'), yahoo.calls[1].pathname);

  await assert.rejects(() => createYahooClient({ fetchImpl: fakeYahoo({ status: 429 }).fetchImpl }).quote('AAPL.US'),
    (error) => error instanceof MarketError && error.status === 503 && error.code === 'yahoo_rate_limit');
  await assert.rejects(() => createYahooClient({ fetchImpl: fakeYahoo({ status: 500 }).fetchImpl }).quote('AAPL.US'),
    (error) => error.code === 'yahoo_error');
  await assert.rejects(() => createYahooClient({ fetchImpl: fakeYahoo({ payload: { chart: { result: [] } } }).fetchImpl }).quote('AAPL.US'),
    (error) => error.status === 404 && error.code === 'not_found');
  await assert.rejects(() => createYahooClient({ fetchImpl: async () => { throw new Error('sin red'); } }).quote('AAPL.US'),
    (error) => error.code === 'yahoo_unreachable');

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});
