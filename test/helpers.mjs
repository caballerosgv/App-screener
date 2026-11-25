import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import jsdomPkg from 'jsdom';

const { JSDOM, VirtualConsole } = jsdomPkg;
const ROOT = new URL('..', import.meta.url);
let sequence = 0;

export const rootPath = (relative) => fileURLToPath(new URL(relative, ROOT));
export const fixturePath = (name) => rootPath(`test/fixtures/${name}`);
export const readFixture = (name) => JSON.parse(readFileSync(fixturePath(name), 'utf8'));

/** Recoge comprobaciones y devuelve la lista de fallos para afirmar al final. */
export function makeChecks() {
  const failures = [];
  const check = (label, condition, extra = '') => {
    if (condition) {
      console.log(`PASS · ${label}${extra ? ' — ' + extra : ''}`);
      return;
    }
    failures.push(`${label}${extra ? ' — ' + extra : ''}`);
    console.log(`FAIL · ${label}${extra ? ' — ' + extra : ''}`);
  };
  return { check, failures };
}

export function offlineFetch() {
  return async () => {
    throw new TypeError('Las pruebas no acceden a la red.');
  };
}

/**
 * Monta la app real (public/index.html + public/js/app.js) en jsdom.
 * Hay que llamarla una vez por archivo de prueba: el módulo guarda estado global.
 */
export async function mountApp({ hash = '#/screener', fetchImpl = offlineFetch(), storage = {} } = {}) {
  const html = readFileSync(rootPath('public/index.html'), 'utf8');
  const errors = [];
  const virtualConsole = new VirtualConsole().on('jsdomError', (error) => {
    if (!/scrollTo|Not implemented/.test(error.message)) errors.push(error.message);
  });
  const dom = new JSDOM(html, {
    url: `http://localhost/${hash}`,
    pretendToBeVisual: true,
    virtualConsole
  });
  const w = dom.window;
  for (const [key, value] of Object.entries(storage)) w.localStorage.setItem(key, JSON.stringify(value));
  for (const key of ['window', 'document', 'location', 'localStorage', 'HTMLElement', 'Node', 'MouseEvent', 'Event', 'CustomEvent', 'Blob', 'File', 'FileReader', 'URL']) {
    globalThis[key] = w[key];
  }
  w.scrollTo = () => {};
  globalThis.fetch = fetchImpl;

  sequence += 1;
  await import(pathToFileURL(rootPath('public/js/app.js')).href + `?v=${sequence}`);

  return { dom, w, document: w.document, view: w.document.getElementById('view'), errors };
}
