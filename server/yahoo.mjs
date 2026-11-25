/**
 * Tercer escalón gratuito de cotización: Yahoo Finance (chart v8), sin clave.
 *
 * Cubre EE. UU. y Europa con el mismo símbolo que usa la app (`AAPL.US` →
 * `AAPL`, `ASML.AS` se queda igual). Desde algunas IPs de centro de datos
 * Yahoo responde 429, así que va detrás de TradingView y Nasdaq.
 */

import { MarketError } from './free-market.mjs';

const CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';
const USER_AGENT =
  process.env.YAHOO_USER_AGENT || 'Mozilla/5.0 (compatible; MOAT screener)';
const TIMEOUT_MS = Number(process.env.MARKET_TIMEOUT_MS || 9000);
const SOURCE = 'Yahoo Finance';

/** "AAPL.US" → "AAPL"; "ASML.AS" se queda igual. */
export function yahooSymbol(symbol) {
  return String(symbol || '').trim().toUpperCase().replace(/\.US$/, '');
}

function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Metadatos del chart → cotización con la forma de la app. */
export function parseChart(payload, symbol) {
  const result = payload && payload.chart && Array.isArray(payload.chart.result) ? payload.chart.result[0] : null;
  const meta = result && result.meta;
  const price = meta ? toNum(meta.regularMarketPrice) : null;
  if (!meta || price === null) return null;

  const previousClose = toNum(meta.chartPreviousClose) ?? toNum(meta.previousClose) ?? price;
  const change = price - previousClose;
  return {
    symbol,
    price,
    previousClose,
    change: Math.round(change * 10000) / 10000,
    changePercent: previousClose ? Math.round((change / previousClose) * 1000000) / 10000 : 0,
    open: toNum(meta.regularMarketOpen),
    high: toNum(meta.regularMarketDayHigh),
    low: toNum(meta.regularMarketDayLow),
    volume: toNum(meta.regularMarketVolume),
    asOf: meta.regularMarketTime ? new Date(Number(meta.regularMarketTime) * 1000).toISOString() : null,
    source: SOURCE
  };
}

export function createYahooClient({ fetchImpl = null, timeoutMs = TIMEOUT_MS } = {}) {
  const doFetch = () => fetchImpl || globalThis.fetch;

  async function quote(symbol) {
    const ticker = yahooSymbol(symbol);
    if (!ticker) throw new MarketError(400, 'invalid_symbol', 'Símbolo no válido.');

    const url = `${CHART_URL}/${encodeURIComponent(ticker)}?range=1d&interval=1d&includePrePost=false`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await doFetch()(url, {
        signal: controller.signal,
        headers: { 'user-agent': USER_AGENT, accept: 'application/json' }
      });
    } catch {
      throw new MarketError(504, 'yahoo_unreachable', 'No se pudo contactar con Yahoo Finance.');
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 429) {
      throw new MarketError(503, 'yahoo_rate_limit', 'Yahoo Finance está limitando las peticiones desde este servidor.');
    }
    if (!response.ok) {
      throw new MarketError(502, 'yahoo_error', `Yahoo Finance respondió con estado ${response.status}.`);
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new MarketError(502, 'yahoo_invalid', 'Yahoo Finance devolvió una respuesta que no se pudo leer.');
    }

    const quote = parseChart(payload, symbol);
    if (!quote) throw new MarketError(404, 'not_found', `Yahoo Finance no tiene cotización para ${symbol}.`);
    return quote;
  }

  return { quote };
}
