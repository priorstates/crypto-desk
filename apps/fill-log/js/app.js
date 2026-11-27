import { t, applyLabels } from './i18n.js';
import { DEFAULTS, data, start, madeUp, stopFor, dayStart, weekStart } from './data.js';

const $ = id => document.getElementById(id);

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

// ---- numbers and times (UTC, like the maker's own day)
const fmt = (n, lo, hi = lo) => n.toLocaleString(undefined, { minimumFractionDigits: lo, maximumFractionDigits: hi });
const int = n => fmt(n, 0);
const price = n => fmt(n, 2);
const size = n => fmt(n, 4, 8);
const signed = n => (+n.toFixed(2) > 0 ? '+' : +n.toFixed(2) < 0 ? '−' : '') + fmt(Math.abs(n), 2);
const iso = s => new Date(s * 1000).toISOString();           // 2026-11-27T14:03:22.123Z
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---- the person's view: period and side, kept between visits
const view = Object.assign({ range: 'today', side: 'all' }, forge.kv.getJSON('view', {}));
if (!['today', 'week'].includes(view.range)) view.range = 'today';
if (!['all', 'buy', 'sell'].includes(view.side)) view.side = 'all';
let shownMax = DEFAULTS.pageRows;

const from = () => (view.range === 'today' ? dayStart() : weekStart());
const inPeriod = () => { const f = from(); return data.fills.filter(r => r.time >= f); };
const bySide = rows => (view.side === 'all' ? rows : rows.filter(r => r.side === view.side));

// Why a fill happened, in words.
function why(r) {
  const q = t(r.side === 'buy' ? 'bid' : 'ask');
  if (r.reason === 'through') {
    return r.tradePrice != null && r.tradeSize != null
      ? t('whyThrough', { s: size(r.tradeSize), p: price(r.tradePrice), q }) : t('whyThroughBare', { q });
  }
  if (r.reason === 'flatten') {
    const stop = stopFor(r), by = stop && ['loss', 'risk', 'person'].includes(stop.by) ? ' (' + t('by_' + stop.by) + ')' : '';
    return t('whyFlatten', { q: t(r.side === 'sell' ? 'bid' : 'ask') }) + by;
  }
  return r.reason || '—';
}

function tile(id, v, unit, sub, cls) {
  const el = $(id);
  el.className = 'fl-tile' + (v == null ? ' is-none' : '') + (cls ? ' is-' + cls : '');
  el.querySelector('.fl-v').innerHTML = v == null ? '—' : esc(v) + (unit ? '<small>' + esc(unit) + '</small>' : '');
  el.querySelector('.fl-s').textContent = v == null ? '' : sub || '';
}

function totals(rows) {
  const s = { buy: { n: 0, q: 0, usd: 0 }, sell: { n: 0, q: 0, usd: 0 }, pnl: 0, hasPnl: false };
  for (const r of rows) {
    const a = s[r.side];
    a.n++; a.q += r.size; a.usd += r.size * r.price;
    if (r.pnl != null) { s.pnl += r.pnl; s.hasPnl = true; }
  }
  const none = !rows.length;
  tile('tFills', none ? null : int(rows.length), '', t('split', { b: int(s.buy.n), s: int(s.sell.n) }));
  tile('tBought', none ? null : size(s.buy.q), 'BTC', s.buy.q ? t('avg', { p: price(s.buy.usd / s.buy.q) }) : '');
  tile('tSold', none ? null : size(s.sell.q), 'BTC', s.sell.q ? t('avg', { p: price(s.sell.usd / s.sell.q) }) : '');
  tile('tVolume', none ? null : fmt(s.buy.usd + s.sell.usd, 0), 'USD', size(s.buy.q + s.sell.q) + ' BTC');
  tile('tPnl', none || !s.hasPnl ? null : signed(s.pnl), 'USD', t('pnlSub'), s.pnl > 0.005 ? 'up' : s.pnl < -0.005 ? 'down' : '');
}

// What the totals and the list cover: the whole period, or only what a page can reach.
function cover(rows) {
  const el = $('cover'), part = data.reachFrom > from() + 1;
  el.hidden = data.state !== 'ready' || (!rows.length && !part);
  el.className = 'fl-cover' + (part ? ' is-part' : '');
  const period = view.range === 'today' ? t('today').toLowerCase() : t('week', { n: DEFAULTS.days }).toLowerCase();
  if (!part) { el.textContent = t('coverFull', { p: period }); return; }
  const at = iso(data.reachFrom), today = at.slice(0, 10) === iso(Date.now() / 1000).slice(0, 10);
  let s = t('coverPart', { t: (today ? '' : at.slice(0, 10) + ' ') + at.slice(11, 19), n: int(DEFAULTS.readLimit) });
  const m = data.makerToday;
  if (m && m.day === iso(Date.now() / 1000).slice(0, 10) && m.n > rows.filter(r => r.time >= dayStart()).length) s += ' ' + t('makerCount', { n: int(m.n) });
  el.textContent = s;
}

function table(rows) {
  const list = bySide(rows), shown = list.slice(0, shownMax);
  $('rows').innerHTML = shown.map(r => {
    const d = iso(r.time);
    return '<tr><td><span class="fl-date">' + d.slice(0, 10) + '</span>' + d.slice(11, 19) + '<span class="fl-ms">' + d.slice(19, 23) + '</span></td>'
      + '<td><span class="fl-pill ' + r.side + '">' + esc(t(r.side)) + '</span></td>'
      + '<td class="fl-n">' + price(r.price) + '</td><td class="fl-n">' + size(r.size) + '</td>'
      + '<td class="fl-why' + (r.reason === 'flatten' ? ' is-stop' : '') + '">' + esc(why(r)) + '</td></tr>';
  }).join('');
  const empty = $('empty');
  empty.hidden = list.length > 0;
  if (!list.length) {
    empty.textContent = t(data.state === 'loading' ? 'eLoading' : data.state === 'missing' ? 'eMissing' : data.state === 'error' ? 'eError'
      : rows.length ? 'eSide' : 'eNone');
  }
  $('more').hidden = list.length <= shownMax;
  $('count').textContent = !list.length ? '' : list.length > shown.length
    ? t('showing', { a: int(shown.length), n: int(list.length) }) : t('count', { n: int(list.length) });
  $('export').toggleAttribute('disabled', !list.length);
}

function glance() {
  if (!window.kit || !kit.glance) return;
  const m = data.makerToday, day = iso(Date.now() / 1000).slice(0, 10);
  const n = m && m.day === day ? m.n : data.state === 'ready' && !(data.reachFrom > dayStart()) ? data.fills.filter(r => r.time >= dayStart()).length : null;
  kit.glance(n == null ? null : t('glance', { n: int(n) }));
}

let queued = false;
function render() {
  queued = false;
  for (const g of ['range', 'side']) for (const b of $(g).querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === view[g]));
  const rows = inPeriod();
  cover(rows); totals(rows); table(rows); glance();
}
const changed = () => { if (!queued) { queued = true; requestAnimationFrame(render); } };

// ---- controls
for (const g of ['range', 'side']) {
  $(g).setAttribute('aria-label', t($(g).dataset.label));
  $(g).addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    view[g] = b.dataset.v;
    forge.kv.setJSON('view', view);
    shownMax = DEFAULTS.pageRows;
    $('scroll').scrollTop = 0;
    render();
  });
}
$('more').addEventListener('click', () => { shownMax += DEFAULTS.pageRows * 3; render(); });

$('export').addEventListener('click', () => {
  const list = bySide(inPeriod());
  if (!list.length) return;
  const q = v => (v == null ? '' : /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));
  const lines = ['time_utc,side,price,size,reason,why,trade_price,trade_size,fill_pnl,position_after,id'];
  for (const r of list) lines.push([iso(r.time), r.side, r.price, r.size, r.reason, why(r), r.tradePrice, r.tradeSize, r.pnl, r.position, r.id].map(q).join(','));
  const day = iso(Date.now() / 1000).slice(0, 10);
  const name = 'paper-fills-' + (view.range === 'today' ? day : iso(list[list.length - 1].time).slice(0, 10) + '_' + day)
    + (view.side === 'all' ? '' : '-' + view.side) + '.csv';
  forge.files.save(name, lines.join('\n') + '\n', 'text/csv');
  forge.toast(t('saved', { n: int(list.length) }));
});

// ---- go
applyLabels({ n: DEFAULTS.days });
const mode = new URLSearchParams(location.search).get('try');
if (mode === 'sample' || mode === 'partial') madeUp(mode === 'partial');
else if (mode === 'empty') data.state = 'missing';
else start(changed);
render();
setInterval(render, 60000);        // the day turns over at 00:00 UTC
