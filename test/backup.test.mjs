import test from 'node:test';
import assert from 'node:assert/strict';
import { mountApp, makeChecks, offlineFetch } from './helpers.mjs';
import { buildBackup, parseBackup, describeBackup, BACKUP_KEYS, BACKUP_VERSION, normalizeBackupCode } from '../public/js/lib.js';
import { BACKUP_KEYS as SERVER_BACKUP_KEYS, normalizeBackupCode as normalizeServerCode } from '../server/backup.mjs';

const SEED = {
  'moat.v1.watchlist': ['AAPL', 'MSFT'],
  'moat.v1.notes': { AAPL: 'Comprar si cae', MSFT: 'Seguir el margen' },
  'moat.v1.checks': { AAPL: { 1: true, 2: true } },
  'moat.v1.overrides': { AAPL: { moat: { value: 9, note: 'Marca', at: '2026-11-01T00:00:00.000Z' } } },
  'moat.v1.remote': { 'ASML.AS': { name: 'ASML Holding', sector: 'Technology' } },
  'moat.v1.auto': { 'ASML.AS': { factors: {}, inputs: {} } },
  'moat.v1.newsRead': ['n1']
};

const tick = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));

const readText = (w, blob) =>
  new Promise((resolve, reject) => {
    const reader = new w.FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });

test('la copia incluye todas las secciones y se puede volver a leer', async () => {
  const { check, failures } = makeChecks();
  const data = {
    watchlist: ['AAPL', 'ASML.AS'],
    notes: { AAPL: 'Nota' },
    checks: { AAPL: { 1: true } },
    newsRead: ['n1'],
    auto: { 'ASML.AS': { factors: {} } },
    overrides: { AAPL: { moat: { value: 9 } } },
    remote: { 'ASML.AS': { name: 'ASML' } }
  };

  const backup = buildBackup(data, { now: new Date('2026-11-25T10:00:00Z') });
  check('lleva versión y fecha', backup.version === BACKUP_VERSION && backup.exportedAt === '2026-11-25T10:00:00.000Z', backup.exportedAt);
  check('incluye las 7 secciones', Object.keys(backup.data).length === BACKUP_KEYS.length, String(Object.keys(backup.data).length));

  const parsed = parseBackup(JSON.stringify(backup));
  check('se vuelve a leer sin pérdidas', parsed.ok === true && JSON.stringify(parsed.data) === JSON.stringify(backup.data));
  check('declara la versión leída', parsed.version === BACKUP_VERSION);

  const resumen = describeBackup(parsed);
  check('el resumen cuenta cada sección', resumen.find((e) => e.key === 'watchlist').count === 2 && resumen.find((e) => e.key === 'notes').count === 1);
  check(
    'las etiquetas están en español',
    resumen.map((e) => e.label).join(',') === 'seguimiento,notas,checklists,noticias leídas,análisis automáticos,sobrescrituras,perfiles remotos',
    resumen.map((e) => e.label).join(',')
  );

  check(
    'cliente y servidor comparten secciones y códigos',
    JSON.stringify(BACKUP_KEYS) === JSON.stringify(SERVER_BACKUP_KEYS) &&
      normalizeBackupCode('abcd efgh') === normalizeServerCode('abcd efgh') &&
      normalizeBackupCode('abc') === null &&
      normalizeBackupCode('ABCD-EFG0') === null,
    normalizeBackupCode('abcd efgh')
  );

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});

test('rechaza copias inválidas y acepta el formato sin envoltorio', async () => {
  const { check, failures } = makeChecks();

  const casos = [
    ['no es JSON', 'esto no es json', /JSON válido/],
    ['un array', '[]', /formato de una copia/],
    ['sin secciones', '{"app":"moat","version":1,"data":{}}', /no contiene/],
    ['seguimiento con tipo incorrecto', JSON.stringify({ app: 'moat', version: 1, data: { watchlist: 'AAPL' } }), /seguimiento.*formato/],
    ['notas con tipo incorrecto', JSON.stringify({ app: 'moat', version: 1, data: { notes: ['x'] } }), /notas.*formato/],
    ['versión futura', JSON.stringify({ app: 'moat', version: 99, data: { notes: {} } }), /versión más nueva/]
  ];
  for (const [label, text, esperado] of casos) {
    const parsed = parseBackup(text);
    check(`${label} → error`, parsed.ok === false && esperado.test(parsed.error), parsed.error);
  }

  const sinEnvoltorio = parseBackup(JSON.stringify({ notes: { AAPL: 'x' } }));
  check('acepta una copia sin envoltorio', sinEnvoltorio.ok === true && sinEnvoltorio.keys.join() === 'notes', sinEnvoltorio.keys?.join());

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});

test('exportar descarga un JSON con todo el trabajo del dispositivo', async () => {
  const { check, failures } = makeChecks();
  const { w, view, document } = await mountApp({ hash: '#/seguimiento', storage: SEED, fetchImpl: offlineFetch() });

  const card = [...view.querySelectorAll('.card h3')].find((h) => h.textContent === 'Copia de seguridad');
  check('la tarjeta de copia está en Seguimiento', !!card);
  const meta = view.querySelector('.card .meta').textContent;
  check('resume lo que hay guardado', meta.includes('seguimiento: 2') && meta.includes('notas: 2') && meta.includes('sobrescrituras: 1'), meta);
  check('avisa de que aún no hay copia', meta.includes('Todavía no has exportado'));

  let captured = null;
  const downloads = [];
  w.URL.createObjectURL = (blob) => {
    captured = blob;
    return 'blob:copia';
  };
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function click() {
    downloads.push(this.download);
  };

  view.querySelector('[data-action="export-backup"]').click();
  await tick();

  check('descarga un archivo JSON con fecha', downloads.length === 1 && /^moat-copia-\d{4}-\d{2}-\d{2}\.json$/.test(downloads[0]), downloads.join(','));
  check('el archivo tiene contenido', !!captured && captured.size > 0, String(captured && captured.size));

  const payload = JSON.parse(await readText(w, captured));
  check('la copia lleva las 7 secciones', Object.keys(payload.data).length === BACKUP_KEYS.length, Object.keys(payload.data).join(','));
  check('lleva seguimiento y notas', payload.data.watchlist.join(',') === 'AAPL,MSFT' && payload.data.notes.AAPL === 'Comprar si cae');
  check('lleva sobrescrituras, perfiles y checklists', payload.data.overrides.AAPL.moat.value === 9 && payload.data.remote['ASML.AS'].name === 'ASML Holding' && payload.data.checks.AAPL[1] === true);
  check('lleva análisis y noticias leídas', !!payload.data.auto['ASML.AS'] && payload.data.newsRead[0] === 'n1');
  check('declara versión y aplicación', payload.app === 'moat' && payload.version === BACKUP_VERSION);

  const status = document.getElementById('backupStatus').textContent;
  check('confirma la exportación', status.includes('Copia exportada') && status.includes('seguimiento: 2'), status);
  check('guarda la fecha de la última copia', typeof w.localStorage.getItem('moat.v1.backupAt') === 'string');
  check('la tarjeta muestra la última copia', view.querySelector('.card .meta').textContent.includes('Última copia'));

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});

test('importar sustituye solo las secciones del archivo y avisa de lo hecho', async () => {
  const { check, failures } = makeChecks();
  const { w, view, document } = await mountApp({ hash: '#/seguimiento', storage: SEED, fetchImpl: offlineFetch() });

  const copia = buildBackup({
    watchlist: ['NVDA'],
    notes: { NVDA: 'Importada' },
    overrides: { NVDA: { moat: { value: 4, note: 'Ciclo', at: '2026-11-20T00:00:00.000Z' } } },
    remote: { 'BMW.DE': { name: 'BMW' } },
    checks: {},
    newsRead: [],
    auto: {}
  }, { now: new Date('2026-11-24T09:00:00Z') });

  const input = document.getElementById('backupFile');
  Object.defineProperty(input, 'files', { value: [new w.File([JSON.stringify(copia)], 'copia.json', { type: 'application/json' })], configurable: true });
  input.dispatchEvent(new w.Event('change', { bubbles: true }));
  await tick(120);

  check('sustituye el seguimiento', JSON.parse(w.localStorage.getItem('moat.v1.watchlist')).join(',') === 'NVDA');
  check('sustituye las notas', JSON.parse(w.localStorage.getItem('moat.v1.notes')).NVDA === 'Importada');
  check('sustituye las sobrescrituras', JSON.parse(w.localStorage.getItem('moat.v1.overrides')).NVDA.moat.value === 4);
  check('sustituye los perfiles remotos', JSON.parse(w.localStorage.getItem('moat.v1.remote'))['BMW.DE'].name === 'BMW');
  check('vacía las secciones que llegan vacías', JSON.parse(w.localStorage.getItem('moat.v1.newsRead')).length === 0);
  check('actualiza el contador de la cabecera', document.getElementById('watchCount').textContent === '1', document.getElementById('watchCount').textContent);
  check('repinta el seguimiento con lo importado', view.textContent.includes('NVDA'));

  const status = document.getElementById('backupStatus').textContent;
  check('resume lo importado', status.includes('Copia importada') && status.includes('seguimiento: 1') && status.includes('notas: 1'), status);

  // un archivo parcial no toca el resto
  const parcial = JSON.stringify({ app: 'moat', version: 1, data: { notes: { AAPL: 'Solo notas' } } });
  Object.defineProperty(input, 'files', { value: [new w.File([parcial], 'parcial.json', { type: 'application/json' })], configurable: true });
  input.dispatchEvent(new w.Event('change', { bubbles: true }));
  await tick(120);
  check('un archivo parcial solo cambia sus secciones', JSON.parse(w.localStorage.getItem('moat.v1.notes')).AAPL === 'Solo notas' && JSON.parse(w.localStorage.getItem('moat.v1.watchlist')).join(',') === 'NVDA');

  // archivo inválido: no toca nada y muestra el error
  Object.defineProperty(input, 'files', { value: [new w.File(['no es json'], 'roto.json', { type: 'application/json' })], configurable: true });
  input.dispatchEvent(new w.Event('change', { bubbles: true }));
  await tick(120);
  const errorEl = document.getElementById('backupStatus');
  check('un archivo inválido se explica', errorEl.textContent.includes('JSON válido') && errorEl.classList.contains('error'), errorEl.textContent);
  check('un archivo inválido no cambia los datos', JSON.parse(w.localStorage.getItem('moat.v1.notes')).AAPL === 'Solo notas');

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});

test('guardar y recuperar la copia desde el servidor con un código', async () => {
  const { check, failures } = makeChecks();
  let saved = null;
  const fetchImpl = async (url, init = {}) => {
    const target = String(url);
    if (target.includes('/api/backup') && init.method === 'POST') {
      const payload = JSON.parse(init.body);
      saved = { code: 'ABCD-EFGH', version: payload.version, exportedAt: payload.exportedAt, data: payload.data };
      return { ok: true, status: 201, json: async () => saved };
    }
    if (target.includes('/api/backup?code=')) {
      const code = decodeURIComponent(target.split('code=')[1]);
      if (!saved || code !== saved.code) {
        return { ok: false, status: 404, json: async () => ({ error: { code: 'not_found', message: 'No hay ninguna copia con ese código.' } }) };
      }
      return { ok: true, status: 200, json: async () => saved };
    }
    return { ok: false, status: 404, json: async () => ({ error: { message: 'sin datos' } }) };
  };
  const { w, view, document } = await mountApp({ hash: '#/seguimiento', storage: SEED, fetchImpl });

  view.querySelector('[data-action="save-remote-backup"]').click();
  await tick(150);
  check('muestra el código devuelto', document.getElementById('backupCode').value === 'ABCD-EFGH', document.getElementById('backupCode').value);
  check('recuerda el código en el dispositivo', JSON.parse(w.localStorage.getItem('moat.v1.backupCode')) === 'ABCD-EFGH');
  check('avisa de la copia guardada', document.getElementById('backupStatus').textContent.includes('guardada en el servidor'));
  check('envía las 7 secciones al servidor', !!saved && Object.keys(saved.data).length === BACKUP_KEYS.length, String(saved && Object.keys(saved.data).length));

  w.localStorage.setItem('moat.v1.notes', JSON.stringify({ OTRA: 'distinta' }));
  document.getElementById('backupCode').value = 'abcd efgh';
  view.querySelector('[data-action="load-remote-backup"]').click();
  await tick(200);
  check('recupera las notas del servidor', JSON.parse(w.localStorage.getItem('moat.v1.notes')).AAPL === 'Comprar si cae', w.localStorage.getItem('moat.v1.notes'));
  check('avisa de la recuperación', document.getElementById('backupStatus').textContent.includes('Copia recuperada'));

  document.getElementById('backupCode').value = 'ZZZZ-ZZZZ';
  view.querySelector('[data-action="load-remote-backup"]').click();
  await tick(150);
  const status = document.getElementById('backupStatus');
  check('explica el código desconocido', status.textContent.includes('No hay ninguna copia') && status.classList.contains('error'), status.textContent);

  document.getElementById('backupCode').value = 'abc';
  view.querySelector('[data-action="load-remote-backup"]').click();
  await tick(80);
  check('exige un código de 8 caracteres', document.getElementById('backupStatus').textContent.includes('8 caracteres'));

  assert.deepEqual(failures, [], `comprobaciones fallidas:\n${failures.join('\n')}`);
});
