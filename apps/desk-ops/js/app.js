import { t, applyLabels } from './i18n.js';
import { DEFAULTS, judge, dur } from './health.js';

const $ = id => document.getElementById(id);
const services = DEFAULTS.services.map(s => ({ ...s, row: null, starts: [], listed: false, missing: false, stops: [] }));

// ---- light and dark
function theme() {
  let m = document.documentElement.getAttribute('data-palmtop-theme') || localStorage.getItem('desk:theme');
  if (m !== 'light' && m !== 'dark') m = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = m;
}
theme();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', theme);
new MutationObserver(theme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-palmtop-theme'] });
if (forge.onTheme) forge.onTheme(theme);

// ---- the rows, built once and then only updated
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls.split(' ').map(c => 'ds-' + c).join(' ');   // see css/app.css
  if (text != null) e.textContent = text;
  return e;
}
function cell(labelKey) {
  const c = el('div', 'cell');
  c.append(el('span', 'cell-label', t(labelKey)), el('span', 'num'));
  return c;
}
function build() {
  for (const s of services) {
    const row = el('div', 'row');
    row.dataset.service = s.key;
    const who = el('div', 'who'), names = el('div');
    names.append(el('b', '', s.name), el('small', '', s.key));
    who.append(el('span', 'icon', s.icon), names);
    const health = el('div', 'health'), state = el('span', 'state');
    state.append(el('span', 'dot'), el('span', 'label'));
    health.append(state, el('div', 'note'));
    const act = el('div', 'act'), btn = el('button', 'open', t('open'));
    btn.type = 'button';
    btn.addEventListener('click', () => forge.apps.open(s.app));
    act.append(btn);
    row.append(who, health, cell('colRunning'), cell('colRestarts'), cell('colBeat'), act);
    $('rows').append(row);
    s.el = { row, icon: who.firstChild, name: names.firstChild, label: state.lastChild, note: health.lastChild,
      running: row.children[2].lastChild, restarts: row.children[3].lastChild, beat: row.children[4].lastChild, btn };
  }
}
function put(node, text, tip) {
  const none = text == null;
  node.textContent = none ? '—' : text;
  node.classList.toggle('ds-none', none);
  node.title = none ? t('notReported') : tip || '';
}

let lastGlance = '';
function render() {
  const now = Date.now() / 1000;
  let need = 0, seen = 0, worst = 'ok';
  for (const s of services) {
    const h = judge(s, now), e = s.el;
    if (s.row) seen++;
    if (h.level !== 'ok') { need++; if (worst !== 'bad') worst = h.level === 'bad' ? 'bad' : 'warn'; }
    e.row.className = 'ds-row is-' + h.level;
    e.label.textContent = h.label;
    e.note.textContent = h.note;
    put(e.running, h.since ? dur(now - h.since) : null);
    put(e.restarts, h.restarts == null ? null : String(h.restarts), t('restartsTip'));
    put(e.beat, h.age == null ? null : t('ago', { s: dur(h.age) }));
    if (h.age == null) e.beat.title = '';
    e.btn.disabled = s.missing;
  }
  const waiting = !seen;
  const text = waiting ? t('waiting') : !need ? t('allRunning') : need === 1 ? t('need1') : t('needN', { n: need });
  $('summary').className = 'ds-summary is-' + (waiting ? 'wait' : !need ? 'ok' : worst);
  $('headline').textContent = text;
  $('sub').textContent = waiting ? t('subWait') : t('sub');
  if (window.kit && kit.glance && text !== lastGlance) {
    lastGlance = text;
    try { kit.glance(waiting ? null : { text, attention: need > 0 }); } catch (e) { /* the card line is optional */ }
  }
}

// ---- data: each app's streams, read through Studio
function follow(s, name, limit, onRows) {
  const sub = since => s.stops.push(forge.stream.subscribe(s.app, name, onRows, { every: DEFAULTS.refreshMs, since, limit: 500 }));
  // The newest rows first, whatever their age; then only what comes after them.
  return forge.stream.read(s.app, name, { limit }).then(rows => {
    rows = rows || [];
    if (rows.length) onRows(rows);
    sub(rows.length ? rows[rows.length - 1].t : 0);
  });
}
async function watch(s) {
  if (s.stops.length) return;
  let names = [];
  try { names = ((await forge.stream.list(s.app)) || []).map(x => x.name); }
  catch (e) { forge.log('stream.list', s.app, String(e && e.message || e)); return; }
  s.listed = true;
  if (!names.includes(s.stream) || s.stops.length) return render();
  try {
    await follow(s, s.stream, 1, rows => {
      const r = rows[rows.length - 1];
      if (r && (!s.row || r.t >= s.row.t)) { s.row = r; render(); }
    });
    if (s.events && names.includes(s.events)) {
      await follow(s, s.events, 500, rows => {
        for (const r of rows) if (r.type === 'start' && !s.starts.includes(r.t)) s.starts.push(r.t);
        s.starts.sort((a, b) => a - b);
        render();
      });
    }
  } catch (e) { forge.log('stream', s.app, String(e && e.message || e)); }
  render();
}
async function names() {
  try {
    const apps = (await forge.apps.list()) || [];
    for (const s of services) {
      const a = apps.find(x => x.id === s.app);
      s.missing = !a;
      if (a) { s.el.name.textContent = a.name || s.name; s.el.icon.textContent = a.icon || s.icon; }
    }
  } catch (e) { /* keep the names we have */ }
  render();
}

// ?try=empty shows the page with no data; ?try=trouble with made-up problems. For checking the page only.
const tryMode = new URLSearchParams(location.search).get('try');
function madeUp() {
  const now = Date.now() / 1000, [rec, mk, mon, rep] = services;
  rec.row = { t: now - 95, connected: true, products: {} };
  mk.row = { t: now, state: 'stopped', stopped_by: 'risk', why: 'position 0.26 BTC beyond 0.25', position: 0, day_pnl: -12.4 };
  mk.starts = [now - 90000, now - 4000, now - 600];
  mon.row = { t: now, checks: { position: { state: 'breach' } }, stop: { reason: 'position 0.26 BTC beyond 0.25' }, position: 0, day_pnl: -12.4 };
  rep.row = { t: now, since: now - 7300, reports: {}, waiting: [], failing: false };
}

applyLabels();
build();
if (tryMode === 'trouble') madeUp();
render();
names();
if (!tryMode) {
  services.forEach(watch);
  setInterval(() => services.forEach(watch), DEFAULTS.relistS * 1000);
}
setInterval(render, 1000);
