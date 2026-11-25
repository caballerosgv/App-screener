import test from 'node:test';
import assert from 'node:assert/strict';
import { makeChecks } from './helpers.mjs';
import { createNasdaqClient, toMoney } from '../server/nasdaq.mjs';
import { MarketError } from '../server/free-market.mjs';

const okJson = (value) => ({ ok: true, status: 200, json: async () => value });

const INFO = {
  AAPL: {
    stocks: {
      data: {
        symbol: 'AAPL',
        companyName: 'Apple Inc. Common Stock',
        exchange: 'NASDAQ-GS',
        primaryData: { lastSalePrice: '$355.0501', netChange: '-0.5299', percentageChange: '-0.15%', volume: '54,215,490.77' },
        secondaryData: { lastSalePrice: '$355.58', netChange: '+1.51', percentageChange: '+0.43%', volume: '53,000,000' }
      }
    }
  },
  VTI: { stocks: { data: null }, etf: { data: { symbol: 'VTI', primaryData: { lastSalePrice: '$352.76', netChange: '-0.60', percentageChange: '-0.17%' } } } }
};

function fakeNasdaq({ info = INFO, failWith = null } = {}) {
  const calls = [];
  const fetchImpl = async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    if (failWith) return { ok: false, status: failWith, json: async () => ({}) };
    const match = url.pathname.match(/\/api\/quote\/([^/]+)\/info$/);
    const code = match ? decodeURIComponent(match[1]) : '';
    const assetclass = url.searchParams.get('assetclass');
    const entry = info[code] && info[code][assetclass];
    if (entry) return okJson(entry);
    return okJson({ data: null });
  };
  return { calls, fetchImpl };
}

test('convierte los importes de Nasdaq', async () => {
  const { check, failures } = makeChecks();
  check('quita el dólar', toMoney('$355.58') === 355.58, String(toMoney('$355.58')));
  check('quita las comas de miles', toMoney('54,215,490.77') === 54215490.77, String(toMoney('54,215,490.77')));
  check('conserva el signo', toMoney('+1.51') === 1.51 && toMoney('-0.5299') === -0.5299);
  check('lee porcentajes', toMoney('-0.15%') === -0.15);
  check('vacío queda nulo', toMoney('') === null && toMoney(null) === null);
  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});

test('cotización de respaldo: cierre de la sesión regular', async () => {
  const { check, failures } = makeChecks();
  const nasdaq = fakeNasdaq();
  const client = createNasdaqClient({ fetchImpl: nasdaq.fetchImpl });

  const apple = await client.quote('AAPL.US');
  check('usa el cierre, no el after-hours', apple.price === 355.58, String(apple.price));
  check('cierre anterior = precio - cambio', Math.abs(apple.previousClose - 354.07) < 0.001, String(apple.previousClose));
  check('cambio y porcentaje', apple.change === 1.51 && Math.abs(apple.changePercent - 0.43) < 0.01);
  check('lee el volumen', Math.round(apple.volume) === 53000000, String(apple.volume));
  check('identifica la fuente', apple.source === 'Nasdaq');
  check('normaliza el símbolo', apple.symbol === 'AAPL.US');
  check('una sola petición para una acción', nasdaq.calls.length === 1, String(nasdaq.calls.length));
  check('pide la clase stocks', nasdaq.calls[0].searchParams.get('assetclass') === 'stocks');

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});

test('cotización de respaldo: sin cierre usa el precio en vivo', async () => {
  const { check, failures } = makeChecks();
  const info = {
    MSFT: { stocks: { data: { primaryData: { lastSalePrice: '$489.93', netChange: '-6.20', percentageChange: '-1.25%' }, secondaryData: { lastSalePrice: '', netChange: '', percentageChange: '' } } } }
  };
  const client = createNasdaqClient({ fetchImpl: fakeNasdaq({ info }).fetchImpl });
  const msft = await client.quote('MSFT');
  check('usa primaryData si no hay cierre', msft.price === 489.93, String(msft.price));
  check('calcula el cierre anterior', Math.abs(msft.previousClose - 496.13) < 0.001, String(msft.previousClose));
  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});

test('cotización de respaldo: ETF y errores', async () => {
  const { check, failures } = makeChecks();
  const nasdaq = fakeNasdaq();
  const client = createNasdaqClient({ fetchImpl: nasdaq.fetchImpl });

  const etf = await client.quote('VTI.US');
  check('prueba stocks y luego etf', etf.price === 352.76 && nasdaq.calls.length === 2, `${etf.price}/${nasdaq.calls.length}`);

  await assert.rejects(() => client.quote('ZZZZ.US'), (error) => error instanceof MarketError && error.status === 404 && error.code === 'not_found');

  const limitado = createNasdaqClient({ fetchImpl: fakeNasdaq({ failWith: 429 }).fetchImpl });
  await assert.rejects(() => limitado.quote('AAPL.US'), (error) => error.status === 503 && error.code === 'nasdaq_rate_limit');

  const caido = createNasdaqClient({ fetchImpl: fakeNasdaq({ failWith: 500 }).fetchImpl });
  await assert.rejects(() => caido.quote('AAPL.US'), (error) => error.code === 'nasdaq_error');

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});
