import test from 'node:test';
import assert from 'node:assert/strict';
import { makeChecks } from './helpers.mjs';
import {
  createInsiderClient, parseForm4, parseXml, findNode, decodeEntities, secTicker
} from '../server/insiders.mjs';
import { FALLBACK_SUBMISSIONS, fakeSecFetch, form4, txRow } from './fixtures/sec.mjs';

const AHORA = () => new Date('2026-11-25T00:00:00Z');

test('parser XML mínimo: atributos, entidades, CDATA y autocierre', async () => {
  const { check, failures } = makeChecks();
  const tree = parseXml(`<?xml version="1.0"?><!-- comentario --><a x="1" y='dos'><b>uno &amp; dos</b><c/><d><![CDATA[<raw>]]></d><e>&#65;&#x42;</e></a>`);

  const a = findNode(tree, 'a');
  check('lee el nodo raíz', !!a);
  check('lee atributos con comillas simples y dobles', a.attrs.x === '1' && a.attrs.y === 'dos', JSON.stringify(a.attrs));
  check('decodifica entidades en el texto', findNode(a, 'b').text === 'uno & dos', findNode(a, 'b').text);
  check('soporta elementos autocerrados', findNode(a, 'c') !== null && findNode(a, 'c').children.length === 0);
  check('soporta CDATA', findNode(a, 'd').text === '<raw>', findNode(a, 'd').text);
  check('decodifica entidades numéricas', findNode(a, 'e').text === 'AB' && decodeEntities('&#65;&#x42;') === 'AB', findNode(a, 'e').text);
  check('una ruta inexistente devuelve null', findNode(a, 'z/y') === null);

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});

test('Form 4: solo compras y ventas de acciones ordinarias', async () => {
  const { check, failures } = makeChecks();
  const xml = form4(
    'Jane Doe',
    '1',
    txRow('P', 1000, 150.5) + txRow('S', 200, 151) + txRow('A', 50, 0, '2026-11-17') + txRow('P', 0, 10)
  );

  const rows = parseForm4(xml, { filingUrl: 'https://sec.test/4', filingDate: '2026-11-18' });
  check('ignora códigos distintos de P y S', rows.every((row) => row.code === 'P' || row.code === 'S'), rows.map((r) => r.code).join(','));
  check('ignora la tabla de derivados', !rows.some((row) => row.shares === 9999));
  check('descarta operaciones de cero acciones', rows.length === 2, String(rows.length));
  check('calcula el importe', rows[0].value_usd === 150500 && rows[1].value_usd === 30200, `${rows[0].value_usd}/${rows[1].value_usd}`);
  check('marca el plan 10b5-1', rows.every((row) => row.plan_10b5_1 === true));
  check('adjunta fecha de presentación y enlace', rows.every((row) => row.filing_date === '2026-11-18' && row.url === 'https://sec.test/4'));
  check('lee el titular', rows.every((row) => row.owner === 'Jane Doe'));

  const sinFlag = parseForm4(form4('John Roe', null, txRow('S', 10, 100)), { filingDate: '2026-11-21' });
  check('sin casilla 10b5-1 el plan queda desconocido', sinFlag[0].plan_10b5_1 === null);

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});

test('secTicker acepta tickers de EE. UU. y rechaza otros mercados', async () => {
  const { check, failures } = makeChecks();
  check('quita el sufijo .US', secTicker('AAPL.US') === 'AAPL');
  check('deja el ticker suelto', secTicker('aapl') === 'AAPL');
  check('conserva las clases de acción', secTicker('BRK.B') === 'BRK.B', secTicker('BRK.B'));
  let europeo = null;
  try {
    secTicker('ASML.AS');
  } catch (error) {
    europeo = error;
  }
  check('una bolsa europea da 400', europeo && europeo.status === 400 && europeo.code === 'unsupported_market', europeo && europeo.code);

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});

test('cliente SEC: resumen, enmiendas y caché del directorio', async () => {
  const { check, failures } = makeChecks();
  const sec = fakeSecFetch();
  const client = createInsiderClient({ fetchImpl: sec.fetchImpl, pauseMs: 0, now: AHORA });

  const result = await client.fetchInsiders('AAPL.US');
  check('devuelve estado ok y el símbolo', result.status === 'ok' && result.symbol === 'AAPL.US');
  check('identifica al emisor', result.issuer === 'Apple Inc.', String(result.issuer));
  check('una compra y cuatro ventas', result.summary.purchase_count === 1 && result.summary.sale_count === 4, JSON.stringify(result.summary));
  check('importe de compras', result.summary.purchase_value_usd === 150500, String(result.summary.purchase_value_usd));
  check('importe de ventas', result.summary.sale_value_usd === 69695, String(result.summary.sale_value_usd));
  check(
    'separa ventas con plan, sin plan y desconocido',
    result.summary.sale_plan_10b5_1_count === 2 && result.summary.sale_no_plan_count === 1 && result.summary.sale_plan_unknown_count === 1,
    JSON.stringify(result.summary)
  );
  check('descarta el Form 4 fuera del periodo', result.filings_in_period === 4, String(result.filings_in_period));
  check('la enmienda 4/A no duplica la compra', result.transactions.filter((tx) => tx.code === 'P').length === 1);
  check('la compra conserva la presentación más reciente', result.transactions.find((tx) => tx.code === 'P').filing_date === '2026-11-20');
  check('sin truncado con cuatro formularios', result.truncated === false);
  check('advierte de que no son posiciones 13F', /13F/.test(result.note), result.note);

  check('no pide FilingSummary.xml', !sec.calls.some((url) => /FilingSummary/i.test(url)), sec.calls.filter((url) => /FilingSummary/i.test(url)).join(' '));
  check('una sola descarga de XML por formulario', sec.calls.filter((url) => /\/form4\.xml$/.test(url)).length === 4, String(sec.calls.filter((url) => /\/form4\.xml$/.test(url)).length));
  check('sin index.json cuando el documento principal ya es el XML', !sec.calls.some((url) => /index\.json$/.test(url)));
  check('seis llamadas a la SEC en total', sec.calls.length === 6, `${sec.calls.length}: ${sec.calls.join(' ')}`);

  const tickersLlamadas = () => sec.calls.filter((url) => url.includes('company_tickers.json')).length;
  check('pide el directorio de la SEC una vez', tickersLlamadas() === 1, String(tickersLlamadas()));
  await client.fetchInsiders('AAPL.US');
  check('reutiliza el directorio en la segunda consulta', tickersLlamadas() === 1, String(tickersLlamadas()));

  const recortado = await client.fetchInsiders('AAPL.US', { limit: 2 });
  check('limita los formularios examinados', recortado.filings_examined === 2 && recortado.truncated === true, `${recortado.filings_examined}/${recortado.truncated}`);

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});

test('cliente SEC: respaldo del índice sin descargar el resumen', async () => {
  const { check, failures } = makeChecks();
  const sec = fakeSecFetch({ submissions: FALLBACK_SUBMISSIONS });
  const client = createInsiderClient({ fetchImpl: sec.fetchImpl, pauseMs: 0, now: AHORA });

  const result = await client.fetchInsiders('AAPL.US');
  check('lee el Form 4 desde el índice', result.transactions.length === 2, String(result.transactions.length));
  check('el índice se pide una vez', sec.calls.filter((url) => /index\.json$/.test(url)).length === 1);
  check('no descarga FilingSummary.xml', !sec.calls.some((url) => /FilingSummary/i.test(url)), sec.calls.join(' '));
  check('cuatro llamadas en total', sec.calls.length === 4, `${sec.calls.length}: ${sec.calls.join(' ')}`);

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});

test('cliente SEC: errores claros y clases de acción', async () => {
  const { check, failures } = makeChecks();

  const sec = fakeSecFetch();
  const client = createInsiderClient({ fetchImpl: sec.fetchImpl, pauseMs: 0, now: AHORA });

  await assert.rejects(() => client.fetchInsiders('ASML.AS'), (error) => error.status === 400 && error.code === 'unsupported_market');
  await assert.rejects(() => client.fetchInsiders('ZZZZ'), (error) => error.status === 404 && error.code === 'not_found');

  const bloqueado = createInsiderClient({ fetchImpl: fakeSecFetch({ failWith: 403 }).fetchImpl, pauseMs: 0 });
  await assert.rejects(() => bloqueado.fetchInsiders('AAPL.US'), (error) => error.code === 'sec_user_agent');

  const limitado = createInsiderClient({ fetchImpl: fakeSecFetch({ failWith: 429 }).fetchImpl, pauseMs: 0 });
  await assert.rejects(() => limitado.fetchInsiders('AAPL.US'), (error) => error.status === 503 && error.code === 'sec_rate_limit');

  const claseB = await client.fetchInsiders('BRK.B');
  check('resuelve BRK.B contra BRK-B', claseB.issuer === 'Berkshire Hathaway Inc.', String(claseB.issuer));

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});
