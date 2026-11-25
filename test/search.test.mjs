import test from 'node:test';
import assert from 'node:assert/strict';
import { mountApp, makeChecks, readFixture } from './helpers.mjs';

test('buscador de símbolos y ficha de valores fuera del universo', async () => {
  const analysis = readFixture('analysis-asml.json');
  const SEARCH = {
    asml: [
      { symbol: 'ASML.AS', code: 'ASML', name: 'ASML Holding N.V.', exchange: 'AS', country: 'Netherlands', currency: 'EUR', type: 'Common Stock' },
      { symbol: 'ASML.XETRA', code: 'ASML', name: 'ASML Holding NV', exchange: 'XETRA', country: 'Germany', currency: 'EUR', type: 'Common Stock' },
      { symbol: 'ASML.US', code: 'ASML', name: 'ASML Holding NV ADR', exchange: 'US', country: 'USA', currency: 'USD', type: 'Common Stock' }
    ],
    bmw: [{ symbol: 'BMW.DE', code: 'BMW', name: 'Bayerische Motoren Werke AG', exchange: 'DE', country: 'Germany', currency: 'EUR', type: 'Common Stock' }]
  };
  let demoMode = false;
  const calls = [];
  const fetchImpl = async (url) => {
    const target = String(url);
    calls.push(target);
    if (demoMode && target.includes('/api/search')) {
      return {
        ok: false,
        status: 502,
        json: async () => ({ error: { code: 'upstream_auth', message: 'EODHD rechazó la petición con el token demo.' } })
      };
    }
    if (target.includes('/api/search')) {
      const q = (target.match(/q=([^&]+)/) || [])[1] || '';
      const key = decodeURIComponent(q).toLowerCase();
      const results = SEARCH[key] || [];
      return { ok: true, status: 200, json: async () => ({ query: key, count: results.length, results, source: 'EODHD' }) };
    }
    if (target.includes('/api/health')) {
      return { ok: true, status: 200, json: async () => ({ provider: 'eodhd', mode: 'live', keyConfigured: true, supports: ['search'] }) };
    }
    if (target.includes('/api/analysis')) return { ok: true, status: 200, json: async () => analysis };
    if (target.includes('/api/fundamentals')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          symbol: 'ASML.AS', name: 'ASML Holding N.V.', sector: 'Technology', exchange: 'AS', currency: 'EUR',
          description: 'ASML es el proveedor dominante de sistemas de litografía para semiconductores.', marketCap: 280000000000
        })
      };
    }
    if (target.includes('/api/quote')) {
      return { ok: true, status: 200, json: async () => ({ symbol: 'ASML.AS', price: 642.5, change: 4.3, changePercent: 0.67 }) };
    }
    return { ok: false, status: 404, json: async () => ({ error: { message: 'no' } }) };
  };
  const { w, view, errors } = await mountApp({ fetchImpl });
  const { check, failures } = makeChecks();
  const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));
  check('el buscador global está en la cabecera', !!document.getElementById('gsearch'));

  const input = document.getElementById('gsearch');
  input.value = 'asml';
  input.dispatchEvent(new w.Event('input', { bubbles: true }));
  check('muestra que está buscando', !document.getElementById('gsearchPanel').hidden);
  await tick(420);

  const items = document.querySelectorAll('.gsearch-item');
  check('el panel lista los 3 resultados de EODHD', items.length === 3, String(items.length));
  check('cada resultado muestra símbolo, nombre y bolsa', items[0].textContent.includes('ASML.AS') && items[0].textContent.includes('Netherlands'));
  check('hay enlace para ver todos', !document.getElementById('gsearchAll').hidden);

  items[0].click();
  await tick(120);
  check('abre la ficha del valor elegido', location.hash === '#/empresa/ASML.AS', location.hash);
  check('el panel se cierra al elegir', document.getElementById('gsearchPanel').hidden);

  check('ficha remota con nombre real de EODHD', view.querySelector('h1').textContent.includes('ASML'), view.querySelector('h1').textContent);
  check('ficha remota muestra perfil, no tesis editorial', view.textContent.includes('Perfil de la empresa') && !view.textContent.includes('Tesis de inversión'));
  check('ficha remota con cotización real', view.textContent.includes('642,50') && view.textContent.includes('EUR'));
  check('ficha remota con 8 factores', view.querySelectorAll('.factor').length === 8);
  const badges = [...view.querySelectorAll('.src-badge')].map((b) => b.textContent.trim());
  check('7 factores automáticos y 1 neutral', badges.filter((b) => b === 'automática').length === 7 && badges.filter((b) => b === 'neutral').length === 1, badges.join('|'));
  check('sin badge de demostración en ficha remota', !badges.includes('demostración'), badges.join('|'));
  check('rúbrica visible en la ficha remota', view.querySelectorAll('.rubric-table tbody tr').length >= 2);
  check('total calculado con las cuentas reales', view.querySelector('.ring-text b').textContent.trim() === '79.7', view.querySelector('.ring-text b').textContent);

  // seguimiento de un valor fuera del universo
  view.querySelector('[data-action="watch"]').click();
  check('se puede seguir un valor remoto', JSON.parse(w.localStorage.getItem('moat.v1.watchlist') || '[]').includes('ASML.AS'));

  // sobrescritura en un valor que no está en el universo demo
  const card = view.querySelectorAll('.factor')[0];
  card.querySelector('.ov-num').value = '4';
  card.querySelector('.ov-note').value = 'Ciclo de litografía';
  card.querySelector('[data-action="save-override"]').click();
  check('la sobrescritura funciona en la ficha remota', view.querySelectorAll('.factor')[0].querySelector('.src-badge').textContent.trim() === 'tu nota');
  check('recalcula el total remoto', view.querySelector('.ring-text b').textContent.trim() === '69.3', view.querySelector('.ring-text b').textContent);
  check('guarda el perfil remoto para la próxima visita', JSON.parse(w.localStorage.getItem('moat.v1.remote') || '{}')['ASML.AS']?.name === 'ASML Holding N.V.');

  // vista de resultados completa
  location.hash = '#/buscar/asml';
  w.dispatchEvent(new w.Event('hashchange'));
  await tick(120);
  check('la vista de búsqueda pinta tarjetas', view.querySelectorAll('.search-card').length === 3, String(view.querySelectorAll('.search-card').length));
  check('la tarjeta enlaza a la ficha real', !!view.querySelector('a[href="#/empresa/ASML.AS"]'));

  // errores del buscador en modo demo
  demoMode = true;
  input.value = 'bmw';
  input.dispatchEvent(new w.Event('input', { bubbles: true }));
  await tick(420);
  const status = document.getElementById('gsearchStatus').textContent;
  check('explica que el buscador necesita token propio', status.includes('token propio'), status);

  // seguimiento con valores fuera del universo
  location.hash = '#/seguimiento';
  w.dispatchEvent(new w.Event('hashchange'));
  check('el seguimiento incluye el valor remoto', view.textContent.includes('ASML'), view.querySelector('.empty')?.textContent || 'con tarjetas');

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
  assert.deepEqual(errors, [], `errores de consola:\n${errors.join('\n')}`);
});
