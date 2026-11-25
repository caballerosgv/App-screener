/**
 * Proveedor gratuito de cotización, fundamentales básicos y buscador.
 *
 * Usa los endpoints públicos del escáner y del buscador de TradingView, que no
 * piden clave. No son una API con contrato estable: si dejan de responder, el
 * proxy lo cuenta con un error claro y EODHD sigue disponible con un token.
 */

const SCAN_URL = 'https://scanner.tradingview.com/global/scan';
const SEARCH_URL = 'https://symbol-search.tradingview.com/symbol_search/v3/';
const USER_AGENT =
  process.env.MARKET_USER_AGENT ||
  'Mozilla/5.0 (compatible; MOAT screener; +https://github.com/caballerosgv/App-screener)';
const TIMEOUT_MS = Number(process.env.MARKET_TIMEOUT_MS || 9000);
const SOURCE = 'TradingView';

export class MarketError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const COLUMNS = [
  'name',
  'description',
  'close',
  'change',
  'open',
  'high',
  'low',
  'volume',
  'market_cap_basic',
  'price_earnings_ttm',
  'price_52_week_high',
  'price_52_week_low',
  'sector',
  'currency',
  'exchange',
  'return_on_equity',
  'return_on_invested_capital',
  'debt_to_equity',
  'gross_margin',
  'net_margin',
  'free_cash_flow',
  'total_revenue',
  'beta_1_year'
];

/** Sufijo de EODHD → bolsa de TradingView. */
const TV_BY_SUFFIX = {
  AS: 'EURONEXT',
  PA: 'EURONEXT',
  BR: 'EURONEXT',
  LS: 'EURONEXT',
  DE: 'XETR',
  SW: 'SIX',
  MC: 'BME',
  CO: 'OMXCOP',
  ST: 'OMXSTO',
  OL: 'OSL',
  HE: 'OMXHEX',
  MI: 'MIL',
  LSE: 'LSE'
};

/** En EE. UU. la bolsa no viene en el símbolo: se prueban las principales. */
const US_EXCHANGES = ['NASDAQ', 'NYSE', 'AMEX', 'NYSEARCA'];

/** Bolsa + país de TradingView → sufijo de EODHD (el que usa la app). */
const SUFFIX_BY_EXCHANGE = {
  EURONEXT: { NL: 'AS', FR: 'PA', BE: 'BR', PT: 'LS' },
  XETR: { DE: 'DE' },
  FWB: { DE: 'DE' },
  SIX: { CH: 'SW' },
  BME: { ES: 'MC' },
  OMXCOP: { DK: 'CO' },
  OMXSTO: { SE: 'ST' },
  OSL: { NO: 'OL' },
  OMXHEX: { FI: 'HE' },
  MIL: { IT: 'MI' },
  LSE: { GB: 'LSE' },
  NASDAQ: { US: 'US' },
  NYSE: { US: 'US' },
  AMEX: { US: 'US' },
  NYSEARCA: { US: 'US' }
};

const SUPPORTED_COUNTRIES = new Set(['US', 'NL', 'FR', 'BE', 'PT', 'DE', 'CH', 'ES', 'DK', 'SE', 'NO', 'FI', 'IT', 'GB']);
const ALLOWED_TYPES = new Set(['stock', 'dr', 'etf', 'fund']);

function toNum(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

/** "ASML.AS" → { code: "ASML", suffix: "AS" }. */
function splitSymbol(raw) {
  const symbol = String(raw || '').trim().toUpperCase();
  const dot = symbol.lastIndexOf('.');
  if (dot === -1) return { code: symbol, suffix: 'US' };
  return { code: symbol.slice(0, dot), suffix: symbol.slice(dot + 1) };
}

/** TradingView escribe las clases de acción con guion bajo: BRK-B → BRK_B. */
const tvTicker = (code) => code.replace(/-/g, '_');

export function suffixFor(exchange, country) {
  const name = String(exchange || '').toUpperCase();
  // El buscador devuelve "Euronext Amsterdam", no "EURONEXT": el país decide.
  if (name.startsWith('EURONEXT')) {
    return { NL: 'AS', FR: 'PA', BE: 'BR', PT: 'LS' }[country] || null;
  }
  const byCountry = SUFFIX_BY_EXCHANGE[name];
  return byCountry ? byCountry[country] || null : null;
}

/** Candidatos "BOLSA:TICKER" para resolver la cotización en una sola petición. */
export function scanCandidates(rawSymbol) {
  const { code, suffix } = splitSymbol(rawSymbol);
  if (!code) return [];
  const ticker = tvTicker(code);
  const exchange = TV_BY_SUFFIX[suffix];
  if (exchange) return [`${exchange}:${ticker}`];
  if (suffix === 'US') return US_EXCHANGES.map((market) => `${market}:${ticker}`);
  // Clase de acción estadounidense (BRK.B): TradingView la escribe BRK_B.
  return US_EXCHANGES.map((market) => `${market}:${ticker}_${suffix}`);
}

export function createMarketClient({
  fetchImpl = null,
  timeoutMs = TIMEOUT_MS,
  ttlMs = 60_000,
  now = () => Date.now()
} = {}) {
  const rows = new Map();
  const searches = new Map();
  const doFetch = () => fetchImpl || globalThis.fetch;

  async function request(url, init = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await doFetch()(url, {
        ...init,
        signal: controller.signal,
        headers: {
          'user-agent': USER_AGENT,
          accept: 'application/json',
          origin: 'https://www.tradingview.com',
          ...(init.headers || {})
        }
      });
    } catch {
      throw new MarketError(504, 'market_unreachable', 'No se pudo contactar con la fuente gratuita de cotizaciones.');
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 429) {
      throw new MarketError(503, 'market_rate_limit', 'La fuente gratuita está limitando las peticiones. Espera un minuto y reinténtalo.');
    }
    if (!response.ok) {
      throw new MarketError(502, 'market_error', `La fuente gratuita de cotizaciones respondió con estado ${response.status}.`);
    }
    try {
      return await response.json();
    } catch {
      throw new MarketError(502, 'market_invalid', 'La fuente gratuita devolvió una respuesta que no se pudo leer.');
    }
  }

  async function scan(tickers) {
    const payload = { symbols: { tickers, query: { types: [] } }, columns: COLUMNS };
    const json = await request(SCAN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const list = Array.isArray(json && json.data) ? json.data : [];
    const found = new Map();
    for (const item of list) {
      if (!item || !item.s) continue;
      const row = { ticker: item.s };
      COLUMNS.forEach((column, index) => {
        row[column] = Array.isArray(item.d) ? item.d[index] : null;
      });
      found.set(item.s, row);
    }
    return found;
  }

  /** Fila del escáner para un símbolo de la app, con caché corta. */
  async function rowFor(symbol) {
    const cached = rows.get(symbol);
    if (cached && now() - cached.at < ttlMs) return cached.row;

    const candidates = scanCandidates(symbol);
    if (!candidates.length) {
      throw new MarketError(400, 'unsupported_market', 'La fuente gratuita todavía no cubre ese mercado.');
    }

    const found = await scan(candidates);
    for (const ticker of candidates) {
      const row = found.get(ticker);
      if (row && toNum(row.close) !== null) {
        rows.set(symbol, { at: now(), row });
        return row;
      }
    }
    throw new MarketError(404, 'not_found', `La fuente gratuita no tiene cotización para ${symbol}.`);
  }

  async function quote(symbol) {
    const row = await rowFor(symbol);
    const price = toNum(row.close);
    const changePercent = toNum(row.change) ?? 0;
    const previousClose = changePercent <= -100 ? price : price / (1 + changePercent / 100);
    return {
      symbol,
      price,
      previousClose: round(previousClose),
      change: round(price - previousClose),
      changePercent: round(changePercent),
      open: toNum(row.open),
      high: toNum(row.high),
      low: toNum(row.low),
      volume: toNum(row.volume),
      asOf: null,
      source: SOURCE
    };
  }

  async function fundamentals(symbol) {
    const row = await rowFor(symbol);
    return {
      symbol,
      name: cleanText(row.description) || cleanText(row.name) || null,
      sector: cleanText(row.sector) || null,
      industry: null,
      description: null,
      currency: cleanText(row.currency) || null,
      exchange: cleanText(row.exchange) || null,
      marketCap: toNum(row.market_cap_basic),
      peRatio: toNum(row.price_earnings_ttm),
      roe: toNum(row.return_on_equity),
      roic: toNum(row.return_on_invested_capital),
      roa: null,
      profitMargin: toNum(row.net_margin),
      netMargin: toNum(row.net_margin),
      grossMargin: toNum(row.gross_margin),
      operatingMargin: null,
      debtToEquity: toNum(row.debt_to_equity),
      freeCashFlow: toNum(row.free_cash_flow),
      beta: toNum(row.beta_1_year),
      revenue: toNum(row.total_revenue),
      ebitda: null,
      dividendYield: null,
      week52High: toNum(row.price_52_week_high),
      week52Low: toNum(row.price_52_week_low),
      source: SOURCE
    };
  }

  async function search(query, limit = 15) {
    const q = String(query || '').trim();
    const cacheKey = q.toLowerCase();
    const cached = searches.get(cacheKey);
    if (cached && now() - cached.at < ttlMs) return cached.data;

    const url = `${SEARCH_URL}?text=${encodeURIComponent(q)}&lang=en&domain=production`;
    const json = await request(url);
    const target = q.toUpperCase().replace(/_/g, '-');
    const seen = new Set();
    const results = [];

    for (const item of (json && json.symbols) || []) {
      const exchange = String((item && item.exchange) || '').toUpperCase();
      const country = String((item && item.country) || '').toUpperCase();
      if (!SUPPORTED_COUNTRIES.has(country)) continue;
      const suffix = suffixFor(exchange, country);
      if (!suffix) continue;
      const type = String(item.type || '').toLowerCase();
      if (!ALLOWED_TYPES.has(type)) continue;

      const code = String(item.symbol || '').toUpperCase().replace(/_/g, '-');
      if (!code) continue;
      const symbol = `${code}.${suffix}`;
      if (seen.has(symbol)) continue;
      seen.add(symbol);

      results.push({
        symbol,
        code,
        name: cleanText(item.description) || symbol,
        exchange: suffix,
        country,
        currency: item.currency_code || null,
        type: type === 'fund' ? 'ETF' : type === 'dr' ? 'DR' : 'Common Stock',
        isin: item.isin || null
      });
    }

    results.sort((a, b) => {
      const exact = (a.code === target ? 0 : 1) - (b.code === target ? 0 : 1);
      if (exact) return exact;
      const stock = (a.type === 'Common Stock' ? 0 : 1) - (b.type === 'Common Stock' ? 0 : 1);
      if (stock) return stock;
      return a.name.localeCompare(b.name, 'es');
    });

    const data = { query: q, count: Math.min(results.length, limit), results: results.slice(0, limit), source: SOURCE };
    searches.set(cacheKey, { at: now(), data });
    return data;
  }

  return { quote, fundamentals, search, rowFor };
}
