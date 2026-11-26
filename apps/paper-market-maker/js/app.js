import { t, applyLabels } from './i18n.js';
import { drawChart } from './chart.js';
import { renderMarkouts } from './markouts.js';
import { sample } from './sample.js';

// The same defaults as the service's (remote/conf.py).
const DEFAULTS = { half_spread_bps: 2, quote_size: 0.01, skew_bps: 2, requote_bps: 1, max_position: 0.25,
  daily_loss_limit: 300, stale_s: 10, data_dir: '~/paper-mm-data', keep_days: 30, stop_at: 0, resume_at: 0 };
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let st = null, fills = [], pnl = [], markouts = [], settings = { ...DEFAULTS }, savedAt = 0, formTouched = false, formFilled = false;

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
const usd = (v, sign = true) => v == null ? '–' : (sign && v > 0 ? '+' : v < 0 ? '−' : '') +
  Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const px = v => v == null ? '–' : Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const btc = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(4);
const clock = ns => new Date(ns / 1e6).toISOString().slice(11, 19);
function dur(s) {
  s = Math.max(0, s);
  if (s < 60) return Math.round(s) + ' s';
  if (s < 3600) return Math.floor(s / 60) + ' min';
  return Math.floor(s / 3600) + ' h ' + Math.floor(s % 3600 / 60) + ' min';
}
const tone = (el, v) => { el.classList.toggle('up', v > 0); el.classList.toggle('down', v < 0); };

// ---- the page
function banner(text, bad) {
  const b = $('banner');
  b.hidden = !text;
  b.textContent = text || '';
  b.classList.toggle('bad', !!bad);
}

function render() {
  const behind = st ? Math.max(0, Date.now() / 1000 - st.t) : 0;
  if (sampleMode) banner(t('sampleNote'));
  else if (!st) banner(t('noData'));
  else if (behind > 20) banner(t('stale', { s: dur(behind) }), true);
  else banner('');
  const s = settings, state = st ? st.state : '';
  const pill = $('state');
  pill.textContent = st ? t(state) : t('unknownState');
  pill.className = 'pill s-' + state;
  let why = '';
  if (state === 'quoting') why = t('whyQuoting');
  else if (state === 'paused') why = t('whyPaused', { e: st.why });
  else if (state === 'stopped') {
    why = (st.stopped_by === 'person' ? t('byPerson') : st.why + '.') + ' ' + t(st.stopped_by === 'person' ? 'untilYou' : 'untilResume');
  }
  $('why').textContent = st ? why + ' ' + t('since', { s: clock(st.since_ns) }) : '';
  $('resume').disabled = state !== 'stopped';
  $('stop').disabled = !st || state === 'stopped';

  const pos = st ? st.position : null;
  $('pos').textContent = pos == null ? '–' : pos === 0 ? t('flat') : btc(pos) + ' BTC';
  tone($('pos'), pos || 0);
  const part = pos && s.max_position ? Math.max(-1, Math.min(1, pos / s.max_position)) : 0;
  const bar = $('posBar');
  bar.style.left = (part < 0 ? 50 + part * 50 : 50) + '%';
  bar.style.width = Math.abs(part) * 50 + '%';
  bar.classList.toggle('warn', Math.abs(part) >= 0.8);
  $('posNote').textContent = t('posNote', { avg: st && pos ? px(st.avg_price) : '–', max: s.max_position });

  const day = st ? st.day_pnl : null;
  $('dayPnl').textContent = day == null ? '–' : usd(day) + ' USD';
  tone($('dayPnl'), day || 0);
  const used = day < 0 && s.daily_loss_limit ? Math.min(1, -day / s.daily_loss_limit) : 0;
  $('lossBar').style.width = used * 100 + '%';
  $('lossBar').className = used >= 0.8 ? 'bad' : used >= 0.5 ? 'warn' : '';
  $('pnlNote').textContent = t('pnlNote', { r: st ? usd(st.realised) : '–', u: st ? usd(st.unrealised) : '–', l: s.daily_loss_limit });

  $('fillsN').textContent = st ? st.fills_today.toLocaleString() : '–';
  $('fillsNote').textContent = st ? t('fillsNote', { v: st.volume_today.toFixed(4), m: px(st.mid) }) : '';

  const q = (id, side) => {
    $(id).textContent = side ? px(side.price) : t('none');
    $(id + 'Size').textContent = side ? side.size + ' BTC' : '';
  };
  q('qBid', st && st.quote_bid);
  q('qAsk', st && st.quote_ask);
  // our spread, and how far each quote sits from the touch (the market's own best bid and ask)
  const qb = st && st.quote_bid, qa = st && st.quote_ask, mid = st && st.bid && st.ask ? (st.bid + st.ask) / 2 : 0;
  const both = v => ({ u: Math.abs(v).toFixed(2), b: (Math.abs(v) / mid * 1e4).toFixed(2) });
  const gap = v => Math.abs(v) < 0.005 ? t('atTouch') : t(v > 0 ? 'behindTouch' : 'insideTouch', both(v));
  $('qSpread').innerHTML = qb && qa && mid ? t('ourSpread', { b: `<b>${both(qa.price - qb.price).b}</b>`, u: both(qa.price - qb.price).u }) : '';
  $('qBidGap').textContent = qb && mid ? gap(st.bid - qb.price) : '';
  $('qAskGap').textContent = qa && mid ? gap(qa.price - st.ask) : '';
  $('mBid').textContent = px(st && st.bid);
  $('mAsk').textContent = px(st && st.ask);

  const today = st ? st.day : new Date().toISOString().slice(0, 10);
  const pts = pnl.filter(p => p.day === today).map(p => ({ t: p.t, v: p.day_pnl }));
  if (st && pts.length && st.t > pts[pts.length - 1].t) pts.push({ t: st.t, v: st.day_pnl });
  const dots = fills.filter(f => f.day === today).map(f => ({ t: f.local_ns / 1e9, v: f.day_pnl, side: f.side }));
  drawChart($('chart'), pts, { limit: s.daily_loss_limit, emptyText: t('chartEmpty'), fills: dots });
  $('fillLegend').hidden = pts.length < 2 || !dots.length;

  renderMarkouts({ empty: $('moEmpty'), table: $('moTable'), chartWrap: $('moChartWrap'), legend: $('moLegend'), chart: $('moChart') },
    markouts.filter(m => m.day === today && m.reason === 'through'), $('moSide').value);

  const rows = fills.filter(f => f.day === today).slice(-30).reverse();
  $('fillsEmpty').hidden = rows.length > 0;
  $('fillsTable').hidden = rows.length === 0;
  $('fillsTable').tBodies[0].innerHTML = rows.map(f => `<tr><td>${clock(f.local_ns)}</td>
    <td class="${f.side === 'buy' ? 'up' : 'down'}">${t(f.side)}</td><td>${px(f.price)}</td><td>${esc(f.size)}</td>
    <td>${esc(t(f.reason))}</td><td>${f.fill_pnl ? usd(f.fill_pnl) : ''}</td><td>${btc(f.position)}</td></tr>`).join('');
  if (!formFilled && !formTouched) fillForm(settings, !!st);
}

// ---- settings and the two buttons: both go to the service as settings, through Studio
function fillForm(values, final) {
  const f = $('settings');
  for (const el of f.elements) if (el.name) el.value = values[el.name] ?? DEFAULTS[el.name];
  formFilled = final;
}
async function send(values, done) {
  settings = { ...settings, ...values };
  savedAt = Date.now();
  try {
    await forge.services.setSettings(settings);
    forge.toast(t(done));
  } catch (err) {
    forge.toast(t('failed', { e: err && err.message || err }));
  }
  render();
}
$('settings').addEventListener('input', () => { formTouched = true; });
$('settings').addEventListener('submit', e => {
  e.preventDefault();
  const values = {};
  for (const el of e.target.elements) if (el.name) values[el.name] = el.type === 'number' ? Number(el.value) : el.value.trim();
  formTouched = false;
  send(values, 'saved');
});
const stamp = () => Math.max(Math.floor(Date.now() / 1000), settings.stop_at + 1, settings.resume_at + 1);
$('moSide').addEventListener('change', render);
$('stop').addEventListener('click', () => send({ stop_at: stamp() }, 'sentStop'));
$('resume').addEventListener('click', () => send({ resume_at: stamp() }, 'sentResume'));

// ---- data: the service's streams, read through Studio
function newest(rows) {
  for (const r of rows || []) if (r && r.state && (!st || r.t >= st.t)) st = r;
  if (st && st.settings && Date.now() - savedAt > 10000) settings = { ...DEFAULTS, ...st.settings };
  render();
}
function more(list, key) {
  return rows => {
    const seen = new Set(list.map(key));
    for (const r of rows || []) if (r && !seen.has(key(r))) list.push(r);
    list.sort((a, b) => a.t - b.t);
    render();
  };
}
const sampleMode = new URLSearchParams(location.search).has('sample');   // layout check only
async function start() {
  applyLabels();
  render();
  try { forge.services.panel($('services')); } catch (e) { forge.log('services panel', String(e)); }
  if (sampleMode) {
    ({ st, fills, pnl, markouts } = sample());
    return render();
  }
  const now = Date.now() / 1000, day0 = Math.floor(now / 86400) * 86400;
  const moreFills = more(fills, f => f.id + ':' + f.local_ns), morePnl = more(pnl, p => p.t);
  const moreMarkouts = more(markouts, m => m.id + ':' + m.local_ns);
  try {
    newest(await forge.stream.read('', 'status', { since: now - 120, limit: 30 }));
    morePnl(await forge.stream.read('', 'pnl', { since: day0, limit: 3000 }));
    moreFills(await forge.stream.read('', 'fills', { since: day0, limit: 2000 }));
    moreMarkouts(await forge.stream.read('', 'markouts', { since: day0, limit: 5000 }));
    forge.stream.subscribe('', 'markouts', moreMarkouts, { every: 5000 });
    forge.stream.subscribe('', 'status', newest, { every: 2000 });
    forge.stream.subscribe('', 'pnl', morePnl, { every: 15000 });
    forge.stream.subscribe('', 'fills', moreFills, { every: 3000 });
  } catch (e) { forge.log('streams', String(e)); }
  setInterval(render, 5000);
}
start();
