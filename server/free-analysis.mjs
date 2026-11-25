/**
 * Nota de los 8 factores con fuentes gratuitas.
 *
 * Usa los ratios públicos del escáner de TradingView (rentabilidad, márgenes,
 * deuda, caja libre, PER, beta) y, en EE. UU., las series anuales XBRL de la
 * SEC para crecimiento, dilución y estabilidad. Es una aproximación a la
 * rúbrica completa de EODHD: cada factor declara con qué se calculó y los que
 * no se pueden derivar (catalizadores) quedan en 5 neutral, nunca inventados.
 */

import { FACTOR_KEYS, RUBRIC_VERSION, factorResult, pick, pickHigh, sectorRiskScore } from './rubric.mjs';

const num = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** Los ratios de TradingView ya vienen en porcentaje (55 = 55 %). */
const pct = (value) => {
  const n = num(value);
  return n === null ? null : Math.round(n * 10) / 10;
};

// Bandas ascendentes: `pickHigh` recorre hasta el último umbral alcanzado.
const ROIC_TABLE = [[-999, 2, '< 5 %'], [5, 4.5, '5-10 %'], [10, 7, '10-15 %'], [15, 8.5, '15-25 %'], [25, 10, '≥ 25 %']];
const MARGIN_TABLE = [[-999, 2, '< 10 %'], [10, 4, '10-25 %'], [25, 6, '25-40 %'], [40, 8, '40-60 %'], [60, 10, '≥ 60 %']];
const GROWTH_TABLE = [[-999, 1, 'negativo'], [0, 3, '0-3 %'], [3, 5, '3-7 %'], [7, 7, '7-12 %'], [12, 8.5, '12-20 %'], [20, 10, '≥ 20 %']];
const PER_TABLE = [[10, 10, '≤ 10'], [15, 8.5, '10-15'], [20, 7, '15-20'], [30, 5, '20-30'], [45, 3, '30-45'], [9999, 1.5, '> 45']];
const DEBT_TABLE = [[0.3, 10, '≤ 0,3'], [0.8, 8, '0,3-0,8'], [1.5, 6, '0,8-1,5'], [2.5, 3.5, '1,5-2,5'], [999, 1, '> 2,5']];
const BETA_TABLE = [[0.8, 9, '≤ 0,8'], [1, 8, '0,8-1'], [1.3, 6.5, '1-1,3'], [1.6, 4.5, '1,3-1,6'], [999, 2.5, '> 1,6']];
const FCF_YIELD_TABLE = [[-9999, 2, '< 1 %'], [1, 4, '1-3 %'], [3, 6, '3-5 %'], [5, 8, '5-8 %'], [8, 10, '≥ 8 %']];
const DILUTION_TABLE = [[-999, 2, 'dilución > 10 %'], [-10, 2, 'dilución > 3 %'], [-3, 5, 'dilución ≤ 3 %'], [0, 8, 'estable'], [5, 10, 'recompra ≥ 5 %']];
const YEARS_TABLE = [[0, 2, 'nunca'], [1, 4, 'irregular'], [6, 7, 'la mayoría'], [9, 10, 'casi siempre']];

/** Indicador con su banda; `points` es null cuando falta el dato. */
function reason(label, value, table, kind = 'high', { display, weight = 1 } = {}) {
  if (value === null) {
    return { label, display: 'sin dato', weight, points: null, band: 'no disponible en la fuente gratuita' };
  }
  const { points, band } = kind === 'low' ? pick(value, table) : pickHigh(value, table);
  return { label, display: display ?? String(value), weight, points, band };
}

export function buildFreeAnalysis({ symbol, fundamentals = {}, xbrl = null } = {}) {
  const roic = num(fundamentals.roic);
  const roe = num(fundamentals.roe);
  const gross = num(fundamentals.grossMargin);
  const netMargin = num(fundamentals.netMargin ?? fundamentals.profitMargin);
  const fcf = num(fundamentals.freeCashFlow);
  const revenue = num(fundamentals.revenue);
  const marketCap = num(fundamentals.marketCap);
  const per = num(fundamentals.peRatio);
  const debtToEquity = num(fundamentals.debtToEquity);
  const beta = num(fundamentals.beta);
  const metrics = (xbrl && xbrl.metrics) || {};
  const years = (xbrl && xbrl.years) || [];

  const fcfYield = fcf !== null && marketCap ? (fcf / marketCap) * 100 : null;
  const fcfMargin = fcf !== null && revenue ? (fcf / revenue) * 100 : num(metrics.fcfMargin);
  const growthYears = years.filter((row, index) => index > 0 && row.revenue > years[index - 1].revenue).length;

  const moat = factorResult({
    key: 'moat',
    reasons: [
      reason('ROIC', roic ?? roe, ROIC_TABLE, 'high', { weight: 0.55, display: pct(roic ?? roe) }),
      reason('Margen bruto', gross, MARGIN_TABLE, 'high', { weight: 0.45, display: pct(gross) })
    ],
    method:
      'Aproximación con ratios públicos: ROIC (55 %) y margen bruto (45 %). Sin la serie de varios años no se mide la persistencia del retorno, así que la nota es orientativa.',
    note: xbrl ? null : 'Sin series de la SEC: la persistencia del moat no se comprueba.'
  });

  const management = factorResult({
    key: 'management',
    reasons: [
      reason('Dilución de acciones', metrics.shareChange === null || metrics.shareChange === undefined ? null : -metrics.shareChange, DILUTION_TABLE, 'high', {
        weight: 0.5,
        display: pct(metrics.shareChange)
      }),
      reason('Años con caja libre positiva', metrics.fcfYears ? (metrics.fcfPositiveYears / metrics.fcfYears) * 10 : null, YEARS_TABLE, 'high', {
        weight: 0.5,
        display: metrics.fcfYears ? `${metrics.fcfPositiveYears}/${metrics.fcfYears}` : null
      })
    ],
    method:
      'Con las series de la SEC: dilución de acciones (50 %) y años con caja libre positiva (50 %). No mide la calidad del equipo directivo.',
    note: 'Requiere cuentas XBRL de la SEC: solo disponible para empresas de EE. UU.'
  });

  const growth = factorResult({
    key: 'growth',
    reasons: [
      reason('Crecimiento de ingresos (CAGR)', num(metrics.cagr), GROWTH_TABLE, 'high', { weight: 0.7, display: pct(metrics.cagr) }),
      reason('Años creciendo', years.length > 1 ? (growthYears / (years.length - 1)) * 10 : null, YEARS_TABLE, 'high', {
        weight: 0.3,
        display: years.length > 1 ? `${growthYears}/${years.length - 1}` : null
      })
    ],
    method: 'CAGR de ingresos de los últimos ejercicios (70 %) y consistencia del crecimiento (30 %), con las cuentas XBRL de la SEC.',
    note: 'Requiere cuentas XBRL de la SEC: solo disponible para empresas de EE. UU.'
  });

  const profitability = factorResult({
    key: 'profitability',
    reasons: [
      reason('ROIC', roic, ROIC_TABLE, 'high', { weight: 0.4, display: pct(roic) }),
      reason('Margen neto', netMargin, MARGIN_TABLE, 'high', { weight: 0.3, display: pct(netMargin) }),
      reason('Margen de caja libre', fcfMargin, MARGIN_TABLE, 'high', { weight: 0.3, display: pct(fcfMargin) })
    ],
    method: 'ROIC (40 %), margen neto (30 %) y conversión a caja libre (30 %) con ratios públicos. El capital invertido es el que publica la fuente, no se recalcula.'
  });

  const balance = factorResult({
    key: 'balance',
    reasons: [
      reason('Deuda / patrimonio', debtToEquity, DEBT_TABLE, 'low', { weight: 0.7, display: debtToEquity === null ? null : `${debtToEquity.toFixed(2)}×` }),
      reason('Pasivo / patrimonio (SEC)', num(metrics.debtToEquity), DEBT_TABLE, 'low', { weight: 0.3, display: num(metrics.debtToEquity) === null ? null : `${metrics.debtToEquity.toFixed(2)}×` })
    ],
    method: 'Deuda sobre patrimonio (70 %) y pasivo total sobre patrimonio con las cuentas de la SEC (30 %). No hay cobertura de intereses en la fuente gratuita.',
    note: 'Sin EBITDA ni gastos financieros: el balance se estima con apalancamiento contable.'
  });

  const valuation = factorResult({
    key: 'valuation',
    reasons: [
      reason('PER', per, PER_TABLE, 'low', { weight: 0.6, display: per === null ? null : `${per.toFixed(1)}×` }),
      reason('Caja libre / capitalización', fcfYield, FCF_YIELD_TABLE, 'high', { weight: 0.4, display: pct(fcfYield) })
    ],
    method: 'PER (60 %) y caja libre sobre capitalización (40 %). Son múltiplos absolutos: no se comparan con la media histórica ni con el sector.',
    note: 'Sin EV/EBITDA ni PEG en la fuente gratuita.'
  });

  const risk = factorResult({
    key: 'risk',
    reasons: [
      reason('Beta', beta, BETA_TABLE, 'low', { weight: 0.4, display: beta === null ? null : beta.toFixed(2) }),
      fundamentals.sector
        ? { label: 'Sector', display: fundamentals.sector, weight: 0.3, ...sectorRiskScore(fundamentals.sector) }
        : { label: 'Sector', display: 'sin clasificar', weight: 0.3, points: null, band: 'sin sector en la fuente' },
      reason('Estabilidad del margen neto', num(metrics.netMarginStdev), [[1.5, 10, 'muy estable'], [3, 7.5, 'estable'], [6, 5, 'variable'], [999, 2, 'muy variable']], 'low', {
        weight: 0.3,
        display: pct(metrics.netMarginStdev)
      })
    ],
    method: 'Beta (40 %), ciclicidad del sector (30 %) y variabilidad del margen neto con la SEC (30 %). Los riesgos regulatorios o de gobernanza requieren tu análisis.',
    note: 'Estimación: no sustituye al análisis cualitativo de riesgos.'
  });

  const catalysts = factorResult({
    key: 'catalysts',
    reasons: [
      { label: 'Datos objetivos', display: 'no disponibles', weight: 1, points: null, band: 'requiere juicio del analista' }
    ],
    method: 'No se puede derivar de las cuentas: depende del pipeline, recompras o valoración del mercado. Se deja en 5 (neutral) hasta que pongas tu nota.',
    note: 'Sin dato automático: se usa 5 neutral.'
  });

  const factors = { moat, management, growth, profitability, balance, valuation, risk, catalysts };
  const inputs = {
    revCagr: pct(num(metrics.cagr)),
    grossMargin: pct(gross),
    opMargin: null,
    roic: pct(roic),
    roe: pct(roe),
    netDebtEbitda: null,
    per: per === null ? null : Math.round(per * 10) / 10,
    evebitda: null,
    fcfYield: pct(fcfYield),
    divYield: null,
    marketCap,
    revenue,
    ebitda: null,
    shareChange: pct(num(metrics.shareChange))
  };

  const coverage = FACTOR_KEYS.filter((key) => factors[key].available).length;
  if (!coverage) return null;

  return {
    symbol,
    rubricVersion: RUBRIC_VERSION,
    approximate: true,
    name: fundamentals.name || null,
    sector: fundamentals.sector || null,
    industry: fundamentals.industry || null,
    currency: fundamentals.currency || null,
    exchange: fundamentals.exchange || null,
    asOf: xbrl && xbrl.years && xbrl.years.length ? xbrl.years[xbrl.years.length - 1].date : null,
    firstYear: xbrl && xbrl.years && xbrl.years.length ? xbrl.years[0].date : null,
    years: xbrl && xbrl.years ? xbrl.years.length : 0,
    generatedAt: new Date().toISOString(),
    inputs,
    factors,
    coverage,
    total: FACTOR_KEYS.length,
    source: xbrl ? 'TradingView + SEC XBRL' : 'TradingView',
    note: xbrl
      ? 'Nota aproximada con ratios públicos y cuentas XBRL de la SEC, no con los estados completos de EODHD.'
      : 'Nota aproximada solo con ratios públicos: crecimiento y dirección quedan neutrales porque no hay series anuales (fuera de EE. UU. la SEC no las publica en XBRL).'
  };
}
