/**
 * Rúbrica transparente de los 8 factores.
 *
 * Cada factor se calcula como media ponderada de 2-4 indicadores. Cada
 * indicador se convierte en puntos (0-10) por bandas explícitas, y la respuesta
 * incluye la banda aplicada para que el usuario pueda auditar la nota.
 *
 * Las cuentas vienen de EODHD (últimos 6 ejercicios). Los factores que no se
 * pueden derivar de los estados financieros (catalizadores) devuelven una nota
 * neutral 5 con `available: false`, nunca una nota inventada.
 */

/**
 * Versión de la rúbrica. Súbela al cambiar bandas, pesos o cálculos: la nota
 * guardada junto a esta versión se puede auditar con las reglas con las que
 * se calculó, no con las de hoy.
 */
export const RUBRIC_VERSION = '1.0.0';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function median(values) {
  const list = values.filter((v) => v !== null && Number.isFinite(v)).sort((a, b) => a - b);
  if (!list.length) return null;
  const mid = Math.floor(list.length / 2);
  return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
}

function stdev(values) {
  const list = values.filter((v) => v !== null && Number.isFinite(v));
  if (list.length < 2) return null;
  const mean = list.reduce((a, b) => a + b, 0) / list.length;
  return Math.sqrt(list.reduce((a, b) => a + (b - mean) ** 2, 0) / list.length);
}

const asPercent = (v) => (v === null || v === undefined ? null : Math.round(v * 1000) / 10);

/** Bandas ascendentes (el valor debe ser <= umbral). */
function pick(value, table) {
  for (const [max, points, band] of table) {
    if (value <= max) return { points, band };
  }
  const last = table[table.length - 1];
  return { points: last[1], band: last[2] };
}

/** Bandas ascendentes (el valor debe ser >= umbral). */
function pickHigh(value, table) {
  let chosen = table[0];
  for (const entry of table) {
    if (value >= entry[0]) chosen = entry;
  }
  return { points: chosen[1], band: chosen[2] };
}

function yearly(fund, section) {
  const flat = fund[`Financials::${section}::yearly`];
  const nested = fund.Financials && fund.Financials[section] && fund.Financials[section].yearly;
  const raw = flat || nested || {};
  return Object.entries(raw)
    .filter(([, row]) => row && typeof row === 'object')
    .map(([date, row]) => ({ date: String(date), ...row }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Fila más cercana por fecha (hasta 400 días). */
function nearest(rows, date) {
  if (!rows.length) return null;
  const target = new Date(date).getTime();
  let best = null;
  let bestDiff = Infinity;
  for (const row of rows) {
    const diff = Math.abs(new Date(row.date).getTime() - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = row;
    }
  }
  return bestDiff <= 400 * 86_400_000 ? best : null;
}

const DEFENSIVE = ['consumer defensive', 'consumer staples', 'healthcare', 'utilities'];

function sectorRiskScore(sector) {
  const value = String(sector || '').toLowerCase();
  if (!value) return { points: 6, band: 'sector sin clasificar' };
  if (DEFENSIVE.includes(value)) return { points: 8.5, band: 'sector defensivo' };
  if (/(financial|industrial|energy|basic materials|real estate|consumer cyclical|semiconduct)/.test(value)) {
    return { points: 4.5, band: 'sector cíclico' };
  }
  return { points: 6.5, band: 'sector neutro' };
}

function factorResult({ key, reasons, method, note = null }) {
  const usable = reasons.filter((r) => r.points !== null);
  if (!usable.length) {
    return { key, score: 5, available: false, confidence: 'nula', reasons, method, note };
  }
  const weightSum = usable.reduce((acc, r) => acc + r.weight, 0);
  const score = usable.reduce((acc, r) => acc + r.points * r.weight, 0) / weightSum;
  return {
    key,
    score: Math.round(clamp(score, 0, 10) * 10) / 10,
    available: true,
    confidence: usable.length === reasons.length ? 'alta' : 'media',
    reasons,
    method,
    note
  };
}

export const FACTOR_KEYS = [
  'moat',
  'management',
  'growth',
  'profitability',
  'balance',
  'valuation',
  'risk',
  'catalysts'
];

export function buildAnalysis(fundamentals, symbol) {
  const general = (fundamentals && fundamentals.General) || {};
  const highlights = (fundamentals && fundamentals.Highlights) || {};
  const income = yearly(fundamentals, 'Income_Statement');
  const balance = yearly(fundamentals, 'Balance_Sheet');
  const cashflow = yearly(fundamentals, 'Cash_Flow');

  if (!income.length) {
    return null;
  }

  const rows = income.slice(-6).map((row) => {
    const sheet = nearest(balance, row.date) || {};
    const flow = nearest(cashflow, row.date) || {};

    const revenue = num(row.totalRevenue);
    const gross = num(row.grossProfit);
    const ebit = num(row.ebit) ?? num(row.operatingIncome);
    const net = num(row.netIncome);
    const pretax = num(row.incomeBeforeTax);
    const tax = num(row.incomeTaxExpense);
    const taxRate = tax !== null && pretax && pretax > 0 ? clamp(tax / pretax, 0, 0.35) : 0.21;

    const debt =
      num(sheet.shortLongTermDebtTotal) ??
      (num(sheet.shortTermDebt) !== null || num(sheet.longTermDebt) !== null
        ? (num(sheet.shortTermDebt) || 0) + (num(sheet.longTermDebt) || 0)
        : null);
    const equity =
      num(sheet.totalStockholderEquity) ??
      (num(sheet.totalAssets) !== null && num(sheet.totalLiab) !== null
        ? num(sheet.totalAssets) - num(sheet.totalLiab)
        : null);
    const cash = num(sheet.cashAndShortTermInvestments) ?? num(sheet.cash) ?? num(sheet.cashAndEquivalents);
    const invested = (debt || 0) + (equity || 0) - (cash || 0);

    return {
      date: row.date,
      revenue,
      grossMargin: revenue && gross !== null ? gross / revenue : null,
      operatingMargin: revenue && ebit !== null ? ebit / revenue : null,
      netMargin: revenue && net !== null ? net / revenue : null,
      net,
      ebit,
      ebitda: num(row.ebitda),
      interest: num(row.interestExpense),
      roic: ebit !== null && invested > 0 ? (ebit * (1 - taxRate)) / invested : null,
      fcf: num(flow.freeCashFlow),
      dividends: Math.abs(num(flow.dividendsPaid) || 0),
      shares: num(sheet.commonStockSharesOutstanding),
      netDebt:
        num(sheet.netDebt) ?? (debt !== null && cash !== null ? debt - cash : null)
    };
  });

  const last = rows[rows.length - 1];
  const first = rows[0];

  const roicSeries = rows.map((r) => r.roic).filter((v) => v !== null);
  const gmSeries = rows.map((r) => r.grossMargin).filter((v) => v !== null);
  const nmSeries = rows.map((r) => r.netMargin).filter((v) => v !== null);
  const fcfSeries = rows.map((r) => r.fcf).filter((v) => v !== null);
  const shareSeries = rows.map((r) => r.shares).filter((v) => v !== null);

  const roicMedian = median(roicSeries);
  const gmLatest = last.grossMargin;
  const gmVolatility = stdev(gmSeries);
  const gmChange = gmSeries.length >= 2 ? gmSeries[gmSeries.length - 1] - gmSeries[0] : null;

  const revRows = rows.filter((r) => r.revenue !== null && r.revenue > 0);
  const periods = Math.min(5, revRows.length - 1);
  const revenueCagr =
    periods >= 1
      ? Math.pow(revRows[revRows.length - 1].revenue / revRows[0].revenue, 1 / periods) - 1
      : null;

  const growthYears = revRows.length - 1;
  const positiveYears = revRows.slice(1).filter((r, i) => r.revenue > revRows[i].revenue).length;
  const growthConsistency = growthYears > 0 ? positiveYears / growthYears : null;

  const roicPersistence = roicSeries.length ? roicSeries.filter((v) => v >= 0.1).length / roicSeries.length : null;
  const fcfPersistence = fcfSeries.length ? fcfSeries.filter((v) => v > 0).length / fcfSeries.length : null;

  const cashConversion = median(rows.filter((r) => r.fcf !== null && r.net && r.net > 0).map((r) => r.fcf / r.net));
  const shareChange =
    shareSeries.length >= 2 ? shareSeries[shareSeries.length - 1] / shareSeries[0] - 1 : null;

  const marketCap = num(highlights.MarketCapitalization);
  const ebitda = last.ebitda ?? num(highlights.EBITDA);
  const netDebt = last.netDebt;
  const netDebtEbitda = netDebt !== null && ebitda && ebitda > 0 ? netDebt / ebitda : null;
  const per = num(highlights.PERatio);
  const fcfYield = last.fcf !== null && marketCap ? last.fcf / marketCap : null;
  const ev = marketCap !== null && netDebt !== null ? marketCap + netDebt : null;
  const evEbitda = ev !== null && ebitda && ebitda > 0 ? ev / ebitda : null;
  const interestCoverage =
    last.ebit !== null && last.interest !== null && Math.abs(last.interest) > 0
      ? last.ebit / Math.abs(last.interest)
      : null;
  const dividendYield = num(highlights.DividendYield);
  const roe = num(highlights.ReturnOnEquityTTM);
  const operatingMargin = last.operatingMargin ?? num(highlights.OperatingMarginTTM);
  const earningsVolatility = stdev(nmSeries);

  const sharesBand = shareChange === null ? null : pick(shareChange, [
    [-0.05, 10, 'reduce ≥ 5 %'],
    [-0.01, 9, 'reduce hasta 5 %'],
    [0.01, 7, 'estable'],
    [0.03, 5.5, 'diluye hasta 3 %'],
    [Infinity, 3, 'diluye > 3 %']
  ]);

  const roicTable = [
    [-Infinity, 2, '< 6 %'],
    [0.06, 4, '6–9 %'],
    [0.09, 5.5, '9–12 %'],
    [0.12, 7, '12–15 %'],
    [0.15, 8.5, '15–20 %'],
    [0.2, 10, '≥ 20 %']
  ];

  const marginTable = [
    [-Infinity, 4.5, '< 20 %'],
    [0.2, 6, '20–30 %'],
    [0.3, 7.5, '30–45 %'],
    [0.45, 9, '45–60 %'],
    [0.6, 10, '≥ 60 %']
  ];

  const leverageTable = [
    [-0.5, 10, 'caja neta'],
    [1, 9, '≤ 1×'],
    [2, 7.5, '1–2×'],
    [3, 5.5, '2–3×'],
    [4, 3.5, '3–4×'],
    [Infinity, 1.5, '> 4×']
  ];

  /* ---------- 1. MOAT ---------- */
  const moatReasons = [
    {
      label: 'ROIC medio (6 ejercicios)',
      display: roicMedian === null ? 'sin dato' : `${asPercent(roicMedian)} %`,
      weight: 0.45,
      ...(roicMedian === null ? { points: null, band: '—' } : pickHigh(roicMedian, roicTable))
    },
    {
      label: 'Años con ROIC ≥ 10 %',
      display:
        roicPersistence === null
          ? 'sin dato'
          : `${Math.round(roicPersistence * roicSeries.length)} de ${roicSeries.length}`,
      weight: 0.35,
      ...(roicPersistence === null
        ? { points: null, band: '—' }
        : pickHigh(roicPersistence, [
            [-Infinity, 2.5, '< 40 % de los años'],
            [0.4, 5, '40–60 % de los años'],
            [0.6, 7, '60–80 % de los años'],
            [0.8, 8.5, '80–99 % de los años'],
            [0.99, 10, 'todos los años']
          ]))
    },
    {
      label: 'Margen bruto actual',
      display: gmLatest === null ? 'sin dato' : `${asPercent(gmLatest)} %`,
      weight: 0.2,
      ...(gmLatest === null
        ? { points: null, band: '—' }
        : (() => {
            const base = pickHigh(gmLatest, marginTable);
            const penalty = gmVolatility !== null && gmVolatility > 0.05 ? 1 : 0;
            return {
              points: Math.max(1, base.points - penalty),
              band: penalty ? `${base.band} · −1 por margen volátil` : base.band
            };
          })())
    }
  ];

  /* ---------- 2. DIRECCIÓN ---------- */
  const dividendUse = (() => {
    if (dividendYield === null || dividendYield <= 0) return { points: 6, band: 'sin dividendo' };
    if (last.fcf === null) return { points: 5, band: 'sin flujo de caja para contrastar' };
    if (last.fcf <= 0) return { points: 2, band: 'dividendo sin caja libre' };
    const payout = last.dividends / last.fcf;
    if (payout < 0.8) return { points: 8, band: `payout ${Math.round(payout * 100)} % del FCF` };
    return { points: 5, band: `payout ${Math.round(payout * 100)} % del FCF` };
  })();

  const managementReasons = [
    {
      label: 'Evolución de acciones en circulación',
      display: shareChange === null ? 'sin dato' : `${asPercent(shareChange) > 0 ? '+' : ''}${asPercent(shareChange)} %`,
      weight: 0.45,
      ...(sharesBand ? sharesBand : { points: null, band: '—' })
    },
    {
      label: 'Años con flujo de caja libre positivo',
      display:
        fcfPersistence === null
          ? 'sin dato'
          : `${Math.round(fcfPersistence * fcfSeries.length)} de ${fcfSeries.length}`,
      weight: 0.35,
      ...(fcfPersistence === null
        ? { points: null, band: '—' }
        : pickHigh(fcfPersistence, [
            [-Infinity, 4, '< 50 % de los años'],
            [0.5, 6.5, '50–75 % de los años'],
            [0.75, 8, '75–90 % de los años'],
            [0.9, 9.5, '≥ 90 % de los años']
          ]))
    },
    {
      label: 'Dividendo frente al flujo libre',
      display: dividendYield === null ? 'sin dato' : `${asPercent(dividendYield)} %`,
      weight: 0.2,
      ...dividendUse
    }
  ];

  /* ---------- 3. CRECIMIENTO ---------- */
  const growthReasons = [
    {
      label: `Crecimiento de ingresos (${periods || 0} años)`,
      display: revenueCagr === null ? 'sin dato' : `${asPercent(revenueCagr)} % anual`,
      weight: 0.55,
      ...(revenueCagr === null
        ? { points: null, band: '—' }
        : pickHigh(revenueCagr, [
            [-Infinity, 1.5, '< 0 %'],
            [0, 3.5, '0–2 %'],
            [0.02, 6, '2–5 %'],
            [0.05, 7, '5–8 %'],
            [0.08, 8.5, '8–12 %'],
            [0.12, 10, '≥ 12 %']
          ]))
    },
    {
      label: 'Años con ingresos crecientes',
      display:
        growthConsistency === null
          ? 'sin dato'
          : `${Math.round(growthConsistency * growthYears)} de ${growthYears}`,
      weight: 0.25,
      ...(growthConsistency === null
        ? { points: null, band: '—' }
        : pickHigh(growthConsistency, [
            [-Infinity, 4, '< 50 % de los años'],
            [0.5, 6, '50–70 % de los años'],
            [0.7, 8, '70–85 % de los años'],
            [0.85, 9.5, '≥ 85 % de los años']
          ]))
    },
    {
      label: 'Evolución del margen bruto',
      display: gmChange === null ? 'sin dato' : `${gmChange > 0 ? '+' : ''}${asPercent(gmChange)} pp`,
      weight: 0.2,
      ...(gmChange === null
        ? { points: null, band: '—' }
        : pickHigh(gmChange, [
            [-Infinity, 3, '< −3 pp'],
            [-0.03, 5, '−3 a −1 pp'],
            [-0.01, 7, 'estable'],
            [0.01, 8.5, '+1 a +3 pp'],
            [0.03, 9.5, '≥ +3 pp']
          ]))
    }
  ];

  /* ---------- 4. RENTABILIDAD ---------- */
  const profitabilityReasons = [
    {
      label: 'ROIC actual',
      display: last.roic === null ? 'sin dato' : `${asPercent(last.roic)} %`,
      weight: 0.4,
      ...(last.roic === null ? { points: null, band: '—' } : pickHigh(last.roic, roicTable))
    },
    {
      label: 'Margen operativo',
      display: operatingMargin === null ? 'sin dato' : `${asPercent(operatingMargin)} %`,
      weight: 0.3,
      ...(operatingMargin === null
        ? { points: null, band: '—' }
        : pickHigh(operatingMargin, [
            [-Infinity, 3, '< 5 %'],
            [0.05, 5, '5–8 %'],
            [0.08, 6.5, '8–12 %'],
            [0.12, 8, '12–18 %'],
            [0.18, 9.5, '≥ 18 %']
          ]))
    },
    {
      label: 'Conversión de caja (FCF / beneficio)',
      display: cashConversion === null ? 'sin dato' : `${asPercent(cashConversion)} %`,
      weight: 0.3,
      ...(cashConversion === null
        ? { points: null, band: '—' }
        : pickHigh(cashConversion, [
            [-Infinity, 3, '< 50 %'],
            [0.5, 5, '50–70 %'],
            [0.7, 7.5, '70–90 %'],
            [0.9, 9, '90–110 %'],
            [1.1, 10, '> 110 %']
          ]))
    }
  ];

  /* ---------- 5. BALANCE ---------- */
  const balanceReasons = [
    {
      label: 'Deuda neta / EBITDA',
      display: netDebtEbitda === null ? 'sin dato' : `${Math.round(netDebtEbitda * 100) / 100}×`,
      weight: 0.6,
      ...(netDebtEbitda === null
        ? { points: netDebt === null ? null : 3, band: netDebt === null ? '—' : 'EBITDA no positivo' }
        : pick(netDebtEbitda, leverageTable))
    },
    {
      label: 'Cobertura de intereses (EBIT / intereses)',
      display: interestCoverage === null ? 'sin deuda relevante' : `${Math.round(interestCoverage * 10) / 10}×`,
      weight: 0.4,
      ...(interestCoverage === null
        ? { points: netDebt === null ? 5 : netDebt <= 0 ? 10 : 8, band: netDebt === null ? 'sin dato' : 'sin intereses que cubrir' }
        : pickHigh(interestCoverage, [
            [-Infinity, 2, '< 1,5×'],
            [1.5, 4, '1,5–3×'],
            [3, 6, '3–5×'],
            [5, 8, '5–8×'],
            [8, 9.5, '8–15×'],
            [15, 10, '≥ 15×']
          ]))
    }
  ];

  /* ---------- 6. VALORACIÓN ---------- */
  const peg = per && per > 0 && revenueCagr && revenueCagr > 0 ? per / (revenueCagr * 100) : null;
  const valuationReasons = [
    {
      label: 'PER',
      display: per === null ? 'sin dato' : `${Math.round(per * 10) / 10}×`,
      weight: 0.35,
      ...(per === null || per <= 0
        ? { points: 1.5, band: 'sin beneficio positivo' }
        : pick(per, [
            [10, 9.5, '≤ 10×'],
            [15, 8.5, '10–15×'],
            [20, 7, '15–20×'],
            [25, 6, '20–25×'],
            [35, 4.5, '25–35×'],
            [50, 3, '35–50×'],
            [Infinity, 1.5, '> 50×']
          ]))
    },
    {
      label: 'FCF yield',
      display: fcfYield === null ? 'sin dato' : `${asPercent(fcfYield)} %`,
      weight: 0.3,
      ...(fcfYield === null
        ? { points: null, band: '—' }
        : pickHigh(fcfYield, [
            [-Infinity, 3, '< 1 %'],
            [0.01, 5, '1–2 %'],
            [0.02, 6.5, '2–3 %'],
            [0.03, 7.5, '3–4 %'],
            [0.04, 9, '4–6 %'],
            [0.06, 10, '≥ 6 %']
          ]))
    },
    {
      label: 'EV / EBITDA',
      display: evEbitda === null ? 'sin dato' : `${Math.round(evEbitda * 10) / 10}×`,
      weight: 0.2,
      ...(evEbitda === null
        ? { points: null, band: '—' }
        : pick(evEbitda, [
            [8, 9, '≤ 8×'],
            [12, 7.5, '8–12×'],
            [16, 6, '12–16×'],
            [22, 4.5, '16–22×'],
            [Infinity, 2.5, '> 22×']
          ]))
    },
    {
      label: 'PEG (PER / crecimiento)',
      display: peg === null ? 'sin dato' : `${Math.round(peg * 100) / 100}`,
      weight: 0.15,
      ...(peg === null
        ? { points: 4, band: 'sin crecimiento positivo' }
        : pick(peg, [
            [1, 9.5, '≤ 1'],
            [1.5, 8, '1–1,5'],
            [2, 6.5, '1,5–2'],
            [2.5, 5, '2–2,5'],
            [Infinity, 3, '> 2,5']
          ]))
    }
  ];

  /* ---------- 7. RIESGO ---------- */
  const riskReasons = [
    {
      label: 'Apalancamiento',
      display: netDebtEbitda === null ? 'sin dato' : `${Math.round(netDebtEbitda * 100) / 100}× deuda neta / EBITDA`,
      weight: 0.4,
      ...(netDebtEbitda === null
        ? { points: netDebt === null ? null : 4, band: netDebt === null ? '—' : 'EBITDA no positivo' }
        : pick(netDebtEbitda, leverageTable))
    },
    {
      label: 'Estabilidad del margen neto',
      display: earningsVolatility === null ? 'sin dato' : `desviación ${asPercent(earningsVolatility)} pp`,
      weight: 0.3,
      ...(earningsVolatility === null
        ? { points: null, band: '—' }
        : pick(earningsVolatility, [
            [0.02, 9, '≤ 2 pp'],
            [0.04, 7.5, '2–4 pp'],
            [0.07, 5.5, '4–7 pp'],
            [0.12, 3.5, '7–12 pp'],
            [Infinity, 2, '> 12 pp']
          ]))
    },
    {
      label: 'Ciclicidad del sector',
      display: general.Sector || 'sin clasificar',
      weight: 0.3,
      ...sectorRiskScore(general.Sector)
    }
  ];

  const factors = {
    moat: factorResult({
      key: 'moat',
      reasons: moatReasons,
      method:
        'Media ponderada de ROIC medio (45 %), años con ROIC ≥ 10 % (35 %) y margen bruto (20 %, con penalización si es volátil). Un moat se reconoce por retornos altos y repetidos.'
    }),
    management: factorResult({
      key: 'management',
      reasons: managementReasons,
      method:
        'Aproximación con datos contables: dilución de acciones (45 %), años con flujo de caja libre positivo (35 %) y sostenibilidad del dividendo (20 %). No mide la calidad del equipo directivo.'
    }),
    growth: factorResult({
      key: 'growth',
      reasons: growthReasons,
      method:
        'Crecimiento anual compuesto de ingresos (55 %), consistencia de los años de crecimiento (25 %) y evolución del margen bruto (20 %).'
    }),
    profitability: factorResult({
      key: 'profitability',
      reasons: profitabilityReasons,
      method:
        'ROIC actual (40 %), margen operativo (30 %) y conversión de beneficio en caja libre (30 %). El ROIC se calcula con NOPAT sobre capital invertido.'
    }),
    balance: factorResult({
      key: 'balance',
      reasons: balanceReasons,
      method:
        'Deuda neta sobre EBITDA (60 %) y cobertura de intereses (40 %). Si no hay intereses relevantes, la cobertura se considera holgada.'
    }),
    valuation: factorResult({
      key: 'valuation',
      reasons: valuationReasons,
      method:
        'PER (35 %), FCF yield (30 %), EV/EBITDA (20 %) y PEG (15 %). Son múltiplos absolutos: no comparan con la media histórica ni con el sector.'
    }),
    risk: factorResult({
      key: 'risk',
      reasons: riskReasons,
      method:
        'Estimación cuantitativa: apalancamiento (40 %), estabilidad del margen neto (30 %) y ciclicidad del sector (30 %). Los riesgos regulatorios o de gobernanza requieren tu análisis.',
      note: 'Estimación: no sustituye al análisis cualitativo de riesgos.'
    }),
    catalysts: factorResult({
      key: 'catalysts',
      reasons: [
        {
          label: 'Datos objetivos',
          display: 'no disponibles',
          weight: 1,
          points: null,
          band: 'requiere juicio del analista'
        }
      ],
      method:
        'No se puede derivar de las cuentas: depende del pipeline, las recompras o la valoración del mercado. Se deja en 5 (neutral) hasta que pongas tu nota.',
      note: 'Sin dato automático: se usa 5 neutral.'
    })
  };

  const inputs = {
    revCagr: asPercent(revenueCagr),
    grossMargin: asPercent(gmLatest),
    opMargin: asPercent(operatingMargin),
    roic: asPercent(last.roic),
    roe: asPercent(roe),
    netDebtEbitda: netDebtEbitda === null ? null : Math.round(netDebtEbitda * 100) / 100,
    per: per === null ? null : Math.round(per * 10) / 10,
    evebitda: evEbitda === null ? null : Math.round(evEbitda * 10) / 10,
    fcfYield: asPercent(fcfYield),
    divYield: asPercent(dividendYield),
    marketCap: marketCap,
    revenue: last.revenue,
    ebitda,
    shareChange: asPercent(shareChange)
  };

  return {
    symbol,
    rubricVersion: RUBRIC_VERSION,
    name: general.Name || null,
    sector: general.Sector || null,
    industry: general.Industry || null,
    currency: general.CurrencyCode || null,
    exchange: general.Exchange || null,
    asOf: last.date,
    firstYear: first.date,
    years: rows.length,
    generatedAt: new Date().toISOString(),
    inputs,
    factors,
    coverage: FACTOR_KEYS.filter((key) => factors[key].available).length,
    total: FACTOR_KEYS.length,
    source: 'EODHD'
  };
}
