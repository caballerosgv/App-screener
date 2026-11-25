#!/usr/bin/env node
/**
 * MOAT · servidor web + proxy de datos de mercado (EODHD).
 *
 * El navegador nunca ve la clave: solo llama a /api/*, y este proceso añade
 * el token de EODHD en la petición al proveedor.
 *
 * Uso:
 *   EODHD_API_TOKEN=tu_token npm run dev
 *   (sin token arranca en modo "demo", con los símbolos públicos de EODHD)
 */
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAnalysis } from './rubric.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUBLIC_DIR = join(ROOT, 'public');

/* ---------- entorno ---------- */
function loadEnvFile() {
  let raw = '';
  try {
    raw = readFileSync(join(ROOT, '.env'), 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && !(key in process.env)) process.env[key] = value;
  }
}
loadEnvFile();

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const PROVIDER = 'eodhd';
const API_BASE = (process.env.EODHD_BASE_URL || 'https://eodhd.com/api').replace(/\/+$/, '');
const TOKEN = process.env.EODHD_API_TOKEN || 'demo';
const MODE = TOKEN === 'demo' ? 'demo' : 'live';
const UPSTREAM_TIMEOUT = Number(process.env.UPSTREAM_TIMEOUT_MS || 9000);

const DEMO_TICKERS = ['AAPL.US', 'AMZN.US', 'TSLA.US', 'VTI.US'];

/* ---------- utilidades ---------- */
class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function toNum(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function cleanText(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function summarize(value, max = 320) {
  const text = cleanText(value);
  if (text.length <= max) return text;
  return text.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

const SYMBOL_RE = /^[A-Z0-9][A-Z0-9.\-]{0,14}$/;

/** Bolsas admitidas: estadounidenses y europeas. */
const SEARCH_EXCHANGES = new Set([
  'US', 'LSE', 'PA', 'AS', 'DE', 'XETRA', 'F', 'SW', 'MI', 'MC', 'BR', 'LS', 'VI', 'ST', 'CO',
  'HE', 'OL', 'PR', 'WAR', 'AT', 'IS', 'DUB', 'BE', 'DU', 'HM', 'MU', 'SG', 'TL', 'VX'
]);

const SEARCH_COUNTRIES = new Set([
  'usa', 'united states', 'netherlands', 'germany', 'france', 'united kingdom', 'switzerland',
  'spain', 'italy', 'belgium', 'portugal', 'sweden', 'norway', 'denmark', 'finland', 'ireland',
  'austria', 'poland', 'greece', 'luxembourg', 'czech republic', 'czechia', 'hungary', 'romania',
  'estonia', 'latvia', 'lithuania', 'slovakia', 'slovenia', 'croatia', 'bulgaria', 'cyprus',
  'malta', 'iceland'
]);

/** Tipos que no son acciones ni ETFs negociables. */
const EXCLUDED_TYPES = /warrant|bond|note|right|unit|currency|index|option|future|crypto|mutual fund|money market/i;

/** AAPL -> AAPL.US · ASML.AS se mantiene · valida el formato. */
function toProviderSymbol(raw) {
  const symbol = String(raw || '').trim().toUpperCase();
  if (!SYMBOL_RE.test(symbol)) {
    throw new HttpError(400, 'invalid_symbol', 'Símbolo no válido. Usa el ticker, por ejemplo AAPL o ASML.AS.');
  }
  return symbol.includes('.') ? symbol : `${symbol}.US`;
}

/* ---------- caché y límite de peticiones ---------- */
const TTL = { quote: 60_000, fundamentals: 86_400_000, news: 600_000, search: 86_400_000 };
const cache = new Map();

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expires < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function cacheSet(key, value, ttl) {
  if (cache.size > 300) cache.clear();
  cache.set(key, { value, expires: Date.now() + ttl });
}

const hits = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const record = hits.get(ip);
  if (!record || record.reset < now) {
    hits.set(ip, { count: 1, reset: now + 60_000 });
    return false;
  }
  record.count += 1;
  if (hits.size > 5000) hits.clear();
  return record.count > 120;
}

/* ---------- proveedor ---------- */
async function upstream(pathname, params = {}) {
  const url = new URL(`${API_BASE}${pathname}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  url.searchParams.set('api_token', TOKEN);
  url.searchParams.set('fmt', 'json');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT);
  let response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json', 'user-agent': 'moat-screener/1.0' }
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new HttpError(504, 'upstream_timeout', 'La fuente de datos tardó demasiado en responder. Inténtalo de nuevo.');
    }
    throw new HttpError(502, 'upstream_unreachable', 'No se pudo contactar con la fuente de datos.');
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401 || response.status === 403 || response.status === 402) {
    const message = MODE === 'demo'
      ? 'El token demo de EODHD solo cubre AAPL, AMZN, TSLA y VTI. Configura EODHD_API_TOKEN en .env para el resto de símbolos y mercados.'
      : 'EODHD rechazó la petición: revisa que el token sea válido y que tu plan incluya ese símbolo y mercado.';
    throw new HttpError(502, 'upstream_auth', message);
  }
  if (response.status === 429) {
    throw new HttpError(503, 'upstream_rate_limit', 'El proveedor ha limitado las peticiones. Espera unos minutos o revisa tu plan.');
  }
  if (response.status === 404) {
    throw new HttpError(404, 'not_found', 'El proveedor no tiene datos para ese símbolo.');
  }
  if (!response.ok) {
    throw new HttpError(502, 'upstream_error', `La fuente de datos respondió con estado ${response.status}.`);
  }

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(502, 'upstream_invalid', 'La fuente de datos devolvió una respuesta que no se pudo leer.');
  }
}

async function getQuote(symbol, refresh) {
  const cacheKey = `quote:${symbol}`;
  if (!refresh) {
    const cached = cacheGet(cacheKey);
    if (cached) return cached;
  }
  const raw = await upstream(`/real-time/${encodeURIComponent(symbol)}`);
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!row || toNum(row.close) === null) {
    throw new HttpError(404, 'no_quote', `Sin cotización para ${symbol}. Con el token demo solo hay datos de AAPL, AMZN, TSLA y VTI.`);
  }
  const price = toNum(row.close);
  const previousClose = toNum(row.previousClose) ?? price;
  const change = toNum(row.change) ?? price - previousClose;
  const changePercent =
    toNum(row.change_p) ?? (previousClose ? ((price - previousClose) / previousClose) * 100 : 0);

  const data = {
    symbol,
    price,
    previousClose,
    change,
    changePercent,
    open: toNum(row.open),
    high: toNum(row.high),
    low: toNum(row.low),
    volume: toNum(row.volume),
    asOf: row.timestamp ? new Date(Number(row.timestamp) * 1000).toISOString() : null,
    source: 'EODHD'
  };
  cacheSet(cacheKey, data, TTL.quote);
  return data;
}

async function getSearch(query, limit, refresh) {
  const q = String(query || '').trim().replace(/\s+/g, ' ');
  if (q.length < 2) {
    throw new HttpError(400, 'invalid_query', 'Escribe al menos 2 caracteres para buscar.');
  }
  if (q.length > 40) {
    throw new HttpError(400, 'invalid_query', 'La búsqueda es demasiado larga (máximo 40 caracteres).');
  }
  if (!/^[\p{L}\p{N} .,&'()+\-]+$/u.test(q)) {
    throw new HttpError(400, 'invalid_query', 'La búsqueda solo admite letras, números y signos como . , & ( ) + -');
  }

  const cacheKey = `search:${q.toLowerCase()}:${limit}`;
  if (!refresh) {
    const cached = cacheGet(cacheKey);
    if (cached) return cached;
  }

  const raw = await upstream(`/search/${encodeURIComponent(q)}`, { limit: Math.max(limit, 10) });
  const rows = Array.isArray(raw) ? raw : [];
  const target = q.toUpperCase();
  const seen = new Set();
  const results = [];

  for (const row of rows) {
    if (!row || !row.Code || !row.Exchange) continue;
    const exchange = String(row.Exchange).toUpperCase();
    const country = String(row.Country || '');
    if (!SEARCH_EXCHANGES.has(exchange) && !SEARCH_COUNTRIES.has(country.toLowerCase())) continue;
    if (row.Type && EXCLUDED_TYPES.test(String(row.Type))) continue;

    const symbol = `${String(row.Code).toUpperCase()}.${exchange}`;
    if (seen.has(symbol)) continue;
    seen.add(symbol);
    results.push({
      symbol,
      code: String(row.Code).toUpperCase(),
      name: cleanText(row.Name) || symbol,
      exchange,
      country: country || null,
      currency: row.Currency || null,
      type: row.Type || null,
      isin: row.Isin || null
    });
  }

  results.sort((a, b) => {
    const exactA = a.code === target ? 0 : 1;
    const exactB = b.code === target ? 0 : 1;
    if (exactA !== exactB) return exactA - exactB;
    const stockA = /^common stock$/i.test(a.type || '') ? 0 : 1;
    const stockB = /^common stock$/i.test(b.type || '') ? 0 : 1;
    if (stockA !== stockB) return stockA - stockB;
    return a.name.localeCompare(b.name, 'es');
  });

  const data = {
    query: q,
    count: Math.min(results.length, limit),
    results: results.slice(0, limit),
    source: 'EODHD'
  };
  cacheSet(cacheKey, data, TTL.search);
  return data;
}

async function getAnalysis(symbol, refresh) {
  const cacheKey = `analysis:${symbol}`;
  if (!refresh) {
    const cached = cacheGet(cacheKey);
    if (cached) return cached;
  }
  const raw = await upstream(`/v1.1/fundamentals/${encodeURIComponent(symbol)}`, {
    filter:
      'General,Highlights,Financials::Income_Statement::yearly,Financials::Balance_Sheet::yearly,Financials::Cash_Flow::yearly'
  });
  const analysis = buildAnalysis(raw, symbol);
  if (!analysis) {
    throw new HttpError(404, 'no_financials', 'El proveedor no devuelve estados financieros para ese símbolo con tu plan.');
  }
  analysis.source = 'EODHD';
  cacheSet(cacheKey, analysis, TTL.fundamentals);
  return analysis;
}

async function getFundamentals(symbol, refresh) {
  const cacheKey = `fund:${symbol}`;
  if (!refresh) {
    const cached = cacheGet(cacheKey);
    if (cached) return cached;
  }
  const raw = await upstream(`/v1.1/fundamentals/${encodeURIComponent(symbol)}`, {
    filter: 'General,Highlights'
  });
  const general = raw && raw.General ? raw.General : {};
  const highlights = raw && raw.Highlights ? raw.Highlights : {};
  if (!general.Name && !highlights.MarketCapitalization) {
    throw new HttpError(404, 'no_fundamentals', 'El plan actual no incluye fundamentales para ese símbolo.');
  }

  const data = {
    symbol,
    name: general.Name || null,
    sector: general.Sector || null,
    industry: general.Industry || null,
    description: summarize(general.Description, 480) || null,
    currency: general.CurrencyCode || null,
    exchange: general.Exchange || null,
    marketCap: toNum(highlights.MarketCapitalization),
    peRatio: toNum(highlights.PERatio),
    roe: toNum(highlights.ReturnOnEquityTTM),
    roa: toNum(highlights.ReturnOnAssetsTTM),
    profitMargin: toNum(highlights.ProfitMargin),
    operatingMargin: toNum(highlights.OperatingMarginTTM),
    revenue: toNum(highlights.RevenueTTM),
    ebitda: toNum(highlights.EBITDA),
    dividendYield: toNum(highlights.DividendYield),
    week52High: toNum(highlights['52WeekHigh']),
    week52Low: toNum(highlights['52WeekLow']),
    source: 'EODHD'
  };
  cacheSet(cacheKey, data, TTL.fundamentals);
  return data;
}

function sentimentOf(value) {
  const polarity =
    typeof value === 'number' ? value : value && Number.isFinite(Number(value.polarity)) ? Number(value.polarity) : 0;
  if (polarity > 0.15) return 'positiva';
  if (polarity < -0.15) return 'negativa';
  return 'neutral';
}

async function getNews(symbol, limit, refresh) {
  const cacheKey = `news:${symbol}:${limit}`;
  if (!refresh) {
    const cached = cacheGet(cacheKey);
    if (cached) return cached;
  }
  const raw = await upstream('/news', { s: symbol, limit, offset: 0 });
  const rows = Array.isArray(raw) ? raw : [];
  const items = rows
    .map((row) => ({
      date: row.date ? String(row.date).slice(0, 10) : null,
      title: cleanText(row.title),
      summary: summarize(row.content),
      url: row.link || null,
      tickers: Array.isArray(row.symbols) ? row.symbols : [],
      sentiment: sentimentOf(row.sentiment)
    }))
    .filter((item) => item.title);
  cacheSet(cacheKey, items, TTL.news);
  return items;
}

/* ---------- HTTP ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8'
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}

async function serveStatic(res, pathname) {
  let relative = pathname;
  try {
    relative = decodeURIComponent(pathname);
  } catch {
    relative = pathname;
  }
  if (relative.endsWith('/')) relative += 'index.html';
  const filePath = resolve(join(PUBLIC_DIR, normalize(relative)));
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + sep)) {
    throw new HttpError(403, 'forbidden', 'Ruta no permitida.');
  }
  let info;
  try {
    info = await stat(filePath);
  } catch {
    throw new HttpError(404, 'not_found', 'Archivo no encontrado.');
  }
  if (!info.isFile()) throw new HttpError(404, 'not_found', 'Archivo no encontrado.');

  res.writeHead(200, {
    'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff'
  });
  createReadStream(filePath).pipe(res);
}

async function handleApi(url, res) {
  const path = url.pathname;
  const params = url.searchParams;
  const refresh = params.get('refresh') === '1';

  if (path === '/api/health') {
    sendJson(res, 200, {
      provider: PROVIDER,
      mode: MODE,
      keyConfigured: TOKEN !== 'demo',
      demoTickers: MODE === 'demo' ? DEMO_TICKERS : undefined,
      supports: ['quote', 'fundamentals', 'analysis', 'news', 'search'],
      time: new Date().toISOString()
    });
    return;
  }

  if (path === '/api/search') {
    const query = params.get('q') || params.get('query') || '';
    const limit = Math.min(Math.max(Number(params.get('limit') || 15), 1), 30);
    sendJson(res, 200, await getSearch(query, limit, refresh));
    return;
  }

  if (path === '/api/quote') {
    const symbol = toProviderSymbol(params.get('symbol'));
    sendJson(res, 200, await getQuote(symbol, refresh));
    return;
  }

  if (path === '/api/fundamentals') {
    const symbol = toProviderSymbol(params.get('symbol'));
    sendJson(res, 200, await getFundamentals(symbol, refresh));
    return;
  }

  if (path === '/api/analysis') {
    const symbol = toProviderSymbol(params.get('symbol'));
    sendJson(res, 200, await getAnalysis(symbol, refresh));
    return;
  }

  if (path === '/api/news') {
    const symbol = toProviderSymbol(params.get('symbol'));
    const limit = Math.min(Math.max(Number(params.get('limit') || 10), 1), 30);
    sendJson(res, 200, { symbol, items: await getNews(symbol, limit, refresh) });
    return;
  }

  throw new HttpError(
    404,
    'unknown_endpoint',
    'Endpoint no encontrado. Disponibles: /api/health, /api/search, /api/quote, /api/fundamentals, /api/analysis, /api/news.'
  );
}

const server = createServer(async (req, res) => {
  const started = Date.now();
  const ip = req.socket.remoteAddress || 'unknown';
  let url;
  try {
    url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  } catch {
    sendJson(res, 400, { error: { code: 'bad_request', message: 'Petición no válida.' } });
    return;
  }

  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      throw new HttpError(405, 'method_not_allowed', 'Solo se admiten peticiones GET.');
    }
    if (url.pathname.startsWith('/api/')) {
      if (isRateLimited(ip)) {
        throw new HttpError(429, 'rate_limited', 'Demasiadas peticiones desde tu red. Espera un minuto.');
      }
      await handleApi(url, res);
    } else {
      await serveStatic(res, url.pathname);
    }
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const code = error instanceof HttpError ? error.code : 'internal_error';
    const message =
      error instanceof HttpError ? error.message : 'Error interno del servidor de datos. Revisa los logs.';
    if (!(error instanceof HttpError)) console.error('[error]', error && error.stack ? error.stack : error);
    if (!res.headersSent) sendJson(res, status, { error: { code, message } });
    else res.end();
  } finally {
    console.log(`${req.method} ${url.pathname} ${res.statusCode} ${Date.now() - started}ms`);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`MOAT escuchando en http://${HOST}:${PORT}`);
  console.log(`Proveedor: ${PROVIDER} · modo: ${MODE}${MODE === 'demo' ? ' (token público, solo AAPL/AMZN/TSLA/VTI)' : ''}`);
  if (MODE === 'demo') {
    console.log('Configura EODHD_API_TOKEN en .env para datos de todo el universo US + Europa.');
  }
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`\nCerrando (${signal})…`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
