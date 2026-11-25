import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { rootPath, makeChecks } from './helpers.mjs';
import { buildFundamentals } from './fixtures/fundamentals.mjs';
import { fakeSecFetch } from './fixtures/sec.mjs';

const SERVER_ENTRY = pathToFileURL(rootPath('server/index.js')).href;
let imports = 0;

/** Respuesta mínima que consume `upstream()`: status, ok y text(). */
function fakeResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body))
  };
}

/**
 * Importa el servidor real con estado propio (caché, contador de peticiones)
 * y su propio entorno. Al importarlo no escucha: las pruebas hablan con él
 * emitiendo la petición sobre el handler, sin abrir ningún socket.
 */
async function loadServer({ token = 'demo', base = 'https://provider.test/api', dataDir } = {}) {
  process.env.EODHD_API_TOKEN = token;
  process.env.EODHD_BASE_URL = base;
  process.env.MOAT_DATA_DIR = dataDir || mkdtempSync(join(tmpdir(), 'moat-datos-'));
  imports += 1;
  const { server } = await import(`${SERVER_ENTRY}?caso=${imports}`);
  return server;
}

/** Proveedor simulado: registra cada URL pedida y responde con el handler. */
function fakeProvider(handler) {
  const calls = [];
  const fetchImpl = async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    return handler(url, calls.length);
  };
  return {
    calls,
    install() {
      globalThis.fetch = fetchImpl;
    },
    hits(fragment) {
      return calls.filter((url) => url.pathname.includes(fragment)).length;
    }
  };
}

function createResponse() {
  const res = {
    statusCode: 200,
    headersSent: false,
    headers: {},
    bodyText: null,
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers || {};
      this.headersSent = true;
    },
    end(body) {
      if (body !== undefined && body !== null) this.bodyText = String(body);
      this.resolve();
    }
  };
  res.done = new Promise((resolve) => {
    res.resolve = resolve;
  });
  return res;
}

/** Lanza una petición contra el handler del servidor, sin abrir puertos. */
async function request(server, path, { method = 'GET', ip = '10.1.0.1', body } = {}) {
  const res = createResponse();
  const raw = body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body);
  const req = {
    method,
    url: path,
    headers: { host: 'localhost' },
    socket: { remoteAddress: ip },
    async *[Symbol.asyncIterator]() {
      if (raw !== null) yield Buffer.from(raw);
    }
  };
  const log = console.log;
  console.log = () => {}; // el servidor registra cada petición atendida
  try {
    server.emit('request', req, res);
    await res.done;
  } finally {
    console.log = log;
  }
  return {
    status: res.statusCode,
    headers: res.headers,
    body: res.bodyText ? JSON.parse(res.bodyText) : null
  };
}

/** Respuestas correctas para cotización, fundamentales, noticias y buscador. */
function happyProvider() {
  return fakeProvider((url) => {
    if (url.pathname.includes('/real-time/')) {
      return fakeResponse(200, [{ close: 100, previousClose: 98, timestamp: 1_700_000_000 }]);
    }
    if (url.pathname.includes('/v1.1/fundamentals/')) {
      return fakeResponse(200, {
        General: { Name: 'Microsoft Corporation', Sector: 'Technology' },
        Highlights: { MarketCapitalization: 3_000_000_000_000 }
      });
    }
    if (url.pathname.endsWith('/news')) {
      return fakeResponse(200, [
        { date: '2026-11-24', title: 'Titular de prueba', link: 'https://example.test/a', symbols: ['MSFT.US'], sentiment: 0.5 }
      ]);
    }
    if (url.pathname.includes('/search/')) {
      return fakeResponse(200, [
        { Code: 'MSFT', Exchange: 'US', Country: 'USA', Name: 'Microsoft Corp', Type: 'Common Stock', Currency: 'USD' }
      ]);
    }
    return fakeResponse(404, {});
  });
}

test('/api/health informa del proveedor, del modo y de los endpoints', async () => {
  const { check, failures } = makeChecks();
  const server = await loadServer();
  const provider = fakeProvider(() => {
    throw new Error('health no debe llamar al proveedor');
  });
  provider.install();

  const demo = await request(server, '/api/health');
  check('responde 200', demo.status === 200, String(demo.status));
  check('identifica el proveedor', demo.body.provider === 'eodhd', String(demo.body.provider));
  check('modo demo sin token propio', demo.body.mode === 'demo' && demo.body.keyConfigured === false, `${demo.body.mode}/${demo.body.keyConfigured}`);
  check('lista los símbolos públicos en demo', Array.isArray(demo.body.demoTickers) && demo.body.demoTickers.includes('AAPL.US'), JSON.stringify(demo.body.demoTickers));
  check('anuncia los cinco endpoints', ['quote', 'fundamentals', 'analysis', 'news', 'search'].every((key) => demo.body.supports.includes(key)), demo.body.supports.join(','));
  check('fecha ISO válida', !Number.isNaN(Date.parse(demo.body.time)), String(demo.body.time));
  check('no se cachea', demo.headers['Cache-Control'] === 'no-store', String(demo.headers['Cache-Control']));
  check('no llama al proveedor', provider.calls.length === 0, String(provider.calls.length));

  const live = await loadServer({ token: 'token-de-prueba' });
  const real = await request(live, '/api/health');
  check('modo live con token propio', real.body.mode === 'live' && real.body.keyConfigured === true, `${real.body.mode}/${real.body.keyConfigured}`);
  check('sin símbolos demo en live', real.body.demoTickers === undefined);

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});

test('valida y normaliza el símbolo antes de llamar al proveedor', async () => {
  const { check, failures } = makeChecks();
  const server = await loadServer();
  const provider = happyProvider();
  provider.install();

  const invalidos = [
    ['sin símbolo', '/api/quote'],
    ['símbolo vacío', '/api/quote?symbol='],
    ['con espacios', '/api/quote?symbol=AA%20PL'],
    ['intento de ruta', '/api/quote?symbol=..%2F..%2Fetc%2Fpasswd'],
    ['demasiado largo', '/api/quote?symbol=ABCDEFGHIJKLMNOP'],
    ['con carácter no permitido', '/api/fundamentals?symbol=AAPL%24']
  ];
  for (const [label, path] of invalidos) {
    const res = await request(server, path, { ip: '10.2.0.1' });
    check(`${label} → 400 invalid_symbol`, res.status === 400 && res.body.error.code === 'invalid_symbol', `${res.status}/${res.body && res.body.error && res.body.error.code}`);
  }
  check('ningún símbolo inválido llega al proveedor', provider.calls.length === 0, String(provider.calls.length));

  const sinBolsa = await request(server, '/api/quote?symbol=aapl', { ip: '10.2.0.2' });
  check('añade .US al ticker sin bolsa', sinBolsa.status === 200 && provider.calls.at(-1).pathname === '/api/real-time/AAPL.US', provider.calls.at(-1).pathname);
  check('el token viaja en la petición al proveedor', provider.calls.at(-1).searchParams.get('api_token') === 'demo' && provider.calls.at(-1).searchParams.get('fmt') === 'json');

  const conBolsa = await request(server, '/api/quote?symbol=asml.as', { ip: '10.2.0.3' });
  check('respeta la bolsa del ticker', conBolsa.status === 200 && provider.calls.at(-1).pathname === '/api/real-time/ASML.AS', provider.calls.at(-1).pathname);

  const fundamentales = await request(server, '/api/fundamentals?symbol=msft', { ip: '10.2.0.4' });
  check('normaliza el símbolo en fundamentales', fundamentales.status === 200 && provider.calls.at(-1).pathname === '/api/v1.1/fundamentals/MSFT.US', provider.calls.at(-1).pathname);
  check('fundamentales pide solo General y Highlights', provider.calls.at(-1).searchParams.get('filter') === 'General,Highlights', provider.calls.at(-1).searchParams.get('filter'));

  const noticias = await request(server, '/api/news?symbol=msft', { ip: '10.2.0.5' });
  check('normaliza el símbolo en noticias', noticias.status === 200 && provider.calls.at(-1).searchParams.get('s') === 'MSFT.US', noticias.body.symbol);

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});

test('traduce los fallos del proveedor a códigos de error normalizados', async () => {
  const { check, failures } = makeChecks();
  const server = await loadServer();
  const provider = fakeProvider((url) => {
    const symbol = url.pathname.split('/').pop().split('.')[0]; // llega normalizado: AUTH403.US
    switch (symbol) {
      case 'AUTH403':
        return fakeResponse(403, { error: 'forbidden' });
      case 'AUTH401':
        return fakeResponse(401, {});
      case 'LIMIT':
        return fakeResponse(429, {});
      case 'MISS':
        return fakeResponse(404, {});
      case 'BOOM':
        return fakeResponse(500, {});
      case 'BROKEN':
        return fakeResponse(200, '<html>esto no es json</html>');
      case 'DOWN':
        throw new TypeError('fetch failed');
      case 'SLOW': {
        const error = new Error('This operation was aborted');
        error.name = 'AbortError';
        throw error;
      }
      case 'EMPTY':
        return fakeResponse(200, []);
      case 'NOFUND':
        return fakeResponse(200, {});
      case 'NOFIN':
        return fakeResponse(200, { General: { Name: 'Sin estados' } });
      default:
        return fakeResponse(200, { General: { Name: 'Correcto' }, Highlights: { MarketCapitalization: 1 } });
    }
  });
  provider.install();

  const casos = [
    ['AUTH403', '/api/quote?symbol=AUTH403', 502, 'upstream_auth'],
    ['AUTH401', '/api/quote?symbol=AUTH401', 502, 'upstream_auth'],
    ['LIMIT', '/api/quote?symbol=LIMIT', 503, 'upstream_rate_limit'],
    ['MISS', '/api/quote?symbol=MISS', 404, 'not_found'],
    ['BOOM', '/api/quote?symbol=BOOM', 502, 'upstream_error'],
    ['BROKEN', '/api/quote?symbol=BROKEN', 502, 'upstream_invalid'],
    ['DOWN', '/api/quote?symbol=DOWN', 502, 'upstream_unreachable'],
    ['SLOW', '/api/quote?symbol=SLOW', 504, 'upstream_timeout'],
    ['EMPTY', '/api/quote?symbol=EMPTY', 404, 'no_quote'],
    ['NOFUND', '/api/fundamentals?symbol=NOFUND', 404, 'no_fundamentals'],
    ['NOFIN', '/api/analysis?symbol=NOFIN', 404, 'no_financials']
  ];
  for (const [label, path, status, code] of casos) {
    const res = await request(server, path, { ip: '10.3.0.1' });
    check(`${label} → ${status} ${code}`, res.status === status && res.body.error.code === code, `${res.status}/${res.body && res.body.error && res.body.error.code}`);
    check(`${label} incluye mensaje legible`, typeof res.body.error.message === 'string' && res.body.error.message.length > 10);
  }

  const auth = await request(server, '/api/quote?symbol=AUTH403', { ip: '10.3.0.1' });
  check('el error de auth en demo explica el token público', auth.body.error.message.includes('token demo'), auth.body.error.message);

  const live = await loadServer({ token: 'token-de-prueba' });
  const authLive = await request(live, '/api/quote?symbol=AUTH403', { ip: '10.3.0.2' });
  check('el error de auth en live habla de plan y token', authLive.body.error.message.includes('plan'), authLive.body.error.message);

  const metodo = await request(server, '/api/health', { method: 'POST', ip: '10.3.0.3' });
  check('POST → 405 method_not_allowed', metodo.status === 405 && metodo.body.error.code === 'method_not_allowed', `${metodo.status}/${metodo.body.error.code}`);

  const desconocido = await request(server, '/api/otra-cosa', { ip: '10.3.0.4' });
  check('endpoint inexistente → 404 unknown_endpoint', desconocido.status === 404 && desconocido.body.error.code === 'unknown_endpoint', `${desconocido.status}/${desconocido.body.error.code}`);

  for (const [label, query] of [
    ['consulta corta', 'a'],
    ['carácter no permitido', 'a%24b'],
    ['consulta de 41 caracteres', 'a'.repeat(41)]
  ]) {
    const res = await request(server, `/api/search?q=${query}`, { ip: '10.3.0.5' });
    check(`buscador: ${label} → 400 invalid_query`, res.status === 400 && res.body.error.code === 'invalid_query', `${res.status}/${res.body && res.body.error && res.body.error.code}`);
  }

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});

test('la caché evita repetir llamadas al proveedor salvo con refresh=1', async () => {
  const { check, failures } = makeChecks();
  const server = await loadServer();
  const provider = happyProvider();
  provider.install();

  const primera = await request(server, '/api/quote?symbol=AAPL', { ip: '10.4.0.1' });
  const segunda = await request(server, '/api/quote?symbol=AAPL', { ip: '10.4.0.1' });
  check('la segunda cotización sale de la caché', provider.hits('/real-time/') === 1, String(provider.hits('/real-time/')));
  check('la cotización cacheada es idéntica', JSON.stringify(segunda.body) === JSON.stringify(primera.body));

  const refrescada = await request(server, '/api/quote?symbol=AAPL&refresh=1', { ip: '10.4.0.2' });
  check('refresh=1 vuelve al proveedor', refrescada.status === 200 && provider.hits('/real-time/') === 2, String(provider.hits('/real-time/')));

  await request(server, '/api/quote?symbol=MSFT', { ip: '10.4.0.3' });
  check('cada símbolo tiene su entrada de caché', provider.hits('/real-time/') === 3, String(provider.hits('/real-time/')));

  await request(server, '/api/search?q=msft', { ip: '10.4.0.4' });
  await request(server, '/api/search?q=msft', { ip: '10.4.0.4' });
  check('el buscador cachea la consulta', provider.hits('/search/') === 1, String(provider.hits('/search/')));

  await request(server, '/api/news?symbol=MSFT', { ip: '10.4.0.5' });
  await request(server, '/api/news?symbol=MSFT', { ip: '10.4.0.5' });
  check('las noticias se cachean', provider.hits('/news') === 1, String(provider.hits('/news')));

  await request(server, '/api/fundamentals?symbol=MSFT', { ip: '10.4.0.6' });
  await request(server, '/api/fundamentals?symbol=MSFT', { ip: '10.4.0.6' });
  check('los fundamentales se cachean', provider.hits('/v1.1/fundamentals/') === 1, String(provider.hits('/v1.1/fundamentals/')));

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});

test('/api/analysis devuelve la rúbrica con su versión', async () => {
  const { check, failures } = makeChecks();
  const server = await loadServer();
  const provider = fakeProvider(() => fakeResponse(200, buildFundamentals()));
  provider.install();

  const res = await request(server, '/api/analysis?symbol=MSFT', { ip: '10.6.0.1' });
  check('responde 200', res.status === 200, String(res.status));
  check('el símbolo llega normalizado', res.body.symbol === 'MSFT.US', String(res.body.symbol));
  check('incluye rubricVersion', /^\d+\.\d+\.\d+$/.test(res.body.rubricVersion || ''), String(res.body.rubricVersion));
  check('los 8 factores con su nota', Object.keys(res.body.factors).length === 8, String(Object.keys(res.body.factors).length));
  check('cobertura 7 de 8', res.body.coverage === 7 && res.body.total === 8, `${res.body.coverage}/${res.body.total}`);
  check('marca la fuente de los datos', res.body.source === 'EODHD', String(res.body.source));

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});

test('la copia en el servidor se guarda, se recupera y sobrevive al reinicio', async () => {
  const { check, failures } = makeChecks();
  const dataDir = mkdtempSync(join(tmpdir(), 'moat-copias-'));
  const server = await loadServer({ dataDir });
  const provider = fakeProvider(() => {
    throw new Error('las copias no llaman al proveedor');
  });
  provider.install();

  const copia = {
    app: 'moat',
    version: 1,
    exportedAt: '2026-11-25T10:00:00.000Z',
    data: { watchlist: ['AAPL'], notes: { AAPL: 'Nota original' } }
  };

  const creada = await request(server, '/api/backup', { method: 'POST', ip: '10.7.0.1', body: copia });
  check('crear devuelve 201', creada.status === 201, String(creada.status));
  check('devuelve un código corto', /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(creada.body.code || ''), String(creada.body.code));
  check('guarda la copia con sus secciones', creada.body.data.notes.AAPL === 'Nota original' && creada.body.keys.join() === 'watchlist,notes', String(creada.body.keys));

  const code = creada.body.code;
  const leida = await request(server, `/api/backup?code=${encodeURIComponent(code)}`, { ip: '10.7.0.2' });
  check('se recupera con el código', leida.status === 200 && leida.body.data.watchlist[0] === 'AAPL', String(leida.status));
  const normalizado = await request(server, `/api/backup?code=${code.replace('-', '').toLowerCase()}`, { ip: '10.7.0.3' });
  check('acepta el código sin guion y en minúsculas', normalizado.status === 200, String(normalizado.status));

  const actualizada = await request(server, `/api/backup?code=${encodeURIComponent(code)}`, {
    method: 'POST',
    ip: '10.7.0.4',
    body: { ...copia, data: { notes: { AAPL: 'Nota nueva' } } }
  });
  check('actualizar el mismo código devuelve 200', actualizada.status === 200, String(actualizada.status));
  check('actualiza solo lo enviado', actualizada.body.data.notes.AAPL === 'Nota nueva' && actualizada.body.data.watchlist === undefined);

  const reinicio = await loadServer({ dataDir });
  const trasReinicio = await request(reinicio, `/api/backup?code=${encodeURIComponent(code)}`, { ip: '10.7.0.5' });
  check('la copia sobrevive a un reinicio', trasReinicio.status === 200 && trasReinicio.body.data.notes.AAPL === 'Nota nueva');

  const desconocido = await request(server, '/api/backup?code=ZZZZ-ZZZZ', { ip: '10.7.0.6' });
  check('código desconocido → 404 not_found', desconocido.status === 404 && desconocido.body.error.code === 'not_found', `${desconocido.status}/${desconocido.body.error.code}`);
  const corto = await request(server, '/api/backup?code=ABC', { ip: '10.7.0.7' });
  check('código con formato inválido → 400 invalid_code', corto.status === 400 && corto.body.error.code === 'invalid_code');
  const rota = await request(server, '/api/backup', { method: 'POST', ip: '10.7.0.8', body: 'no es json' });
  check('cuerpo que no es JSON → 400 invalid_backup', rota.status === 400 && rota.body.error.code === 'invalid_backup');
  const forma = await request(server, '/api/backup', { method: 'POST', ip: '10.7.0.9', body: { data: { watchlist: 'AAPL' } } });
  check('secciones con tipo incorrecto → 400 invalid_backup', forma.status === 400 && forma.body.error.code === 'invalid_backup');
  const grande = await request(server, '/api/backup', { method: 'POST', ip: '10.7.0.10', body: 'x'.repeat(1_000_001) });
  check('más de 1 MB → 413 payload_too_large', grande.status === 413 && grande.body.error.code === 'payload_too_large', `${grande.status}/${grande.body.error.code}`);
  const postOtro = await request(server, '/api/quote', { method: 'POST', ip: '10.7.0.11', body: {} });
  check('POST fuera de /api/backup → 405', postOtro.status === 405 && postOtro.body.error.code === 'method_not_allowed');

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});

test('/api/insiders consulta SEC, solo admite EE. UU. y cachea', async () => {
  const { check, failures } = makeChecks();
  const server = await loadServer();
  const sec = fakeSecFetch();
  globalThis.fetch = sec.fetchImpl;

  const primera = await request(server, '/api/insiders?symbol=AAPL', { ip: '10.8.0.1' });
  check('responde 200', primera.status === 200, String(primera.status));
  check('normaliza el símbolo y marca la fuente', primera.body.symbol === 'AAPL.US' && primera.body.source === 'SEC EDGAR Form 4', `${primera.body.symbol}/${primera.body.source}`);
  check('devuelve el resumen de compras y ventas', primera.body.summary.purchase_count === 1 && primera.body.summary.sale_count === 4, JSON.stringify(primera.body.summary));

  const llamadasTrasPrimera = sec.calls.length;
  const segunda = await request(server, '/api/insiders?symbol=AAPL', { ip: '10.8.0.2' });
  check('la segunda consulta sale de la caché', segunda.status === 200 && sec.calls.length === llamadasTrasPrimera, `${sec.calls.length}/${llamadasTrasPrimera}`);

  const refrescada = await request(server, '/api/insiders?symbol=AAPL&refresh=1', { ip: '10.8.0.3' });
  check('refresh=1 vuelve a la SEC', refrescada.status === 200 && sec.calls.length > llamadasTrasPrimera, String(sec.calls.length));

  const europea = await request(server, '/api/insiders?symbol=ASML.AS', { ip: '10.8.0.4' });
  check('una empresa europea → 400 unsupported_market', europea.status === 400 && europea.body.error.code === 'unsupported_market', `${europea.status}/${europea.body.error.code}`);

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});

test('el límite de 120 peticiones por minuto se aplica por IP', async () => {
  const { check, failures } = makeChecks();
  const server = await loadServer();
  const provider = fakeProvider(() => {
    throw new Error('health no debe llamar al proveedor');
  });
  provider.install();

  let permitidas = 0;
  for (let i = 0; i < 120; i += 1) {
    const res = await request(server, '/api/health', { ip: '10.5.0.1' });
    if (res.status === 200) permitidas += 1;
  }
  check('las 120 primeras peticiones pasan', permitidas === 120, String(permitidas));

  const bloqueada = await request(server, '/api/health', { ip: '10.5.0.1' });
  check('la 121 devuelve 429 rate_limited', bloqueada.status === 429 && bloqueada.body.error.code === 'rate_limited', `${bloqueada.status}/${bloqueada.body && bloqueada.body.error && bloqueada.body.error.code}`);
  check('el mensaje invita a esperar', bloqueada.body.error.message.includes('Espera un minuto'), bloqueada.body.error.message);

  const otraIp = await request(server, '/api/health', { ip: '10.5.0.2' });
  check('otra IP no está limitada', otraIp.status === 200, String(otraIp.status));

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});
