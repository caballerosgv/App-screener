import test from 'node:test';
import assert from 'node:assert/strict';
import { makeChecks } from './helpers.mjs';
import { createMarketClient, scanCandidates, MarketError } from '../server/free-market.mjs';
import { fakeTradingViewFetch } from './fixtures/tradingview.mjs';

test('símbolos: bolsa por sufijo y candidatos para EE. UU.', async () => {
  const { check, failures } = makeChecks();
  check('un ticker sin bolsa se prueba en las bolsas de EE. UU.', scanCandidates('AAPL.US').length === 4, scanCandidates('AAPL.US').join(','));
  check('incluye NASDAQ, NYSE y AMEX', ['NASDAQ:AAPL', 'NYSE:AAPL', 'AMEX:AAPL'].every((t) => scanCandidates('AAPL').includes(t)), scanCandidates('AAPL').join(','));
  check('una bolsa europea va directa', scanCandidates('ASML.AS').join(',') === 'EURONEXT:ASML', scanCandidates('ASML.AS').join(','));
  check('Dinamarca usa OMXCOP', scanCandidates('NOVO-B.CO').join(',') === 'OMXCOP:NOVO_B', scanCandidates('NOVO-B.CO').join(','));
  check('Suiza usa SIX', scanCandidates('NESN.SW').join(',') === 'SIX:NESN');
  check('Alemania usa XETR', scanCandidates('SIE.DE').join(',') === 'XETR:SIE');
  check('una clase de acción de EE. UU. se resuelve con guion bajo', scanCandidates('BRK.B').includes('NYSE:BRK_B'), scanCandidates('BRK.B').join(','));

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});

test('cotización gratuita: precio, cierre anterior y fuente', async () => {
  const { check, failures } = makeChecks();
  const tv = fakeTradingViewFetch();
  const client = createMarketClient({ fetchImpl: tv.fetchImpl });

  const apple = await client.quote('AAPL.US');
  check('precio de la sesión', apple.price === 200, String(apple.price));
  check('cierre anterior calculado desde el % de cambio', Math.abs(apple.previousClose - 196.0784) < 0.01, String(apple.previousClose));
  check('cambio absoluto', Math.abs(apple.change - 3.9216) < 0.01, String(apple.change));
  check('máximo, mínimo y volumen', apple.high === 201 && apple.low === 197 && apple.volume === 50_000_000);
  check('identifica la fuente', apple.source === 'TradingView');
  check('una sola petición al escáner', tv.scans().length === 1, String(tv.scans().length));

  const etf = await client.quote('VTI.US');
  check('resuelve un ETF en AMEX', etf.price === 300, String(etf.price));
  const asml = await client.quote('ASML.AS');
  check('resuelve un valor europeo', asml.price === 900 && asml.change === 0);

  await client.quote('AAPL.US');
  check('reutiliza la fila cacheada', tv.scans().length === 3, String(tv.scans().length));

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});

test('fundamentales básicos y buscador con sufijo de la app', async () => {
  const { check, failures } = makeChecks();
  const tv = fakeTradingViewFetch();
  const client = createMarketClient({ fetchImpl: tv.fetchImpl });

  const asml = await client.fundamentals('ASML.AS');
  check('nombre y sector', asml.name === 'ASML Holding NV' && asml.sector === 'Electronic Technology', `${asml.name}/${asml.sector}`);
  check('capitalización y PER', asml.marketCap === 350_000_000_000 && Math.abs(asml.peRatio - 32.3) < 0.01);
  check('divisa y mercado', asml.currency === 'EUR' && asml.exchange === 'EURONEXT');

  const found = await client.search('ASML', 10);
  check('devuelve resultados', found.results.length === 3, String(found.results.length));
  check('mapea EURONEXT + NL a .AS', found.results.some((r) => r.symbol === 'ASML.AS'), found.results.map((r) => r.symbol).join(','));
  check('mapea OMXCOP + DK a .CO y guion', found.results.some((r) => r.symbol === 'NOVO-B.CO'), found.results.map((r) => r.symbol).join(','));
  check('descarta mercados no cubiertos', !found.results.some((r) => r.symbol.endsWith('.TSE') || r.country === 'JP'));
  check('la acción va antes que el ADR', found.results[0].type === 'Common Stock', found.results[0].type);
  check('identifica la fuente del buscador', found.source === 'TradingView');

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});

test('errores del proveedor gratuito', async () => {
  const limitado = createMarketClient({ fetchImpl: fakeTradingViewFetch({ failWith: 429 }).fetchImpl });
  await assert.rejects(() => limitado.quote('AAPL.US'), (error) => error instanceof MarketError && error.status === 503 && error.code === 'market_rate_limit');

  const caido = createMarketClient({ fetchImpl: fakeTradingViewFetch({ failWith: 500 }).fetchImpl });
  await assert.rejects(() => caido.quote('AAPL.US'), (error) => error.code === 'market_error');

  const sinDatos = createMarketClient({ fetchImpl: fakeTradingViewFetch({ rows: {} }).fetchImpl });
  await assert.rejects(() => sinDatos.quote('AAPL.US'), (error) => error.status === 404 && error.code === 'not_found');
});
