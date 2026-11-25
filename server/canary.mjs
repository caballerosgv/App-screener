/**
 * Canario de las fuentes gratuitas de cotización.
 *
 * Comprueba contra la red real que TradingView, Nasdaq y Yahoo siguen
 * respondiendo con el formato que espera la app. Vive fuera de `npm test`
 * (que es offline) y se ejecuta a diario en GitHub Actions: si alguna fuente
 * cambia el formato o desaparece, el workflow falla.
 */

export const CANARY_CASES = [
  { symbol: 'AAPL.US', label: 'Apple (EE. UU.)', sources: ['tradingview', 'nasdaq', 'yahoo'] },
  { symbol: 'ASML.AS', label: 'ASML (Euronext)', sources: ['tradingview', 'yahoo'] }
];

/** Un salto mayor que esto en un día casi siempre es un cambio de unidades. */
const MAX_DAILY_MOVE = 60;
/** Diferencia tolerada entre el cambio y precio − cierre anterior. */
const CHANGE_TOLERANCE = 0.02;
/** Dos fuentes del mismo valor no deberían diferir más que esto. */
const CROSS_SOURCE_TOLERANCE = 0.03;

const isNum = (value) => typeof value === 'number' && Number.isFinite(value);

/**
 * Valida una cotización con la forma que consume la tarjeta.
 * Devuelve la lista de problemas; vacía significa que el formato es correcto.
 */
export function validateQuote(quote, { symbol, source }) {
  const problems = [];
  if (!quote || typeof quote !== 'object') return ['no se recibió ninguna cotización'];

  if (quote.source !== source) problems.push(`source "${quote.source}" en vez de "${source}"`);
  if (String(quote.symbol || '').toUpperCase() !== String(symbol || '').toUpperCase()) {
    problems.push(`symbol "${quote.symbol}" en vez de "${symbol}"`);
  }
  for (const field of ['price', 'previousClose', 'change', 'changePercent']) {
    if (!isNum(quote[field])) problems.push(`${field} no es un número (${JSON.stringify(quote[field])})`);
  }
  if (problems.length) return problems;

  if (quote.price <= 0) problems.push(`price no es positivo (${quote.price})`);
  if (quote.previousClose <= 0) problems.push(`previousClose no es positivo (${quote.previousClose})`);
  if (Math.abs(quote.changePercent) > MAX_DAILY_MOVE) {
    problems.push(`changePercent fuera de rango (${quote.changePercent}%), ¿unidades cambiadas?`);
  }

  const expectedChange = quote.price - quote.previousClose;
  if (Math.abs(expectedChange - quote.change) > CHANGE_TOLERANCE) {
    problems.push(`change (${quote.change}) no cuadra con price − previousClose (${expectedChange.toFixed(4)})`);
  }
  const expectedPercent = (expectedChange / quote.previousClose) * 100;
  if (Math.abs(expectedPercent - quote.changePercent) > 0.5) {
    problems.push(`changePercent (${quote.changePercent}) no cuadra con el cambio (${expectedPercent.toFixed(4)}%)`);
  }
  return problems;
}

const isRateLimit = (error) => Boolean(error && /rate_limit|too_many|429/.test(String(error.code || '')));

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** Reintenta una vez los límites de peticiones (429), que suelen ser pasajeros. */
export async function callWithRetry(fn, { retries = 1, waitMs = 4000, sleepImpl = sleep } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return { quote: await fn() };
    } catch (error) {
      lastError = error;
      if (!isRateLimit(error) || attempt === retries) break;
      await sleepImpl(waitMs);
    }
  }
  return { error: lastError };
}

/**
 * Ejecuta el canario con clientes inyectables (`{ tradingview, nasdaq, yahoo }`).
 * Cada resultado es `ok`, `format` (falla), `blocked` (aviso) o `error` (falla).
 */
export async function runCanary({ clients, cases = CANARY_CASES, retry = {}, log = () => {} }) {
  const results = [];
  const crossChecks = [];

  for (const item of cases) {
    const quotes = {};
    for (const source of item.sources) {
      const client = clients[source];
      if (!client) {
        results.push({ ...item, source, status: 'error', detail: 'cliente no configurado' });
        continue;
      }
      const { quote, error } = await callWithRetry(() => client.quote(item.symbol), retry);
      if (error) {
        const status = isRateLimit(error) ? 'blocked' : 'error';
        results.push({ ...item, source, status, detail: `${error.code || 'error'}: ${error.message}` });
        continue;
      }
      const problems = validateQuote(quote, { symbol: item.symbol, source: clients[source].label || source });
      if (problems.length) {
        results.push({ ...item, source, status: 'format', detail: problems.join('; ') });
        continue;
      }
      quotes[source] = quote;
      results.push({ ...item, source, status: 'ok', detail: `${quote.price} (${quote.changePercent}%)`, price: quote.price });
      log(`${item.symbol} ${source}: ${quote.price}`);
    }

    const prices = Object.values(quotes).map((quote) => quote.price);
    if (prices.length > 1) {
      const spread = (Math.max(...prices) - Math.min(...prices)) / Math.min(...prices);
      crossChecks.push({
        symbol: item.symbol,
        prices,
        spread,
        ok: spread <= CROSS_SOURCE_TOLERANCE,
        detail: `${prices.join(' / ')} (${(spread * 100).toFixed(2)}% entre fuentes)`
      });
    }
  }

  const failures = results.filter((r) => r.status === 'format' || r.status === 'error');
  const blocked = results.filter((r) => r.status === 'blocked');
  const crossFailures = crossChecks.filter((c) => !c.ok);
  return { ok: failures.length === 0 && crossFailures.length === 0, results, crossChecks, failures, blocked, crossFailures };
}

/** Informe legible del canario. */
export function formatReport({ ok, results, crossChecks, blocked }) {
  const icons = { ok: '✔', format: '✖', error: '✖', blocked: '⚠' };
  const lines = ['Canario de fuentes gratuitas', ''];
  for (const item of results) {
    lines.push(`${icons[item.status]} ${item.symbol.padEnd(8)} ${item.source.padEnd(12)} ${item.status.padEnd(8)} ${item.detail}`);
  }
  if (crossChecks.length) {
    lines.push('', 'Contraste entre fuentes');
    for (const check of crossChecks) lines.push(`${check.ok ? '✔' : '✖'} ${check.symbol.padEnd(8)} ${check.detail}`);
  }
  if (blocked.length) {
    lines.push('', `⚠ ${blocked.length} fuente(s) limitaron las peticiones; no se pudieron verificar hoy.`);
  }
  lines.push('', ok ? 'Resultado: todas las fuentes responden con el formato esperado.' : 'Resultado: alguna fuente ha cambiado o ha fallado.');
  return lines.join('\n');
}
