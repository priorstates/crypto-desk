import { t, applyLabels } from './i18n.js';
import { sample } from './sample.js';

const DEFAULTS = { products: 'BTC-USD,ETH-USD', data_dir: '~/market-data', cap_gb: 5, keep_days: 30, min_free_gb: 1 };
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const secs = v => (v > 1e12 ? v / 1000 : v);
let hb = null, gaps = [], formFilled = false;

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

// ---- formats
function dur(s) {
  if (s == null || isNaN(s)) return '–';
  s = Math.max(0, s);
  if (s < 10) return s.toFixed(1) + ' s';
  if (s < 60) return Math.round(s) + ' s';
  if (s < 3600) return Math.floor(s / 60) + ' min ' + Math.round(s % 60) + ' s';
  if (s < 86400) return Math.floor(s / 3600) + ' h ' + Math.floor(s % 3600 / 60) + ' min';
  return Math.floor(s / 86400) + ' d ' + Math.floor(s % 86400 / 3600) + ' h';
}
function bytes(n) {
  if (n == null) return '–';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return (i && n < 100 ? n.toFixed(1) : Math.round(n)) + ' ' + u[i];
}
function spread(q) {
  const d = Math.max((q.bid.split('.')[1] || '').length, (q.ask.split('.')[1] || '').length);
  const v = Number(q.ask) - Number(q.bid);
  return isNaN(v) ? '–' : v.toFixed(d);
}

// ---- the page
function card(name, p, behind) {
  const q = p && p.quote, tr = p && p.trade;
  const age = p && p.age_s != null ? p.age_s : null;   // as the recorder measured it; an old heartbeat has its own banner
  const cls = age == null ? '' : age < 5 ? '' : age < 15 ? 'warn' : 'bad';
  const ago = ev => t('ago', { s: dur((hb.t_ns - ev.recv_ns) / 1e9 + behind) });
  const side = tr && (tr.maker_side === 'sell' ? t('takerBuy') : t('takerSell'));
  return `<article class="card" data-product="${esc(name)}">
    <div class="phead"><h2>${esc(name)}</h2><span class="age ${cls}">${t('feedAge', { s: dur(age) })}</span></div>
    <div class="book">
      <div><small>${t('bid')}</small><b>${esc(q ? q.bid : '–')}</b><em>${esc(q ? q.bid_size : '')}</em></div>
      <div><small>${t('ask')}</small><b>${esc(q ? q.ask : '–')}</b><em>${esc(q ? q.ask_size : '')}</em></div>
    </div>
    <dl>
      <div><dt>${t('lastQuote')}</dt><dd>${q ? ago(q) + ' · ' + t('spread') + ' ' + spread(q) : '–'}</dd></div>
      <div><dt>${t('lastTrade')}</dt><dd>${tr ? `${esc(tr.price)} × ${esc(tr.size)} ${side} · ${ago(tr)}` : '–'}</dd></div>
      <div><dt>${t('rate')}</dt><dd>${p ? p.msgs_min.toLocaleString() : '–'}</dd></div>
      <div><dt>${t('gapsToday')}</dt><dd>${p ? p.gaps_today : '–'}</dd></div>
      <div><dt>${t('filesToday')}</dt><dd>${p ? t('filesVal', { q: bytes(p.files.quotes), t: bytes(p.files.trades) }) : '–'}</dd></div>
    </dl>
    ${p && p.gap_open ? `<p class="gapopen">${esc(t('gapOpen', { s: new Date(p.gap_open.start_ns / 1e6).toISOString().slice(11, 19) + ' UTC', e: p.gap_open.reason }))}</p>` : ''}
  </article>`;
}

function banner(text, bad) {
  const b = $('banner');
  b.hidden = !text;
  b.textContent = text || '';
  b.classList.toggle('bad', !!bad);
}

function render() {
  const behind = hb ? Math.max(0, Date.now() / 1000 - secs(hb.t)) : 0;
  if (!hb) banner(t('noData'));
  else if (behind > 20) banner(t('stale', { s: dur(behind) }), true);
  else if (!hb.connected) banner(t('down', { e: hb.error }), true);
  else if (hb.paused) banner(t('paused', { e: hb.pause_why }), true);
  else banner('');
  const names = hb ? Object.keys(hb.products) : DEFAULTS.products.split(',');
  $('products').innerHTML = names.map(n => card(n, hb && hb.products[n], behind)).join('');
  const d = hb && hb.disk;
  $('diskUsed').textContent = bytes(d && d.used);
  $('diskCap').textContent = d ? bytes(d.cap) : DEFAULTS.cap_gb + ' GB';
  $('diskFree').textContent = bytes(d && d.free);
  const part = d && d.cap ? Math.min(1, (d.used || 0) / d.cap) : 0;
  $('diskBar').style.width = (part * 100).toFixed(1) + '%';
  $('diskBar').classList.toggle('warn', part > 0.9);
  $('diskNote').textContent = d ? t('diskNote', { dir: d.data_dir, days: d.days, oldest: d.oldest_day || '–' }) : '';
  const rows = gaps.slice(-50).reverse();
  $('gapsEmpty').hidden = rows.length > 0;
  $('gapsTable').hidden = rows.length === 0;
  $('gapsTable').tBodies[0].innerHTML = rows.map(g => `<tr><td>${esc(g.product)}</td>
    <td>${esc(String(g.start).slice(0, 19).replace('T', ' '))}</td><td>${dur(g.seconds)}</td>
    <td class="wrap">${esc(g.reason)}</td><td>${g.missed_trades ?? ''}</td></tr>`).join('');
  if (!formFilled) fillForm(hb ? hb.settings : DEFAULTS, !!hb);
}

// ---- settings
function fillForm(values, final) {
  const f = $('settings');
  for (const k in DEFAULTS) f.elements[k].value = values[k] ?? DEFAULTS[k];
  formFilled = final;
}
$('settings').addEventListener('input', () => { formFilled = true; });
$('settings').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target.elements;
  const values = {
    products: f.products.value.toUpperCase().split(/[\s,;]+/).filter(Boolean).join(','),
    data_dir: f.data_dir.value.trim(),
    cap_gb: Number(f.cap_gb.value), keep_days: Number(f.keep_days.value), min_free_gb: Number(f.min_free_gb.value),
  };
  try {
    await forge.services.setSettings(values);
    f.products.value = values.products;
    forge.toast(t('saved'));
  } catch (err) {
    forge.toast(t('saveFailed', { e: err && err.message || err }));
  }
});

// ---- data: the recorder's streams, read through Studio
function newest(rows) {
  for (const r of rows || []) if (r && r.products && (!hb || secs(r.t) >= secs(hb.t))) hb = r;
  render();
}
function moreGaps(rows) {
  const seen = new Set(gaps.map(g => g.product + g.end_ns));
  for (const r of rows || []) if (r && r.product && !seen.has(r.product + r.end_ns)) gaps.push(r);
  gaps.sort((a, b) => a.end_ns - b.end_ns);
  render();
}
async function start() {
  applyLabels();
  render();
  try { forge.services.panel($('services')); } catch (e) { forge.log('services panel', String(e)); }
  if (new URLSearchParams(location.search).has('sample')) {   // layout check only
    const s = sample();
    hb = s.hb; gaps = s.gaps;
  } else {
    const now = Date.now() / 1000;
    try {
      newest(await forge.stream.read('', 'heartbeat', { since: now - 120, limit: 30 }));
      moreGaps(await forge.stream.read('', 'gaps', { since: now - 7 * 86400, limit: 200 }));
      forge.stream.subscribe('', 'heartbeat', newest, { every: 2000 });
      forge.stream.subscribe('', 'gaps', moreGaps, { every: 5000 });
    } catch (e) { forge.log('streams', String(e)); }
  }
  setInterval(render, 1000);
}
start();
