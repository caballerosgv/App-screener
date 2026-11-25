/**
 * Series anuales gratuitas de la SEC (XBRL company facts).
 *
 * La SEC publica los estados financieros de las empresas de EE. UU. en XBRL,
 * sin clave y sin límite práctico (pide un User-Agent con contacto). Aquí se
 * extraen las magnitudes que la rúbrica necesita —ingresos, beneficio, caja,
 * deuda y acciones— de los últimos ejercicios presentados en un 10-K.
 */

import { SEC_USER_AGENT_DEFAULT } from './insiders.mjs';

const TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';
const FACTS_URL = 'https://data.sec.gov/api/xbrl/companyfacts';
const TIMEOUT_MS = Number(process.env.SEC_TIMEOUT_MS || 12000);
const TICKERS_TTL = 24 * 60 * 60 * 1000;

const CONCEPTS = {
  revenue: [
    'RevenueFromContractWithCustomerExcludingAssessedTax',
    'RevenueFromContractWithCustomerIncludingAssessedTax',
    'Revenues',
    'SalesRevenueNet'
  ],
  netIncome: ['NetIncomeLoss', 'ProfitLoss'],
  equity: ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'],
  assets: ['Assets'],
  liabilities: ['Liabilities'],
  operatingCash: ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'],
  capex: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'],
  shares: ['CommonStockSharesOutstanding', 'EntityCommonStockSharesOutstanding']
};

const num = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** Una serie anual limpia: un valor por ejercicio, el último presentado. */
export function annualSeries(facts, names, { flow = false, namespace = 'us-gaap' } = {}) {
  const groups = namespace === 'dei'
    ? [facts && facts.facts && facts.facts.dei]
    : [facts && facts.facts && facts.facts['us-gaap']];

  for (const group of groups) {
    if (!group) continue;
    for (const name of names) {
      const fact = group[name];
      const units = fact && fact.units;
      const list = units && (units.USD || units.shares || units['USD/shares']);
      if (!Array.isArray(list) || !list.length) continue;

      const byYear = new Map();
      for (const entry of list) {
        if (!entry || entry.form !== '10-K' || entry.end === undefined) continue;
        const end = new Date(entry.end);
        if (!Number.isFinite(end.getTime())) continue;
        if (flow) {
          const start = entry.start ? new Date(entry.start) : null;
          if (!start) continue;
          const days = (end - start) / 86_400_000;
          if (days < 300 || days > 400) continue; // ejercicio completo, no trimestres
        }
        const year = end.getUTCFullYear();
        const value = num(entry.val);
        if (value === null) continue;
        const previous = byYear.get(year);
        const filed = String(entry.filed || '');
        if (!previous || filed > previous.filed) {
          byYear.set(year, { end: end.toISOString().slice(0, 10), val: value, filed });
        }
      }

      if (byYear.size) {
        return [...byYear.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([, row]) => row);
      }
    }
  }
  return [];
}

const latestByEnd = (series, end) => {
  let best = null;
  for (const row of series) {
    if (row.end <= end) best = row;
  }
  return best;
};

/** Une las series por ejercicio fiscal y calcula los agregados de la rúbrica. */
export function summarize(facts) {
  const revenue = annualSeries(facts, CONCEPTS.revenue, { flow: true });
  if (revenue.length < 2) return null;

  const netIncome = annualSeries(facts, CONCEPTS.netIncome, { flow: true });
  const operatingCash = annualSeries(facts, CONCEPTS.operatingCash, { flow: true });
  const capex = annualSeries(facts, CONCEPTS.capex, { flow: true });
  const equity = annualSeries(facts, CONCEPTS.equity);
  const assets = annualSeries(facts, CONCEPTS.assets);
  const liabilities = annualSeries(facts, CONCEPTS.liabilities);
  const shares = annualSeries(facts, CONCEPTS.shares, { namespace: 'dei' });

  const years = revenue.slice(-4).map((row) => {
    const pick = (series) => {
      const found = latestByEnd(series, row.end);
      return found ? found.val : null;
    };
    const ocf = pick(operatingCash);
    const investment = pick(capex);
    return {
      date: row.end,
      revenue: row.val,
      netIncome: pick(netIncome),
      equity: pick(equity),
      assets: pick(assets),
      liabilities: pick(liabilities),
      operatingCash: ocf,
      capex: investment,
      freeCashFlow: ocf !== null && investment !== null ? ocf - investment : ocf
    };
  });

  const first = years[0];
  const last = years[years.length - 1];
  const span = years.length - 1;
  const cagr =
    span > 0 && first.revenue > 0 && last.revenue > 0
      ? (Math.pow(last.revenue / first.revenue, 1 / span) - 1) * 100
      : null;

  const margins = years
    .filter((row) => row.revenue > 0 && row.netIncome !== null)
    .map((row) => (row.netIncome / row.revenue) * 100);
  const mean = margins.length ? margins.reduce((a, b) => a + b, 0) / margins.length : null;
  const stdev =
    margins.length > 1
      ? Math.sqrt(margins.reduce((acc, value) => acc + (value - mean) ** 2, 0) / margins.length)
      : null;

  const withFcf = years.filter((row) => row.freeCashFlow !== null);
  const equityValue = last.equity || (last.assets !== null && last.liabilities !== null ? last.assets - last.liabilities : null);
  const shareFirst = shares.length ? shares[0].val : null;
  const shareLast = shares.length ? shares[shares.length - 1].val : null;

  return {
    years,
    metrics: {
      cagr: cagr === null ? null : Math.round(cagr * 10) / 10,
      netMargin: mean === null ? null : Math.round(mean * 10) / 10,
      netMarginStdev: stdev === null ? null : Math.round(stdev * 10) / 10,
      roe: last.netIncome !== null && equityValue ? Math.round((last.netIncome / equityValue) * 1000) / 10 : null,
      fcfPositiveYears: withFcf.filter((row) => row.freeCashFlow > 0).length,
      fcfYears: withFcf.length,
      fcfMargin:
        last.freeCashFlow !== null && last.revenue > 0
          ? Math.round((last.freeCashFlow / last.revenue) * 1000) / 10
          : null,
      debtToEquity:
        last.liabilities !== null && equityValue ? Math.round((last.liabilities / equityValue) * 100) / 100 : null,
      shareChange:
        shareFirst && shareLast ? Math.round(((shareLast / shareFirst - 1) * 100) * 10) / 10 : null,
      latestRevenue: last.revenue
    }
  };
}

export function createSecXbrlClient({
  fetchImpl = null,
  userAgent = process.env.SEC_USER_AGENT || SEC_USER_AGENT_DEFAULT,
  timeoutMs = TIMEOUT_MS,
  now = () => Date.now()
} = {}) {
  const doFetch = () => fetchImpl || globalThis.fetch;
  let tickers = { at: 0, map: null };
  const factsCache = new Map();

  async function getJson(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await doFetch()(url, {
        signal: controller.signal,
        headers: { 'user-agent': userAgent, accept: 'application/json' }
      });
      if (!response.ok) {
        const error = new Error(`SEC respondió ${response.status}`);
        error.code = response.status === 404 ? 'sec_not_found' : 'sec_error';
        throw error;
      }
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function tickerMap() {
    if (tickers.map && now() - tickers.at < TICKERS_TTL) return tickers.map;
    const raw = await getJson(TICKERS_URL);
    const map = new Map();
    for (const item of Object.values(raw || {})) {
      if (!item || !item.ticker) continue;
      map.set(String(item.ticker).toUpperCase(), String(item.cik_str).padStart(10, '0'));
    }
    if (!map.size) throw Object.assign(new Error('La SEC no devolvió el listado de tickers.'), { code: 'sec_invalid' });
    tickers = { at: now(), map };
    return map;
  }

  /** Series anuales del símbolo; `null` si la SEC no las tiene (p. ej. Europa). */
  async function series(symbol) {
    const code = String(symbol || '').toUpperCase().replace(/\.US$/, '');
    if (!/^[A-Z0-9.\-]{1,10}$/.test(code)) return null;
    if (!/\.US$/i.test(String(symbol || '')) && String(symbol || '').includes('.')) return null;

    const cached = factsCache.get(code);
    if (cached && now() - cached.at < TICKERS_TTL) return cached.value;

    let value = null;
    try {
      const map = await tickerMap();
      const cik = map.get(code);
      if (cik) {
        const facts = await getJson(`${FACTS_URL}/CIK${cik}.json`);
        const summary = summarize(facts);
        if (summary) value = { cik, ...summary };
      }
    } catch {
      value = null;
    }
    factsCache.set(code, { at: now(), value });
    return value;
  }

  return { series, tickerMap };
}
