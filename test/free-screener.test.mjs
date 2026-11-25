import test from 'node:test';
import assert from 'node:assert/strict';
import { makeChecks } from './helpers.mjs';
import { marketFilter, qualityOf, screenMarket, toResult } from '../server/free-screener.mjs';
import { buildFreeAnalysis } from '../server/free-analysis.mjs';
import { MarketError } from '../server/free-market.mjs';

const COLUMNS = [
  'name', 'description', 'close', 'change', 'market_cap_basic', 'price_earnings_ttm',
  'return_on_equity', 'return_on_invested_capital', 'debt_to_equity', 'gross_margin',
  'net_margin', 'free_cash_flow', 'total_revenue', 'beta_1_year', 'sector', 'country',
  'currency', 'exchange', 'type'
];

const awesome = {
  name: 'Awesome Corp', description: 'Awesome Corp', close: 120, change: 1.5,
  market_cap_basic: 200_000_000_000, price_earnings_ttm: 22,
  return_on_equity: 35, return_on_invested_capital: 28, debt_to_equity: 0.2,
  gross_margin: 65, net_margin: 30, free_cash_flow: 15_000_000_000,
  total_revenue: 60_000_000_000, beta_1_year: 0.9, sector: 'Technology Services',
  country: 'US', currency: 'USD', type: 'stock'
};

const mediocre = {
  ...awesome,
  name: 'Mediocre SA', description: 'Mediocre SA', market_cap_basic: 80_000_000_000,
  price_earnings_ttm: 45, return_on_equity: 6, return_on_invested_capital: 4,
  debt_to_equity: 3.5, gross_margin: 12, net_margin: 3, free_cash_flow: 200_000_000,
  total_revenue: 20_000_000_000, beta_1_year: 1.8, sector: 'Energy Minerals',
  country: 'FR', exchange: 'EURONEXT', currency: 'EUR'
};

function fakeScan({ rows = [['NASDAQ:AWES', awesome], ['EURONEXT:MED', mediocre]], totalCount = 2, status = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    calls.push({ url: String(input), body: JSON.parse(init.body || '{}') });
    if (status !== 200) return { ok: false, status, json: async () => ({}) };
    const columns = JSON.parse(init.body).columns;
    const data = rows.map(([ticker, values]) => ({
      s: ticker,
      d: columns.map((column) => {
        const key = column === 'exchange' ? null : column;
        return values[key] ?? null;
      })
    }));
    return { ok: true, status: 200, json: async () => ({ totalCount, data }) };
  };
  return { calls, fetchImpl };
}

test('explorador: filtro, mapeo y orden por nota', async () => {
  const { check, failures } = makeChecks();
  const scan = fakeScan();
  const data = await screenMarket({ market: 'US', limit: 10, fetchImpl: scan.fetchImpl });

  const body = scan.calls[0].body;
  check('pide el lote por capitalización', body.sort.sortBy === 'market_cap_basic' && body.range[0] === 0, JSON.stringify(body.range));
  check('filtra por bolsas de EE. UU.', JSON.stringify(body.filter[0].right) === JSON.stringify(['NASDAQ', 'NYSE', 'AMEX', 'NYSEARCA']), JSON.stringify(body.filter));
  check('sin capitalización mínima no añade filtro', body.filter.length === 1);

  check('traduce el símbolo al de la app', data.results.some((row) => row.symbol === 'AWES.US') && data.results.some((row) => row.symbol === 'MED.PA'), data.results.map((r) => r.symbol).join(','));
  check('los números llegan redondeados', data.results.every((row) => row.per === null || Math.abs(row.per * 100 - Math.round(row.per * 100)) < 1e-9), data.results.map((r) => r.per).join(','));
  check('ordena de mejor a peor nota', data.results[0].quality >= data.results[1].quality, data.results.map((r) => r.quality).join(' / '));
  check('la nota va en escala 0-100', data.results.every((row) => row.quality > 0 && row.quality <= 100));
  check('declara la fuente y el tamaño del mercado', data.source === 'TradingView' && data.universe === 2 && data.approximate === true);
  check('devuelve los ratios para la tabla', data.results[0].per === 22 && data.results[0].roic === 28 && data.results[0].name === 'Awesome Corp' && data.results[0].marketCap === 200_000_000_000, JSON.stringify(data.results[0]));

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});

test('explorador: mercado, sector, filtros y errores', async () => {
  const { check, failures } = makeChecks();
  const eu = fakeScan();
  await screenMarket({ market: 'EU', fetchImpl: eu.fetchImpl });
  const filtroPais = eu.calls[0].body.filter.find((f) => f.left === 'country');
  check('Europa filtra por país además de por bolsa', eu.calls[0].body.filter[0].left === 'exchange' && !!filtroPais, JSON.stringify(eu.calls[0].body.filter.map((f) => f.left)));
  check('y excluye a EE. UU. de ese filtro', filtroPais.right.includes('Netherlands') && filtroPais.right.includes('Germany') && !filtroPais.right.includes('United States'), filtroPais.right.join(','));

  const conCap = fakeScan();
  await screenMarket({ market: 'US', minCap: 10_000_000_000, fetchImpl: conCap.fetchImpl });
  check('añade la capitalización mínima', conCap.calls[0].body.filter.some((f) => f.left === 'market_cap_basic' && f.operation === 'greater' && f.right === 10_000_000_000));

  const sectorial = fakeScan();
  const soloTech = await screenMarket({ market: 'US', sector: 'techno', fetchImpl: sectorial.fetchImpl });
  check('el sector se aplica sobre el lote', soloTech.results.length === 1 && soloTech.results[0].symbol === 'AWES.US', soloTech.results.map((r) => r.symbol).join(','));

  const limitado = fakeScan();
  const tres = await screenMarket({ market: 'US', limit: 1, fetchImpl: limitado.fetchImpl });
  check('respeta el límite', tres.results.length === 1 && tres.count === 1);

  check('mercado inválido', await screenMarket({ market: 'JP', fetchImpl: fakeScan().fetchImpl }).then(() => false).catch((error) => error instanceof MarketError && error.code === 'invalid_market'));

  const caido = fakeScan({ status: 429 });
  await assert.rejects(() => screenMarket({ market: 'US', fetchImpl: caido.fetchImpl }), (error) => error.code === 'market_rate_limit');
  const roto = fakeScan({ status: 500 });
  await assert.rejects(() => screenMarket({ market: 'US', fetchImpl: roto.fetchImpl }), (error) => error.code === 'market_error');
  const sinRed = async () => { throw new Error('sin red'); };
  await assert.rejects(() => screenMarket({ market: 'US', fetchImpl: sinRed }), (error) => error.code === 'market_unreachable');

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});

test('explorador: descarta ETF, mercados no soportados y valores sin ratios', () => {
  const { check, failures } = makeChecks();
  const base = { code: 'AAA', exchange: 'NASDAQ', country: 'US', type: 'stock', name: 'AAA', ...awesome };

  check('un ETF se descarta', toResult({ ...base, type: 'etf' }) === null);
  check('un mercado sin sufijo se descarta', toResult({ ...base, exchange: 'TSE', country: 'JP' }) === null);
  check('una clase de acción con guion bajo se descarta', toResult({ ...base, code: 'BRK_B' }) === null);
  check('sin ratios suficientes no hay nota', toResult({ code: 'ZZZ', exchange: 'NASDAQ', country: 'US', type: 'stock', name: 'ZZZ' }) === null);
  check('un valor normal sí entra', toResult(base)?.symbol === 'AAA.US');

  const analisis = buildFreeAnalysis({
    symbol: 'AAA.US',
    fundamentals: { roic: 28, grossMargin: 65, netMargin: 30, freeCashFlow: 15e9, revenue: 60e9, marketCap: 200e9, peRatio: 22, debtToEquity: 0.2, beta: 0.9, sector: 'Technology' },
    xbrl: null
  });
  const nota = qualityOf(analisis);
  check('la nota usa los pesos de la app', nota > 60 && nota <= 100, String(nota));

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});
