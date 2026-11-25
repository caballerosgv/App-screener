import test from 'node:test';
import assert from 'node:assert/strict';
import { makeChecks } from './helpers.mjs';
import { buildFreeAnalysis } from '../server/free-analysis.mjs';
import { summarize } from '../server/sec-xbrl.mjs';
import { FACTOR_KEYS } from '../server/rubric.mjs';
import { companyFacts } from './fixtures/sec-xbrl.mjs';

const FUNDAMENTALS = {
  symbol: 'AAPL.US',
  name: 'Apple Inc.',
  sector: 'Technology',
  currency: 'USD',
  exchange: 'NASDAQ',
  marketCap: 3_500_000_000_000,
  peRatio: 30,
  roe: 150,
  roic: 55,
  grossMargin: 46,
  netMargin: 25,
  freeCashFlow: 100_000_000_000,
  revenue: 416_000_000_000,
  debtToEquity: 3.9,
  beta: 1.1
};

test('nota gratis: los 8 factores con ratios y XBRL', () => {
  const { check, failures } = makeChecks();
  const xbrl = summarize(companyFacts());
  const analysis = buildFreeAnalysis({ symbol: 'AAPL.US', fundamentals: FUNDAMENTALS, xbrl });

  check('calcula 7 de 8 factores', analysis.coverage === 7 && analysis.total === FACTOR_KEYS.length, `${analysis.coverage}/${analysis.total}`);
  check('declara las fuentes', analysis.source === 'TradingView + SEC XBRL', analysis.source);
  check('marca la nota como aproximada', analysis.approximate === true && /aproximada/i.test(analysis.note), analysis.note);
  check('moat disponible con datos', analysis.factors.moat.available === true && analysis.factors.moat.score > 7, String(analysis.factors.moat.score));
  check('crecimiento con CAGR de la SEC', analysis.factors.growth.available === true && analysis.factors.growth.score >= 5, String(analysis.factors.growth.score));
  check('dirección con dilución y caja libre', analysis.factors.management.available === true, JSON.stringify(analysis.factors.management.reasons.map((r) => r.points)));
  check('valoración penaliza un PER alto', analysis.factors.valuation.score < 8, String(analysis.factors.valuation.score));
  check('riesgo usa beta y sector', analysis.factors.risk.reasons.some((r) => r.label === 'Beta' && r.points !== null));
  check('catalizadores quedan neutrales', analysis.factors.catalysts.available === false && analysis.factors.catalysts.score === 5);
  check('la rúbrica lleva versión', analysis.rubricVersion === '1.0.0', analysis.rubricVersion);
  check('los inputs alimentan la tabla', analysis.inputs.roic === 55 && analysis.inputs.per === 30 && analysis.inputs.grossMargin === 46, `${analysis.inputs.roic}/${analysis.inputs.per}`);
  check('cada factor explica su método', FACTOR_KEYS.every((key) => analysis.factors[key].method.length > 20));

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});

test('nota gratis: sin XBRL quedan neutrales crecimiento y dirección', () => {
  const { check, failures } = makeChecks();
  const analysis = buildFreeAnalysis({ symbol: 'ASML.AS', fundamentals: { ...FUNDAMENTALS, symbol: 'ASML.AS', name: 'ASML Holding' }, xbrl: null });

  check('5 de 8 factores', analysis.coverage === 5, String(analysis.coverage));
  check('solo ratios públicos', analysis.source === 'TradingView', analysis.source);
  check('crecimiento neutral y sin dato', analysis.factors.growth.available === false && analysis.factors.growth.score === 5);
  check('dirección neutral', analysis.factors.management.available === false);
  check('lo explica en la nota', /neutrales/.test(analysis.note), analysis.note);
  check('moat, caja y deuda sí se calculan', ['moat', 'profitability', 'balance', 'valuation', 'risk'].every((key) => analysis.factors[key].available));

  const vacio = buildFreeAnalysis({ symbol: 'X.US', fundamentals: { }, xbrl: null });
  check('sin ningún dato no se inventa una nota', vacio === null);

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});
