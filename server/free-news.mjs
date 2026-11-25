/**
 * Titulares gratuitos por ticker, sin clave ni token.
 *
 * Fuente principal: el RSS de Yahoo Finance, que acepta el símbolo completo
 * (`AAPL`, `ASML.AS`, `MC.PA`). Respaldo: la búsqueda de Google News en RSS.
 * Se reutiliza el parser XML de los formularios de la SEC.
 */

import { MarketError } from './free-market.mjs';
import { findNode, parseXml } from './insiders.mjs';

const YAHOO_URL = 'https://feeds.finance.yahoo.com/rss/2.0/headline';
const GOOGLE_URL = 'https://news.google.com/rss/search';
const USER_AGENT =
  process.env.NEWS_USER_AGENT || 'Mozilla/5.0 (compatible; MOAT screener)';
const TIMEOUT_MS = Number(process.env.NEWS_TIMEOUT_MS || 9000);
const SOURCE_YAHOO = 'Yahoo Finance';
const SOURCE_GOOGLE = 'Google News';

const clean = (value) =>
  String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const clip = (value, max = 200) => (value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value);

/** "Wed, 25 Nov 2026 21:27:04 +0000" → "2026-11-25". */
function rssDate(value) {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

/** Elementos <item> del RSS → titulares con la forma que usa la app. */
export function parseFeed(xml, { symbol, limit = 10, source } = {}) {
  if (!xml) return [];
  const channel = findNode(parseXml(xml), 'rss/channel');
  if (!channel) return [];

  const items = [];
  for (const item of channel.children || []) {
    if (item.name !== 'item') continue;
    const title = clean(findNode(item, 'title')?.text);
    if (!title) continue;
    items.push({
      date: rssDate(findNode(item, 'pubDate')?.text),
      title,
      summary: clip(clean(findNode(item, 'description')?.text)),
      url: clean(findNode(item, 'link')?.text) || null,
      tickers: symbol ? [symbol] : [],
      sentiment: 'neutral',
      source
    });
    if (items.length >= limit) break;
  }
  return items;
}

/** Quita duplicados por título y ordena de más reciente a más antiguo. */
export function tidyHeadlines(items) {
  const seen = new Set();
  const unique = [];
  for (const item of items) {
    const key = String(item.title || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

const STOP_WORDS = new Set(['inc', 'corp', 'corporation', 'company', 'holding', 'holdings', 'group', 'plc', 'sa', 'nv', 'ag', 'a/s', 'the', 'and']);

/** Palabras que identifican a la empresa: el ticker y las primeras del nombre. */
export function keywordsFor(symbol, name) {
  const words = [String(symbol || '').split('.')[0].toLowerCase()];
  for (const word of String(name || '').toLowerCase().split(/[^a-z0-9]+/)) {
    if (word.length >= 4 && !STOP_WORDS.has(word)) words.push(word);
    if (words.length >= 4) break;
  }
  return [...new Set(words.filter(Boolean))];
}

/** Deja los titulares que mencionan a la empresa; si no hay ninguno, devuelve todos. */
export function relevant(items, symbol, name) {
  // Sin nombre de empresa no hay filtro: el feed por ticker ya viene acotado.
  const words = name ? keywordsFor(symbol, name) : [];
  if (!words.length) return items;
  const hits = items.filter((item) => {
    const haystack = `${item.title} ${item.summary || ''}`.toLowerCase();
    return words.some((word) => haystack.includes(word));
  });
  return hits.length ? hits : items;
}

export function createNewsClient({ fetchImpl = null, timeoutMs = TIMEOUT_MS } = {}) {
  const doFetch = () => fetchImpl || globalThis.fetch;

  async function fetchText(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await doFetch()(url, {
        signal: controller.signal,
        headers: { 'user-agent': USER_AGENT, accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.8' }
      });
      if (!response.ok) return null;
      return await response.text();
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Titulares del símbolo; Yahoo primero y Google News si no hay nada. Si se
   * conoce el nombre de la empresa, se quedan los que la mencionan (el feed de
   * Yahoo mezcla noticias generales de mercado).
   */
  async function headlines(symbol, limit = 10, { name = null } = {}) {
    const code = String(symbol || '').trim().toUpperCase();
    if (!code) throw new MarketError(400, 'invalid_symbol', 'Símbolo no válido.');
    const size = Math.min(Math.max(Number(limit) || 10, 1), 30);

    // Yahoo usa el ticker sin sufijo para EE. UU. ("AAPL") y con sufijo en Europa ("ASML.AS").
    const yahooSymbol = code.replace(/\.US$/i, '');
    const yahoo = await fetchText(`${YAHOO_URL}?s=${encodeURIComponent(yahooSymbol)}&region=US&lang=en-US`);
    const primary = tidyHeadlines(parseFeed(yahoo, { symbol: code, limit: size * 2, source: SOURCE_YAHOO }));
    if (primary.length) return relevant(primary, code, name).slice(0, size);

    const query = encodeURIComponent(`${code.replace(/\.[A-Z]+$/, '')} stock`);
    const google = await fetchText(`${GOOGLE_URL}?q=${query}&hl=en-US&gl=US&ceid=US:en`);
    const secondary = tidyHeadlines(parseFeed(google, { symbol: code, limit: size * 2, source: SOURCE_GOOGLE }));
    if (secondary.length) return relevant(secondary, code, name).slice(0, size);

    throw new MarketError(502, 'news_unavailable', 'Las fuentes gratuitas de noticias no devolvieron titulares para este valor.');
  }

  return { headlines };
}
