/**
 * Explorador de mercado gratuito.
 *
 * Pide al escáner de TradingView un lote de valores con sus ratios (por
 * capitalización, el escáner no conoce nuestra nota), descarta ETF y valores
 * sin mercado reconocido, y ordena el lote con la nota aproximada de los 8
 * factores. No es el universo entero: es una foto de los mayores valores de
 * cada mercado, suficiente para explorar sin token.
 */

import { MarketError, suffixFor } from './free-market.mjs';
import { buildFreeAnalysis } from './free-analysis.mjs';
import { FACTOR_KEYS, FACTOR_WEIGHTS } from './rubric.mjs';

const SCAN_URL = 'https://scanner.tradingview.com/global/scan';
const USER_AGENT =
  process.env.MARKET_USER_AGENT ||
  'Mozilla/5.0 (compatible; MOAT screener; +https://github.com/caballerosgv/App-screener)';
const TIMEOUT_MS = Number(process.env.MARKET_TIMEOUT_MS || 9000);
const SOURCE = 'TradingView';

export const MARKETS = {
  US: ['NASDAQ', 'NYSE', 'AMEX', 'NYSEARCA'],
  EU: ['EURONEXT', 'XETR', 'FWB', 'SIX', 'BME', 'MIL', 'LSE', 'OMXCOP', 'OMXSTO', 'OSL', 'OMXHEX']
};

/** El escáner devuelve el país con su nombre; la app usa el código ISO. */
export const COUNTRY_BY_NAME = {
  'United States': 'US',
  Netherlands: 'NL',
  France: 'FR',
  Belgium: 'BE',
  Portugal: 'PT',
  Germany: 'DE',
  Switzerland: 'CH',
  Spain: 'ES',
  Denmark: 'DK',
  Sweden: 'SE',
  Norway: 'NO',
  Finland: 'FI',
  Italy: 'IT',
  'United Kingdom': 'GB'
};

export function countryCode(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (text.length === 2) return text.toUpperCase();
  return COUNTRY_BY_NAME[text] || null;
}

const COLUMNS = [
  'name',
  'description',
  'close',
  'change',
  'market_cap_basic',
  'price_earnings_ttm',
  'return_on_equity',
  'return_on_invested_capital',
  'debt_to_equity',
  'gross_margin',
  'net_margin',
  'free_cash_flow',
  'total_revenue',
  'beta_1_year',
  'sector',
  'country',
  'currency',
  'exchange',
  'type'
];

const num = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** Nota 0-100 con los pesos de la app, a partir de la rúbrica aproximada. */
export function qualityOf(analysis) {
  if (!analysis) return null;
  const weight = FACTOR_KEYS.reduce((acc, key) => acc + FACTOR_WEIGHTS[key], 0);
  const score = FACTOR_KEYS.reduce((acc, key) => acc + analysis.factors[key].score * FACTOR_WEIGHTS[key], 0) / weight;
  return Math.round(score * 10 * 10) / 10;
}

/** Filtro del escáner por bolsa; en Europa además por país, para no colar ADR de EE. UU. */
export function marketFilter(market) {
  const key = String(market || 'US').toUpperCase();
  const filters = [{ left: 'exchange', operation: 'in_range', right: MARKETS[key] || MARKETS.US }];
  if (key === 'EU') {
    filters.push({ left: 'country', operation: 'in_range', right: Object.keys(COUNTRY_BY_NAME).filter((name) => name !== 'United States') });
  }
  return filters;
}

/** Fila del escáner → valor de la app (símbolo incluido); null si no encaja. */
export function toResult(row) {
  if (!row || !row.code || !row.exchange) return null;
  if (row.type && String(row.type).toLowerCase() !== 'stock') return null;
  if (String(row.code).includes('_')) return null; // clases de acción: símbolo ambiguo
  const country = countryCode(row.country);
  if (!country) return null;
  const suffix = suffixFor(row.exchange, country);
  if (!suffix) return null;

  const fundamentals = {
    name: row.name || row.description || row.code,
    sector: row.sector || null,
    currency: row.currency || null,
    exchange: row.exchange,
    marketCap: num(row.marketCap),
    peRatio: num(row.per),
    roic: num(row.roic),
    roe: num(row.roe),
    grossMargin: num(row.grossMargin),
    netMargin: num(row.netMargin),
    freeCashFlow: num(row.freeCashFlow),
    revenue: num(row.revenue),
    debtToEquity: num(row.debtToEquity),
    beta: num(row.beta)
  };
  const symbol = `${String(row.code).toUpperCase()}.${suffix}`;
  const analysis = buildFreeAnalysis({ symbol, fundamentals, xbrl: null });
  const quality = qualityOf(analysis);
  if (quality === null) return null;

  const round = (value, digits = 2) => (value === null ? null : Math.round(value * 10 ** digits) / 10 ** digits);
  return {
    symbol,
    name: fundamentals.name,
    sector: fundamentals.sector,
    country,
    currency: fundamentals.currency,
    price: round(num(row.price)),
    changePercent: round(num(row.change)),
    marketCap: fundamentals.marketCap,
    per: round(fundamentals.peRatio),
    roic: round(fundamentals.roic),
    netMargin: round(fundamentals.netMargin),
    debtToEquity: round(fundamentals.debtToEquity),
    quality
  };
}

export async function screenMarket({
  market = 'US',
  sector = '',
  minCap = 0,
  limit = 40,
  fetchImpl = null,
  timeoutMs = TIMEOUT_MS
} = {}) {
  const key = String(market || 'US').toUpperCase();
  if (!MARKETS[key]) throw new MarketError(400, 'invalid_market', 'Mercado no válido: usa US o EU.');

  const filter = marketFilter(key);
  if (Number(minCap) > 0) filter.push({ left: 'market_cap_basic', operation: 'greater', right: Number(minCap) });

  const doFetch = fetchImpl || globalThis.fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await doFetch(SCAN_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'user-agent': USER_AGENT,
        accept: 'application/json',
        'content-type': 'application/json',
        origin: 'https://www.tradingview.com'
      },
      body: JSON.stringify({
        filter,
        options: { lang: 'en' },
        columns: COLUMNS,
        sort: { sortBy: 'market_cap_basic', sortOrder: 'desc' },
        range: [0, Math.min(Math.max(Number(limit) * 3, 60), 150)]
      })
    });
  } catch {
    throw new MarketError(504, 'market_unreachable', 'No se pudo contactar con el explorador gratuito.');
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 429) {
    throw new MarketError(503, 'market_rate_limit', 'El explorador gratuito está limitando las peticiones. Espera un minuto.');
  }
  if (!response.ok) {
    throw new MarketError(502, 'market_error', `El explorador gratuito respondió con estado ${response.status}.`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new MarketError(502, 'market_invalid', 'El explorador devolvió una respuesta que no se pudo leer.');
  }

  const rows = Array.isArray(payload && payload.data) ? payload.data : [];
  const mapped = [];
  for (const item of rows) {
    if (!item || !item.s || !Array.isArray(item.d)) continue;
    const row = { ticker: item.s };
    COLUMNS.forEach((column, index) => {
      row[column] = item.d[index];
    });
    row.code = String(item.s).split(':')[1] || null;
    row.exchange = String(item.s).split(':')[0] || row.exchange;
    const result = toResult({
      code: row.code,
      exchange: row.exchange,
      type: row.type,
      country: row.country,
      name: row.description || row.name,
      sector: row.sector,
      currency: row.currency,
      price: row.close,
      change: row.change,
      marketCap: row.market_cap_basic,
      per: row.price_earnings_ttm,
      roe: row.return_on_equity,
      roic: row.return_on_invested_capital,
      debtToEquity: row.debt_to_equity,
      grossMargin: row.gross_margin,
      netMargin: row.net_margin,
      freeCashFlow: row.free_cash_flow,
      revenue: row.total_revenue,
      beta: row.beta_1_year
    });
    if (result) mapped.push(result);
  }

  const needle = String(sector || '').trim().toLowerCase();
  const filtered = needle ? mapped.filter((row) => String(row.sector || '').toLowerCase().includes(needle)) : mapped;
  filtered.sort((a, b) => b.quality - a.quality || (b.marketCap || 0) - (a.marketCap || 0));

  // Un valor puede cotizar en varias bolsas y con varias clases de acción.
  const seen = new Set();
  const unique = filtered.filter((row) => {
    const key = `${row.name}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    market: key,
    sector: needle || null,
    minCap: Number(minCap) || 0,
    universe: Number(payload && payload.totalCount) || mapped.length,
    reviewed: mapped.length,
    count: Math.min(unique.length, limit),
    source: SOURCE,
    approximate: true,
    note: 'Nota aproximada con ratios públicos; el lote son los valores con más capitalización del mercado, no el universo completo.',
    results: unique.slice(0, limit)
  };
}
