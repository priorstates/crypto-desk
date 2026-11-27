import { DEFAULTS, load, totals, avg, HORIZONS } from './data.js';
import { t, lang, locale } from './i18n.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nf = (d) => new Intl.NumberFormat(locale, { minimumFractionDigits: d, maximumFractionDigits: d });
const signed = (v, d = 2) => (v > 0 ? '+' : v < 0 ? '−' : '') + nf(d).format(Math.abs(v));
const tone = v => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');
const DASH = '—';
let model = null;

function dayLabel(day) {
  const d = new Date(day + 'T00:00:00Z');
  return new Intl.DateTimeFormat(locale, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(d);
}
function num(v, cls, tip) {
  if (v == null) return `<span class="num none"${tip ? ` title="${esc(tip)}"` : ''}>${DASH}</span>`;
  return `<span class="num ${cls || ''}">${v}</span>`;
}
const money = v => (v == null ? num(null) : num(signed(v), tone(v)));
const count = (v, tip) => (v == null ? num(null, '', tip) : num(nf(0).format(v), v ? '' : 'zero'));
const alertN = v => (v == null ? num(null) : num(nf(0).format(v), v ? 'warn' : 'zero'));
function mark(c, part) {
  const a = avg(c);
  return a == null ? num(null) : num(signed(a) + (part ? '<i>*</i>' : ''), tone(a));
}

function card(key, value, sub, cls) {
  return `<div class="card ${cls || ''}" data-card="${key}"><span class="label">${esc(t(key))}</span>
    <b class="value">${value}</b><small>${sub || '&nbsp;'}</small></div>`;
}
const ofDays = (a, n) => (a < n ? t('ofDays', { a, b: n }) : t('allDays', { b: n }));

function render() {
  const m = model, tot = totals(m.rows);
  const any = tot.seen > 0, n = tot.seen;      // "of n days": the days the desk has data for
  const first = m.rows[m.rows.length - 1].day, last = m.rows[0].day;
  const age = m.lastPnlT ? m.now - m.lastPnlT : 0;
  const old = any && m.lastPnlT && age > DEFAULTS.staleDataS;
  const ageTxt = age >= 7200 ? Math.round(age / 3600) + ' ' + t('h') : Math.round(age / 60) + ' ' + t('min');
  $('sub').innerHTML = esc(t('range', { a: dayLabel(first), b: dayLabel(last) })) + ' · ' +
    (old ? `<span class="warn">${esc(t('lastData', { age: ageTxt }))}</span>`
      : esc(t('updated', { t: new Date(m.now * 1000).toISOString().slice(11, 19) })));

  const mkCells = HORIZONS.map(h => `<span><em>${h} s</em>${mark(tot.mk[h], any && tot.mkPart)}</span>`).join('');
  $('cards').innerHTML =
    card('weekPnl', any && tot.pnlDays ? `<span class="${tone(tot.pnl)}">${signed(tot.pnl)}</span> <u>${t('usd')}</u>` : DASH,
      any ? ofDays(tot.pnlDays, n) : '', 'big') +
    card('fills', any && tot.fillDays ? nf(0).format(tot.fills) : DASH, any ? ofDays(tot.fillDays, n) : '') +
    `<div class="card mk" data-card="mk"><span class="label">${esc(t('mk'))}</span>
       <div class="trio">${mkCells}</div><small>${esc(t('perBtc'))}</small></div>` +
    card('breaches', any && tot.riskDays ? nf(0).format(tot.breaches) : DASH, '', any && tot.breaches ? 'alert' : '') +
    card('stale', any && tot.riskDays ? nf(0).format(tot.stale) : DASH, '', any && tot.stale ? 'alert' : '');

  $('empty').hidden = any;
  $('board').hidden = !any;
  const tip = t('dashTip', { limit: nf(0).format(m.limit) });
  let partN = 0, dashes = false;
  $('rows').innerHTML = m.rows.map(r => {
    const name = `<span class="who"><b>${esc(dayLabel(r.day))}</b>${r.today ? `<small>${esc(t('today'))}</small>` : ''}</span>`;
    if (!r.seen) return `<div class="row off">${name}<span class="nodata">${esc(t('noData'))}</span></div>`;
    if (r.mkPart && r.mk) partN += r.mkN;
    if (r.fills == null || !r.mk) dashes = true;
    const mk = HORIZONS.map(h => (r.mk ? mark(r.mk[h], r.mkPart) : num(null, '', tip))).join('');
    return `<div class="row">${name}${money(r.pnl)}${count(r.fills, tip)}${mk}
      <span class="num-wrap" title="${esc(r.checks.join(', '))}">${alertN(r.breaches)}</span>${alertN(r.stale)}</div>`;
  }).join('');
  $('notes').innerHTML = (partN ? `<p>${esc(t('partial', { n: nf(0).format(partN), limit: nf(0).format(m.limit) }))}</p>` : '') +
    (dashes && any ? `<p>${esc(t('dash'))}</p>` : '') + `<p>${esc(t('foot'))}</p>`;

  if (window.kit && kit.glance) {
    kit.glance(any && tot.pnlDays ? { text: t('glance', { pnl: signed(tot.pnl), n: tot.breaches + tot.stale }) } : null);
  }
}

async function refresh() {
  try { model = await load(DEFAULTS); render(); }
  catch (e) { forge.log('load failed', String(e && e.message || e)); }
}

function start() {
  document.documentElement.lang = lang;
  document.title = t('title');
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
  refresh();
  setInterval(refresh, DEFAULTS.refreshS * 1000);
  // Today's PnL moves every 30 s: follow it between the full reloads.
  forge.stream.subscribe(DEFAULTS.maker, 'pnl', rows => {
    const p = rows[rows.length - 1];
    const r = model && model.rows.find(x => x.day === p.day);
    if (!r || p.day_pnl == null) return;
    r.pnl = +p.day_pnl; r.seen = true; model.lastPnlT = p.t; model.now = Date.now() / 1000;
    render();
  }, { every: 10000, since: Date.now() / 1000, limit: 1 });
}
start();
