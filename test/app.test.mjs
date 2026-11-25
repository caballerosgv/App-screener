import test from 'node:test';
import assert from 'node:assert/strict';
import { mountApp, makeChecks } from './helpers.mjs';

test('screener, ficha, comparador y noticias', async () => {
  const { w, view, errors } = await mountApp();
  const { check, failures } = makeChecks();

  check('screener renderiza', view.innerHTML.includes('Screener de calidad'));
  const rows = view.querySelectorAll('tbody tr');
  check('filas de empresas = 24', rows.length === 24, `filas=${rows.length}`);
  check('cabecera de tabla con 9 columnas', view.querySelectorAll('thead th').length === 9);
  check('stats de cabecera', view.querySelectorAll('.stat').length === 4);
  const firstScore = parseFloat(view.querySelector('.score-num').textContent);
  check('puntuación en escala 0-100', firstScore > 50 && firstScore <= 100, String(firstScore));
  const cand = [...view.querySelectorAll('.stat')].find((s) => s.querySelector('dt').textContent.includes('Candidatas'));
  check('candidatas >= 80 no es cero', cand && Number(cand.querySelector('dd').textContent.trim().split(' ')[0]) > 0, cand ? cand.querySelector('dd').textContent.trim() : 'sin stat');

  // filtro por mercado
  [...view.querySelectorAll('[data-region]')].find((b) => b.dataset.region === 'EU').click();
  check('filtro Europa deja 12', view.querySelectorAll('tbody tr').length === 12, `filas=${view.querySelectorAll('tbody tr').length}`);
  [...view.querySelectorAll('[data-region]')].find((b) => b.dataset.region === 'all').click();

  // búsqueda
  const q = document.getElementById('q');
  q.value = 'ASML';
  q.dispatchEvent(new w.Event('input', { bubbles: true }));
  check('búsqueda "ASML" deja 1', view.querySelectorAll('tbody tr').length === 1);
  q.value = '';
  q.dispatchEvent(new w.Event('input', { bubbles: true }));

  // orden por PER
  const sort = document.getElementById('sort');
  sort.value = 'per';
  sort.dispatchEvent(new w.Event('change', { bubbles: true }));
  check('orden por PER devuelve 24', view.querySelectorAll('tbody tr').length === 24);

  // estrella / watchlist
  const star = view.querySelector('[data-action="watch"][data-t="MSFT"]');
  star.click();
  check('estrella guarda en localStorage', JSON.parse(w.localStorage.getItem('moat.v1.watchlist') || '[]').includes('MSFT'));
  check('badge de seguimiento = 1', document.getElementById('watchCount').textContent === '1');

  // ficha de empresa
  location.hash = '#/empresa/AAPL';
  w.dispatchEvent(new w.Event('hashchange'));
  check('ficha AAPL', view.innerHTML.includes('Apple Inc.'), view.querySelector('h1')?.textContent);
  check('ficha muestra 8 factores', view.querySelectorAll('.factor').length === 8);
  check('ficha muestra las 5 preguntas del MOAT', view.querySelectorAll('.moat-q > div').length === 5);
  check('radar SVG presente', !!view.querySelector('.radar-card svg polygon'));
  check('checklist 8 casillas', view.querySelectorAll('[data-check]').length === 8);

  // checklist persiste
  const chk = view.querySelector('[data-check="AAPL:0"]');
  chk.checked = true;
  chk.dispatchEvent(new w.Event('change', { bubbles: true }));
  check('checklist persiste', JSON.parse(w.localStorage.getItem('moat.v1.checks') || '{}').AAPL['0'] === true);

  // notas persisten
  const note = view.querySelector('textarea[data-note="AAPL"]');
  note.value = 'Tesis de prueba';
  note.dispatchEvent(new w.Event('input', { bubbles: true }));
  check('notas persisten', JSON.parse(w.localStorage.getItem('moat.v1.notes') || '{}').AAPL === 'Tesis de prueba');

  // comparador
  location.hash = '#/comparar/AAPL/MSFT';
  w.dispatchEvent(new w.Event('hashchange'));
  check('comparador renderiza', view.innerHTML.includes('Veredicto'));
  const cmpTables = view.querySelectorAll('.cmp-table');
  check('comparador 8 filas de factores', cmpTables[0].querySelectorAll('tbody tr').length === 8);
  check('comparador 12 filas de métricas', cmpTables[1].querySelectorAll('tbody tr').length === 12);
  check('comparador selectores correctos', document.getElementById('cmpA').value === 'AAPL' && document.getElementById('cmpB').value === 'MSFT');
  check('comparador radar con dos areas', view.querySelectorAll('.radar-wrap svg polygon').length === 6, String(view.querySelectorAll('.radar-wrap svg polygon').length));
  const maried = [...cmpTables[1].querySelectorAll('tbody tr')].filter((r) => r.querySelectorAll('td.win').length > 1).length;
  check('cada metrica tiene como maximo una ganadora', maried === 0, String(maried));
  const selB = document.getElementById('cmpB');
  selB.value = 'ASML';
  selB.dispatchEvent(new w.Event('change', { bubbles: true }));
  check('cambiar B actualiza la URL', location.hash === '#/comparar/AAPL/ASML', location.hash);
  location.hash = '#/comparar/AAPL/AAPL';
  w.dispatchEvent(new w.Event('hashchange'));
  check('no compara una empresa consigo misma', document.getElementById('cmpB').value !== 'AAPL', document.getElementById('cmpB').value);
  location.hash = '#/comparar/ZZZZ/AAPL';
  w.dispatchEvent(new w.Event('hashchange'));
  check('ticker invalido cae en la primera empresa', document.getElementById('cmpA').value === 'MSFT', document.getElementById('cmpA').value);
  const swap = view.querySelector('[data-action="swap-cmp"]');
  swap.click();
  check('intercambiar reordena el duelo', location.hash.startsWith('#/comparar/'), location.hash);
  location.hash = '#/empresa/AAPL';
  w.dispatchEvent(new w.Event('hashchange'));
  check('la ficha enlaza al comparador', !!view.querySelector('a[href="#/comparar/AAPL"]'));

  // enlace a ficha desde noticias
  location.hash = '#/noticias';
  w.dispatchEvent(new w.Event('hashchange'));
  check('noticias renderiza', view.innerHTML.includes('Qué está pasando'));
  check('18 titulares de noticias', view.querySelectorAll('.news-item').length === 18, `n=${view.querySelectorAll('.news-item').length}`);
  const ncat = document.getElementById('ncat');
  ncat.value = 'Resultados';
  ncat.dispatchEvent(new w.Event('change', { bubbles: true }));
  check('filtro categoría Resultados', view.querySelectorAll('.news-item').length === 3, `n=${view.querySelectorAll('.news-item').length}`);
  const readBtn = view.querySelector('[data-action="read"]');
  readBtn.click();
  check('marcar leído persiste', JSON.parse(w.localStorage.getItem('moat.v1.newsRead') || '[]').length === 1);

  // seguimiento
  location.hash = '#/seguimiento';
  w.dispatchEvent(new w.Event('hashchange'));
  check('seguimiento muestra MSFT', view.innerHTML.includes('Microsoft'));

  // marco
  location.hash = '#/marco';
  w.dispatchEvent(new w.Event('hashchange'));
  check('guía de 8 factores', view.querySelectorAll('.fw-item').length === 8);
  check('proceso de 6 pasos', view.querySelectorAll('.timeline li').length === 6);

  // ruta inválida → screener
  location.hash = '#/no-existe';
  w.dispatchEvent(new w.Event('hashchange'));
  check('ruta inválida cae en screener', view.innerHTML.includes('Screener de calidad'));

  // empresa inexistente
  location.hash = '#/empresa/XXXX';
  w.dispatchEvent(new w.Event('hashchange'));
  await new Promise((r) => setTimeout(r, 80));
  check('ticker desconocido abre ficha remota', view.textContent.includes('XXXX') && view.textContent.includes('Perfil de la empresa'), view.querySelector('h1')?.textContent);

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
  assert.deepEqual(errors, [], `errores de consola:\n${errors.join('\n')}`);
});
