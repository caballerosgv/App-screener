/**
 * Movimientos de directivos (insiders) de empresas de EE. UU. desde SEC EDGAR.
 *
 * Gratis y sin token: la SEC solo pide un User-Agent con un contacto real.
 * Se leen los Form 4 (y sus enmiendas 4/A) y solo se clasifican las compras y
 * ventas de acciones ordinarias (códigos P y S); el resto de códigos se ignora.
 * No son posiciones institucionales (13F).
 */

export const SEC_USER_AGENT_DEFAULT = 'MOAT screener (https://github.com/caballerosgv/App-screener)';

const TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';
const submissionsUrl = (cik) => `https://data.sec.gov/submissions/CIK${cik}.json`;
const archiveBase = (cik, accession) =>
  `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${String(accession).replace(/-/g, '')}`;

export class InsiderError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/* ---------- XML mínimo (sin dependencias) ---------- */

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeEntities(text) {
  return String(text).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[entity] !== undefined ? ENTITIES[entity] : match;
  });
}

const appendText = (node, raw, cdata = false) => {
  if (!raw) return;
  node.text += cdata ? raw : decodeEntities(raw.replace(/\s+/g, ' '));
};

/** Parser XML mínimo: elementos, atributos, texto, CDATA y comentarios. */
export function parseXml(xml) {
  const source = String(xml);
  const root = { name: '#document', attrs: {}, children: [], text: '' };
  const stack = [root];
  let i = 0;

  const tagEnd = (from) => {
    let quote = null;
    for (let k = from; k < source.length; k += 1) {
      const char = source[k];
      if (quote) {
        if (char === quote) quote = null;
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === '>') {
        return k;
      }
    }
    return -1;
  };

  while (i < source.length) {
    const lt = source.indexOf('<', i);
    if (lt === -1) {
      appendText(stack[stack.length - 1], source.slice(i));
      break;
    }
    if (lt > i) appendText(stack[stack.length - 1], source.slice(i, lt));

    if (source.startsWith('<!--', lt)) {
      const end = source.indexOf('-->', lt);
      i = end === -1 ? source.length : end + 3;
      continue;
    }
    if (source.startsWith('<![CDATA[', lt)) {
      const end = source.indexOf(']]>', lt);
      appendText(stack[stack.length - 1], source.slice(lt + 9, end === -1 ? source.length : end), true);
      i = end === -1 ? source.length : end + 3;
      continue;
    }
    if (source.startsWith('<?', lt) || source.startsWith('<!', lt)) {
      const end = source.indexOf('>', lt);
      i = end === -1 ? source.length : end + 1;
      continue;
    }

    const gt = tagEnd(lt + 1);
    if (gt === -1) break;
    const raw = source.slice(lt + 1, gt);

    if (raw.startsWith('/')) {
      const name = raw.slice(1).trim();
      for (let k = stack.length - 1; k > 0; k -= 1) {
        if (stack[k].name === name) {
          stack.length = k;
          break;
        }
      }
      i = gt + 1;
      continue;
    }

    const selfClosing = raw.trimEnd().endsWith('/');
    const body = selfClosing ? raw.trimEnd().slice(0, -1) : raw;
    const split = body.search(/\s/);
    const name = (split === -1 ? body : body.slice(0, split)).trim();
    const attrs = {};
    if (name && split !== -1) {
      const attributeRe = /([A-Za-z_:][\w.:-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
      let match;
      const chunk = body.slice(split);
      while ((match = attributeRe.exec(chunk))) {
        attrs[match[1]] = decodeEntities(match[3] !== undefined ? match[3] : match[4] || '');
      }
    }
    if (!name) {
      i = gt + 1;
      continue;
    }
    const node = { name, attrs, children: [], text: '' };
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) stack.push(node);
    i = gt + 1;
  }

  return root;
}

/** Busca un nodo por ruta tipo "./a/b". Devuelve null si falta algún tramo. */
export function findNode(node, path) {
  let current = node;
  for (const part of String(path).replace(/^\.\//, '').split('/').filter(Boolean)) {
    if (!current || !current.children) return null;
    current = current.children.find((child) => child.name === part) || null;
  }
  return current;
}

const textAt = (node, path) => {
  const found = findNode(node, path);
  return found ? found.text.trim() : null;
};

const numberAt = (node, path) => {
  const value = textAt(node, path);
  if (value === null || value === '') return null;
  const parsed = Number(value.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

/* ---------- Form 4 ---------- */

/** Bolsas europeas y demás mercados sin Form 4. */
const NON_US_EXCHANGES = new Set([
  'AS', 'PA', 'DE', 'LSE', 'MI', 'MC', 'SW', 'XETRA', 'F', 'BR', 'LS', 'VI', 'ST', 'CO', 'HE', 'OL', 'PR',
  'WAR', 'AT', 'IS', 'DUB', 'BE', 'DU', 'HM', 'MU', 'SG', 'TL', 'VX', 'TO', 'V', 'HK', 'T'
]);

/**
 * "AAPL.US" → "AAPL"; una bolsa europea → error 400 (solo hay Form 4 de EE. UU.).
 * Un punto que no es bolsa se conserva: BRK.B es una clase de acción, no un mercado.
 */
export function secTicker(rawSymbol) {
  const symbol = String(rawSymbol || '').trim().toUpperCase();
  const dot = symbol.lastIndexOf('.');
  if (dot === -1) return symbol;
  const suffix = symbol.slice(dot + 1);
  if (suffix === 'US') return symbol.slice(0, dot);
  if (NON_US_EXCHANGES.has(suffix)) {
    throw new InsiderError(400, 'unsupported_market', 'Los movimientos de directivos solo cubren empresas de EE. UU. (Form 4 de la SEC).');
  }
  return symbol;
}

/** Transacciones P/S de un Form 4. Ignora derivados, premios y códigos distintos de P/S. */
export function parseForm4(xml, { filingUrl = null, filingDate = null } = {}) {
  const document = findNode(parseXml(xml), 'ownershipDocument');
  if (!document) return [];

  const owner = textAt(document, 'reportingOwner/reportingOwnerId/rptOwnerName') || 'Insider no identificado';
  const planFlag = textAt(document, 'aff10b5One');
  const plan = planFlag === null ? null : ['1', 'true'].includes(planFlag.toLowerCase());

  const transactions = [];
  for (const tx of findNode(document, 'nonDerivativeTable')?.children || []) {
    if (tx.name !== 'nonDerivativeTransaction') continue;
    const code = textAt(tx, 'transactionCoding/transactionCode');
    if (code !== 'P' && code !== 'S') continue;

    const shares = numberAt(tx, 'transactionAmounts/transactionShares/value');
    if (shares === null || shares <= 0) continue;
    const price = numberAt(tx, 'transactionAmounts/transactionPricePerShare/value');

    transactions.push({
      transaction_date: textAt(tx, 'transactionDate/value') || filingDate,
      filing_date: filingDate,
      owner,
      code,
      shares,
      price_usd: price,
      value_usd: price !== null && price >= 0 ? shares * price : null,
      plan_10b5_1: plan,
      security: textAt(tx, 'securityTitle/value'),
      url: filingUrl
    });
  }
  return transactions;
}

/* ---------- cliente ---------- */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isoDate = (date) => date.toISOString().slice(0, 10);

export function createInsiderClient({
  fetchImpl = null,
  userAgent = SEC_USER_AGENT_DEFAULT,
  timeoutMs = 12_000,
  now = () => new Date(),
  pauseMs = 120
} = {}) {
  const doFetch = () => fetchImpl || globalThis.fetch;
  let tickers = null;
  let tickersAt = 0;

  async function secText(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await doFetch()(url, {
        signal: controller.signal,
        headers: { 'user-agent': userAgent, accept: 'application/json, application/xml, text/xml, */*' }
      });
    } catch (error) {
      if (error && error.name === 'AbortError') {
        throw new InsiderError(504, 'upstream_timeout', 'La SEC tardó demasiado en responder.');
      }
      throw new InsiderError(502, 'upstream_unreachable', 'No se pudo conectar con SEC EDGAR.');
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 403 || response.status === 401) {
      throw new InsiderError(502, 'sec_user_agent', 'La SEC rechazó la petición: configura SEC_USER_AGENT con tu nombre y un correo real.');
    }
    if (response.status === 429) {
      throw new InsiderError(503, 'sec_rate_limit', 'La SEC ha limitado las peticiones. Espera unos minutos e inténtalo de nuevo.');
    }
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new InsiderError(502, 'upstream_error', `SEC EDGAR respondió con estado ${response.status}.`);
    }
    return response.text();
  }

  async function secJson(url) {
    const text = await secText(url);
    if (text === null) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new InsiderError(502, 'upstream_invalid', 'SEC EDGAR devolvió una respuesta que no se pudo leer.');
    }
  }

  async function tickerMap() {
    const fresh = tickers && Date.now() - tickersAt < 24 * 60 * 60 * 1000;
    if (fresh) return tickers;
    const payload = await secJson(TICKERS_URL);
    const map = new Map();
    const rows = payload && typeof payload === 'object' ? Object.values(payload) : [];
    for (const row of rows) {
      const ticker = String((row && row.ticker) || '').toUpperCase();
      if (ticker && row.cik_str) map.set(ticker, { cik: String(row.cik_str).padStart(10, '0'), name: row.title || null });
    }
    tickers = map;
    tickersAt = Date.now();
    return map;
  }

  async function fetchInsiders(rawSymbol, { months = 12, limit = 20 } = {}) {
    const ticker = secTicker(rawSymbol);
    const map = await tickerMap();
    const issuer = map.get(ticker) || map.get(ticker.replace(/\./g, '-')) || map.get(ticker.replace(/-/g, '.'));
    if (!issuer) {
      throw new InsiderError(404, 'not_found', `${ticker} no figura en el directorio de la SEC: no hay cobertura de Form 4.`);
    }

    const submissions = await secJson(submissionsUrl(issuer.cik));
    const recent = (submissions && submissions.filings && submissions.filings.recent) || {};
    const forms = Array.isArray(recent.form) ? recent.form : [];
    const cutoff = isoDate(new Date(now().getTime() - months * 31 * 86_400_000));

    const candidates = [];
    for (let index = 0; index < forms.length; index += 1) {
      const form = forms[index];
      const filingDate = (recent.filingDate || [])[index] || null;
      if (form !== '4' && form !== '4/A') continue;
      if (!filingDate || filingDate < cutoff) continue;
      candidates.push({
        accession: (recent.accessionNumber || [])[index],
        filingDate,
        primary: (recent.primaryDocument || [])[index] || null
      });
    }

    const filingsInPeriod = candidates.length;
    const examined = candidates.slice(0, limit);
    const transactions = [];

    for (const candidate of examined) {
      try {
        const index = await secJson(`${archiveBase(issuer.cik, candidate.accession)}/index.json`);
        const items = (index && index.directory && index.directory.item) || [];
        const names = items
          .map((item) => String((item && item.name) || ''))
          .filter((name) => name.toLowerCase().endsWith('.xml') && !name.toLowerCase().includes('xsl'))
          .sort((a, b) => (a.toLowerCase().includes('ownership') ? 0 : 1) - (b.toLowerCase().includes('ownership') ? 0 : 1) || a.localeCompare(b));

        for (const name of names.slice(0, 4)) {
          const xml = await secText(`${archiveBase(issuer.cik, candidate.accession)}/${name}`);
          if (!xml || !xml.slice(0, 2000).includes('ownershipDocument')) continue;
          const filingUrl = candidate.primary
            ? `${archiveBase(issuer.cik, candidate.accession)}/${candidate.primary}`
            : `${archiveBase(issuer.cik, candidate.accession)}/${name}`;
          // La ocurrencia se cuenta dentro de cada formulario: un 4/A puede repetir
          // la misma operación del 4 original y, aun así, conservar líneas legítimas.
          const perFiling = new Map();
          for (const row of parseForm4(xml, { filingUrl, filingDate: candidate.filingDate })) {
            const base = [row.transaction_date, row.owner, row.code, row.shares, row.price_usd, row.security].join('|');
            const occurrence = perFiling.get(base) || 0;
            perFiling.set(base, occurrence + 1);
            transactions.push({ ...row, occurrence });
          }
          break;
        }
      } catch (error) {
        if (error instanceof InsiderError && error.code === 'sec_user_agent') throw error;
        // Un formulario retirado o ilegible no debe tumbar el resto.
      }
      if (pauseMs) await sleep(pauseMs);
    }

    // Un 4/A repite las operaciones del 4 original: se conserva la versión más reciente.
    const seen = new Map();
    for (const tx of transactions) {
      const key = [tx.transaction_date, tx.owner, tx.code, tx.shares, tx.price_usd, tx.security, tx.occurrence].join('|');
      const previous = seen.get(key);
      if (!previous || String(tx.filing_date) > String(previous.filing_date)) seen.set(key, tx);
    }

    const unique = [...seen.values()]
      .map(({ occurrence, ...row }) => row)
      .sort((a, b) =>
      String(a.transaction_date).localeCompare(String(b.transaction_date)) ||
      String(a.filing_date).localeCompare(String(b.filing_date))
    );
    const purchases = unique.filter((tx) => tx.code === 'P');
    const sales = unique.filter((tx) => tx.code === 'S');
    const sum = (rows) => (rows.some((tx) => tx.value_usd !== null) ? rows.reduce((acc, tx) => acc + (tx.value_usd || 0), 0) : null);

    return {
      status: 'ok',
      symbol: `${ticker}.US`,
      ticker,
      issuer: issuer.name,
      source: 'SEC EDGAR Form 4',
      period: `últimos ${months} meses`,
      retrieved_at: new Date().toISOString(),
      summary: {
        purchase_count: purchases.length,
        sale_count: sales.length,
        purchase_value_usd: sum(purchases),
        sale_value_usd: sum(sales),
        sale_plan_10b5_1_count: sales.filter((tx) => tx.plan_10b5_1 === true).length,
        sale_no_plan_count: sales.filter((tx) => tx.plan_10b5_1 === false).length,
        sale_plan_unknown_count: sales.filter((tx) => tx.plan_10b5_1 === null).length
      },
      filings_in_period: filingsInPeriod,
      filings_examined: examined.length,
      truncated: filingsInPeriod > examined.length,
      transactions: unique,
      message: unique.length ? null : 'No se han encontrado operaciones de compra o venta en los Form 4 del periodo.',
      note: 'Operaciones de directivos, no posiciones institucionales 13F. Los códigos P y S se interpretan según el Form 4 de la SEC.'
    };
  }

  return { fetchInsiders, secText, secJson, tickerMap };
}
