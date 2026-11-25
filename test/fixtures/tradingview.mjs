/** Fixtures del proveedor gratuito (TradingView) sin red. */

export const COLUMNS_ORDER = [
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
  'exchange'
];

const row = (overrides) => ({
  name: overrides.name || 'X',
  description: overrides.description || overrides.name || 'X',
  close: overrides.close ?? null,
  change: overrides.change ?? null,
  open: overrides.open ?? null,
  high: overrides.high ?? null,
  low: overrides.low ?? null,
  volume: overrides.volume ?? null,
  market_cap_basic: overrides.market_cap_basic ?? null,
  price_earnings_ttm: overrides.price_earnings_ttm ?? null,
  price_52_week_high: overrides.price_52_week_high ?? null,
  price_52_week_low: overrides.price_52_week_low ?? null,
  sector: overrides.sector ?? null,
  currency: overrides.currency ?? null,
  exchange: overrides.exchange ?? null
});

export const ROWS = {
  'NASDAQ:AAPL': row({
    name: 'AAPL',
    description: 'Apple Inc.',
    close: 200,
    change: 2,
    open: 198,
    high: 201,
    low: 197,
    volume: 50_000_000,
    market_cap_basic: 3_000_000_000_000,
    price_earnings_ttm: 30.5,
    price_52_week_high: 260,
    price_52_week_low: 164,
    sector: 'Technology Services',
    currency: 'USD',
    exchange: 'NASDAQ'
  }),
  'AMEX:VTI': row({
    name: 'VTI',
    description: 'Vanguard Total Stock Market ETF',
    close: 300,
    change: -1,
    currency: 'USD',
    exchange: 'AMEX'
  }),
  'EURONEXT:ASML': row({
    name: 'ASML',
    description: 'ASML Holding NV',
    close: 900,
    change: 0,
    market_cap_basic: 350_000_000_000,
    price_earnings_ttm: 32.3,
    sector: 'Electronic Technology',
    currency: 'EUR',
    exchange: 'EURONEXT'
  })
};

export const SEARCH_SYMBOLS = [
  {
    symbol: 'ASML',
    description: 'ASML Holding NV',
    type: 'stock',
    exchange: 'Euronext Amsterdam',
    country: 'NL',
    currency_code: 'EUR',
    isin: 'NL0010273215'
  },
  {
    symbol: 'ASML',
    description: 'ASML Holding N.V. - New York Registry Shares',
    type: 'dr',
    exchange: 'NASDAQ',
    country: 'US',
    currency_code: 'USD'
  },
  {
    symbol: 'NOVO_B',
    description: 'Novo Nordisk A/S Class B',
    type: 'stock',
    exchange: 'OMXCOP',
    country: 'DK',
    currency_code: 'DKK'
  },
  {
    symbol: 'ZZZZ',
    description: 'Empresa japonesa',
    type: 'stock',
    exchange: 'TSE',
    country: 'JP',
    currency_code: 'JPY'
  }
];

export function fakeTradingViewFetch({ rows = ROWS, symbols = SEARCH_SYMBOLS, failWith = null } = {}) {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({ url: String(input), method: (init.method || 'GET').toUpperCase(), body: init.body || null });
    if (failWith) return { ok: false, status: failWith, json: async () => ({}) };
    if (url.pathname === '/global/scan') {
      const payload = JSON.parse(init.body);
      const data = payload.symbols.tickers
        .filter((ticker) => rows[ticker])
        .map((ticker) => ({ s: ticker, d: payload.columns.map((column) => rows[ticker][column] ?? null) }));
      return { ok: true, status: 200, json: async () => ({ totalCount: data.length, data }) };
    }
    if (url.pathname.startsWith('/symbol_search')) {
      return { ok: true, status: 200, json: async () => ({ symbols }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return {
    calls,
    fetchImpl,
    scans() {
      return calls.filter((call) => call.url.includes('/global/scan'));
    }
  };
}
