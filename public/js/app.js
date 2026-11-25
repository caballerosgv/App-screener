import { COMPANIES, NEWS, FRAMEWORK, PROCESS, SCALE, MOAT_TYPES } from './data.js';
import {
  weightedScore, band, avg, pct, num, cap, mult, dateLabel, esc, tone, store, REGION_LABEL,
  buildBackup, parseBackup, describeBackup, normalizeBackupCode
} from './lib.js';

const SHORT = ['MOAT', 'Dirección', 'Crecimiento', 'Rentabilidad', 'Balance', 'Valoración', 'Riesgo', 'Catalizadores'];

const DATA = COMPANIES
  .map((c) => ({ ...c, score: weightedScore(c.scores) }))
  .sort((a, b) => b.score - a.score);
const BY = new Map(DATA.map((c) => [c.t, c]));
const SECTORS = [...new Set(DATA.map((c) => c.sector))].sort((a, b) => a.localeCompare(b, 'es'));
const CATEGORIES = [...new Set(NEWS.map((n) => n.category))].sort((a, b) => a.localeCompare(b, 'es'));
const byDate = [...NEWS].sort((a, b) => b.date.localeCompare(a.date));

const state = {
  q: '', region: 'all', sector: 'all', min: 0, moat: 'all', sort: 'score',
  news: { q: '', region: 'all', category: 'all', sentiment: 'all', impact: 'all', watchOnly: false },
  watchlist: new Set(store.get('watchlist', [])),
  notes: store.get('notes', {}),
  checks: store.get('checks', {}),
  newsRead: new Set(store.get('newsRead', [])),
  auto: store.get('auto', {}),
  overrides: store.get('overrides', {}),
  analysisError: {},
  analysisLoading: new Set(),
  analysisTried: new Set(),
  profiles: store.get('remote', {})
};

const view = document.getElementById('view');

/* ---------- persistencia ---------- */
const saveWatch = () => { store.set('watchlist', [...state.watchlist]); updateWatchBadge(); };
const saveNotes = () => store.set('notes', state.notes);
const saveChecks = () => store.set('checks', state.checks);
const saveRead = () => store.set('newsRead', [...state.newsRead]);

function updateWatchBadge() {
  const el = document.getElementById('watchCount');
  if (!el) return;
  el.textContent = String(state.watchlist.size);
  el.hidden = state.watchlist.size === 0;
}

/* ---------- valores fuera del universo de demostración ---------- */
const REMOTE = new Map();

function remoteCompany(symbol) {
  const key = String(symbol || '').trim().toUpperCase();
  if (!REMOTE.has(key)) {
    const saved = state.profiles[key] || {};
    REMOTE.set(key, {
      t: key,
      name: saved.name || key,
      exchange: saved.exchange || '',
      country: saved.country || '',
      sector: saved.sector || '',
      currency: saved.currency || '',
      price: saved.price ?? null,
      cap: saved.cap ?? null,
      description: saved.description || null,
      moatRating: saved.moatRating || 'None',
      region: saved.region || (key.endsWith('.US') ? 'US' : 'EU'),
      scores: FRAMEWORK.map(() => 5),
      notes: FRAMEWORK.map(() => ''),
      f1: null,
      thesis: '',
      risks: [],
      catalysts: [],
      metrics: {
        revCagr: null, grossMargin: null, opMargin: null, roic: null, roe: null,
        netDebtEbitda: null, intCover: null, per: saved.per ?? null, evebitda: null,
        fcfYield: null, divYield: null
      },
      remote: true
    });
  }
  return REMOTE.get(key);
}

function saveRemoteProfile(c) {
  state.profiles[c.t] = {
    name: c.name,
    exchange: c.exchange,
    country: c.country,
    sector: c.sector,
    currency: c.currency,
    price: c.price,
    cap: c.cap,
    description: c.description,
    moatRating: c.moatRating,
    region: c.region,
    per: c.metrics ? c.metrics.per : null
  };
  store.set('remote', state.profiles);
}

function syncRemoteFromAnalysis(c, analysis) {
  if (!analysis) return;
  c.name = analysis.name || c.name;
  c.sector = analysis.sector || c.sector;
  c.exchange = analysis.exchange || c.exchange;
  c.currency = analysis.currency || c.currency;
  if (analysis.factors && analysis.factors.moat) {
    const moat = analysis.factors.moat.score;
    c.moatRating = moat >= 8 ? 'Wide' : moat >= 6 ? 'Narrow' : 'None';
  }
  if (analysis.inputs) c.metrics = { ...c.metrics, ...analysis.inputs };
}

function currentCompanyTicker() {
  const raw = location.hash.replace(/^#\/?/, '').split('/');
  return raw[0] === 'empresa' ? decodeURIComponent(raw[1] || '').toUpperCase() : '';
}

async function loadRemoteCompany(symbol) {
  const ticker = String(symbol || '').toUpperCase();
  if (!ticker || state.analysisTried.has(ticker) || state.analysisLoading.has(ticker)) return;
  state.analysisTried.add(ticker);
  state.analysisLoading.add(ticker);
  const c = remoteCompany(ticker);
  const offset = window.scrollY;
  const repaint = () => {
    if (currentCompanyTicker() === ticker) {
      renderCompany(ticker, 0);
      window.scrollTo(0, offset);
    }
  };

  try {
    const [analysis, fundamentals, quote] = await Promise.allSettled([
      api(`/api/analysis?symbol=${encodeURIComponent(ticker)}`),
      api(`/api/fundamentals?symbol=${encodeURIComponent(ticker)}`),
      api(`/api/quote?symbol=${encodeURIComponent(ticker)}`)
    ]);

    if (analysis.status === 'fulfilled') {
      state.auto[ticker] = analysis.value;
      store.set('auto', state.auto);
      syncRemoteFromAnalysis(c, analysis.value);
      delete state.analysisError[ticker];
    }
    if (fundamentals.status === 'fulfilled') {
      const f = fundamentals.value;
      c.name = f.name || c.name;
      c.sector = f.sector || c.sector;
      c.exchange = f.exchange || c.exchange;
      c.currency = f.currency || c.currency;
      c.description = f.description || c.description;
      c.cap = f.marketCap ?? c.cap;
    }
    if (quote.status === 'fulfilled' && quote.value) {
      c.price = quote.value.price ?? c.price;
    }

    if (analysis.status === 'rejected') {
      setAnalysisError(ticker, liveErrorMessage(analysis.reason || {}));
    } else if (fundamentals.status === 'rejected' && quote.status === 'rejected') {
      setAnalysisError(ticker, liveErrorMessage(fundamentals.reason || {}));
    }
    saveRemoteProfile(c);
  } finally {
    state.analysisLoading.delete(ticker);
    repaint();
  }
}

/* ---------- componentes ---------- */
function initials(c) {
  return c.t.replace(/[^A-Z0-9]/g, '').slice(0, 3);
}

function scoreBar(score) {
  return `<span class="bar ${tone(score / 10)}" aria-hidden="true"><span style="width:${Math.max(2, score)}%"></span></span>`;
}

function ring(score, size = 84) {
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(100, Math.max(0, score)) / 100);
  const col = score >= 85 ? 'var(--great)' : score >= 70 ? 'var(--good)' : score >= 55 ? 'var(--warn)' : 'var(--bad)';
  return `<div class="ring" style="width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="6"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${col}" stroke-width="6"
        stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/>
    </svg>
    <div class="ring-text"><b>${score.toFixed(1)}</b><span>de 100</span></div>
  </div>`;
}

function radar(scores) {
  const n = 8, cx = 190, cy = 150, R = 88;
  const pt = (i, r) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  };
  const rings = [0.25, 0.5, 0.75, 1].map((f) => {
    const pts = scores.map((_, i) => pt(i, R * f).map((v) => v.toFixed(1)).join(',')).join(' ');
    return `<polygon points="${pts}" fill="none" stroke="#22303f" stroke-width="1"/>`;
  }).join('');
  const axes = scores.map((_, i) => {
    const [x, y] = pt(i, R);
    return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#1b2735" stroke-width="1"/>`;
  }).join('');
  const shape = scores.map((s, i) => pt(i, (R * Math.max(0.6, s)) / 10).map((v) => v.toFixed(1)).join(',')).join(' ');
  const labels = SHORT.map((label, i) => {
    const [x, y] = pt(i, R + 18);
    const anchor = Math.abs(x - cx) < 14 ? 'middle' : x > cx ? 'start' : 'end';
    const s = scores[i];
    return `<text x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="${anchor}" font-size="10.5"
      fill="#8fa0b5" font-family="system-ui, sans-serif">${label}</text>
      <text x="${x.toFixed(1)}" y="${(y + 15).toFixed(1)}" text-anchor="${anchor}" font-size="10"
      fill="${s >= 8.5 ? '#3ddc97' : s >= 7 ? '#6fb3f2' : s >= 5.5 ? '#e9b949' : '#f2748a'}"
      font-family="ui-monospace, monospace" font-weight="700">${s.toFixed(1)}</text>`;
  }).join('');
  return `<svg viewBox="0 0 380 300" width="100%" role="img" aria-label="Perfil de los 8 factores">${rings}${axes}
    <polygon points="${shape}" fill="rgba(94,234,212,.16)" stroke="#5eead4" stroke-width="1.8" stroke-linejoin="round"/>
    ${scores.map((s, i) => {
      const [x, y] = pt(i, (R * Math.max(0.6, s)) / 10);
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="#5eead4"/>`;
    }).join('')}
    ${labels}</svg>`;
}

function statCard(label, value, note = '') {
  return `<div class="stat"><dt>${label}</dt><dd>${value}${note ? ` <small>${note}</small>` : ''}</dd></div>`;
}

/* ---------- screener ---------- */
function filteredCompanies() {
  const q = state.q.trim().toLowerCase();
  let list = DATA.filter((c) => {
    if (state.region !== 'all' && c.region !== state.region) return false;
    if (state.sector !== 'all' && c.sector !== state.sector) return false;
    if (state.moat !== 'all' && c.moatRating !== state.moat) return false;
    if (c.score < state.min) return false;
    if (q) {
      const hay = `${c.t} ${c.name} ${c.sector} ${c.moat} ${c.country}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const sorters = {
    score: (a, b) => b.score - a.score,
    growth: (a, b) => b.metrics.revCagr - a.metrics.revCagr,
    roic: (a, b) => b.metrics.roic - a.metrics.roic,
    per: (a, b) => (a.metrics.per || 999) - (b.metrics.per || 999),
    cap: (a, b) => b.cap - a.cap,
    name: (a, b) => a.name.localeCompare(b.name, 'es')
  };
  list = [...list].sort(sorters[state.sort] || sorters.score);
  return list;
}

function screenerRows() {
  const list = filteredCompanies();
  if (!list.length) {
    return `<div class="empty"><strong>Sin resultados</strong>Prueba a quitar filtros o a buscar otro nombre, ticker o sector.</div>`;
  }
  const rows = list.map((c) => {
    const auto = analysisFor(c);
    const m = (auto && auto.inputs) || c.metrics;
    const debt = m.netDebtEbitda;
    return `<tr data-href="#/empresa/${encodeURIComponent(c.t)}">
      <td>
        <div class="co">
          <button class="star" data-action="watch" data-t="${esc(c.t)}" aria-pressed="${state.watchlist.has(c.t)}"
            aria-label="Añadir ${esc(c.name)} a seguimiento" title="Seguimiento">
            <svg viewBox="0 0 20 20" width="16" height="16"><path d="M10 2.5l2.3 4.7 5.2.8-3.8 3.7.9 5.2-4.6-2.4-4.6 2.4.9-5.2L2.5 8l5.2-.8L10 2.5z"
              fill="${state.watchlist.has(c.t) ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.3"/></svg>
          </button>
          <div class="co-name"><strong>${esc(c.name)}</strong><small>${esc(c.t)} · ${esc(c.country)}</small></div>
        </div>
      </td>
      <td class="hide-sm"><span class="pill ${c.region === 'US' ? 'us' : 'eu'}">${REGION_LABEL[c.region]}</span></td>
      <td class="hide-md"><span class="pill sector">${esc(c.sector)}</span></td>
      <td>
        <div class="scorecell"><span class="score-num">${c.score.toFixed(1)}</span>${scoreBar(c.score)}</div>
      </td>
      <td class="hide-md"><span class="pill ${c.moatRating.toLowerCase()}">${c.moatRating === 'Wide' ? 'Amplio' : c.moatRating === 'Narrow' ? 'Estrecho' : 'Sin moat'}</span></td>
      <td class="num hide-md">${pct(m.revCagr)}</td>
      <td class="num hide-md">${pct(m.roic, 0)}</td>
      <td class="num">${m.per ? mult(m.per) : '—'}</td>
      <td class="num hide-md">${debt === 0 ? 'n/a' : mult(debt)}</td>
    </tr>`;
  }).join('');

  return `<div class="table-wrap"><table>
    <thead><tr>
      <th>Empresa</th><th class="hide-sm">Mercado</th><th class="hide-md">Sector</th>
      <th>Calidad</th><th class="hide-md">MOAT</th>
      <th class="num hide-md">Crec.</th><th class="num hide-md">ROIC</th>
      <th class="num">PER</th><th class="num hide-md">Deuda/EBITDA</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function renderScreener() {
  const list = filteredCompanies();
  const top = [...DATA].slice(0, 1)[0];
  view.innerHTML = `
    <div class="page-head">
      <p class="eyebrow">Universo EE. UU. · Europa</p>
      <h1>Screener de calidad</h1>
      <p>Filtra por mercado, sector y ventaja competitiva, y ordena las empresas por la puntuación de los 8 factores. Cada ficha incluye el análisis del moat, las métricas clave y un espacio para tus notas.</p>
    </div>

    <dl class="stats">
      ${statCard('Empresas analizadas', DATA.length, 'US + EU')}
      ${statCard('Puntuación media', avg(DATA.map((c) => c.score)).toFixed(1), 'sobre 100')}
      ${statCard('Candidatas ≥ 80', DATA.filter((c) => c.score >= 80).length, 'calidad excepcional')}
      ${statCard('En seguimiento', state.watchlist.size, 'tu lista')}
    </dl>

    <div class="toolbar">
      <div class="toolbar-row">
        <label class="search">
          <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="m13.2 13.2 3.6 3.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          <input id="q" type="search" placeholder="Buscar empresa, ticker, país o sector…" value="${esc(state.q)}" autocomplete="off"/>
        </label>
        <div class="seg" role="group" aria-label="Mercado">
          ${[['all', 'Todos'], ['US', 'EE. UU.'], ['EU', 'Europa']].map(([v, l]) =>
            `<button type="button" data-region="${v}" aria-pressed="${state.region === v}">${l}</button>`).join('')}
        </div>
      </div>
      <div class="toolbar-row">
        <label class="field">Sector
          <select id="sector">
            <option value="all">Todos</option>
            ${SECTORS.map((s) => `<option value="${s}"${state.sector === s ? ' selected' : ''}>${s}</option>`).join('')}
          </select>
        </label>
        <label class="field">MOAT
          <select id="moat">
            <option value="all">Todos</option>
            <option value="Wide"${state.moat === 'Wide' ? ' selected' : ''}>Amplio</option>
            <option value="Narrow"${state.moat === 'Narrow' ? ' selected' : ''}>Estrecho</option>
          </select>
        </label>
        <label class="field">Ordenar por
          <select id="sort">
            <option value="score"${state.sort === 'score' ? ' selected' : ''}>Calidad (8 factores)</option>
            <option value="growth"${state.sort === 'growth' ? ' selected' : ''}>Crecimiento</option>
            <option value="roic"${state.sort === 'roic' ? ' selected' : ''}>ROIC</option>
            <option value="per"${state.sort === 'per' ? ' selected' : ''}>PER más bajo</option>
            <option value="cap"${state.sort === 'cap' ? ' selected' : ''}>Capitalización</option>
            <option value="name"${state.sort === 'name' ? ' selected' : ''}>Nombre</option>
          </select>
        </label>
        <div class="range">Calidad mínima <input id="min" type="range" min="0" max="90" step="5" value="${state.min}"/><output id="minOut">${state.min}</output></div>
      </div>
    </div>

    <div class="results-meta">
      <p id="resultCount">${list.length} empresas · ordenadas por calidad</p>
      <p>Referencia: <strong>${top.name}</strong> ${top.score.toFixed(1)}/100</p>
    </div>
    <div id="screenerResults">${screenerRows()}</div>
  `;

  const refresh = () => {
    document.getElementById('screenerResults').innerHTML = screenerRows();
    document.getElementById('resultCount').textContent = `${filteredCompanies().length} empresas · ${
      state.sort === 'score' ? 'ordenadas por calidad' : 'según el criterio elegido'}`;
    view.querySelectorAll('[data-region]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.region === state.region)));
  };

  const q = document.getElementById('q');
  q.addEventListener('input', () => { state.q = q.value; refresh(); });
  view.querySelectorAll('[data-region]').forEach((b) =>
    b.addEventListener('click', () => { state.region = b.dataset.region; refresh(); }));
  document.getElementById('sector').addEventListener('change', (e) => { state.sector = e.target.value; refresh(); });
  document.getElementById('moat').addEventListener('change', (e) => { state.moat = e.target.value; refresh(); });
  document.getElementById('sort').addEventListener('change', (e) => { state.sort = e.target.value; refresh(); });
  const min = document.getElementById('min');
  min.addEventListener('input', () => {
    state.min = Number(min.value);
    document.getElementById('minOut').textContent = min.value;
    refresh();
  });
}

/* ---------- ficha de empresa ---------- */
function metricCard(label, value, cls = '') {
  return `<div class="metric"><dt>${label}</dt><dd class="${cls}">${value}</dd></div>`;
}

/* ---------- notas: automáticas, tuyas y de demostración ---------- */
// Valores europeos que en la app van sin sufijo de bolsa: su listado real es local.
const PROVIDER_SUFFIX = { ASML: 'AS', SAP: 'DE' };

const providerSymbol = (ticker) => {
  if (ticker.includes('.')) return ticker;
  const suffix = PROVIDER_SUFFIX[String(ticker).toUpperCase()];
  return `${ticker}.${suffix || 'US'}`;
};

function analysisFor(c) {
  return state.auto[c.t] || null;
}

function analysisErrorFor(c) {
  return state.analysisError[c.t] || '';
}

function factorAuto(c, key) {
  const analysis = analysisFor(c);
  return analysis && analysis.factors ? analysis.factors[key] || null : null;
}

function overrideFor(c, key) {
  const row = (state.overrides[c.t] || {})[key];
  return row && typeof row.value === 'number' ? row : null;
}

function factorValue(c, index) {
  const key = FRAMEWORK[index].key;
  const override = overrideFor(c, key);
  const auto = factorAuto(c, key);
  if (override) return { value: override.value, src: 'manual', auto, override };
  if (auto) return { value: auto.score, src: 'auto', auto, override: null };
  return { value: c.scores[index], src: 'demo', auto: null, override: null };
}

function effectiveValues(c) {
  return FRAMEWORK.map((_, index) => factorValue(c, index).value);
}

function companyTotal(c) {
  const manual = FRAMEWORK.filter((f) => overrideFor(c, f.key)).length;
  const analysis = analysisFor(c);
  return {
    score: weightedScore(effectiveValues(c)),
    manual,
    analysis,
    source: analysis ? (manual ? 'mixta' : 'auto') : 'demo',
    coverage: analysis ? analysis.coverage : null,
    total: analysis ? analysis.total : null
  };
}

function recomputeScores() {
  for (const company of DATA) company.score = companyTotal(company).score;
}
recomputeScores();

function rubricBlock(auto) {
  const confidence =
    auto.confidence === 'alta' ? 'datos completos' : auto.confidence === 'media' ? 'datos parciales' : 'sin datos';
  return `<div class="rubric">
    <div class="rubric-head">
      <span>Cálculo automático · EODHD</span>
      <span class="rubric-conf ${auto.confidence}">${confidence}</span>
    </div>
    <table class="rubric-table">
      <thead><tr><th>Indicador</th><th class="num">Valor</th><th>Banda</th><th class="num">Pts</th></tr></thead>
      <tbody>${auto.reasons
        .map(
          (r) => `<tr>
        <td>${esc(r.label)}</td>
        <td class="num">${esc(r.display)}</td>
        <td class="band">${esc(r.band)}</td>
        <td class="num">${r.points === null ? '—' : r.points.toFixed(1)}</td>
      </tr>`
        )
        .join('')}</tbody>
    </table>
    <p class="note-hint">${esc(auto.method)}</p>
    ${auto.note ? `<p class="note-hint">${esc(auto.note)}</p>` : ''}
  </div>`;
}

function overrideBlock(c, f) {
  const key = f.key;
  const override = overrideFor(c, key);
  const auto = factorAuto(c, key);
  return `<div class="override">
    <div class="override-head">
      <strong>Tu nota</strong>
      <span class="note-hint">${auto ? `automática ${auto.score.toFixed(1)}` : 'sin dato automático'}</span>
    </div>
    <div class="override-row">
      <input class="ov-num" type="number" min="0" max="10" step="0.1" inputmode="decimal"
        value="${override ? override.value : ''}" placeholder="0–10"
        aria-label="Tu nota para ${esc(f.name)}"/>
      <input class="ov-note" type="text" value="${esc(override ? override.note : '')}"
        placeholder="Por qué te separas de la nota automática (opcional)"
        aria-label="Motivo de tu nota para ${esc(f.name)}"/>
      <button class="btn btn-sm btn-primary" data-action="save-override" data-t="${esc(c.t)}" data-key="${key}">Guardar</button>
      ${override ? `<button class="btn btn-sm btn-ghost" data-action="reset-override" data-t="${esc(c.t)}" data-key="${key}">Quitar</button>` : ''}
    </div>
  </div>`;
}

function factorCard(c, f, i, openIndex = 0) {
  const eff = factorValue(c, i);
  const score = eff.value;
  const open = i === openIndex ? ' open' : '';
  const isNeutral = eff.src === 'auto' && eff.auto && eff.auto.available === false;
  const badge = eff.src === 'manual'
    ? 'tu nota'
    : isNeutral
      ? 'neutral'
      : eff.src === 'auto'
        ? 'automática'
        : c.remote
          ? 'sin datos'
          : 'demostración';
  const comparison =
    eff.override && eff.auto
      ? `<p class="compare-line">Automática <strong>${eff.auto.score.toFixed(1)}</strong> · tu nota <strong>${eff.override.value.toFixed(1)}</strong>${eff.override.note ? ` — «${esc(eff.override.note)}»` : ''}</p>`
      : '';
  return `<details class="factor ${tone(score)}"${open}>
    <summary>
      <span class="factor-index">${f.id}</span>
      <span class="factor-name">${esc(f.name)}<small>${esc(f.subtitle)}</small></span>
      <span class="src-badge ${eff.src}${isNeutral ? ' neutral' : ''}">${badge}</span>
      <span class="factor-weight">${f.weight}%</span>
      <span class="factor-score">${score.toFixed(1)}</span>
    </summary>
    <div class="factor-body">
      <div class="bar ${tone(score)}" style="margin-bottom:.9rem"><span style="width:${score * 10}%"></span></div>
      ${comparison}

      ${i === 0 && c.f1 ? `<h4>Cómo funciona el negocio, en cinco respuestas</h4>
        <dl class="moat-q">
          <div><dt>¿A qué se dedica?</dt><dd>${esc(c.f1.negocio)}</dd></div>
          <div><dt>¿Cómo gana dinero?</dt><dd>${esc(c.f1.dinero)}</dd></div>
          <div><dt>¿Es difícil de sustituir?</dt><dd>${esc(c.f1.sustitucion)}</dd></div>
          <div><dt>¿Tiene posición dominante?</dt><dd>${esc(c.f1.dominio)}</dd></div>
          <div><dt>¿Aguanta 10-15 años?</dt><dd>${esc(c.f1.durabilidad)}</dd></div>
        </dl>` : ''}

      ${eff.auto
        ? rubricBlock(eff.auto)
        : c.notes[i]
          ? `<h4>Comentario (demostración)</h4><p class="factor-desc" style="color:#c6d2e2">${esc(c.notes[i])}</p>`
          : `<p class="note-hint">Todavía no hay análisis automático para este valor: la nota 5 es el punto de partida neutral. Pulsa «Calcular con EODHD» cuando el servidor tenga acceso a sus cuentas.</p>`}

      <h4>Qué mirar</h4>
      <ul class="bullets">${f.questions.map((q) => `<li>${esc(q)}</li>`).join('')}</ul>

      <h4>Señales</h4>
      <div class="grid2">
        <div class="flag green"><h5>Verdes</h5><ul>${f.green.map((g) => `<li>${esc(g)}</li>`).join('')}</ul></div>
        <div class="flag red"><h5>Rojas</h5><ul>${f.red.map((g) => `<li>${esc(g)}</li>`).join('')}</ul></div>
      </div>

      <h4>Métricas a revisar</h4>
      <div class="chips">${f.metrics.map((m) => `<span class="tag">${esc(m)}</span>`).join('')}</div>

      ${overrideBlock(c, f)}
    </div>
  </details>`;
}

function relatedNews(c) {
  return byDate.filter((n) => n.t === c.t).slice(0, 4);
}

function newsItem(n) {
  const c = BY.get(n.t);
  const read = state.newsRead.has(n.id);
  return `<article class="news-item ${n.sentiment}${read ? ' read' : ''}">
    <div class="news-top">
      <time datetime="${n.date}">${dateLabel(n.date)}</time>
      <a class="ticker-chip" href="#/empresa/${encodeURIComponent(n.t)}">${esc(n.t)}</a>
      ${c ? `<span>${esc(c.name)}</span>` : ''}
      <span class="tag">${esc(n.category)}</span>
      <span class="impact ${n.impact.toLowerCase()}">Impacto ${n.impact.toLowerCase()}</span>
      <span class="sent ${n.sentiment}">${n.sentiment === 'positiva' ? 'Positiva' : n.sentiment === 'negativa' ? 'Negativa' : 'Neutral'}</span>
    </div>
    <h3>${esc(n.headline)}</h3>
    <p>${esc(n.summary)}</p>
    <div class="news-foot">
      <span class="src">Titular de demostración</span>
      <button class="btn btn-sm btn-ghost" data-action="read" data-id="${n.id}">${read ? 'Marcar no leído' : 'Marcar leído'}</button>
    </div>
  </article>`;
}

/* ---------- cálculo automático ---------- */
let healthPromise = null;

function getHealth() {
  if (!healthPromise) {
    healthPromise = api('/api/health').catch(() => null);
  }
  return healthPromise;
}

function setAnalysisError(ticker, message) {
  state.analysisError[ticker] = message;
  const el = document.getElementById('analysisError');
  if (el) el.textContent = message;
}

async function runAnalysis(ticker) {
  if (state.analysisLoading.has(ticker)) return;
  state.analysisLoading.add(ticker);
  const button = document.querySelector(`[data-action="analyse"][data-t="${ticker}"]`);
  if (button) {
    button.disabled = true;
    button.textContent = 'Calculando…';
  }
  try {
    const data = await api(`/api/analysis?symbol=${encodeURIComponent(ticker)}`);
    state.auto[ticker] = data;
    store.set('auto', state.auto);
    delete state.analysisError[ticker];
    if (!BY.has(ticker)) {
      const remote = remoteCompany(ticker);
      syncRemoteFromAnalysis(remote, data);
      saveRemoteProfile(remote);
    }
    recomputeScores();
    if (location.hash.includes(encodeURIComponent(ticker))) {
      const offset = window.scrollY;
      renderCompany(ticker, 0);
      window.scrollTo(0, offset);
    }
  } catch (err) {
    setAnalysisError(ticker, liveErrorMessage(err));
  } finally {
    state.analysisLoading.delete(ticker);
    const current = document.querySelector(`[data-action="analyse"][data-t="${ticker}"]`);
    if (current) {
      current.disabled = false;
      current.textContent = 'Recalcular';
    }
  }
}

async function maybeAnalyse(ticker) {
  const health = await getHealth();
  if (!health) {
    setAnalysisError(ticker, 'Sin conexión con el servidor de datos: abre la app con «npm run dev».');
    return;
  }
  if (health.mode === 'demo' && Array.isArray(health.demoTickers) && !health.demoTickers.includes(providerSymbol(ticker))) {
    setAnalysisError(
      ticker,
      `El token demo de EODHD solo permite ${health.demoTickers.join(', ')}. Configura EODHD_API_TOKEN para el resto del universo.`
    );
    return;
  }
  await runAnalysis(ticker);
}

function metric(val, format) {
  return val === null || val === undefined ? '—' : format(val);
}

/* ---------- ficha de empresa ---------- */
function renderCompany(ticker, openIndex = 0) {
  const c = BY.get(ticker) || remoteCompany(ticker);
  const total = companyTotal(c);
  const values = effectiveValues(c);
  const analysis = total.analysis;
  const b = band(total.score);
  const inWatch = state.watchlist.has(c.t);
  const news = relatedNews(c);
  const watched = state.checks[c.t] || {};
  const m = analysis && analysis.inputs ? analysis.inputs : c.metrics;
  const usListed = /\.US$/i.test(providerSymbol(c.t)) && (!c.region || c.region === 'US');

  const sourceText =
    total.source === 'auto'
      ? 'Notas automáticas con datos de EODHD'
      : total.source === 'mixta'
        ? `${total.manual} ${total.manual === 1 ? 'nota tuya' : 'notas tuyas'} · resto automático`
        : c.remote
          ? 'Sin notas: pide el análisis con EODHD'
          : 'Notas de demostración';

  const analysisStatus = analysis
    ? `Calculado con EODHD · cuentas hasta ${esc(analysis.asOf)} · ${analysis.coverage}/${analysis.total} factores con datos`
    : state.analysisLoading.has(c.t)
      ? 'Cargando perfil, cuentas y cotización de EODHD…'
      : 'Sin cálculo automático todavía';

  view.innerHTML = `
    <a class="back" href="#/screener">
      <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><path d="M11.5 4.5 6 10l5.5 5.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      Volver al screener
    </a>

    <header class="co-head">
      <div class="co-logo">${initials(c)}</div>
      <div class="co-head-main">
        <h1>${esc(c.name)}</h1>
        <div class="meta">
          <span>${esc(c.t)}</span>
          ${c.exchange ? `<span class="dot">·</span><span>${esc(c.exchange)}</span>` : ''}
          ${c.country ? `<span class="dot">·</span><span>${esc(c.country)}</span>` : ''}
          ${c.sector ? `<span class="dot">·</span><span class="pill sector">${esc(c.sector)}</span>` : ''}
          ${analysis ? `<span class="pill ${c.moatRating.toLowerCase()}">MOAT ${c.moatRating === 'Wide' ? 'amplio' : c.moatRating === 'Narrow' ? 'estrecho' : 'nulo'}</span>` : ''}
        </div>
      </div>
      <div class="co-price">
        <strong>${c.price !== null && c.price !== undefined ? `${num(c.price, 2)} ${esc(c.currency)}` : 'Sin cotización'}</strong>
        <small>Capitalización ${cap(c.cap)}</small>
        <div style="margin-top:.5rem">
          <button class="btn btn-sm" data-action="watch" data-t="${esc(c.t)}" aria-pressed="${inWatch}">
            ${inWatch ? '★ En seguimiento' : '☆ Añadir a seguimiento'}
          </button>
          ${BY.has(c.t) ? `<a class="btn btn-sm btn-ghost" href="#/comparar/${encodeURIComponent(c.t)}">Comparar</a>` : ''}
        </div>
      </div>
      <div class="scoreblock">
        ${ring(total.score)}
        <div class="band-label" style="color:var(--${b.tone === 'great' ? 'great' : b.tone === 'good' ? 'good' : b.tone === 'warn' ? 'warn' : 'bad'})">
          ${b.label}<small style="color:var(--dim)">${b.desc}</small>
          <small class="score-src">${sourceText}</small>
        </div>
      </div>
    </header>

    <div class="metric-grid">
      ${metricCard('Crec. ingresos 5a', metric(m.revCagr, (v) => pct(v)))}
      ${metricCard('Margen bruto', metric(m.grossMargin, (v) => pct(v)))}
      ${metricCard('ROIC', metric(m.roic, (v) => pct(v)), m.roic !== null && m.roic !== undefined && m.roic >= 15 ? 'pos' : '')}
      ${metricCard(
        'Deuda neta / EBITDA',
        metric(m.netDebtEbitda, (v) => mult(v)),
        m.netDebtEbitda === null || m.netDebtEbitda === undefined ? '' : m.netDebtEbitda < 2 ? 'pos' : m.netDebtEbitda > 3 ? 'neg' : ''
      )}
      ${metricCard('PER', metric(m.per, (v) => mult(v)))}
      ${metricCard('FCF yield', metric(m.fcfYield, (v) => pct(v)))}
    </div>
    ${analysis ? `<p class="note-hint" style="margin:-.5rem 0 1rem">Métricas de EODHD con las cuentas hasta ${esc(analysis.asOf)} (${analysis.years} ejercicios).</p>` : ''}

    <div class="detail-grid">
      <div class="detail-main">
        ${companyProfileCard(c)}

        <section>
          <div class="panel-title" style="padding:0 .2rem">Análisis de los 8 factores <span>${FRAMEWORK.reduce((a, f) => a + f.weight, 0)}% ponderado</span></div>
          <div class="analysis-bar">
            <div>
              <span class="analysis-status">${analysisStatus}</span>
              <span class="analysis-error" id="analysisError">${esc(analysisErrorFor(c))}</span>
            </div>
            <button class="btn btn-sm" data-action="analyse" data-t="${esc(c.t)}">${analysis ? 'Recalcular' : 'Calcular con EODHD'}</button>
          </div>
          ${FRAMEWORK.map((f, i) => factorCard(c, f, i, openIndex)).join('')}
        </section>
      </div>

      <aside class="detail-aside">
        <section class="card radar-card">
          <div class="panel-title">Perfil de calidad</div>
          <div class="radar-wrap">${radar(values)}</div>
          <p class="note-hint" style="margin-top:.5rem">${analysis ? 'Notas automáticas de EODHD con tus sobrescrituras aplicadas.' : c.remote ? 'Cada eje va de 0 a 10. Sin análisis todavía, todos parten de 5.' : 'Cada eje va de 0 a 10. Las notas son de demostración.'}</p>
        </section>

        <section class="card">
          <div class="panel-title">Checklist de estudio <span>${Object.values(watched).filter(Boolean).length}/8</span></div>
          <ul class="checklist">
            ${FRAMEWORK.map((f, i) => `<li><label>
              <input type="checkbox" data-check="${esc(c.t)}:${i}"${watched[i] ? ' checked' : ''}/>
              <span>${f.id}. ${esc(f.name.split('(')[0].trim())}</span>
            </label></li>`).join('')}
          </ul>
          <p class="note-hint">Se guarda en este dispositivo. Marca un factor cuando hayas verificado sus números con las cuentas de la empresa.</p>
        </section>

        <section class="card">
          <div class="panel-title">Notas del analista</div>
          <textarea class="note" data-note="${esc(c.t)}" placeholder="Qué te convence, qué no, a qué precio te interesaría, qué evidencia invalidaría la tesis…">${esc(state.notes[c.t] || '')}</textarea>
          <p class="note-hint">Guardado automáticamente en este dispositivo.</p>
        </section>

        <section class="card">
          <div class="panel-title">Noticias relacionadas</div>
          ${news.length ? `<div class="news-list">${news.map(newsItem).join('')}</div>`
            : `<p style="color:var(--dim);font-size:.84rem">No hay titulares de demostración para esta empresa. <a href="#/noticias" style="color:var(--accent)">Ver todo el screener de noticias</a>.</p>`}
        </section>

        <section class="card" id="liveSlot">
          <div class="panel-title">Datos de mercado <span id="liveSource">fuente</span></div>
          <p style="font-size:.82rem;color:var(--muted)">Cotización y perfil desde el proxy del servidor; con token de EODHD, también titulares. La clave del proveedor nunca llega al navegador.</p>
          <button class="btn btn-sm" style="margin-top:.6rem" data-action="live" data-t="${esc(c.t)}">Cargar datos reales</button>
          <div id="liveOut" style="margin-top:.7rem"></div>
          <p class="note-hint" id="liveHint">Precio, capitalización y PER de cualquier símbolo de EE. UU. o Europa, sin token.</p>
        </section>

        <section class="card" id="insiderSlot">
          <div class="panel-title">Directivos <span>SEC</span></div>
          <p style="font-size:.82rem;color:var(--muted)">Compras y ventas de directivos de los últimos 12 meses según los Form 4 de la SEC. Gratis, sin token y solo para empresas de EE. UU.</p>
          ${usListed
            ? `<button class="btn btn-sm" style="margin-top:.6rem" data-action="insiders" data-t="${esc(c.t)}">Cargar movimientos</button>`
            : `<p style="font-size:.82rem;color:var(--muted);margin-top:.5rem">Este valor no presenta Form 4: los movimientos de directivos solo se publican en EE. UU.</p>`}
          <div id="insiderOut" style="margin-top:.7rem"></div>
        </section>
      </aside>
    </div>
  `;

  if (c.remote) {
    if (!analysis && !state.analysisTried.has(c.t)) loadRemoteCompany(c.t);
    return;
  }
  if (!analysis && !state.analysisTried.has(c.t)) {
    state.analysisTried.add(c.t);
    maybeAnalyse(c.t);
  }
}

function companyProfileCard(c) {
  if (!c.remote) {
    return `<section class="card">
      <h3>Tesis de inversión</h3>
      <p>${esc(c.thesis)}</p>
      <div class="grid2" style="margin-top:1rem">
        <div>
          <h4 style="margin-top:0">Riesgos principales</h4>
          <ul class="prose-list">${c.risks.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
        </div>
        <div>
          <h4 style="margin-top:0">Catalizadores</h4>
          <ul class="prose-list">${c.catalysts.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
        </div>
      </div>
    </section>`;
  }
  return `<section class="card">
    <h3>Perfil de la empresa</h3>
    ${c.description
      ? `<p>${esc(c.description)}</p>`
      : `<p style="color:var(--muted)">EODHD todavía no devuelve la descripción de este valor.</p>`}
    <p class="note-hint">Perfil, cuentas y cotización de EODHD. Esta ficha llega desde el buscador de símbolos, así que no incluye la tesis, los riesgos ni los catalizadores editoriales de las 24 empresas de demostración: esos apartados son juicio del analista y puedes escribirlos en «Notas del analista».</p>
  </section>`;
}

/* ---------- comparador ---------- */
const CMP_METRICS = [
  { key: 'revCagr', label: 'Crecimiento ingresos 5a', better: 'high' },
  { key: 'grossMargin', label: 'Margen bruto', better: 'high' },
  { key: 'opMargin', label: 'Margen operativo', better: 'high' },
  { key: 'roic', label: 'ROIC', better: 'high' },
  { key: 'roe', label: 'ROE', better: 'high' },
  { key: 'netDebtEbitda', label: 'Deuda neta / EBITDA', better: 'low' },
  { key: 'intCover', label: 'Cobertura de intereses', better: 'high' },
  { key: 'per', label: 'PER', better: 'low' },
  { key: 'evebitda', label: 'EV / EBITDA', better: 'low' },
  { key: 'fcfYield', label: 'FCF yield', better: 'high' },
  { key: 'divYield', label: 'Dividendo', better: 'high' },
  { key: 'cap', label: 'Capitalización', better: 'none' }
];

const ZERO_IS_MISSING = new Set(['grossMargin', 'roic', 'evebitda', 'fcfYield', 'intCover', 'netDebtEbitda']);

function metricValue(c, key) {
  if (key === 'cap') return c.cap;
  const v = c.metrics[key];
  if (v === null || v === undefined) return null;
  if (v === 0 && ZERO_IS_MISSING.has(key)) return null;
  return v;
}

function fmtMetric(key, v) {
  if (v === null) return '—';
  if (key === 'cap') return cap(v);
  if (key === 'per' || key === 'evebitda' || key === 'netDebtEbitda') return mult(v);
  if (key === 'intCover') return mult(v, 0);
  return pct(v);
}

function betterSide(a, b, better) {
  if (a === null || b === null || better === 'none' || a === b) return null;
  if (better === 'high') return a > b ? 'A' : 'B';
  return a < b ? 'A' : 'B';
}

function radarDual(a, b) {
  const n = 8, cx = 190, cy = 150, R = 88;
  const pt = (i, r) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [cx + Math.cos(ang) * r, cy + Math.sin(ang) * r];
  };
  const rings = [0.25, 0.5, 0.75, 1].map((f) => {
    const pts = a.map((_, i) => pt(i, R * f).map((v) => v.toFixed(1)).join(',')).join(' ');
    return `<polygon points="${pts}" fill="none" stroke="#22303f" stroke-width="1"/>`;
  }).join('');
  const axes = a.map((_, i) => {
    const [x, y] = pt(i, R);
    return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#1b2735" stroke-width="1"/>`;
  }).join('');
  const shape = (scores, color, fill) => {
    const pts = scores.map((s, i) => pt(i, (R * Math.max(0.6, s)) / 10).map((v) => v.toFixed(1)).join(',')).join(' ');
    return `<polygon points="${pts}" fill="${fill}" stroke="${color}" stroke-width="1.8" stroke-linejoin="round"/>`;
  };
  const labels = SHORT.map((label, i) => {
    const [x, y] = pt(i, R + 18);
    const anchor = Math.abs(x - cx) < 14 ? 'middle' : x > cx ? 'start' : 'end';
    return `<text x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="${anchor}" font-size="10.5"
      fill="#8fa0b5" font-family="system-ui, sans-serif">${label}</text>`;
  }).join('');
  return `<svg viewBox="0 0 380 300" width="100%" role="img" aria-label="Comparación de los 8 factores">
    ${rings}${axes}${shape(b, '#e2bd7d', 'rgba(226,189,125,.13)')}${shape(a, '#5eead4', 'rgba(94,234,212,.15)')}${labels}</svg>`;
}

function cmpSelect(id, selected) {
  return `<select id="${id}" aria-label="Elegir empresa para comparar">${
    ['US', 'EU'].map((r) => `<optgroup label="${REGION_LABEL[r]}">` +
      DATA.filter((c) => c.region === r)
        .map((c) => `<option value="${esc(c.t)}"${c.t === selected ? ' selected' : ''}>${esc(c.name)} · ${esc(c.t)}</option>`)
        .join('') + '</optgroup>').join('')}</select>`;
}

function cmpHeader(c, label, selectId) {
  const b = band(c.score);
  const color = b.tone === 'great' ? 'var(--great)' : b.tone === 'good' ? 'var(--good)' : b.tone === 'warn' ? 'var(--warn)' : 'var(--bad)';
  return `<div class="cmp-company">
    <div class="cmp-col-label">${label === 'A' ? 'Empresa A' : 'Empresa B'}</div>
    ${cmpSelect(selectId, c.t)}
    <div class="cmp-id">
      <div class="co-avatar">${initials(c)}</div>
      <div><strong>${esc(c.name)}</strong><span>${esc(c.t)} · ${REGION_LABEL[c.region]} · ${esc(c.sector)}</span></div>
      ${ring(c.score, 68)}
    </div>
    <div class="cmp-band" style="color:${color}">${b.label}<small>${esc(b.desc)}</small></div>
    <a class="btn btn-sm" href="#/empresa/${encodeURIComponent(c.t)}">Ver ficha completa</a>
  </div>`;
}

function renderCompare(aT, bT) {
  let A = BY.get(aT);
  if (!A) A = DATA[0];
  let B = BY.get(bT);
  if (!B || B.t === A.t) {
    const pool = DATA.filter((c) => c.t !== A.t);
    B = pool.find((c) => c.score <= A.score) || pool[0];
  }

  const valuesA = effectiveValues(A);
  const valuesB = effectiveValues(B);
  const winsA = FRAMEWORK.reduce((n, f, i) => n + (valuesA[i] > valuesB[i] ? 1 : 0), 0);
  const winsB = FRAMEWORK.reduce((n, f, i) => n + (valuesB[i] > valuesA[i] ? 1 : 0), 0);
  const leader = A.score === B.score ? null : A.score > B.score ? A : B;
  const other = leader ? (leader.t === A.t ? B : A) : null;
  const gap = Math.abs(A.score - B.score);
  const deltas = FRAMEWORK.map((f, i) => ({ name: f.name.split('(')[0].trim(), d: valuesA[i] - valuesB[i] }));
  const big = [...deltas].sort((x, y) => Math.abs(y.d) - Math.abs(x.d))[0];

  const factorRows = FRAMEWORK.map((f, i) => {
    const a = valuesA[i], b = valuesB[i];
    const w = a > b ? 'A' : b > a ? 'B' : null;
    return `<tr>
      <td><span class="cmp-factor"><b>${f.id}</b>${esc(f.name.split('(')[0].trim())}<small>${f.weight}%</small></span></td>
      <td class="num ${w === 'A' ? 'win' : w === 'B' ? 'lose' : ''}">
        <span class="cmp-score">${a.toFixed(1)}</span>
        <span class="bar ${tone(a)}"><span style="width:${a * 10}%"></span></span>
      </td>
      <td class="num ${w === 'B' ? 'win' : w === 'A' ? 'lose' : ''}">
        <span class="cmp-score">${b.toFixed(1)}</span>
        <span class="bar ${tone(b)}"><span style="width:${b * 10}%"></span></span>
      </td>
      <td class="advantage">${w === 'A' ? esc(A.t) : w === 'B' ? esc(B.t) : 'Empate'}</td>
    </tr>`;
  }).join('');

  const metricRows = CMP_METRICS.map((m) => {
    const a = metricValue(A, m.key);
    const b = metricValue(B, m.key);
    const w = betterSide(a, b, m.better);
    return `<tr>
      <td>${esc(m.label)}</td>
      <td class="num ${w === 'A' ? 'win' : w === 'B' ? 'lose' : ''}">${fmtMetric(m.key, a)}</td>
      <td class="num ${w === 'B' ? 'win' : w === 'A' ? 'lose' : ''}">${fmtMetric(m.key, b)}</td>
    </tr>`;
  }).join('');

  view.innerHTML = `
    <div class="page-head">
      <p class="eyebrow">Duelo de candidatas</p>
      <h1>Comparador</h1>
      <p>Dos empresas lado a lado con la misma escala: los 8 factores ponderados, las métricas clave y una lectura rápida de quién gana en cada punto.</p>
    </div>

    <div class="cmp-pickers">
      ${cmpHeader(A, 'A', 'cmpA')}
      ${cmpHeader(B, 'B', 'cmpB')}
    </div>

    <div class="cmp-grid">
      <section class="panel">
        <div class="panel-title">Perfil de calidad <span>${esc(A.t)} vs ${esc(B.t)}</span></div>
        <div class="radar-wrap">${radarDual(A.scores, B.scores)}</div>
        <div class="cmp-legend">
          <span><i style="background:#5eead4"></i>${esc(A.name)}</span>
          <span><i style="background:#e2bd7d"></i>${esc(B.name)}</span>
        </div>
      </section>

      <section class="panel">
        <div class="panel-title">Veredicto <button class="btn btn-sm btn-ghost" data-action="swap-cmp" data-a="${esc(A.t)}" data-b="${esc(B.t)}">⇄ Intercambiar</button></div>
        ${leader ? `
          <p class="verdict-lead"><strong>${esc(leader.name)}</strong> obtiene <strong>${leader.score.toFixed(1)}</strong> frente a <strong>${other.score.toFixed(1)}</strong> de ${esc(other.name)}: <strong>${gap.toFixed(1)} puntos</strong> de diferencia.</p>
          <p class="verdict-line">Gana en <strong>${leader.t === A.t ? winsA : winsB} de 8</strong> factores; ${esc(other.t)} se impone en ${leader.t === A.t ? winsB : winsA}${winsA + winsB < 8 ? ` (${8 - winsA - winsB} empate${8 - winsA - winsB === 1 ? '' : 's'})` : ''}.</p>
          <p class="verdict-line">La brecha más grande está en <strong>${esc(big.name.toLowerCase())}</strong>: ${Math.abs(big.d).toFixed(1)} puntos a favor de ${esc(big.d > 0 ? A.t : B.t)}.</p>
          ${gap < 3 ? `<p class="notice" style="margin-top:.8rem">Diferencia menor de 3 puntos: con esta calidad tan parecida, la decisión debería depender sobre todo de la <strong>valoración</strong> y de tu tesis, no del ranking.</p>` : ''}
        ` : `<p class="verdict-lead">Ambas empresas empatan con <strong>${A.score.toFixed(1)}</strong> puntos. Mira las métricas y la valoración para desempatar.</p>`}
        <dl class="cmp-mini">
          <div><dt>Factores ganados por ${esc(A.t)}</dt><dd>${winsA}</dd></div>
          <div><dt>Factores ganados por ${esc(B.t)}</dt><dd>${winsB}</dd></div>
          <div><dt>Diferencia de calidad</dt><dd>${gap.toFixed(1)} pts</dd></div>
        </dl>
      </section>
    </div>

    <section class="panel" style="margin-top:1rem">
      <div class="panel-title">Los 8 factores <span>${esc(A.t)} · ${esc(B.t)}</span></div>
      <div style="overflow-x:auto">
        <table class="cmp-table">
          <thead><tr><th>Factor</th><th class="num">${esc(A.t)}</th><th class="num">${esc(B.t)}</th><th>Ventaja</th></tr></thead>
          <tbody>${factorRows}</tbody>
        </table>
      </div>
    </section>

    <section class="panel" style="margin-top:1rem">
      <div class="panel-title">Métricas clave <span>mejor valor marcado en verde</span></div>
      <div style="overflow-x:auto">
        <table class="cmp-table">
          <thead><tr><th>Métrica</th><th class="num">${esc(A.t)}</th><th class="num">${esc(B.t)}</th></tr></thead>
          <tbody>${metricRows}</tbody>
        </table>
      </div>
      <p class="note-hint" style="margin-top:.7rem">Datos de demostración. En la deuda y en los múltiplos, cuanto más bajo mejor; en el resto, más alto es mejor. Los valores no disponibles no cuentan como victoria.</p>
    </section>
  `;

  const go = (a, b) => { location.hash = `#/comparar/${encodeURIComponent(a)}/${encodeURIComponent(b)}`; };
  document.getElementById('cmpA').addEventListener('change', (e) => {
    const next = e.target.value;
    go(next, next === B.t ? A.t : B.t);
  });
  document.getElementById('cmpB').addEventListener('change', (e) => {
    const next = e.target.value;
    go(next === A.t ? B.t : A.t, next);
  });
}

/* ---------- noticias ---------- */
function filteredNews() {
  const q = state.news.q.trim().toLowerCase();
  return byDate.filter((n) => {
    const c = BY.get(n.t);
    if (state.news.watchOnly && !state.watchlist.has(n.t)) return false;
    if (state.news.region !== 'all' && c && c.region !== state.news.region) return false;
    if (state.news.category !== 'all' && n.category !== state.news.category) return false;
    if (state.news.sentiment !== 'all' && n.sentiment !== state.news.sentiment) return false;
    if (state.news.impact !== 'all' && n.impact !== state.news.impact) return false;
    if (q) {
      const hay = `${n.headline} ${n.summary} ${n.t} ${n.category} ${c ? c.name + ' ' + c.sector : ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function newsStats(list) {
  return `<dl class="stats">
    ${statCard('Titulares', list.length, 'filtrados')}
    ${statCard('Positivos', list.filter((n) => n.sentiment === 'positiva').length, '')}
    ${statCard('Negativos', list.filter((n) => n.sentiment === 'negativa').length, '')}
    ${statCard('Alto impacto', list.filter((n) => n.impact === 'Alto').length, '')}
  </dl>`;
}

function renderNews() {
  const list = filteredNews();
  view.innerHTML = `
    <div class="page-head">
      <p class="eyebrow">Screener de noticias</p>
      <h1>Qué está pasando en tus empresas</h1>
      <p>Filtra los titulares por mercado, sector, tipo de evento, impacto y sentimiento. Cada noticia enlaza a la ficha de la empresa para contrastarla con los números.</p>
    </div>

    <div id="newsStats">${newsStats(list)}</div>

    <div class="toolbar">
      <div class="toolbar-row">
        <label class="search">
          <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="m13.2 13.2 3.6 3.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          <input id="nq" type="search" placeholder="Buscar titular, empresa o tema…" value="${esc(state.news.q)}" autocomplete="off"/>
        </label>
        <div class="seg" role="group" aria-label="Mercado">
          ${[['all', 'Todos'], ['US', 'EE. UU.'], ['EU', 'Europa']].map(([v, l]) =>
            `<button type="button" data-nregion="${v}" aria-pressed="${state.news.region === v}">${l}</button>`).join('')}
        </div>
        <label class="field" style="margin-left:auto">
          <input type="checkbox" id="watchOnly"${state.news.watchOnly ? ' checked' : ''} style="accent-color:var(--accent)"/>
          Solo seguimiento
        </label>
      </div>
      <div class="toolbar-row">
        <label class="field">Categoría
          <select id="ncat">
            <option value="all">Todas</option>
            ${CATEGORIES.map((s) => `<option value="${s}"${state.news.category === s ? ' selected' : ''}>${s}</option>`).join('')}
          </select>
        </label>
        <label class="field">Sentimiento
          <select id="nsent">
            <option value="all">Todos</option>
            <option value="positiva"${state.news.sentiment === 'positiva' ? ' selected' : ''}>Positiva</option>
            <option value="neutral"${state.news.sentiment === 'neutral' ? ' selected' : ''}>Neutral</option>
            <option value="negativa"${state.news.sentiment === 'negativa' ? ' selected' : ''}>Negativa</option>
          </select>
        </label>
        <label class="field">Impacto
          <select id="nimp">
            <option value="all">Todos</option>
            <option value="Alto"${state.news.impact === 'Alto' ? ' selected' : ''}>Alto</option>
            <option value="Medio"${state.news.impact === 'Medio' ? ' selected' : ''}>Medio</option>
            <option value="Bajo"${state.news.impact === 'Bajo' ? ' selected' : ''}>Bajo</option>
          </select>
        </label>
      </div>
    </div>

    <div id="newsResults"></div>
  `;

  const renderList = () => {
    const l = filteredNews();
    document.getElementById('newsStats').innerHTML = newsStats(l);
    document.getElementById('newsResults').innerHTML = l.length
      ? `<p class="results-meta" style="margin-bottom:.6rem"><span>${l.length} titulares</span><span>Más recientes primero</span></p>
         <div class="news-list">${l.map(newsItem).join('')}</div>`
      : `<div class="empty"><strong>Ningún titular con esos filtros</strong>Prueba con otro mercado, categoría o desactiva "solo seguimiento".</div>`;
  };
  renderList();

  const nq = document.getElementById('nq');
  nq.addEventListener('input', () => { state.news.q = nq.value; renderList(); });
  view.querySelectorAll('[data-nregion]').forEach((b) => b.addEventListener('click', () => {
    state.news.region = b.dataset.nregion; renderList();
    view.querySelectorAll('[data-nregion]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.nregion === state.news.region)));
  }));
  document.getElementById('ncat').addEventListener('change', (e) => { state.news.category = e.target.value; renderList(); });
  document.getElementById('nsent').addEventListener('change', (e) => { state.news.sentiment = e.target.value; renderList(); });
  document.getElementById('nimp').addEventListener('change', (e) => { state.news.impact = e.target.value; renderList(); });
  document.getElementById('watchOnly').addEventListener('change', (e) => { state.news.watchOnly = e.target.checked; renderList(); });
}

/* ---------- copia de seguridad ---------- */
const BACKUP_AT = 'backupAt';

function backupData() {
  return {
    watchlist: [...state.watchlist],
    notes: state.notes,
    checks: state.checks,
    newsRead: [...state.newsRead],
    auto: state.auto,
    overrides: state.overrides,
    remote: state.profiles
  };
}

const backupSummary = (entries) => entries.map((entry) => `${entry.label}: ${entry.count}`).join(' · ');

function setBackupStatus(message, isError = false) {
  const el = document.getElementById('backupStatus');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('error', isError);
}

function exportBackup() {
  const payload = buildBackup(backupData());
  const text = JSON.stringify(payload, null, 2);
  const name = `moat-copia-${payload.exportedAt.slice(0, 10)}.json`;
  const urlApi = window.URL;
  try {
    const url = urlApi.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    const timer = setTimeout(() => {
      if (typeof urlApi.revokeObjectURL === 'function') urlApi.revokeObjectURL(url);
    }, 1000);
    if (timer && typeof timer.unref === 'function') timer.unref();
  } catch {
    setBackupStatus('Este navegador no permite descargar el archivo; abre la app en el navegador para exportar.', true);
    return;
  }
  store.set(BACKUP_AT, payload.exportedAt);
  const message = `Copia exportada: ${name}. ${backupSummary(describeBackup(payload))}.`;
  renderWatchlist();
  setBackupStatus(message);
}

async function importBackup(file) {
  let text;
  try {
    text = typeof file.text === 'function'
      ? await file.text()
      : await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsText(file);
        });
  } catch {
    setBackupStatus('No se pudo leer el archivo.', true);
    return;
  }

  const parsed = parseBackup(text);
  if (!parsed.ok) {
    setBackupStatus(parsed.error, true);
    return;
  }

  applyBackup(parsed);
  renderWatchlist();
  setBackupStatus(`Copia importada. ${backupSummary(describeBackup(parsed))}.`);
}

/** Aplica una copia ya validada al estado y al almacenamiento del dispositivo. */
function applyBackup(parsed) {
  for (const key of parsed.keys) {
    const value = parsed.data[key];
    if (key === 'watchlist') {
      state.watchlist = new Set(value);
      store.set('watchlist', [...state.watchlist]);
      updateWatchBadge();
    } else if (key === 'newsRead') {
      state.newsRead = new Set(value);
      store.set('newsRead', [...state.newsRead]);
    } else if (key === 'remote') {
      state.profiles = value;
      store.set('remote', value);
    } else if (key === 'auto') {
      state.auto = value;
      store.set('auto', value);
    } else if (key === 'overrides') {
      state.overrides = value;
      store.set('overrides', value);
    } else if (key === 'notes') {
      state.notes = value;
      store.set('notes', value);
    } else if (key === 'checks') {
      state.checks = value;
      store.set('checks', value);
    }
  }
  recomputeScores();
}

const BACKUP_CODE_KEY = 'backupCode';

async function saveRemoteBackup() {
  const payload = buildBackup(backupData());
  const code = normalizeBackupCode(store.get(BACKUP_CODE_KEY, null));
  try {
    const saved = await api(`/api/backup${code ? `?code=${encodeURIComponent(code)}` : ''}`, { method: 'POST', body: payload });
    store.set(BACKUP_CODE_KEY, saved.code);
    renderWatchlist();
    setBackupStatus(`Copia guardada en el servidor con el código ${saved.code}. ${backupSummary(describeBackup(payload))}.`);
  } catch (error) {
    setBackupStatus(error.message || 'No se pudo guardar la copia en el servidor.', true);
  }
}

async function loadRemoteBackup() {
  const input = document.getElementById('backupCode');
  const code = normalizeBackupCode(input ? input.value : '');
  if (!code) {
    setBackupStatus('Escribe el código de 8 caracteres de la copia (por ejemplo ABCD-EFGH).', true);
    return;
  }
  try {
    const remote = await api(`/api/backup?code=${encodeURIComponent(code)}`);
    const parsed = parseBackup(JSON.stringify(remote));
    if (!parsed.ok) {
      setBackupStatus(parsed.error, true);
      return;
    }
    applyBackup(parsed);
    store.set(BACKUP_CODE_KEY, code);
    renderWatchlist();
    setBackupStatus(`Copia recuperada del servidor (${code}). ${backupSummary(describeBackup(parsed))}.`);
  } catch (error) {
    setBackupStatus(error.message || 'No se pudo recuperar la copia del servidor.', true);
  }
}

/* ---------- seguimiento ---------- */
function renderWatchlist() {
  const list = [
    ...DATA.filter((c) => state.watchlist.has(c.t)),
    ...[...state.watchlist].filter((t) => !BY.has(t)).map((t) => remoteCompany(t))
  ];
  const lastExport = store.get(BACKUP_AT, null);
  const remoteCode = normalizeBackupCode(store.get(BACKUP_CODE_KEY, null));
  const backupMeta = `Ahora mismo — ${backupSummary(describeBackup(backupData()))}. ${
    lastExport ? `Última copia: ${new Date(lastExport).toLocaleString('es-ES')}.` : 'Todavía no has exportado ninguna copia.'
  }`;
  const remoteNote = remoteCode
    ? `Última copia en el servidor: ${remoteCode}. Vuelve a guardar para actualizarla.`
    : 'Todavía no has guardado ninguna copia en el servidor.';

  view.innerHTML = `
    <div class="page-head">
      <p class="eyebrow">Tu lista</p>
      <h1>Seguimiento</h1>
      <p>Las empresas que has marcado, con su puntuación actual y el estado de tu estudio. Las notas y checklists se guardan en este dispositivo.</p>
    </div>
    ${list.length ? `<div class="wl-grid">${list.map((c) => {
      const done = Object.values(state.checks[c.t] || {}).filter(Boolean).length;
      const note = (state.notes[c.t] || '').trim();
      const auto = analysisFor(c);
      const wm = (auto && auto.inputs) || c.metrics;
      return `<a class="wl-card" href="#/empresa/${encodeURIComponent(c.t)}">
        <div class="wl-top">
          <div class="co-avatar">${initials(c)}</div>
          <div>
            <div style="font-weight:600;font-size:.86rem">${esc(c.t)}</div>
            <div class="meta">${esc(c.sector)}</div>
          </div>
          <span class="score-num">${companyTotal(c).score.toFixed(1)}</span>
        </div>
        <h3>${esc(c.name)}</h3>
        <div class="meta">${REGION_LABEL[c.region]} · ${esc(c.country)} · MOAT ${c.moatRating === 'Wide' ? 'amplio' : 'estrecho'}</div>
        ${note ? `<p class="wl-note">${esc(note)}</p>` : ''}
        <div class="wl-foot">
          <span style="color:${done === 8 ? 'var(--great)' : 'var(--dim)'}">Estudio ${done}/8 factores</span>
          <span style="color:var(--dim)">${pct(wm.revCagr)} crec. · ${wm.per ? mult(wm.per) + ' PER' : '—'}</span>
        </div>
      </a>`;
    }).join('')}</div>`
      : `<div class="empty"><strong>Tu lista está vacía</strong>
          Pulsa la estrella en el <a href="#/screener" style="color:var(--accent)">screener</a> para guardar una empresa y seguir su análisis aquí.</div>`}

    <section class="card" style="margin-top:1.6rem">
      <h3>Copia de seguridad</h3>
      <p>Las notas, sobrescrituras, perfiles, checklists y el seguimiento viven solo en este navegador. Exporta un JSON para guardarlo o llevarlo a otro dispositivo: al importar se sustituyen únicamente las secciones que incluya el archivo.</p>
      <p class="meta" style="margin-top:.6rem">${esc(backupMeta)}</p>
      <div class="toolbar-row" style="margin-top:.8rem">
        <button class="btn btn-primary" type="button" data-action="export-backup">Exportar JSON</button>
        <button class="btn" type="button" data-action="import-backup">Importar JSON</button>
        <input id="backupFile" type="file" accept="application/json,.json" hidden />
      </div>
      <h4 style="margin-top:1.2rem">Copia en el servidor</h4>
      <p>Guarda la misma copia en el proxy con un código corto y recupérala en otro dispositivo. Cualquiera que tenga el código puede leerla: trátalo como una contraseña.</p>
      <div class="toolbar-row" style="margin-top:.8rem">
        <button class="btn" type="button" data-action="save-remote-backup">Guardar en el servidor</button>
        <label class="field" for="backupCode">Código
          <input id="backupCode" class="backup-code" type="text" inputmode="latin" autocomplete="off" spellcheck="false" placeholder="ABCD-EFGH" maxlength="9" value="${esc(remoteCode || '')}" />
        </label>
        <button class="btn" type="button" data-action="load-remote-backup">Recuperar</button>
      </div>
      <p class="meta" style="margin-top:.5rem">${esc(remoteNote)}</p>
      <p class="backup-status" id="backupStatus" role="status" aria-live="polite"></p>
    </section>
  `;

  const importButton = view.querySelector('[data-action="import-backup"]');
  const fileInput = document.getElementById('backupFile');
  if (importButton && fileInput) {
    importButton.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (file) importBackup(file);
      fileInput.value = '';
    });
  }
}

/* ---------- marco ---------- */
function renderFramework() {
  const total = FRAMEWORK.reduce((a, f) => a + f.weight, 0);
  view.innerHTML = `
    <div class="page-head">
      <p class="eyebrow">Método</p>
      <h1>Los 8 factores para analizar una empresa</h1>
      <p>El mismo marco se aplica a cada empresa del screener. El peso indica cuánto influye cada factor en la puntuación final: primero el negocio, luego los números y al final el precio y el momento.</p>
    </div>

    <dl class="stats">
      ${statCard('Factores', '8', 'de 0 a 10 cada uno')}
      ${statCard('Peso del MOAT', FRAMEWORK[0].weight + '%', 'el factor decisivo')}
      ${statCard('Peso de los números', FRAMEWORK.slice(1, 5).reduce((a, f) => a + f.weight, 0) + '%', 'dirección, crecimiento, rentabilidad, balance')}
      ${statCard('Peso de precio y riesgo', FRAMEWORK.slice(5).reduce((a, f) => a + f.weight, 0) + '%', 'valoración, riesgo, catalizadores')}
    </dl>

    <div class="fw-list">
      ${FRAMEWORK.map((f) => `<details class="fw-item"${f.id === 1 ? ' open' : ''}>
        <summary>
          <span class="fw-num">${f.id}</span>
          <span class="fw-title">${esc(f.name)}<small>${esc(f.subtitle)}</small></span>
          <span class="fw-weight">${f.weight}%</span>
        </summary>
        <div class="fw-body">
          <div class="fw-weight-bar">Peso <div class="bar"><span style="width:${(f.weight / total) * 100 * 3}%"></span></div></div>
          <p style="font-size:.87rem;color:var(--muted)">${esc(f.desc)}</p>

          <h4 style="font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:var(--dim);margin:1rem 0 .4rem">Preguntas clave</h4>
          <ul class="bullets">${f.questions.map((q) => `<li>${esc(q)}</li>`).join('')}</ul>

          <div class="grid2" style="margin-top:1rem">
            <div class="flag green"><h5>Señales verdes</h5><ul>${f.green.map((g) => `<li>${esc(g)}</li>`).join('')}</ul></div>
            <div class="flag red"><h5>Señales rojas</h5><ul>${f.red.map((g) => `<li>${esc(g)}</li>`).join('')}</ul></div>
          </div>

          <h4 style="font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:var(--dim);margin:1rem 0 .4rem">Métricas a revisar</h4>
          <div class="chips">${f.metrics.map((m) => `<span class="tag">${esc(m)}</span>`).join('')}</div>
        </div>
      </details>`).join('')}
    </div>

    <section class="card" style="margin-top:1.6rem">
      <h3>Tipos de ventaja competitiva</h3>
      <p>Un moat es algo que protege los beneficios de la competencia. Si no identificas al menos uno con claridad, probablemente no exista.</p>
      <div class="chips" style="margin-top:.7rem">${MOAT_TYPES.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
    </section>

    <section class="card" style="margin-top:1rem">
      <h3>Cómo se puntúa</h3>
      <div class="scale-list">
        ${SCALE.map((s) => `<div class="scale-row">
          <span class="pill ${s.tone === 'great' ? 'wide' : s.tone === 'good' ? 'us' : s.tone === 'warn' ? 'narrow' : 'none'}">${s.label}</span>
          <span style="font-family:var(--mono);color:var(--muted)">${s.min}+</span>
          <p style="color:var(--muted)">${esc(s.desc)}</p>
        </div>`).join('')}
      </div>
    </section>

    <section style="margin-top:1.6rem">
      <div class="panel-title" style="padding:0 .2rem">Proceso de análisis en 6 pasos</div>
      <ol class="timeline">
        ${PROCESS.map((p) => `<li>
          <span class="step-num">${p.step}</span>
          <div><strong>${esc(p.title)}</strong><p>${esc(p.desc)}</p></div>
        </li>`).join('')}
      </ol>
    </section>

    <div class="notice" style="margin-top:1.4rem">
      <strong>Aviso:</strong> este marco es una guía de estudio, no una recomendación. Las puntuaciones son una ayuda para ordenar el análisis, no una predicción de rentabilidad. Comprueba siempre los datos en las cuentas anuales y en los informes trimestrales de la empresa.
    </div>
  `;
}

/* ---------- datos de mercado (a través del proxy) ---------- */
const API_BASE = window.MOAT_API_BASE || '';
const API_TIMEOUT = 12000;

async function api(path, { method = 'GET', body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT);
  const init = { method, headers: { accept: 'application/json' }, signal: controller.signal };
  if (body !== undefined) {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, init);
  } catch (err) {
    clearTimeout(timer);
    throw new Error(err && err.name === 'AbortError'
      ? 'El servidor de datos tardó demasiado en responder.'
      : 'No se pudo conectar con el servidor de datos. Abre la app con «npm run dev».');
  }
  clearTimeout(timer);

  let resBody = null;
  try {
    resBody = await res.json();
  } catch {
    resBody = null;
  }
  if (!res.ok) {
    const message = resBody && resBody.error && resBody.error.message ? resBody.error.message : `El servidor respondió ${res.status}.`;
    const error = new Error(message);
    error.status = res.status;
    error.code = resBody && resBody.error ? resBody.error.code : 'http_error';
    throw error;
  }
  return resBody;
}

function setStatus(html) {
  const el = document.getElementById('liveStatus');
  if (el) el.innerHTML = html;
}

function renderDataPanel(status = '') {
  const body = document.getElementById('dataBody');
  body.innerHTML = `
    <p style="font-size:.85rem;color:var(--muted)">
      Los datos de mercado se piden a un <strong>proxy propio</strong> (<code>server/index.js</code>). La clave del proveedor
      vive en el servidor y el navegador solo llama a <code>/api/…</code>: nunca se expone en el cliente.
    </p>
    <ol>
      <li>Copia <code>.env.example</code> a <code>.env</code> y pega tu token de EODHD.</li>
      <li>Arranca la app con <code>npm run dev</code> (web y API en el mismo puerto).</li>
      <li>En cada ficha, pulsa «Cargar datos reales».</li>
    </ol>
    <div style="display:flex;gap:.5rem;flex-wrap:wrap">
      <button class="btn btn-primary" type="button" data-action="check-server">Comprobar servidor</button>
    </div>
    <div id="liveStatus">${status}</div>
    <div class="notice">
      <strong>Proveedor: EODHD.</strong> Cubre más de 60 bolsas (NYSE, NASDAQ, LSE, XETRA, Euronext, SIX, BME) con un
      formato de ticker único: <code>AAPL.US</code>, <code>ASML.AS</code>, <code>SAP.DE</code>. Sin token, el servidor usa
      el token público <code>demo</code>, que solo responde para AAPL, AMZN, TSLA y VTI.
    </div>
  `;
}

async function checkServer() {
  setStatus(`<div class="live-status">Consultando el servidor…</div>`);
  try {
    const health = await api('/api/health');
    const mode = health.provider === 'tradingview'
      ? 'fuente gratuita, sin token'
      : health.mode === 'demo'
        ? 'modo demo (token público de EODHD)'
        : 'token propio configurado';
    const extra = health.mode === 'demo' && Array.isArray(health.demoTickers) ? ` · símbolos: ${health.demoTickers.join(', ')}` : '';
    setStatus(`<div class="live-status ok">Servidor operativo · ${esc(health.provider)} · ${esc(mode)}${esc(extra)}</div>`);
  } catch (err) {
    setStatus(`<div class="live-status err">${esc(err.message)} Comprueba que el servidor está arrancado y que abres la app desde su puerto.</div>`);
  }
}

function liveErrorMessage(err) {
  const known = {
    upstream_rate_limit: 'EODHD ha limitado las peticiones. Espera unos minutos o revisa tu plan.',
    upstream_timeout: 'EODHD tardó demasiado en responder. Reintenta en unos segundos.',
    upstream_unreachable: 'El servidor no pudo contactar con EODHD. Revisa su conexión a internet.',
    no_quote: 'EODHD no devuelve cotización para este símbolo con el plan actual. Con el token demo solo funcionan AAPL y AMZN de esta lista.',
    not_found: 'El símbolo no existe en EODHD o no está incluido en tu plan.',
    invalid_symbol: 'El símbolo no tiene un formato válido.',
    rate_limited: 'Demasiadas peticiones desde tu red. Espera un minuto.'
  };
  return known[err.code] || err.message;
}

function timeLabel(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function compactMoney(value) {
  if (!value) return '—';
  return new Intl.NumberFormat('es-ES', { notation: 'compact', maximumFractionDigits: 2 }).format(value);
}

async function loadMarket(ticker) {
  const out = document.getElementById('liveOut');
  const hint = document.getElementById('liveHint');
  if (!out) return;
  out.innerHTML = `<p style="font-size:.8rem;color:var(--dim)">Consultando cotización, perfil y noticias…</p>`;
  if (hint) hint.textContent = '';

  const symbol = providerSymbol(ticker);
  const [quote, fundamentals, news] = await Promise.allSettled([
    api(`/api/quote?symbol=${encodeURIComponent(symbol)}`),
    api(`/api/fundamentals?symbol=${encodeURIComponent(symbol)}`),
    api(`/api/news?symbol=${encodeURIComponent(symbol)}&limit=3`)
  ]);

  if (quote.status === 'rejected') {
    out.innerHTML = `<div class="live-status err">${esc(liveErrorMessage(quote.reason || {}))}</div>`;
    if (hint) hint.textContent = 'El resto de la ficha sigue mostrando los datos de análisis.';
    return;
  }

  const q = quote.value;
  const sourceBadge = document.getElementById('liveSource');
  if (sourceBadge) sourceBadge.textContent = q.source || 'proveedor';
  const f = fundamentals.status === 'fulfilled' ? fundamentals.value : null;
  const items = news.status === 'fulfilled' && news.value && Array.isArray(news.value.items) ? news.value.items : [];
  const currency = (f && f.currency) || 'USD';
  const up = Number(q.changePercent) >= 0;

  const newsHtml = items.length
    ? `<div class="live-news">
        <h4 style="margin:.8rem 0 .2rem;font-size:.66rem;text-transform:uppercase;letter-spacing:.07em;color:var(--dim)">Titulares recientes</h4>
        ${items.map((item) => `<a href="${esc(item.url || '#')}" target="_blank" rel="noopener noreferrer">
          <strong>${esc(item.title)}</strong>
          <span>${esc(item.date || '')}${item.sentiment && item.sentiment !== 'neutral' ? ' · ' + esc(item.sentiment) : ''}</span>
        </a>`).join('')}
      </div>`
    : '';

  out.innerHTML = `<div class="live-panel">
    <div class="live-price">
      <strong>${num(q.price, 2)} <small>${esc(currency)}</small></strong>
      <span class="${up ? 'up' : 'down'}">${up ? '+' : ''}${num(q.change, 2)} (${pct(q.changePercent, 2)})</span>
    </div>
    <dl class="live-metrics">
      ${q.previousClose ? `<div><dt>Cierre anterior</dt><dd>${num(q.previousClose, 2)}</dd></div>` : ''}
      ${q.open ? `<div><dt>Apertura</dt><dd>${num(q.open, 2)}</dd></div>` : ''}
      ${q.high ? `<div><dt>Máximo</dt><dd>${num(q.high, 2)}</dd></div>` : ''}
      ${q.low ? `<div><dt>Mínimo</dt><dd>${num(q.low, 2)}</dd></div>` : ''}
      ${f && f.marketCap ? `<div><dt>Capitalización</dt><dd>${compactMoney(f.marketCap)}</dd></div>` : ''}
      ${f && f.peRatio ? `<div><dt>PER</dt><dd>${mult(f.peRatio)}</dd></div>` : ''}
    </dl>
    ${f && f.name ? `<p class="live-src">${esc(f.name)}${f.sector ? ' · ' + esc(f.sector) : ''}${f.exchange ? ' · ' + esc(f.exchange) : ''}</p>` : ''}
    ${newsHtml}
    <p class="live-src">Fuente: ${esc(q.source || 'EODHD')} · ${q.asOf ? 'datos de ' + esc(timeLabel(q.asOf)) : 'datos de mercado'}${f ? '' : ' · fundamentales no incluidos en el plan'}</p>
  </div>`;

  if (hint) hint.textContent = 'Estos datos son del proveedor; las notas de los 8 factores siguen siendo análisis propio.';
}


/* ---------- directivos (SEC Form 4) ---------- */
function insiderMoney(value) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

/** "2026-10-13" → "13 oct 2026". */
function insiderDate(iso) {
  const date = new Date(`${iso}T12:00:00`);
  if (!iso || Number.isNaN(date.getTime())) return iso || '';
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

function insiderHtml(data) {
  const summary = data.summary || {};
  const rows = Array.isArray(data.transactions) ? data.transactions.slice(0, 8) : [];

  const list = rows.length
    ? `<div class="live-news">${rows.map((tx) => `<a href="${esc(tx.url || '#')}" target="_blank" rel="noopener noreferrer">
        <strong>${esc(tx.owner)} · ${tx.code === 'P' ? 'compra' : 'venta'} ${num(tx.shares, 0)} acc.</strong>
        <span>${esc(insiderDate(tx.transaction_date))}${tx.price_usd !== null && tx.price_usd !== undefined ? ' · ' + num(tx.price_usd, 2) + ' $/acc.' : ''}${tx.value_usd !== null && tx.value_usd !== undefined ? ' · ' + insiderMoney(tx.value_usd) : ''}${tx.plan_10b5_1 === true ? ' · plan 10b5-1' : ''}</span>
      </a>`).join('')}</div>`
    : `<p class="note-hint">${esc(data.message || 'Sin operaciones de compra o venta en el periodo.')}</p>`;

  return `<div class="live-panel">
    <dl class="live-metrics">
      <div><dt>Compras</dt><dd>${summary.purchase_count || 0}${summary.purchase_value_usd ? `<small>${insiderMoney(summary.purchase_value_usd)}</small>` : ''}</dd></div>
      <div><dt>Ventas</dt><dd>${summary.sale_count || 0}${summary.sale_value_usd ? `<small>${insiderMoney(summary.sale_value_usd)}</small>` : ''}</dd></div>
      <div><dt>Ventas en plan 10b5-1</dt><dd>${summary.sale_plan_10b5_1_count || 0}</dd></div>
    </dl>
    ${list}
    <p class="live-src">Fuente: SEC EDGAR · Form 4 · ${esc(data.period || '')}${data.truncated ? ` · revisados ${data.filings_examined} de ${data.filings_in_period}` : ''}</p>
    <p class="live-src">Operaciones de directivos, no posiciones institucionales 13F.</p>
  </div>`;
}

function insiderErrorMessage(error) {
  const known = {
    unsupported_market: 'Los movimientos de directivos solo cubren empresas de EE. UU.',
    sec_user_agent: 'La SEC rechazó la petición: el servidor necesita SEC_USER_AGENT con un correo real.',
    sec_rate_limit: 'La SEC está limitando las consultas. Espera un minuto y vuelve a intentarlo.',
    not_found: 'La SEC no tiene formularios Form 4 para este valor.',
    upstream_timeout: 'La SEC tardó demasiado en responder. Reintenta en unos segundos.'
  };
  const code = error && error.code;
  if (code && known[code]) return known[code];
  return 'No se pudo consultar la SEC. Revisa tu conexión e inténtalo de nuevo.';
}

async function loadInsiders(ticker) {
  const out = document.getElementById('insiderOut');
  if (!out) return;
  out.innerHTML = `<p style="font-size:.8rem;color:var(--dim)">Consultando los Form 4 de la SEC…</p>`;
  try {
    const data = await api(`/api/insiders?symbol=${encodeURIComponent(providerSymbol(ticker))}`);
    out.innerHTML = insiderHtml(data);
  } catch (error) {
    out.innerHTML = `<div class="live-status err">${esc(insiderErrorMessage(error))}</div>`;
  }
}

/* ---------- eventos globales ---------- */
document.addEventListener('click', (e) => {
  const symbolBtn = e.target.closest('[data-symbol]');
  if (symbolBtn) {
    e.preventDefault();
    openSymbol(symbolBtn.dataset.symbol);
    return;
  }
  const actionEl = e.target.closest('[data-action]');
  if (actionEl) {
    const a = actionEl.dataset.action;
    if (a === 'watch') {
      e.preventDefault();
      e.stopPropagation();
      const t = actionEl.dataset.t;
      if (state.watchlist.has(t)) state.watchlist.delete(t); else state.watchlist.add(t);
      saveWatch();
      actionEl.setAttribute('aria-pressed', String(state.watchlist.has(t)));
      const svgPath = actionEl.querySelector('path');
      if (svgPath) svgPath.setAttribute('fill', state.watchlist.has(t) ? 'currentColor' : 'none');
      if (actionEl.classList.contains('btn')) {
        actionEl.textContent = state.watchlist.has(t) ? '★ En seguimiento' : '☆ Añadir a seguimiento';
      }
      if (location.hash.startsWith('#/seguimiento')) render();
      return;
    }
    if (a === 'read') {
      const id = actionEl.dataset.id;
      if (state.newsRead.has(id)) state.newsRead.delete(id); else state.newsRead.add(id);
      saveRead();
      const item = actionEl.closest('.news-item');
      if (item) {
        item.classList.toggle('read');
        actionEl.textContent = state.newsRead.has(id) ? 'Marcar no leído' : 'Marcar leído';
      }
      return;
    }
    if (a === 'open-data') {
      e.preventDefault();
      renderDataPanel();
      document.getElementById('dataDialog').showModal();
      return;
    }
    if (a === 'check-server') { checkServer(); return; }
    if (a === 'export-backup') { exportBackup(); return; }
    if (a === 'save-remote-backup') { saveRemoteBackup(); return; }
    if (a === 'load-remote-backup') { loadRemoteBackup(); return; }
    if (a === 'live') { loadMarket(actionEl.dataset.t); return; }
    if (a === 'insiders') { loadInsiders(actionEl.dataset.t); return; }
    if (a === 'analyse') { runAnalysis(actionEl.dataset.t); return; }
    if (a === 'goto-search') {
      const q = String(actionEl.dataset.q || '');
      location.hash = q ? `#/buscar/${encodeURIComponent(q)}` : '#/buscar';
      return;
    }
    if (a === 'save-override') {
      const ticker = actionEl.dataset.t;
      const key = actionEl.dataset.key;
      const wrap = actionEl.closest('.override');
      const numberInput = wrap ? wrap.querySelector('.ov-num') : null;
      const noteInput = wrap ? wrap.querySelector('.ov-note') : null;
      const raw = numberInput ? Number(String(numberInput.value).replace(',', '.')) : NaN;
      if (!Number.isFinite(raw) || raw < 0 || raw > 10) {
        if (numberInput) {
          numberInput.classList.add('invalid');
          numberInput.focus();
        }
        return;
      }
      if (!ticker || !key) return;
      const index = FRAMEWORK.findIndex((f) => f.key === key);
      state.overrides[ticker] = state.overrides[ticker] || {};
      state.overrides[ticker][key] = {
        value: Math.round(raw * 10) / 10,
        note: noteInput ? noteInput.value.trim() : '',
        at: new Date().toISOString()
      };
      store.set('overrides', state.overrides);
      recomputeScores();
      const offset = window.scrollY;
      renderCompany(ticker, index);
      window.scrollTo(0, offset);
      return;
    }
    if (a === 'reset-override') {
      const ticker = actionEl.dataset.t;
      const key = actionEl.dataset.key;
      if (state.overrides[ticker] && state.overrides[ticker][key]) {
        delete state.overrides[ticker][key];
        if (!Object.keys(state.overrides[ticker]).length) delete state.overrides[ticker];
        store.set('overrides', state.overrides);
        recomputeScores();
        const index = FRAMEWORK.findIndex((f) => f.key === key);
        const offset = window.scrollY;
        renderCompany(ticker, index);
        window.scrollTo(0, offset);
      }
      return;
    }
    if (a === 'swap-cmp') {
      const first = actionEl.dataset.a;
      const second = actionEl.dataset.b;
      location.hash = `#/comparar/${encodeURIComponent(second)}/${encodeURIComponent(first)}`;
      return;
    }
  }

  const row = e.target.closest('[data-href]');
  if (row) {
    location.hash = row.dataset.href;
  }
});

document.addEventListener('input', (e) => {
  const note = e.target.closest('textarea[data-note]');
  if (note) {
    state.notes[note.dataset.note] = note.value;
    saveNotes();
  }
});

document.addEventListener('change', (e) => {
  const chk = e.target.closest('input[data-check]');
  if (chk) {
    const [t, i] = chk.dataset.check.split(':');
    const current = state.checks[t] || {};
    current[i] = chk.checked;
    state.checks[t] = current;
    saveChecks();
    const counter = chk.closest('.card')?.querySelector('.panel-title span');
    if (counter) counter.textContent = `${Object.values(current).filter(Boolean).length}/8`;
  }
});

document.getElementById('dataBtn').addEventListener('click', () => {
  renderDataPanel();
  document.getElementById('dataDialog').showModal();
});

document.getElementById('year').textContent = new Date().getFullYear();

/* ---------- buscador de símbolos ---------- */
const searchState = { q: '', results: [], loading: false, active: -1, error: '', timer: null };
let searchViewSeq = 0;

function searchErrorMessage(err) {
  const base = liveErrorMessage(err || {});
  if (err && err.code === 'upstream_auth') {
    return `${base} El buscador de símbolos de EODHD necesita un token propio, no el token público demo.`;
  }
  return base;
}

function placeLabel(r) {
  return [r.exchange, r.country].filter(Boolean).join(' · ');
}

function openSymbol(symbol) {
  const input = document.getElementById('gsearch');
  if (input) input.value = '';
  closeSearchPanel();
  location.hash = `#/empresa/${encodeURIComponent(symbol)}`;
}

function closeSearchPanel() {
  const panel = document.getElementById('gsearchPanel');
  const input = document.getElementById('gsearch');
  if (panel) panel.hidden = true;
  if (input) input.setAttribute('aria-expanded', 'false');
  searchState.active = -1;
}

function paintSearchPanel() {
  const panel = document.getElementById('gsearchPanel');
  const list = document.getElementById('gsearchList');
  const status = document.getElementById('gsearchStatus');
  const all = document.getElementById('gsearchAll');
  const input = document.getElementById('gsearch');
  if (!panel || !list || !status || !input) return;

  panel.hidden = false;
  input.setAttribute('aria-expanded', 'true');
  all.hidden = true;

  if (searchState.loading) {
    status.textContent = 'Buscando…';
    list.innerHTML = '';
    return;
  }
  if (searchState.error) {
    status.textContent = searchState.error;
    list.innerHTML = '';
    return;
  }
  if (searchState.q.length < 2) {
    status.textContent = 'Escribe al menos 2 caracteres para buscar en EE. UU. y Europa.';
    list.innerHTML = '';
    return;
  }
  if (!searchState.results.length) {
    status.textContent = `Sin coincidencias para «${searchState.q}» en EE. UU. o Europa.`;
    list.innerHTML = '';
    return;
  }

  status.textContent = `${searchState.results.length} coincidencias`;
  list.innerHTML = searchState.results.map((r, i) => `<li role="option" aria-selected="${i === searchState.active}">
    <button type="button" class="gsearch-item${i === searchState.active ? ' active' : ''}" data-symbol="${esc(r.symbol)}">
      <span class="gs-code">${esc(r.symbol)}</span>
      <span class="gs-name">${esc(r.name)}</span>
      <span class="gs-meta">${esc(placeLabel(r))}${r.type ? ' · ' + esc(r.type) : ''}</span>
    </button>
  </li>`).join('');
  all.hidden = false;
  all.href = `#/buscar/${encodeURIComponent(searchState.q)}`;
  all.textContent = `Ver todos los resultados de «${searchState.q}»`;
}

async function runSearch(q) {
  searchState.q = q;
  searchState.loading = true;
  searchState.error = '';
  paintSearchPanel();
  try {
    const data = await api(`/api/search?q=${encodeURIComponent(q)}&limit=15`);
    if (searchState.q !== q) return;
    searchState.results = Array.isArray(data.results) ? data.results : [];
    searchState.active = -1;
  } catch (err) {
    if (searchState.q !== q) return;
    searchState.results = [];
    searchState.error = searchErrorMessage(err);
  } finally {
    if (searchState.q === q) {
      searchState.loading = false;
      paintSearchPanel();
    }
  }
}

function searchCard(r) {
  return `<article class="search-card">
    <div class="sc-top">
      <span class="sc-code">${esc(r.symbol)}</span>
      ${r.type ? `<span class="tag">${esc(r.type)}</span>` : ''}
    </div>
    <h3>${esc(r.name)}</h3>
    <p class="meta">${esc(placeLabel(r))}${r.currency ? ' · ' + esc(r.currency) : ''}${r.isin ? ' · ' + esc(r.isin) : ''}</p>
    <a class="btn btn-sm" href="#/empresa/${encodeURIComponent(r.symbol)}">Abrir ficha</a>
  </article>`;
}

async function fillSearchView(q) {
  const box = document.getElementById('searchResults');
  if (!box) return;
  if (q.length < 2) {
    box.innerHTML = `<div class="empty"><strong>Escribe al menos 2 caracteres</strong>Busca por nombre de empresa o ticker: «ASML», «BMW», «Nestlé», «AAPL».</div>`;
    return;
  }
  const seq = ++searchViewSeq;
  box.innerHTML = `<p class="note-hint">Buscando…</p>`;
  try {
    const data = await api(`/api/search?q=${encodeURIComponent(q)}&limit=30`);
    if (seq !== searchViewSeq || !document.getElementById('searchResults')) return;
    const results = Array.isArray(data.results) ? data.results : [];
    document.getElementById('searchResults').innerHTML = results.length
      ? `<p class="note-hint">${results.length} valores en EE. UU. y Europa · fuente ${esc(data.source || 'EODHD')}</p>` + results.map(searchCard).join('')
      : `<div class="empty"><strong>Sin coincidencias</strong>Prueba con el nombre completo, el ticker o la bolsa (por ejemplo «ASML.AS»).</div>`;
  } catch (err) {
    if (seq !== searchViewSeq || !document.getElementById('searchResults')) return;
    document.getElementById('searchResults').innerHTML = `<div class="live-status err">${esc(searchErrorMessage(err))}</div>`;
  }
}

function renderSearch(query) {
  const q = String(query || '').trim();
  view.innerHTML = `
    <div class="page-head">
      <p class="eyebrow">Buscar valores</p>
      <h1>${q ? `Resultados para «${esc(q)}»` : 'Cualquier valor de EE. UU. o Europa'}</h1>
      <p>El buscador consulta el catálogo de símbolos de EODHD a través del proxy del servidor y abre una ficha con perfil, cotización y notas calculadas con sus cuentas.</p>
    </div>
    <form class="search-box" id="searchViewForm">
      <input id="sview" type="search" value="${esc(q)}" placeholder="Nombre o ticker: Apple, ASML, BMW, Nestlé…" aria-label="Buscar valores" autocomplete="off"/>
      <button class="btn btn-primary" type="submit">Buscar</button>
    </form>
    <div id="searchResults" class="search-grid"></div>
  `;
  const form = document.getElementById('searchViewForm');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = document.getElementById('sview').value.trim();
    if (value.length >= 2) location.hash = `#/buscar/${encodeURIComponent(value)}`;
  });
  fillSearchView(q);
}

const gsearchInput = document.getElementById('gsearch');
if (gsearchInput) {
  gsearchInput.addEventListener('input', (e) => {
    const q = e.target.value.trim();
    clearTimeout(searchState.timer);
    searchState.q = q;
    searchState.error = '';
    searchState.active = -1;
    if (q.length < 2) {
      searchState.results = [];
      searchState.loading = false;
      paintSearchPanel();
      return;
    }
    searchState.loading = true;
    paintSearchPanel();
    searchState.timer = setTimeout(() => runSearch(q), 280);
  });

  gsearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSearchPanel();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!searchState.results.length) return;
      e.preventDefault();
      const total = searchState.results.length;
      searchState.active = e.key === 'ArrowDown'
        ? (searchState.active + 1) % total
        : (searchState.active - 1 + total) % total;
      paintSearchPanel();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const chosen = searchState.results[searchState.active >= 0 ? searchState.active : 0];
      if (chosen) openSymbol(chosen.symbol);
      else if (searchState.q.length >= 2) location.hash = `#/buscar/${encodeURIComponent(searchState.q)}`;
    }
  });

  gsearchInput.addEventListener('focus', () => {
    if (gsearchInput.value.trim().length >= 2) paintSearchPanel();
  });
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('#gsearchForm')) closeSearchPanel();
});

/* ---------- router ---------- */
const ROUTES = ['screener', 'comparar', 'noticias', 'seguimiento', 'marco', 'empresa', 'buscar'];

function render() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [route, arg, arg2] = raw.split('/');
  const r = ROUTES.includes(route) ? route : 'screener';
  document.querySelectorAll('[data-nav]').forEach((a) => {
    a.classList.toggle('active', a.dataset.nav === (r === 'empresa' ? 'screener' : r));
  });
  if (r === 'screener') renderScreener();
  else if (r === 'comparar') renderCompare(decodeURIComponent(arg || ''), decodeURIComponent(arg2 || ''));
  else if (r === 'noticias') renderNews();
  else if (r === 'seguimiento') renderWatchlist();
  else if (r === 'marco') renderFramework();
  else if (r === 'buscar') renderSearch(decodeURIComponent(arg || ''));
  else renderCompany(decodeURIComponent(arg || ''));
  updateWatchBadge();
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', render);
if (!location.hash) location.replace('#/screener');
render();
updateWatchBadge();
