import { t, has, applyLabels } from './i18n.js';
import { DEFAULTS, data, start, madeUp } from './data.js';

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

// ---- numbers and words
const ok = v => typeof v === 'number' && isFinite(v);
const fmt = (n, d) => Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const plain = (n, d) => (n < 0 ? '−' : '') + fmt(n, d);
const signed = (n, d) => (+n.toFixed(d) > 0 ? '+' : +n.toFixed(d) < 0 ? '−' : '') + fmt(n, d);
function dur(s) {
  s = Math.max(0, s);
  if (s < 10) return s.toFixed(1) + ' s';
  s = Math.round(s);
  if (s < 60) return s + ' s';
  if (s < 3600) return Math.floor(s / 60) + ' m ' + String(s % 60).padStart(2, '0') + ' s';
  if (s < 86400) return Math.floor(s / 3600) + ' h ' + String(Math.floor(s % 3600 / 60)).padStart(2, '0') + ' m';
  return Math.floor(s / 86400) + ' d ' + Math.floor(s % 86400 / 3600) + ' h';
}
const join = a => a.filter(Boolean).join(' · ');
const isOld = (row, now) => now - row.t > DEFAULTS.staleS;
const oldMsg = (row, now) => t('old', { s: dur(now - row.t) });

// One tile: the big value, its unit, the small line under it, and its look.
function set(id, { v, u = '', s = '', cls = '' }) {
  const el = $(id), none = v == null;
  el.className = 'dd-tile' + (el.id === 'pnl' || el.id === 'risk' ? ' dd-wide' : '') + (none ? ' is-none' : '') + (cls ? ' ' + cls.split(' ').map(c => 'is-' + c).join(' ') : '');
  el.querySelector('.dd-v').textContent = none ? '—' : v;
  el.querySelector('.dd-u').textContent = none ? '' : u;
  el.querySelector('.dd-s').textContent = s;
}
const wait = who => ({ v: null, s: t('waitFor', { s: t('n_' + who) }) });

// ---- the PnL trend line
function trend(points) {
  const svg = $('trend'), line = svg.querySelector('polyline'), zero = svg.querySelector('line');
  svg.style.display = points.length < 2 ? 'none' : '';
  if (points.length < 2) { line.setAttribute('points', ''); return null; }
  const W = 300, H = 70, pad = 4;
  const vals = points.map(p => p.day_pnl), lo = Math.min(0, ...vals), hi = Math.max(0, ...vals), span = hi - lo || 1;
  const t0 = points[0].t, dt = points[points.length - 1].t - t0 || 1;
  const y = v => pad + (H - 2 * pad) * (1 - (v - lo) / span);
  line.setAttribute('points', points.map(p => ((p.t - t0) / dt * W).toFixed(1) + ',' + y(p.day_pnl).toFixed(1)).join(' '));
  zero.style.display = '';
  zero.setAttribute('y1', y(0)); zero.setAttribute('y2', y(0));
  return { lo: Math.min(...vals), hi: Math.max(...vals) };
}

// ---- risk: all clear, or the breach
function checkValue(name, v) {
  if (!ok(v)) return '—';
  if (name === 'position') return plain(v, 4) + ' BTC';
  if (name === 'loss') return plain(v, 2) + ' USD';
  if (name === 'disk') return plain(v, 1) + ' GB';
  return dur(v);
}
function riskTile(r, now) {
  if (!r) return { ...wait('risk'), label: '' };
  const checks = Object.entries(r.checks || {});
  const breached = checks.filter(([, c]) => c && c.state === 'breach');
  const name = k => (has('ck_' + k) ? t('ck_' + k) : k);
  let out;
  if (r.error) out = { v: 'Error', s: r.error, cls: 'bad' };
  else if (breached.length) {
    out = { v: name(breached[0][0]), u: breached.length > 1 ? t('more', { n: breached.length - 1 }) : '', cls: 'bad',
      s: join([...breached.map(([k, c]) => t('valLimit', { name: name(k), v: checkValue(k, c.value), l: checkValue(k, k === 'loss' ? -c.limit : c.limit) })),
        r.stop && r.stop.reason && t('stopOn') + ': ' + r.stop.reason]) };
  } else if (r.stop) out = { v: t('stopOn'), s: r.stop.reason || '', cls: 'warn' };
  else out = { v: t('allClear'), s: t('checksOk', { n: checks.filter(([, c]) => c && c.state === 'ok').length }), cls: 'ok' };
  out.label = out.v;
  if (isOld(r, now)) { out.cls = 'warn old'; out.s = oldMsg(r, now); }
  return out;
}

// ---- the feed's age
function feedTile(hb, risk, now) {
  if (!hb) return wait('recorder');
  const old = isOld(hb, now);
  const ages = DEFAULTS.products.map(p => {
    const v = (hb.products || {})[p];
    if (!v) return null;
    return { p, s: old && v.last_ns ? now - v.last_ns / 1e9 : v.age_s };
  }).filter(a => a && ok(a.s));
  if (hb.connected === false) return { v: t('feedDown'), s: hb.error || '', cls: 'bad' };
  if (!ages.length) return { v: null, s: t('noData') };
  const worst = Math.max(...ages.map(a => a.s));
  const limit = risk && risk.checks && risk.checks.feed_btc && risk.checks.feed_btc.limit || DEFAULTS.feedWarnS;
  return { v: dur(worst).replace(/ s$/, ''), u: worst < 60 ? 's' : '', cls: worst > limit ? 'bad' : 'ok',
    s: old ? oldMsg(hb, now) : join(ages.map(a => t('perProduct', { p: a.p.split('-')[0], s: dur(a.s) }))) };
}

function midTile(hb, product, fallback, now) {
  const q = hb && hb.products && hb.products[product] && hb.products[product].quote;
  const bid = q ? +q.bid : NaN, ask = q ? +q.ask : NaN;
  if (ok(bid) && ok(ask)) {
    return { v: fmt((bid + ask) / 2, 2), u: 'USD', cls: isOld(hb, now) ? 'old' : '',
      s: isOld(hb, now) ? oldMsg(hb, now) : t('bidAsk', { a: fmt(bid, 2), b: fmt(ask, 2) }) };
  }
  if (fallback && ok(fallback.mid)) return { v: fmt(fallback.mid, 2), u: 'USD', cls: isOld(fallback, now) ? 'old' : '', s: isOld(fallback, now) ? oldMsg(fallback, now) : '' };
  return wait('recorder');
}

// ---- the whole page
let glanced = '', glancedAt = 0;
function render() {
  const now = Date.now() / 1000;
  const { hb, status, risk, fill } = data;
  // Position and PnL: the strategy's own row, or Risk Monitor's when that is the newer one.
  const book = [status, risk].filter(r => r && ok(r.day_pnl)).sort((a, b) => b.t - a.t)[0];
  const old = book && isOld(book, now);

  if (!book) { set('pnl', wait('maker')); set('pos', wait('maker')); trend([]); }
  else {
    const pts = data.pnl.filter(p => !book.day || p.day === book.day);
    if (!old && (!pts.length || book.t > pts[pts.length - 1].t)) pts.push({ t: book.t, day_pnl: book.day_pnl });
    const r = trend(pts), flat = +book.day_pnl.toFixed(2) === 0;
    set('pnl', { v: signed(book.day_pnl, 2), u: 'USD', cls: join([flat ? '' : book.day_pnl > 0 ? 'up' : 'down', old && 'old']).replace(' · ', ' '),
      s: old ? oldMsg(book, now) : r ? t('range', { a: signed(r.lo, 2), b: signed(r.hi, 2) }) : t('noTrend') });
    const pos = ok(book.position) ? book.position : 0, state = book.state || (book.maker && book.maker.state);
    const side = +pos.toFixed(4) === 0 ? 'flat' : pos > 0 ? 'long' : 'short';
    set('pos', { v: signed(pos, 4), u: 'BTC', cls: old ? 'old' : '',
      s: old ? oldMsg(book, now) : join([t(side), side !== 'flat' && ok(book.avg_price) && t('avg', { s: fmt(book.avg_price, 2) }), state && (has('st_' + state) ? t('st_' + state) : state)]) });
  }

  set('btc', midTile(hb, 'BTC-USD', status, now));
  set('eth', midTile(hb, 'ETH-USD', null, now));

  if (!book || !ok(book.fills_today)) set('fills', wait('maker'));
  else {
    const last = fill && ok(+fill.price) && t('lastFill', { side: has(fill.side) ? t(fill.side) : fill.side || '', size: plain(+fill.size, 4),
      price: fmt(+fill.price, 2), ago: t('ago', { s: dur(now - fill.t) }) });
    set('fills', { v: book.fills_today.toLocaleString(), cls: old ? 'old' : '',
      s: old ? oldMsg(book, now) : last || (ok(book.volume_today) ? t('volume', { s: fmt(book.volume_today, 2) }) : '') });
  }

  const rk = riskTile(risk, now);
  set('risk', rk);
  set('feed', feedTile(hb, risk, now));

  $('day').textContent = (book && book.day || new Date().toISOString().slice(0, 10)) + ' UTC';
  const missing = [!hb && 'recorder', !status && 'maker', !risk && 'risk'].filter(Boolean);
  $('empty').hidden = !missing.length;
  $('empty').textContent = missing.length === 3 ? t('emptyAll') : t('emptySome', { s: missing.map(k => t('n_' + k)).join(', ') });

  // The line on the app's card: the day's PnL and the risk state.
  if (window.kit && kit.glance && now - glancedAt > 30 || rk.label !== glanced) {
    glancedAt = now; glanced = rk.label;
    try {
      if (window.kit && kit.glance) kit.glance(book ? { text: join([signed(book.day_pnl, 2) + ' USD', rk.label]).slice(0, 60), attention: rk.cls === 'bad' || !!(risk && risk.stop) } : null);
    } catch (e) { /* the card line is optional */ }
  }
}

applyLabels();
$('trend').setAttribute('aria-label', t('trendAlt'));
const tryMode = new URLSearchParams(location.search).get('try');   // empty | breach: for checking the page only
if (tryMode === 'breach') madeUp();
render();
if (!tryMode) start(render);
setInterval(render, 1000);
