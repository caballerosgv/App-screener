import test from 'node:test';
import assert from 'node:assert/strict';
import { makeChecks } from './helpers.mjs';
import { callWithRetry, formatReport, runCanary, validateQuote } from '../server/canary.mjs';

const quote = (source, { symbol = 'AAPL.US', price = 355.58, previousClose = 354.07 } = {}) => ({
  symbol,
  price,
  previousClose,
  change: Math.round((price - previousClose) * 10000) / 10000,
  changePercent: Math.round(((price - previousClose) / previousClose) * 1000000) / 10000,
  asOf: null,
  source
});

const cases = [{ symbol: 'AAPL.US', label: 'Apple', sources: ['tradingview', 'nasdaq', 'yahoo'] }];

function clients({ tradingview, nasdaq, yahoo } = {}) {
  const make = (label, impl) => ({ label, quote: impl || (async () => quote(label)) });
  return {
    tradingview: make('TradingView', tradingview),
    nasdaq: make('Nasdaq', nasdaq),
    yahoo: make('Yahoo Finance', yahoo)
  };
}

const rateLimit = () => {
  throw Object.assign(new Error('límite'), { code: 'nasdaq_rate_limit' });
};
const broken = () => {
  throw Object.assign(new Error('caído'), { code: 'market_error' });
};

test('canario: valida el formato de la cotización', () => {
  const { check, failures } = makeChecks();
  const good = quote('TradingView');
  check('una cotización correcta no da problemas', validateQuote(good, { symbol: 'AAPL.US', source: 'TradingView' }).length === 0);
  check('detecta la fuente equivocada', validateQuote(good, { symbol: 'AAPL.US', source: 'Nasdaq' }).some((p) => /source/.test(p)));
  check('detecta el símbolo equivocado', validateQuote(good, { symbol: 'MSFT.US', source: 'TradingView' }).some((p) => /symbol/.test(p)));
  check('detecta un precio ausente', validateQuote({ ...good, price: null }, { symbol: 'AAPL.US', source: 'TradingView' }).some((p) => /price/.test(p)));
  check('detecta un cambio incoherente', validateQuote({ ...good, change: 40 }, { symbol: 'AAPL.US', source: 'TradingView' }).some((p) => /no cuadra/.test(p)));

  const cents = { ...quote('Nasdaq'), price: 35558, change: 151, changePercent: 0.43 };
  check('detecta un cambio de unidades', validateQuote(cents, { symbol: 'AAPL.US', source: 'Nasdaq' }).some((p) => /price − previousClose/.test(p)));
  check('una cotización vacía se rechaza', validateQuote(null, { symbol: 'AAPL.US', source: 'Yahoo Finance' })[0].includes('ninguna'));

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});

test('canario: todas las fuentes bien', async () => {
  const { check, failures } = makeChecks();
  const report = await runCanary({ clients: clients(), cases });
  check('el canario pasa', report.ok === true, formatReport(report));
  check('tres fuentes comprobadas', report.results.length === 3 && report.results.every((r) => r.status === 'ok'));
  check('contrasta precios entre fuentes', report.crossChecks.length === 1 && report.crossChecks[0].ok);
  check('el informe lo dice', /todas las fuentes responden/.test(formatReport(report)));

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});

test('canario: un cambio de formato lo hace fallar', async () => {
  const { check, failures } = makeChecks();
  const wrongSource = await runCanary({ clients: clients({ nasdaq: async () => quote('Nasdaq Inc.') }), cases });
  check('falla si la fuente no es la esperada', wrongSource.ok === false && wrongSource.failures[0].status === 'format', formatReport(wrongSource));
  check('el informe lo marca', /✖ AAPL.US {2}nasdaq/.test(formatReport(wrongSource)));

  const noPrice = await runCanary({ clients: clients({ yahoo: async () => ({ ...quote('Yahoo Finance'), price: undefined }) }), cases });
  check('falla si falta el precio', noPrice.ok === false && noPrice.failures.some((f) => /price/.test(f.detail)), noPrice.failures.map((f) => f.detail).join('|'));

  const down = await runCanary({ clients: clients({ tradingview: broken }), cases, retry: { waitMs: 0 } });
  check('falla si una fuente da error', down.ok === false && down.failures.some((f) => f.status === 'error'), formatReport(down));

  const disagree = await runCanary({ clients: clients({ yahoo: async () => quote('Yahoo Finance', { price: 400, previousClose: 399 }) }), cases });
  check('falla si las fuentes no coinciden', disagree.ok === false && disagree.crossFailures.length === 1, disagree.crossChecks[0].detail);

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});

test('canario: un 429 persistente avisa pero no falla, y se reintenta', async () => {
  const { check, failures } = makeChecks();
  const blocked = await runCanary({ clients: clients({ yahoo: rateLimit }), cases, retry: { retries: 1, waitMs: 0 } });
  check('el límite de peticiones no cuenta como cambio', blocked.ok === true && blocked.blocked.length === 1, formatReport(blocked));
  check('el informe avisa', /no se pudieron verificar hoy/.test(formatReport(blocked)));

  let calls = 0;
  const flaky = async () => {
    calls += 1;
    if (calls === 1) throw rateLimit();
    return quote('Yahoo Finance');
  };
  const retried = await callWithRetry(flaky, { retries: 1, waitMs: 0, sleepImpl: async () => {} });
  check('reintenta tras el 429', calls === 2 && !!retried.quote, String(calls));

  let generic = 0;
  const hard = await callWithRetry(async () => { generic += 1; throw broken(); }, { retries: 1, waitMs: 0, sleepImpl: async () => {} });
  check('un error normal no se reintenta', generic === 1 && hard.error.code === 'market_error', String(generic));

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});
