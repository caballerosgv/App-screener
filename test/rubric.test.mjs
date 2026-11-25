import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAnalysis, FACTOR_KEYS, RUBRIC_VERSION } from '../server/rubric.mjs';
import { buildFundamentals } from './fixtures/fundamentals.mjs';
import { makeChecks } from './helpers.mjs';

const analizar = (opciones = {}) => buildAnalysis(buildFundamentals(opciones), 'TEST.US');
const reasonsOf = (analysis, key) => analysis.factors[key].reasons;
const pointsOf = (analysis, key) => reasonsOf(analysis, key).map((r) => r.points);
const byLabel = (analysis, key, fragment) =>
  reasonsOf(analysis, key).find((r) => r.label.toLowerCase().includes(fragment.toLowerCase()));

/** Contrato común a todos los factores: pesos, indicadores, nota y confianza. */
function contratoDeFactor(analysis, key, check) {
  const factor = analysis.factors[key];
  check(`${key}: existe`, !!factor);
  if (!factor) return;
  check(`${key}: método documentado`, typeof factor.method === 'string' && factor.method.length > 20);
  const weightSum = factor.reasons.reduce((acc, r) => acc + r.weight, 0);
  check(`${key}: los pesos suman 1`, Math.abs(weightSum - 1) < 1e-9, String(weightSum));
  check(
    `${key}: cada indicador trae etiqueta, valor y banda`,
    factor.reasons.every(
      (r) => typeof r.label === 'string' && r.label && typeof r.display === 'string' && r.display && typeof r.band === 'string' && r.band
    )
  );
  check(
    `${key}: los puntos van de 0 a 10 o son nulos`,
    factor.reasons.every((r) => r.points === null || (typeof r.points === 'number' && r.points >= 0 && r.points <= 10))
  );

  const usable = factor.reasons.filter((r) => r.points !== null);
  check(`${key}: disponible solo si hay algún indicador`, factor.available === (usable.length > 0));
  const esperada = !usable.length ? 'nula' : usable.length === factor.reasons.length ? 'alta' : 'media';
  check(`${key}: confianza coherente con los datos`, factor.confidence === esperada, factor.confidence);
  check(`${key}: nota entre 0 y 10`, factor.score >= 0 && factor.score <= 10, String(factor.score));
  check(`${key}: nota con un decimal`, Math.abs(factor.score * 10 - Math.round(factor.score * 10)) < 1e-9, String(factor.score));

  if (!usable.length) {
    check(`${key}: sin datos la nota es 5 neutral`, factor.score === 5, String(factor.score));
    return;
  }
  const weightSumUsable = usable.reduce((acc, r) => acc + r.weight, 0);
  const calculada = Math.round((usable.reduce((acc, r) => acc + r.points * r.weight, 0) / weightSumUsable) * 10) / 10;
  check(`${key}: la nota es la media ponderada de sus indicadores`, Math.abs(factor.score - calculada) < 1e-9, `${factor.score} vs ${calculada}`);
}

test('contrato por factor: estructura, pesos, nota y versión de la rúbrica', async () => {
  const { check, failures } = makeChecks();
  const analysis = analizar();

  check('devuelve un análisis', !!analysis);
  check('los 8 factores en el orden del marco', Object.keys(analysis.factors).join(',') === FACTOR_KEYS.join(','), Object.keys(analysis.factors).join(','));
  for (const key of FACTOR_KEYS) contratoDeFactor(analysis, key, check);

  const disponibles = FACTOR_KEYS.filter((key) => analysis.factors[key].available).length;
  check('cobertura = factores disponibles', analysis.coverage === disponibles && analysis.total === 8, `${analysis.coverage}/${analysis.total}`);

  check('la respuesta declara rubricVersion', analysis.rubricVersion === RUBRIC_VERSION, String(analysis.rubricVersion));
  check('rubricVersion es semver', /^\d+\.\d+\.\d+$/.test(analysis.rubricVersion || ''), String(analysis.rubricVersion));

  check(
    'metadatos del análisis',
    analysis.symbol === 'TEST.US' && analysis.years === 6 && analysis.asOf === '2024-12-31' && analysis.firstYear === '2019-12-31',
    `${analysis.years} años · ${analysis.firstYear} → ${analysis.asOf}`
  );
  check('inputs con las métricas base', analysis.inputs.revCagr === 10 && analysis.inputs.grossMargin === 60 && analysis.inputs.roic === 18.4, JSON.stringify(analysis.inputs));

  check('catalizadores nunca son automáticos', analysis.factors.catalysts.available === false && analysis.factors.catalysts.score === 5);
  check('catalizadores explican por qué son neutrales', /requiere juicio|No se puede derivar/.test(analysis.factors.catalysts.method + analysis.factors.catalysts.note));

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});

test('puntos por banda de una empresa sana', async () => {
  const { check, failures } = makeChecks();
  const analysis = analizar();

  check('MOAT: ROIC medio 7, persistencia 10, margen bruto 10', pointsOf(analysis, 'moat').join('|') === '7|10|10', pointsOf(analysis, 'moat').join('|'));
  check('Dirección: acciones 7, FCF 9,5, dividendo 8', pointsOf(analysis, 'management').join('|') === '7|9.5|8', pointsOf(analysis, 'management').join('|'));
  check('Crecimiento: CAGR 8,5, consistencia 9,5, margen 7', pointsOf(analysis, 'growth').join('|') === '8.5|9.5|7', pointsOf(analysis, 'growth').join('|'));
  check('Rentabilidad: ROIC 8,5, margen operativo 9,5, conversión 10', pointsOf(analysis, 'profitability').join('|') === '8.5|9.5|10', pointsOf(analysis, 'profitability').join('|'));
  check('Balance: caja neta 10, cobertura 10', pointsOf(analysis, 'balance').join('|') === '10|10', pointsOf(analysis, 'balance').join('|'));
  check('Riesgo: apalancamiento 10, estabilidad 9, sector neutro 6,5', pointsOf(analysis, 'risk').join('|') === '10|9|6.5', pointsOf(analysis, 'risk').join('|'));

  const valoracion = pointsOf(analysis, 'valuation');
  check('Valoración: PER 7, FCF yield 5, EV/EBITDA 2,5', valoracion.slice(0, 3).join('|') === '7|5|2.5', valoracion.join('|'));
  check('Valoración usa cuatro múltiplos', valoracion.length === 4, String(valoracion.length));
  check('la banda de la caja neta se explica', byLabel(analysis, 'balance', 'Deuda neta').band.includes('caja neta'), byLabel(analysis, 'balance', 'Deuda neta').band);

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});

test('límites exactos de las bandas', async () => {
  const { check, failures } = makeChecks();

  const roicAlLimite = buildAnalysis(buildFundamentals({ revenue: () => 100, ebitMargin: () => 0.35 }), 'ROIC.US');
  check('ROIC 20,0 % cae en la banda de 10', byLabel(roicAlLimite, 'moat', 'ROIC medio').points === 10, String(byLabel(roicAlLimite, 'moat', 'ROIC medio').points));
  check('ROIC 20,0 % es también la nota de rentabilidad', byLabel(roicAlLimite, 'profitability', 'ROIC actual').points === 10);

  const roicJustoDebajo = buildAnalysis(buildFundamentals({ revenue: () => 100, ebitMargin: () => 0.34825 }), 'ROIC2.US');
  check('ROIC 19,9 % baja a la banda de 8,5', byLabel(roicJustoDebajo, 'moat', 'ROIC medio').points === 8.5, String(byLabel(roicJustoDebajo, 'moat', 'ROIC medio').points));

  check('PER 10× → 9,5', byLabel(analizar({ per: 10 }), 'valuation', 'PER').points === 9.5);
  check('PER 10,5× → 8,5', byLabel(analizar({ per: 10.5 }), 'valuation', 'PER').points === 8.5);
  check('PER 0 → sin beneficio positivo', byLabel(analizar({ per: 0 }), 'valuation', 'PER').points === 1.5);

  const deuda1 = buildAnalysis(buildFundamentals({ revenue: () => 100, ebitdaMargin: () => 1, debt: () => 100, cash: () => 0 }), 'D1.US');
  check('deuda neta / EBITDA 1,0× → 9', byLabel(deuda1, 'balance', 'Deuda neta').points === 9, String(byLabel(deuda1, 'balance', 'Deuda neta').points));

  const deuda2 = buildAnalysis(buildFundamentals({ revenue: () => 100, ebitdaMargin: () => 1, debt: () => 200, cash: () => 0 }), 'D2.US');
  check('deuda neta / EBITDA 2,0× → 7,5', byLabel(deuda2, 'balance', 'Deuda neta').points === 7.5, String(byLabel(deuda2, 'balance', 'Deuda neta').points));

  check('margen bruto 60 % → 10', byLabel(analizar({ grossMargin: () => 0.6 }), 'moat', 'Margen bruto').points === 10);
  check('margen bruto 59 % → 9', byLabel(analizar({ grossMargin: () => 0.59 }), 'moat', 'Margen bruto').points === 9);

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});

test('casos límite: un ejercicio, patrimonio negativo, EBITDA no positivo, sin intereses y pérdidas', async () => {
  const { check, failures } = makeChecks();

  const unAnio = analizar({ years: 1 });
  check('con un solo ejercicio, crecimiento no es automático', unAnio.factors.growth.available === false && unAnio.factors.growth.score === 5);
  check('con un solo ejercicio, dirección usa solo lo disponible', unAnio.factors.management.confidence === 'media', unAnio.factors.management.confidence);
  check('la cobertura refleja el hueco de crecimiento', unAnio.coverage === 6, String(unAnio.coverage));

  const patrimonioNegativo = analizar({ equity: () => -300 });
  check('con patrimonio negativo no se inventa el ROIC', byLabel(patrimonioNegativo, 'moat', 'ROIC medio').points === null);
  check('MOAT queda con confianza media', patrimonioNegativo.factors.moat.confidence === 'media', patrimonioNegativo.factors.moat.confidence);
  check('MOAT sigue disponible por el margen bruto', patrimonioNegativo.factors.moat.available === true);

  const sinEbitda = buildAnalysis(buildFundamentals({ revenue: () => 100, ebitdaMargin: () => 0, debt: () => 100, cash: () => 0 }), 'NEG.US');
  check('EBITDA no positivo se marca en balance', byLabel(sinEbitda, 'balance', 'Deuda neta').points === 3 && byLabel(sinEbitda, 'balance', 'Deuda neta').band.includes('EBITDA no positivo'));
  check('EBITDA no positivo penaliza el riesgo', byLabel(sinEbitda, 'risk', 'Apalancamiento').points === 4);

  const sinIntereses = buildAnalysis(buildFundamentals({ debt: () => 0, cash: () => 100, interestMargin: () => 0 }), 'CASH.US');
  check('sin intereses que cubrir la cobertura es holgada', byLabel(sinIntereses, 'balance', 'Cobertura').points === 10 && byLabel(sinIntereses, 'balance', 'Cobertura').band.includes('sin intereses'), byLabel(sinIntereses, 'balance', 'Cobertura').band);

  const perdidas = analizar({ per: -5 });
  check('con pérdidas el PER no premia', byLabel(perdidas, 'valuation', 'PER').points === 1.5 && byLabel(perdidas, 'valuation', 'PER').band.includes('sin beneficio'));
  check('sin crecimiento positivo el PEG es neutral', byLabel(perdidas, 'valuation', 'PEG').points === 4 && byLabel(perdidas, 'valuation', 'PEG').band.includes('sin crecimiento'));

  const diluye = buildAnalysis(buildFundamentals({ shares: (i) => (i === 5 ? 104 : 100) }), 'DIL.US');
  check('dilución del 4 % → 3 puntos', byLabel(diluye, 'management', 'acciones').points === 3, String(byLabel(diluye, 'management', 'acciones').points));

  const recompra = buildAnalysis(buildFundamentals({ shares: (i) => (i === 5 ? 94 : 100) }), 'BUY.US');
  check('recompra del 6 % → 10 puntos', byLabel(recompra, 'management', 'acciones').points === 10, String(byLabel(recompra, 'management', 'acciones').points));

  const sinCaja = analizar({ fcfMargin: () => 0 });
  check('dividendo sin caja libre se penaliza', byLabel(sinCaja, 'management', 'Dividendo').points === 2 && byLabel(sinCaja, 'management', 'Dividendo').band.includes('sin caja libre'));
  check('sin flujo libre la persistencia cae', byLabel(sinCaja, 'management', 'flujo de caja libre').points === 4);

  const margenVolatil = analizar({ grossMargin: (i) => (i % 2 ? 0.6 : 0.8) });
  check('margen bruto volátil resta un punto', byLabel(margenVolatil, 'moat', 'Margen bruto').points === 9 && byLabel(margenVolatil, 'moat', 'Margen bruto').band.includes('volátil'), byLabel(margenVolatil, 'moat', 'Margen bruto').band);

  const ochoAnios = analizar({ years: 8 });
  check('solo puntúa los últimos 6 ejercicios', ochoAnios.years === 6 && ochoAnios.firstYear === '2021-12-31' && ochoAnios.asOf === '2026-12-31', `${ochoAnios.firstYear} → ${ochoAnios.asOf}`);

  check('sin estados financieros no hay análisis', buildAnalysis({}, 'NADA.US') === null);
  check('con estados vacíos tampoco', buildAnalysis({ Financials: { Income_Statement: { yearly: {} } } }, 'NADA.US') === null);

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});

test('el mismo balance produce siempre la misma nota', async () => {
  const { check, failures } = makeChecks();
  const primero = analizar();
  const segundo = analizar();
  const sinFecha = (analysis) => JSON.stringify({ ...analysis, generatedAt: null });
  check('los factores son deterministas', sinFecha(primero) === sinFecha(segundo));
  check('solo cambia la fecha de generación', typeof primero.generatedAt === 'string' && !Number.isNaN(Date.parse(primero.generatedAt)));

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});
