// Small shared pieces: theme, element builder, number and time formats.
export const $ = id => document.getElementById(id);
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
  return el;
}

export function initTheme() {
  const set = () => {
    let m = document.documentElement.getAttribute('data-palmtop-theme') || localStorage.getItem('desk:theme');
    if (m !== 'light' && m !== 'dark') m = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.dataset.theme = m;
  };
  set();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', set);
  new MutationObserver(set).observe(document.documentElement, { attributes: true, attributeFilter: ['data-palmtop-theme'] });
  if (forge.onTheme) forge.onTheme(set);
  addEventListener('storage', e => { if (e.key === 'desk:theme') set(); });
}

// ---- numbers
export function num(x, d = 2) {
  if (x == null || !isFinite(x)) return '–';
  return Number(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
export const int = x => (x == null ? '–' : Math.round(x).toLocaleString('en-US'));
// enough digits to tell small numbers apart: 0.0016, 0.21, 12.4
export function sig(x) {
  if (x == null || !isFinite(x)) return '–';
  const a = Math.abs(x);
  return num(x, a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : a >= 0.1 ? 3 : 4);
}
export const signed = (x, d = 2) => (x == null || !isFinite(x) ? '–' : (x > 0 ? '+' : '') + num(x, d));
export const pct = (x, d = 1) => (x == null ? '–' : num(x * 100, d) + '%');
export const usd = (x, d = 2) => (x == null ? '–' : (x < 0 ? '−$' : '$') + num(Math.abs(x), d));
export function big(x) {
  if (x == null) return '–';
  const a = Math.abs(x);
  return a >= 1e9 ? num(x / 1e9, 2) + 'B' : a >= 1e6 ? num(x / 1e6, 2) + 'M' : a >= 1e4 ? num(x / 1e3, 1) + 'k' : int(x);
}
export function bytes(b) {
  return b >= 1e9 ? num(b / 1e9, 2) + ' GB' : b >= 1e6 ? num(b / 1e6, 1) + ' MB' : num(b / 1e3, 0) + ' kB';
}

// ---- time
export function horizon(ms) {
  if (ms === 0) return '0';
  if (ms < 1000) return ms + ' ms';
  if (ms < 60000) return ms / 1000 + ' s';
  return ms / 60000 + ' min';
}
export function dur(s) {
  if (s == null || isNaN(s)) return '–';
  if (s < 60) return num(s, s < 10 ? 1 : 0) + ' s';
  if (s < 3600) return Math.floor(s / 60) + ' min ' + Math.round(s % 60) + ' s';
  if (s < 86400) return num(s / 3600, 1) + ' h';
  return num(s / 86400, 1) + ' d';
}
export const utc = ns => (ns ? new Date(ns / 1e6).toISOString().slice(0, 19).replace('T', ' ') : '–');
export const utcSec = s => (s ? new Date(s * 1000).toISOString().slice(0, 16).replace('T', ' ') : '–');

export function table(head, rows, cls = '') {
  return h('div', { class: 'scroll' }, h('table', { class: cls },
    h('thead', {}, h('tr', {}, head.map(x => h('th', {}, x)))),
    h('tbody', {}, rows.map(r => h('tr', {}, r.map(c => (c instanceof Node ? h('td', {}, c) : h('td', { html: esc(c) }))))))));
}
export const tiles = items => h('div', { class: 'tiles' },
  items.map(([label, value, hint]) => h('div', { class: 'tile' }, h('span', {}, label), h('b', {}, value), hint ? h('em', {}, hint) : null)));
export const card = (title, ...kids) => h('section', { class: 'card' }, title ? h('h2', {}, title) : null, ...kids);
