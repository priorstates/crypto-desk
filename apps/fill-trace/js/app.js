// Fill Trace: a viewer. It only reads other apps' streams through Studio; it starts, stops and sends nothing.
import { t, applyLabels } from './i18n.js';
import { renderStory, px, sgn, clock } from './story.js';
import { sample } from './sample.js';

const DEFAULTS = {
  lookback_h: 24,    // how far back the fill list goes
  max_fills: 200,    // how many fills the list shows (newest first)
  settle_s: 40,      // the fill opened by default is the newest one at least this old, so its markouts are in
  product: 'BTC-USD', // the product whose mid is read from Market Recorder when the maker's status has none
  max_rows: 45000,   // the most rows one read asks for (a day of 2 s status rows)
  window_s: 60,      // seconds each side of the fill: the chart, and which risk events count as near
};
const MAKER = 'paper-market-maker', RISK = 'risk-monitor', RECORDER = 'market-recorder';
const cfg = { ...DEFAULTS };
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const key = r => r.id + ':' + r.local_ns;
const sampleMode = new URLSearchParams(location.search).has('sample');

let fills = [], markouts = new Map(), riskRows = new Map(), makerEvents = [];
let chosen = null, picked = false;          // the fill's key; picked = the person chose it (else follow the newest)
let statusFor = null, status = [];          // status rows around the chosen fill
let streams = { fills: false, risk: false }, problem = '', loaded = false;

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

// ---- events near a fill, in one shape: {t, tone, text, sub}
function eventsNear(t0) {
  const out = [], near = s => s && Math.abs(s - t0) <= cfg.window_s;
  for (const e of riskRows.values()) {
    const check = e.check || '';
    const detail = [e.reason || (e.value != null && e.limit != null ? t('valLimit', { v: e.value, l: e.limit }) : ''),
      e.stop_sent ? t('sentStop') : ''].filter(Boolean).join(' · ');
    if (e.kind === 'clear' || e.kind === 'released') { if (near(e.t)) out.push({ t: e.t, tone: 'okev', text: t('ev_' + e.kind), sub: e.reason || '' }); continue; }
    if (near(e.opened)) out.push({ t: e.opened, tone: 'risk', text: t('ev_breach', { c: check }), sub: detail });
    if (near(e.recovered)) out.push({ t: e.recovered, tone: 'okev', text: t('ev_recovered', { c: check }), sub: '' });
  }
  for (const e of makerEvents) {
    const at = e.local_ns ? e.local_ns / 1e9 : e.t;
    if (!near(at) || !['stop', 'resume', 'feed_stale', 'feed_ok'].includes(e.type)) continue;
    out.push({ t: at, tone: e.type === 'stop' || e.type === 'feed_stale' ? 'risk' : 'okev', text: t('ev_' + e.type, { by: e.by || '' }), sub: e.reason || '' });
  }
  return out.sort((a, b) => a.t - b.t);
}

// ---- the page
function render() {
  const now = Date.now() / 1000;
  const list = fills.slice(-cfg.max_fills).reverse();
  if (!picked || !fills.some(f => key(f) === chosen)) {
    // by default the newest fill old enough for its 1, 5 and 30 s markouts to be measured
    const ready = list.find(f => now - f.local_ns / 1e9 >= cfg.settle_s) || list[0];
    chosen = ready ? key(ready) : null;
  }
  const b = $('banner');
  const note = sampleMode ? t('sampleNote') : problem ? t('cantRead', { e: problem }) : loaded && !streams.fills ? t('noMaker') : '';
  b.hidden = !note; b.textContent = note;
  $('count').textContent = list.length ? '· ' + (fills.length > list.length ? t('shown', { n: list.length }) : t('lastH', { h: cfg.lookback_h })) : '';
  $('live').textContent = list.length ? t('live', { s: dur(now - list[0].local_ns / 1e9) }) : '';

  let day = '', html = '';
  const today = new Date().toISOString().slice(0, 10);
  for (const f of list) {
    const d = new Date(f.local_ns / 1e6).toISOString().slice(0, 10);
    if (d !== day) { day = d; html += `<div class="day">${d === today ? t('today') : d}</div>`; }
    const mo = markouts.get(key(f)), m = mo ? mo.m30 : null;
    html += `<button class="fill${key(f) === chosen ? ' on' : ''}" data-k="${esc(key(f))}"><span class="t">${clock(f.local_ns / 1e9)}</span>
      <b class="${f.side === 'buy' ? 'up' : 'down'}">${esc(t(f.side))}</b><span>${px(f.price)}</span>
      <span class="m ${m > 0 ? 'up' : m < 0 ? 'down' : ''}" title="+30 s, USD/BTC">${m == null ? '' : sgn(m)}</span></button>`;
  }
  const box = $('fills'), top = box.scrollTop;
  box.innerHTML = html; box.scrollTop = top;
  box.hidden = !list.length;
  $('fillsEmpty').hidden = !!list.length || !loaded;
  $('fillsEmpty').textContent = t('emptyFills', { h: cfg.lookback_h });

  const f = fills.find(r => key(r) === chosen);
  $('detail').hidden = !f;
  $('pick').hidden = !!f || !loaded;
  $('pick').innerHTML = `<b>${t('emptyTitle')}</b>${esc(streams.fills || sampleMode ? t('emptyFills', { h: cfg.lookback_h }) : t('noMaker'))}`;
  if (!f) return;
  if (statusFor !== chosen) { status = []; loadStatus(f); }
  renderStory({ head: $('head'), marks: $('marks'), chart: $('chart'), legend: $('legend'), quote: $('quote'),
    timeline: $('timeline'), timelineTitle: $('timelineTitle') },
    { fill: f, mo: markouts.get(key(f)), status, events: eventsNear(f.local_ns / 1e9), cfg, riskStream: streams.risk || sampleMode, now });
}
function dur(s) {
  s = Math.max(0, s);
  if (s < 60) return Math.round(s) + ' s';
  if (s < 3600) return Math.floor(s / 60) + ' min';
  return Math.floor(s / 3600) + ' h ' + Math.floor(s % 3600 / 60) + ' min';
}

// the maker's status for the minute each side of the fill (2 s rows); read again while that minute is still running
let sampleData = null;
async function loadStatus(f) {
  const k = key(f), t0 = f.local_ns / 1e9, w = cfg.window_s + 4;
  statusFor = k;
  // A read returns the newest `limit` rows after `since`, so the limit must reach from the fill's minute up to now.
  const age = Date.now() / 1000 - t0;
  const around = async (app, name, every) => {
    const rows = await forge.stream.read(app, name, { since: t0 - w, limit: Math.min(cfg.max_rows, Math.ceil((age + w) / every * 1.3) + 50) }) || [];
    return rows.filter(r => r && r.t >= t0 - w && r.t <= t0 + w).sort((a, b) => a.t - b.t);
  };
  let rows = [];
  if (sampleData) rows = sampleData.status.filter(r => Math.abs(r.t - t0) <= w);
  else {
    try { rows = await around(MAKER, 'status', 2); } catch (e) { forge.log('status', String(e)); }
    if (statusFor !== k) return;
    // no status for that minute: the mid alone, from Market Recorder's heartbeat (every 5 s)
    if (rows.length < 2) try {
      const hb = (await around(RECORDER, 'heartbeat', 5)).map(r => {
        const q = r.products && r.products[cfg.product] && r.products[cfg.product].quote;
        const at = q && q.recv_ns ? q.recv_ns / 1e9 : r.t;
        return q && +q.bid && +q.ask ? { t: at, midOnly: true, mid: (+q.bid + +q.ask) / 2, bid: +q.bid, ask: +q.ask } : null;
      }).filter(Boolean);
      if (hb.length > rows.length) rows = hb;
    } catch (e) { forge.log('heartbeat', String(e)); }
  }
  if (statusFor !== k) return;
  status = rows;
  render();
}
setInterval(() => {
  const f = fills.find(r => key(r) === chosen);
  if (f && !sampleData && Date.now() / 1000 - f.local_ns / 1e9 < cfg.window_s + 10) loadStatus(f);
  else if (f) render();
}, 5000);

// ---- choosing a fill: a click, or the arrow keys in the list
function choose(k) { chosen = k; picked = true; render(); }
$('fills').addEventListener('click', e => { const b = e.target.closest('.fill'); if (b) choose(b.dataset.k); });
$('fills').addEventListener('keydown', e => {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  e.preventDefault();
  const list = fills.slice(-cfg.max_fills).reverse(), i = list.findIndex(f => key(f) === chosen);
  const next = list[Math.max(0, Math.min(list.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
  if (next) { choose(key(next)); const el = $('fills').querySelector('.fill.on'); if (el) { el.focus(); el.scrollIntoView({ block: 'nearest' }); } }
});

// ---- data
const names = l => (Array.isArray(l) ? l : l && typeof l === 'object' ? (l.streams || Object.keys(l)) : [])
  .map(s => typeof s === 'string' ? s : s && (s.name || s.stream)).filter(Boolean);
const addFills = rows => {
  const seen = new Set(fills.map(key));
  for (const r of rows || []) if (r && r.local_ns && !seen.has(key(r))) fills.push(r);
  fills.sort((a, b) => a.local_ns - b.local_ns);
  render();
};
const addMarkouts = rows => { for (const r of rows || []) if (r && r.local_ns) markouts.set(key(r), r); render(); };
const addRisk = rows => { for (const r of rows || []) if (r && r.id != null) { const old = riskRows.get(r.id); if (!old || r.t >= old.t) riskRows.set(r.id, r); } render(); };
const addMaker = rows => { for (const r of rows || []) if (r && r.type) makerEvents.push(r); render(); };

async function start() {
  applyLabels();
  const now = Date.now() / 1000, since = now - cfg.lookback_h * 3600;
  if (sampleMode) {
    sampleData = sample(now);
    loaded = true;
    addMarkouts(sampleData.markouts); addRisk(sampleData.risk); addMaker(sampleData.maker); addFills(sampleData.fills);
    const n = Number(new URLSearchParams(location.search).get('sample'));   // ?sample=3: open the 4th newest
    if (n) choose(key(fills[fills.length - 1 - n]));
    return;
  }
  render();
  let maker = [], risk = [];
  try { maker = names(await forge.stream.list(MAKER)); } catch (e) { forge.log('list maker', String(e)); }
  try { risk = names(await forge.stream.list(RISK)); } catch (e) { forge.log('list risk', String(e)); }
  streams = { fills: maker.includes('fills'), risk: risk.includes('events') };
  const follow = async (app, name, add, every, limit) => {
    add(await forge.stream.read(app, name, { since: since - 120, limit }));
    forge.stream.subscribe(app, name, add, { every });
  };
  try {
    if (streams.fills) await follow(MAKER, 'fills', addFills, 3000, cfg.max_fills * 5);
    if (maker.includes('markouts')) await follow(MAKER, 'markouts', addMarkouts, 4000, cfg.max_fills * 8);
    if (maker.includes('events')) await follow(MAKER, 'events', addMaker, 10000, 1000);
    if (streams.risk) await follow(RISK, 'events', addRisk, 5000, 2000);
  } catch (e) { problem = String(e && e.message || e); forge.log('streams', problem); }
  loaded = true;
  render();
  const n = Number(new URLSearchParams(location.search).get('n'));   // ?n=150: open the 151st newest (a check)
  if (n && fills.length) choose(key(fills[Math.max(0, fills.length - 1 - n)]));
}
start();
