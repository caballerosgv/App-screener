/**
 * Respaldo gratuito de cotización para valores de EE. UU. con la API pública de
 * Nasdaq (api.nasdaq.com), que no pide clave. Solo cubre acciones y ETF
 * estadounidenses; se usa cuando la fuente principal falla.
 */

import { MarketError } from './free-market.mjs';

const INFO_URL = 'https://api.nasdaq.com/api/quote';
// Nasdaq deja colgada la petición si el User-Agent parece un bot con URL, así
// que este respaldo usa un agente simple (configurable con NASDAQ_USER_AGENT).
const USER_AGENT = process.env.NASDAQ_USER_AGENT || 'Mozilla/5.0 (compatible; MOAT screener)';
const TIMEOUT_MS = Number(process.env.MARKET_TIMEOUT_MS || 9000);
const SOURCE = 'Nasdaq';

/** "$1,234.56" → 1234.56; "+1.51" → 1.51; "-0.15%" → -0.15. */
export function toMoney(value) {
  if (value === null || value === undefined) return null;
  const clean = String(value).replace(/[^0-9.+-]/g, '');
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

/**
 * Precio de la sesión regular: `secondaryData` es el cierre oficial cuando el
 * mercado está en after-hours; si no hay, se usa `primaryData`.
 */
function pickQuote(data) {
  for (const block of [data && data.secondaryData, data && data.primaryData]) {
    if (!block) continue;
    const price = toMoney(block.lastSalePrice);
    if (price !== null) return { block, price };
  }
  return null;
}

export function createNasdaqClient({ fetchImpl = null, timeoutMs = TIMEOUT_MS } = {}) {
  const doFetch = () => fetchImpl || globalThis.fetch;

  async function request(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await doFetch()(url, {
        signal: controller.signal,
        headers: { 'user-agent': USER_AGENT, accept: 'application/json' }
      });
    } catch {
      throw new MarketError(504, 'nasdaq_unreachable', 'No se pudo contactar con el respaldo de Nasdaq.');
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 429) {
      throw new MarketError(503, 'nasdaq_rate_limit', 'Nasdaq está limitando las peticiones. Espera un minuto.');
    }
    if (!response.ok) {
      throw new MarketError(502, 'nasdaq_error', `Nasdaq respondió con estado ${response.status}.`);
    }
    try {
      return await response.json();
    } catch {
      throw new MarketError(502, 'nasdaq_invalid', 'Nasdaq devolvió una respuesta que no se pudo leer.');
    }
  }

  async function quote(symbol) {
    const code = String(symbol || '').replace(/\.US$/i, '').toUpperCase();
    if (!code) throw new MarketError(400, 'invalid_symbol', 'Símbolo no válido.');

    for (const assetclass of ['stocks', 'etf']) {
      const json = await request(`${INFO_URL}/${encodeURIComponent(code)}/info?assetclass=${assetclass}`);
      const data = json && json.data;
      const picked = data ? pickQuote(data) : null;
      if (!picked) continue;

      const { block, price } = picked;
      const change = toMoney(block.netChange) ?? 0;
      const changePercent = toMoney(block.percentageChange) ?? (price ? (change / (price - change)) * 100 : 0);
      return {
        symbol: `${code}.US`,
        price,
        previousClose: Math.round((price - change) * 10000) / 10000,
        change,
        changePercent,
        open: null,
        high: null,
        low: null,
        volume: toMoney(block.volume),
        asOf: null,
        source: SOURCE
      };
    }

    throw new MarketError(404, 'not_found', `Nasdaq no tiene cotización para ${symbol}.`);
  }

  return { quote };
}
