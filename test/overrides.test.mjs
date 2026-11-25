import test from 'node:test';
import assert from 'node:assert/strict';
import { mountApp, makeChecks, readFixture } from './helpers.mjs';

test('rúbrica automática, sobrescritura y recálculo de totales', async () => {
  const analysis = readFixture('analysis-aapl.json');
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).includes('/api/health')) {
      return { ok: true, status: 200, json: async () => ({ provider: 'eodhd', mode: 'live', keyConfigured: true, demoTickers: [] }) };
    }
    if (String(url).includes('/api/analysis')) return { ok: true, status: 200, json: async () => analysis };
    return { ok: false, status: 404, json: async () => ({ error: { message: 'no' } }) };
  };
  const { w, view, errors } = await mountApp({ fetchImpl });
  const { check, failures } = makeChecks();
  const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));


  location.hash = '#/empresa/AAPL';
  w.dispatchEvent(new w.Event('hashchange'));
  check('ficha se pinta al instante', view.innerHTML.includes('Apple Inc.'));
  await tick(80);

  check('pidió el análisis al abrir la ficha', calls.some((u) => u.includes('/api/analysis')), calls.join(', '));
  const badges = [...view.querySelectorAll('.src-badge')].map((b) => b.textContent.trim());
  check('7 factores marcados como automáticos', badges.filter((b) => b === 'automática').length === 7, badges.join('|'));
  check('catalizadores marcado como neutral', badges.filter((b) => b === 'neutral').length === 1, badges.join('|'));
  check('barra de estado indica cobertura real', view.textContent.includes('7/8 factores con datos'));
  check('anillo usa el total recalculado (79.7)', view.querySelector('.ring-text b').textContent.trim() === '79.7', view.querySelector('.ring-text b')?.textContent);
  check('la cabecera dice que son notas automáticas', view.textContent.includes('Notas automáticas con datos de EODHD'));
  check('métricas de EODHD en la ficha', view.textContent.includes('97.6') && view.textContent.includes('38.9'));

  const moatCard = view.querySelectorAll('.factor')[0];
  check('rúbrica visible en el factor abierto', moatCard.querySelectorAll('.rubric-table tbody tr').length === 3, String(moatCard.querySelectorAll('.rubric-table tbody tr').length));
  check('la rúbrica muestra banda y puntos', moatCard.textContent.includes('≥ 20 %') && moatCard.textContent.includes('45–60 %'));
  check('nota automática del MOAT = 9.8', moatCard.querySelector('.factor-score').textContent.trim() === '9.8', moatCard.querySelector('.factor-score').textContent.trim());

  // sobrescribir el MOAT con 3
  const input = moatCard.querySelector('.ov-num');
  const note = moatCard.querySelector('.ov-note');
  input.value = '3';
  note.value = 'Riesgo regulatorio en servicios';
  moatCard.querySelector('[data-action="save-override"]').click();

  const moatAfter = view.querySelectorAll('.factor')[0];
  check('badge pasa a "tu nota"', moatAfter.querySelector('.src-badge').textContent.trim() === 'tu nota');
  check('nota del factor = 3.0', moatAfter.querySelector('.factor-score').textContent.trim() === '3.0');
  check('compara automática vs propia', moatAfter.textContent.includes('Automática') && moatAfter.textContent.includes('3.0') && moatAfter.textContent.includes('Riesgo regulatorio'));
  check('se mantiene la rúbrica como evidencia', moatAfter.querySelectorAll('.rubric-table tbody tr').length === 3);
  check('el total baja a 67.5', view.querySelector('.ring-text b').textContent.trim() === '67.5', view.querySelector('.ring-text b')?.textContent);
  check('la cabecera distingue notas tuyas', view.textContent.includes('1 nota tuya · resto automático'));
  const saved = JSON.parse(w.localStorage.getItem('moat.v1.overrides') || '{}');
  check('override persistido en localStorage', saved.AAPL && saved.AAPL.moat && saved.AAPL.moat.value === 3, JSON.stringify(saved));

  // el screener usa las notas efectivas
  location.hash = '#/screener';
  w.dispatchEvent(new w.Event('hashchange'));
  const aaplRow = [...view.querySelectorAll('tbody tr')].find((r) => r.textContent.includes('AAPL'));
  check('el screener refleja la nota sobrescrita', aaplRow && Math.abs(parseFloat(aaplRow.querySelector('.score-num').textContent) - 67.5) < 0.2, aaplRow ? aaplRow.querySelector('.score-num').textContent : 'sin fila');

  // quitar la sobrescritura
  location.hash = '#/empresa/AAPL';
  w.dispatchEvent(new w.Event('hashchange'));
  await tick(20);
  const removeBtn = view.querySelector('[data-action="reset-override"]');
  check('botón para volver a la automática', !!removeBtn);
  removeBtn.click();
  check('vuelve a la nota automática', view.querySelectorAll('.factor')[0].querySelector('.factor-score').textContent.trim() === '9.8');
  check('vuelve a marcar automática', view.querySelectorAll('.factor')[0].querySelector('.src-badge').textContent.trim() === 'automática');
  check('localStorage limpio', !JSON.parse(w.localStorage.getItem('moat.v1.overrides') || '{}').AAPL);

  // validación del rango
  const input2 = view.querySelectorAll('.factor')[0].querySelector('.ov-num');
  input2.value = '12';
  view.querySelectorAll('.factor')[0].querySelector('[data-action="save-override"]').click();
  check('rechaza notas fuera de 0-10', !JSON.parse(w.localStorage.getItem('moat.v1.overrides') || '{}').AAPL);
  check('marca el campo como inválido', input2.classList.contains('invalid'));

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
  assert.deepEqual(errors, [], `errores de consola:\n${errors.join('\n')}`);
});
