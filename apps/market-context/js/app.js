import { t, applyLabels } from './i18n.js';
import { DEFAULTS, dayHours, toSample, aggregate, better, metrics, marks, bucketPnl, fmt, madeUp } from './data.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const secs = v => (v > 1e12 ? v / 1000 : Number(v));
const tryMode = new URLSearchParams(location.search).get('try');
const P = DEFAULTS.products;
const METRICS = ['spread', 'vol', 'rate'];

let day = dayHours();
const samples = Object.fromEntries(P.map(p => [p, []]));
let kept = Object.fromEntries(P.map(p => [p, {}]));     // sums of hours seen earlier, by hour start
let pnlRows = [], lastHb = 0, sel = null, notice = null, savedAt = 0, dirty = false;
let pnlOn = false, pnlState = 'wait';                   // wait (being read) | ok | none (no such stream) | fail
const pnlSeen = new Set();

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

function dur(s) {
  s = Math.max(0, s);
  if (s < 60) return Math.round(s) + ' s';
  if (s < 3600) return Math.floor(s / 60) + ' min';
  return Math.floor(s / 3600) + ' h ' + Math.floor(s % 3600 / 60) + ' min';
}

// ---- what was seen earlier today (kv 'hours')
function loadKept() {
  const k = forge.kv.getJSON('hours', null);
  if (k && k.date === day.date && k.unit === DEFAULTS.spreadUnit && k.zone === DEFAULTS.hours && k.p)
    for (const p of P) kept[p] = k.p[p] || {};
}
function saveKept() {
  if (tryMode || !dirty || Date.now() - savedAt < 60000) return;
  forge.kv.setJSON('hours', { date: day.date, unit: DEFAULTS.spreadUnit, zone: DEFAULTS.hours, p: kept });
  savedAt = Date.now(); dirty = false;
}

// ---- the figures, per hour
function work(nowS) {
  const m = {};
  for (const p of P) {
    const agg = aggregate(samples[p], day);
    m[p] = day.hours.map((h, i) => {
      if (h.start > nowS) return null;
      const o = better(agg[i], kept[p][h.start]);
      if (o && o[4] > 0 && o !== kept[p][h.start]) { kept[p][h.start] = o.map(v => +v.toPrecision(9)); dirty = true; }
      return metrics(o, nowS - h.start);
    });
  }
  return { m, pnl: bucketPnl(pnlRows, day) };
}

// ---- drawing
function plot(metric, v, nowIdx) {
  const per = P.map(p => v.m[p].map(x => (x ? x[metric] : null)));
  const tops = per.map(a => Math.max(0, ...a.filter(x => x != null)));
  const mk = per.map(marks);
  $('p-' + metric).innerHTML = day.hours.map((h, i) => {
    const bars = P.map((p, k) => {
      const x = per[k][i];
      if (x == null) return '';
      return `<i class="mh-b p${k} ${mk[k][i]}${v.m[p][i].partial && i !== nowIdx ? ' partial' : ''}" style="height:${(tops[k] ? x / tops[k] * 100 : 0).toFixed(1)}%"></i>`;
    }).join('');
    return `<div class="mh-col${i > nowIdx ? ' future' : bars ? '' : ' unknown'}${i === nowIdx ? ' now' : ''}${i === sel ? ' sel' : ''}" data-h="${i}">${bars}</div>`;
  }).join('');
  $('s-' + metric).innerHTML = P.map((p, k) =>
    `<div><i class="mh-dot p${k}"></i>${esc(p)} <b>${fmt(per[k][nowIdx], metric)}</b> · ${t('high')} ${fmt(tops[k] || null, metric)}</div>`).join('');
  return mk;
}
function plotPnl(v, nowIdx) {
  const a = v.pnl.hours, top = Math.max(0, ...a.filter(x => x != null).map(Math.abs));
  $('p-pnl').innerHTML = day.hours.map((h, i) => {
    const x = a[i];
    const bar = x == null ? '' : `<i class="mh-b ${x >= 0 ? 'up' : 'down'}" style="height:${Math.max(1.5, top ? Math.abs(x) / top * 48 : 0).toFixed(1)}%"></i>`;
    return `<div class="mh-col${i > nowIdx ? ' future' : bar ? '' : ' unknown'}${i === nowIdx ? ' now' : ''}${i === sel ? ' sel' : ''}" data-h="${i}">${bar}</div>`;
  }).join('');
  const tot = v.pnl.total;
  $('s-pnl').innerHTML = tot == null ? esc(t(pnlState === 'wait' ? 'pnlWait' : pnlState === 'fail' ? 'pnlFail' : 'noPnl'))
    : `<div>${t('today')} <b class="${tot >= 0 ? 'pos' : 'neg'}">${fmt(tot, 'pnl')} USD</b></div>`;
}
function readout(v, nowIdx, volMarks) {
  const i = sel ?? nowIdx, h = day.hours[i], next = day.hours[i + 1];
  const zone = day.utc ? 'UTC' : '';
  let html = `<b class="mh-hour">${h.label}:00–${next ? next.label : '24'}:00 ${zone}</b>`;
  if (i === nowIdx) html += `<span>${t('now')}</span>`;
  const x = v.pnl.hours[i];
  html += `<span>${t('pnl')} <b class="${x == null ? '' : x >= 0 ? 'pos' : 'neg'}">${fmt(x, 'pnl')}</b></span>`;
  P.forEach((p, k) => {
    const m = v.m[p][i];
    html += `<span><i class="mh-dot p${k}"></i>${esc(p)} ` + (m
      ? `${t('spread')} <b>${fmt(m.spread, 'spread')}</b> · ${t('vol')} <b>${fmt(m.vol, 'vol')}</b> · ${t('rate')} <b>${fmt(m.rate, 'rate')}</b>`
        + (volMarks[k][i] ? ` <i class="mh-tag ${volMarks[k][i]}">${t(volMarks[k][i] === 'hi' ? 'wild' : 'quiet')}</i>` : '')
        + (m.partial && i !== nowIdx ? ` (${t('partialTag')})` : '')
      : t('noHour')) + '</span>';
  });
  $('readout').innerHTML = html;
}
function banner(text, warn) {
  const b = $('banner');
  b.hidden = !text; b.textContent = text || ''; b.classList.toggle('warn', !!warn);
}

function render() {
  const nowS = Date.now() / 1000;
  if (nowS >= day.end) return location.reload();          // a new day: start clean
  const v = work(nowS);
  const nowIdx = Math.min(day.hours.length - 1, Math.floor((nowS - day.start) / 3600));
  plotPnl(v, nowIdx);
  const mk = {};
  for (const m of METRICS) mk[m] = plot(m, v, nowIdx);
  readout(v, nowIdx, mk.vol);

  const firstSeen = day.hours.findIndex((h, i) => P.some(p => v.m[p][i]));
  const age = lastHb ? nowS - lastHb : null;
  const live = $('live');
  live.textContent = tryMode === 'sample' ? t('sample') : age == null ? '' : t('live', { s: dur(age) });
  live.classList.toggle('warn', tryMode === 'sample' || age > 20);
  if (notice) banner(notice, true);
  else if (firstSeen < 0) banner(t('empty'));
  else if (!tryMode && age > 20) banner(t('stale', { s: dur(age) }), true);
  else if (firstSeen > 0) banner(t('reach', { h: day.hours[firstSeen].label + ':00', n: DEFAULTS.pageRows.toLocaleString() }));
  else banner('');

  const cur = v.m[P[0]][nowIdx];
  if (!tryMode && window.kit && kit.glance) kit.glance(cur ? t('glance', { v: fmt(cur.vol, 'vol'), r: fmt(cur.rate, 'rate') }) : null);
  saveKept();
}

// ---- data: the other apps' streams, read through Studio
function moreHb(rows) {
  for (const r of rows || []) {
    const ts = r && secs(r.t);
    if (!r || !r.products || !(ts > lastHb)) continue;
    lastHb = ts;
    for (const p of P) { const s = toSample(r, p); if (s) samples[p].push(s); }
  }
  render();
}
function morePnl(rows) {
  for (const r of rows || []) {
    if (!r || r.day_pnl == null || secs(r.t) < day.start || pnlSeen.has(r.t)) continue;
    pnlSeen.add(r.t); pnlRows.push(r);
  }
}
// The desk's PnL, read as Desk Today reads it: on its own (not behind the recorder's rows), today's rows
// in steps, then each new batch; looked for again every 30 s until it is there.
async function watchPnl() {
  if (pnlOn) return;
  const mk = DEFAULTS.makerApp, pn = DEFAULTS.pnlStream;
  const theirs = await names(mk);
  if (pnlOn) return;
  if (theirs && !theirs.includes(pn)) { pnlState = 'none'; return render(); }
  pnlOn = true;
  try {
    let since = day.start, last = 0;
    for (let i = 0; i < 6; i++) {
      const rows = (await forge.stream.read(mk, pn, { since, limit: 3000 })) || [];
      morePnl(rows);
      const newest = rows.length ? secs(rows[rows.length - 1].t) : 0;
      if (!rows.length || newest <= last || newest > Date.now() / 1000 - 120) break;
      last = since = newest;
    }
    pnlState = 'ok';
    render();
    forge.stream.subscribe(mk, pn, rows => { if (rows && rows.length) { morePnl(rows); render(); } },
      { every: DEFAULTS.refreshMs, since: pnlRows.reduce((m, r) => Math.max(m, secs(r.t)), day.start), limit: 500 });
  } catch (e) {
    pnlOn = false; pnlState = 'fail';
    forge.log('pnl', String(e && e.message || e));
    render();
  }
}
async function names(app) {
  try { return ((await forge.stream.list(app)) || []).map(s => s.name); } catch (e) { forge.log('list', app, String(e)); return null; }
}

async function start() {
  applyLabels();
  $('sub').textContent = t('sub', { d: day.date, z: day.utc ? 'UTC' : t('local') });
  $('u-spread').textContent = t(DEFAULTS.spreadUnit === 'usd' ? 'usd' : 'bps');
  $('axis').innerHTML = day.hours.map((h, i) => `<span>${i % 3 ? '' : h.label}</span>`).join('');
  const panel = $('panel');
  panel.addEventListener('mouseover', e => {
    const c = e.target.closest('.mh-col'), h = c ? Number(c.dataset.h) : null;
    if (h !== sel && (c || !e.target.closest('.mh-plot'))) { sel = h; render(); }
  });
  panel.addEventListener('mouseleave', () => { if (sel != null) { sel = null; render(); } });

  if (tryMode === 'sample') {
    const s = madeUp(day);
    for (const p of P) samples[p] = s.samples[p];
    pnlRows = s.pnl; pnlState = 'ok'; lastHb = Date.now() / 1000;
  } else if (tryMode) pnlState = 'ok';
  else {
    loadKept();
    render();
    watchPnl();
    setInterval(watchPnl, 30000);
    const rec = DEFAULTS.recorderApp, hb = DEFAULTS.heartbeatStream;
    const have = await names(rec);
    if (have && !have.includes(hb)) notice = t('noStream', { n: hb, s: have.join(', ') || t('none') });
    else {
      try {
        moreHb(await forge.stream.read(rec, hb, { since: day.start, limit: DEFAULTS.pageRows }));
        forge.stream.subscribe(rec, hb, moreHb, { every: DEFAULTS.refreshMs });
      } catch (e) { notice = t('readFail', { e: e && e.message || e }); forge.log('heartbeat', String(e)); }
    }
  }
  render();
  setInterval(render, DEFAULTS.refreshMs);
}
start();
