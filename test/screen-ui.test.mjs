import test from 'node:test';
import assert from 'node:assert/strict';
import { makeChecks, mountApp } from './helpers.mjs';

const tick = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));

const PAYLOAD = {
  market: 'US',
  count: 2,
  reviewed: 60,
  universe: 4500,
  source: 'TradingView',
  approximate: true,
  results: [
    { symbol: 'AWES.US', name: 'Awesome Corp', sector: 'Technology', price: 120, changePercent: 1.5, marketCap: 200e9, per: 22, roic: 28, netMargin: 30, quality: 81.2 },
    { symbol: 'MED.PA', name: 'Mediocre SA', sector: 'Energy', price: 40, changePercent: -0.5, marketCap: 80e9, per: 45, roic: 4, netMargin: 3, quality: 42.5 }
  ]
};

test('el explorador del screener pide valores reales y los pinta', async () => {
  const { check, failures } = makeChecks();
  const calls = [];
  const fetchImpl = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('/api/screen')) return { ok: true, status: 200, json: async () => PAYLOAD };
    return { ok: false, status: 404, json: async () => ({ error: { message: 'sin datos' } }) };
  };
  const { document, view } = await mountApp({ hash: '#/screener', fetchImpl });

  check('la tarjeta existe', !!view.querySelector('.screen-card'));
  check('explica qué hace', /nota aproximada/i.test(view.querySelector('.screen-card').textContent));

  document.getElementById('smSector').value = 'tech';
  document.getElementById('smMarket').value = 'US';
  view.querySelector('[data-action="screen-market"]').click();
  await tick(150);

  check('pide el explorador con los filtros', calls.some((url) => url.includes('/api/screen?market=US') && url.includes('sector=tech')), calls.join(' '));
  const rows = view.querySelectorAll('#screenOut tbody tr');
  check('pinta una fila por valor', rows.length === 2, String(rows.length));
  check('la mejor nota va primero', rows[0].textContent.includes('AWES.US') && rows[0].textContent.includes('81.2'), rows[0].textContent);
  check('muestra ratios y capitalización', rows[0].textContent.includes('22.0×') && rows[0].textContent.includes('28 %') && rows[0].textContent.includes('200 MM'), rows[0].textContent);
  check('los valores se pueden abrir', !!rows[0].querySelector('[data-symbol="AWES.US"]'));
  check('avisa de la nota aproximada', /nota aproximada/i.test(view.querySelector('#screenOut').textContent));

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});
