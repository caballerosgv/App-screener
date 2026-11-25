import test from 'node:test';
import assert from 'node:assert/strict';
import { makeChecks } from './helpers.mjs';
import { createNewsClient, keywordsFor, parseFeed, relevant, tidyHeadlines } from '../server/free-news.mjs';
import { MarketError } from '../server/free-market.mjs';
import { EMPTY_RSS, GOOGLE_RSS, YAHOO_RSS, fakeNewsFetch } from './fixtures/news.mjs';

test('lee los titulares del RSS con la forma de la app', async () => {
  const { check, failures } = makeChecks();
  const items = parseFeed(YAHOO_RSS, { symbol: 'AAPL.US', limit: 10, source: 'Yahoo Finance' });

  check('dos titulares', items.length === 2, String(items.length));
  check('título limpio', items[0].title.startsWith('Apple (AAPL) Pushes Back'), items[0].title);
  check('fecha en ISO', items[0].date === '2026-11-25', String(items[0].date));
  check('enlace', items[0].url === 'https://example.test/aapl-1', String(items[0].url));
  check('quita el HTML del resumen', items[0].summary === 'Shares of Apple rise after the announcement.', items[0].summary);
  check('lee CDATA en el resumen', items[1].summary === 'Details on the new tariff list.', items[1].summary);
  check('marca el símbolo y el sentimiento neutro', items[0].tickers[0] === 'AAPL.US' && items[0].sentiment === 'neutral');
  check('anota la fuente', items[0].source === 'Yahoo Finance');
  check('respeta el límite', parseFeed(YAHOO_RSS, { limit: 1 }).length === 1);
  check('un feed vacío no rompe', parseFeed(EMPTY_RSS, { limit: 5 }).length === 0 && parseFeed('', {}).length === 0);

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});

test('titulares: Yahoo primero y Google como respaldo', async () => {
  const { check, failures } = makeChecks();

  const yahoo = fakeNewsFetch();
  const client = createNewsClient({ fetchImpl: yahoo.fetchImpl });
  const items = await client.headlines('AAPL.US', 5);
  check('usa Yahoo Finance', items.length === 2 && items[0].source === 'Yahoo Finance', `${items.length}/${items[0] && items[0].source}`);
  check('no consulta Google si hay titulares', yahoo.calls.length === 1, String(yahoo.calls.length));
  check('pide el RSS del símbolo sin el sufijo .US', yahoo.calls[0].searchParams.get('s') === 'AAPL', String(yahoo.calls[0].searchParams.get('s')));

  const europeo = fakeNewsFetch();
  await createNewsClient({ fetchImpl: europeo.fetchImpl }).headlines('ASML.AS', 3);
  check('en Europa conserva el sufijo de bolsa', europeo.calls[0].searchParams.get('s') === 'ASML.AS', String(europeo.calls[0].searchParams.get('s')));

  const sinYahoo = fakeNewsFetch({ yahoo: EMPTY_RSS });
  const fallback = createNewsClient({ fetchImpl: sinYahoo.fetchImpl });
  const google = await fallback.headlines('ASML.AS', 5);
  check('cae a Google News', google.length === 1 && google[0].source === 'Google News', `${google.length}/${google[0] && google[0].source}`);
  check('consulta las dos fuentes', sinYahoo.calls.length === 2, String(sinYahoo.calls.length));

  const caido = fakeNewsFetch({ fail: 'finance.yahoo.com' });
  const rescue = createNewsClient({ fetchImpl: caido.fetchImpl });
  const rescued = await rescue.headlines('MSFT.US', 3);
  check('si Yahoo no responde, sigue Google', rescued.length === 1 && rescued[0].source === 'Google News');

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});

test('titulares: orden por fecha y sin duplicados', async () => {
  const { check, failures } = makeChecks();
  const desordenado = `<?xml version="1.0"?><rss><channel>
    <item><title>Vieja</title><link>https://a</link><pubDate>Mon, 02 Nov 2026 08:00:00 GMT</pubDate></item>
    <item><title>Nueva</title><link>https://b</link><pubDate>Wed, 25 Nov 2026 08:00:00 GMT</pubDate></item>
    <item><title>nueva</title><link>https://c</link><pubDate>Wed, 25 Nov 2026 09:00:00 GMT</pubDate></item>
  </channel></rss>`;

  const items = tidyHeadlines(parseFeed(desordenado, { symbol: 'AAPL.US', limit: 5, source: 'Yahoo Finance' }));
  check('la más reciente primero', items[0].title === 'Nueva', items.map((i) => i.title).join(','));
  check('quita duplicados por título', items.length === 2, String(items.length));

  const google = createNewsClient({ fetchImpl: fakeNewsFetch({ yahoo: EMPTY_RSS, google: desordenado }).fetchImpl });
  const viaGoogle = await google.headlines('ASML.AS', 5);
  check('el respaldo también sale ordenado', viaGoogle[0].date === '2026-11-25' && viaGoogle.at(-1).date === '2026-11-02', viaGoogle.map((i) => i.date).join(','));

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});

test('titulares relevantes: se queda con los que mencionan a la empresa', async () => {
  const { check, failures } = makeChecks();
  check('palabras clave del símbolo y del nombre', keywordsFor('MSFT.US', 'Microsoft Corporation').join(',') === 'msft,microsoft', keywordsFor('MSFT.US', 'Microsoft Corporation').join(','));
  check('descarta palabras vacías', !keywordsFor('ASML.AS', 'ASML Holding NV').includes('holding'));

  const mezcla = `<?xml version="1.0"?><rss><channel>
    <item><title>Japan's biggest banks pick Solana</title><link>https://a</link><pubDate>Wed, 25 Nov 2026 10:00:00 GMT</pubDate></item>
    <item><title>What Microsoft expects from AI in 2027</title><link>https://b</link><pubDate>Wed, 25 Nov 2026 09:00:00 GMT</pubDate></item>
  </channel></rss>`;

  const conNombre = createNewsClient({ fetchImpl: fakeNewsFetch({ yahoo: mezcla }).fetchImpl });
  const filtrado = await conNombre.headlines('MSFT.US', 5, { name: 'Microsoft Corporation' });
  check('quita el ruido de mercado', filtrado.length === 1 && filtrado[0].title.includes('Microsoft'), filtrado.map((i) => i.title).join('|'));

  const sinNombre = createNewsClient({ fetchImpl: fakeNewsFetch({ yahoo: mezcla }).fetchImpl });
  const todos = await sinNombre.headlines('MSFT.US', 5);
  check('sin nombre devuelve todo', todos.length === 2, String(todos.length));

  const nadie = relevant(parseFeed(mezcla, { symbol: 'KO.US', limit: 5 }), 'KO.US', 'Coca-Cola Company');
  check('si nadie coincide no se queda vacío', nadie.length === 2, String(nadie.length));

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});

test('titulares: sin ninguna fuente se informa del fallo', async () => {
  const vacio = createNewsClient({ fetchImpl: fakeNewsFetch({ yahoo: EMPTY_RSS, google: EMPTY_RSS }).fetchImpl });
  await assert.rejects(() => vacio.headlines('AAPL.US'), (error) => error instanceof MarketError && error.status === 502 && error.code === 'news_unavailable');

  const caido = createNewsClient({ fetchImpl: fakeNewsFetch({ fail: 'news.google.com', yahoo: EMPTY_RSS }).fetchImpl });
  await assert.rejects(() => caido.headlines('ASML.AS'), (error) => error.code === 'news_unavailable');

  assert.ok(GOOGLE_RSS.includes('Reuters'));
});
