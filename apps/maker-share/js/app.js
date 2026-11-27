import { t, applyLabels } from './i18n.js';
import { DEFAULTS, dayHours, hourState, clock, bucketFills, bucketVolume, hasSize, share, fmtSize, fmtPct, madeUp } from './data.js';

const $ = id => document.getElementById(id);
const day = dayHours();
const S = {
  makerListed: false, fillsThere: false, fills: new Map(), fillsFrom: day.start, status: null, statusOn: false,
  recListed: false, recNames: [], volStream: '', volume: new Map(), volFrom: day.start,
  error: '', updated: 0,
};

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

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// ---- the chart's columns, built once and then only updated
const cols = day.hours.map(h => {
  const c = el('div', 'ms-col'), val = el('div', 'ms-val'), track = el('div', 'ms-track'), bar = el('div', 'ms-bar');
  track.append(bar);
  c.append(val, track, el('div', 'ms-hour', h.label));
  $('chart').append(c);
  return { c, val, bar };
});

function tile(label, value) {
  const d = el('div', 'ms-tile');
  d.append(el('small', '', label), el('b', value === '—' ? 'ms-none' : '', value));
  return d;
}
function cells(tag, list) { return list.map(c => el(tag, c === '—' ? 'ms-none' : '', c)); }

let lastGlance = '';
function render() {
  const now = Date.now() / 1000;
  const withVol = !!S.volStream;
  const from = withVol ? Math.max(S.fillsFrom, S.volFrom) : S.fillsFrom;   // the hours we can show start here
  const cut = from > day.start;
  const { hours, flattens } = bucketFills([...S.fills.values()], day);
  const vol = withVol ? bucketVolume([...S.volume.values()], day) : [];
  const state = day.hours.map(h => hourState(h, from, now));
  const seen = i => state[i] === 'ok' || state[i] === 'partial';
  const sum = k => hours.reduce((a, h, i) => a + (seen(i) ? h[k] : 0), 0);
  const volSum = vol.reduce((a, v, i) => a + (seen(i) ? v : 0), 0);
  // The day's totals: our own sums when every hour could be read, else the maker's own count.
  const own = cut && S.status && S.status.day === day.date ? S.status : null;
  const n = own ? Number(own.fills_today) || 0 : sum('n');
  const size = own ? Number(own.volume_today) || 0 : sum('size');
  const sz = v => (v ? fmtSize(v) : '0');

  $('sub').textContent = t('sub', { p: DEFAULTS.product, d: day.date, z: day.utc ? 'UTC' : t('local') });

  // Notices: why there is no share, and which hours could not be read
  const notes = [];
  if (!withVol && S.recListed) notes.push(S.recNames.length ? t('noVolume', { s: S.recNames.join(', ') }) : t('noRecorder'));
  if (cut) notes.push(t('truncated', { n: DEFAULTS.pageRows.toLocaleString(), h: clock(from, day) }) + (own ? t('ownCount') : ''));
  $('notice').hidden = !notes.length;
  $('notice').replaceChildren(...notes.map(s => el('div', '', s)));

  // Tiles
  let best = -1;
  hours.forEach((h, i) => { if (state[i] === 'ok' && h.n && (best < 0 || h.n > hours[best].n)) best = i; });
  const dayShare = withVol && S.volFrom <= day.start && (own || !cut) ? share(size, volSum) : null;
  const tiles = [tile(t('tFills'), S.fillsThere ? n.toLocaleString() : '—'), tile(t('tSize'), n ? fmtSize(size) + ' BTC' : '—')];
  if (withVol) tiles.push(tile(t('tMarket'), volSum && !cut ? fmtSize(volSum) + ' BTC' : '—'), tile(t('tShare'), fmtPct(dayShare)));
  else tiles.push(cut ? tile(t('tFrom'), clock(from, day)) : tile(t('tBuySell'), n ? fmtSize(sum('buy')) + ' / ' + fmtSize(sum('sell')) : '—'),
    tile(t('tBusiest'), best < 0 ? '—' : day.hours[best].label + ':00'));
  $('tiles').replaceChildren(...tiles);

  // Bars: the share when the market's volume is known, else the number of fills
  const vals = hours.map((h, i) => (!seen(i) ? 0 : withVol ? share(h.size, vol[i]) || 0 : h.n));
  const max = Math.max(...vals, 0);
  const nowIdx = Math.floor((now - day.start) / 3600);
  $('chartTitle').textContent = t(withVol ? 'chartShare' : 'chartFills');
  cols.forEach((c, i) => {
    c.c.className = 'ms-col is-' + state[i] + (i === nowIdx ? ' is-now' : '');
    c.bar.style.height = max ? Math.max(vals[i] ? 2 : 0, vals[i] / max * 100) + '%' : '0';
    c.val.textContent = !vals[i] ? '' : withVol ? fmtPct(vals[i]).replace('%', '') : vals[i].toLocaleString();
    c.c.title = state[i] === 'unknown' ? t('unknownTip', { h: day.hours[i].label }) : state[i] === 'future' ? ''
      : t('barTip', { h: day.hours[i].label, n: hours[i].n, s: fmtSize(hours[i].size) }) + (withVol ? ' · ' + fmtPct(share(hours[i].size, vol[i])) : '');
  });
  $('chart').setAttribute('aria-label', $('chartTitle').textContent);

  // The empty state, over the chart
  const msg = S.error ? [t('cantRead'), S.error]
    : !S.makerListed ? [t('loading'), '']
    : !S.fillsThere ? [t('noMaker'), t('noMakerMore')]
    : !n ? [t('noFills'), t('noFillsMore')] : null;
  $('empty').hidden = !msg;
  if (msg) $('empty').replaceChildren(el('b', '', msg[0]), el('span', '', msg[1]));

  // Table: a dash is an hour that has not come or could not be read; 0 is an hour with no fills
  const heads = withVol ? ['cHour', 'cFills', 'cOurs', 'cMarket', 'cShare'] : ['cHour', 'cFills', 'cSize', 'cBuy', 'cSell'];
  $('thead').replaceChildren(...cells('th', heads.map(k => t(k))));
  $('tbody').replaceChildren(...hours.map((h, i) => {
    const tr = el('tr', 'is-' + state[i] + (i === nowIdx ? ' is-now' : ''));
    const label = state[i] === 'partial' ? clock(from, day) + '–' : day.hours[i].label + ':00';
    const v = !seen(i) || !S.fillsThere ? ['—', '—', '—', '—'] : withVol
      ? [h.n.toLocaleString(), sz(h.size), sz(vol[i]), fmtPct(share(h.size, vol[i]))]
      : [h.n.toLocaleString(), sz(h.size), sz(h.buy), sz(h.sell)];
    tr.append(...cells('td', [label, ...v]));
    if (state[i] === 'unknown') tr.title = t('unknownTip', { h: day.hours[i].label });
    return tr;
  }));
  const tot = !S.fillsThere ? ['—', '—', '—', '—'] : withVol
    ? [n.toLocaleString(), sz(size), cut ? '—' : sz(volSum), fmtPct(dayShare)]
    : [n.toLocaleString(), sz(size), own ? '—' : sz(sum('buy')), own ? '—' : sz(sum('sell'))];
  $('tfoot').replaceChildren(...cells('td', [t(cut && !own ? 'shown' : 'total'), ...tot]));

  $('foot').textContent = t('foot') + (flattens ? t('flattens', { n: flattens }) : '')
    + (S.updated ? t('updated', { s: new Date(S.updated * 1000).toLocaleTimeString() }) : '');

  const g = !S.fillsThere ? '' : dayShare != null ? t('glanceShare', { s: fmtPct(dayShare) })
    : t('glanceFills', { n: n.toLocaleString(), s: fmtSize(size) });
  if (window.kit && kit.glance && g !== lastGlance) {
    lastGlance = g;
    try { kit.glance(g || null); } catch (e) { /* the card line is optional */ }
  }
}

// ---- data: the other apps' streams, read through Studio
const key = r => r.id || r.trade_id || r.t + ':' + (r.size != null ? r.size : r.volume);
function take(map, rows) {
  for (const r of rows || []) map.set(key(r), r);
  S.updated = Date.now() / 1000;
  render();
}
// Today's rows, then what comes after. Studio hands over a stream's newest rows only, so a full
// page means older rows of today were left out: the answer is the time the rows reach back to.
async function follow(app, name, map) {
  const rows = (await forge.stream.read(app, name, { since: day.start, limit: DEFAULTS.pageRows })) || [];
  take(map, rows);
  forge.stream.subscribe(app, name, more => take(map, more),
    { every: DEFAULTS.refreshMs, since: rows.length ? rows[rows.length - 1].t : day.start, limit: DEFAULTS.pageRows });
  return rows.length >= DEFAULTS.pageRows ? rows[0].t : day.start;
}
const listNames = async app => ((await forge.stream.list(app)) || []).map(x => x.name);

async function watchMaker() {
  if (S.fillsThere) return;
  try {
    const names = await listNames(DEFAULTS.makerApp);
    S.makerListed = true; S.error = '';
    if (names.includes(DEFAULTS.statusStream) && !S.statusOn) {
      S.statusOn = true;
      const put = rows => { if (rows && rows.length) { S.status = rows[rows.length - 1]; render(); } };
      put(await forge.stream.read(DEFAULTS.makerApp, DEFAULTS.statusStream, { limit: 1 }));
      forge.stream.subscribe(DEFAULTS.makerApp, DEFAULTS.statusStream, put, { every: DEFAULTS.refreshMs, since: S.status ? S.status.t : 0, limit: 5 });
    }
    if (names.includes(DEFAULTS.fillsStream)) {
      S.fillsThere = true;
      S.fillsFrom = await follow(DEFAULTS.makerApp, DEFAULTS.fillsStream, S.fills);
    }
  } catch (e) {
    S.makerListed = true; S.fillsThere = false; S.error = String(e && e.message || e);
    forge.log('maker fills', S.error);
  }
  render();
}
async function watchRecorder() {
  if (S.volStream) return;
  try {
    S.recNames = await listNames(DEFAULTS.recorderApp);
    for (const name of DEFAULTS.volumeStreams) {
      if (!S.recNames.includes(name)) continue;
      const newest = (await forge.stream.read(DEFAULTS.recorderApp, name, { limit: 1 })) || [];
      if (!hasSize(newest[newest.length - 1])) continue;
      S.volFrom = await follow(DEFAULTS.recorderApp, name, S.volume);
      S.volStream = name;
      break;
    }
  } catch (e) { forge.log('recorder streams', String(e && e.message || e)); }
  S.recListed = true;
  render();
}

// ?try=sample, ?try=volume, ?try=empty: made-up data, for checking the page only.
const tryMode = new URLSearchParams(location.search).get('try');
applyLabels();
if (tryMode) {
  S.makerListed = S.recListed = true;
  S.recNames = ['heartbeat', 'gaps'];
  if (tryMode !== 'empty') {
    const m = madeUp(day, tryMode === 'volume');
    S.fillsThere = true;
    m.fills.forEach(r => S.fills.set(r.id, r));
    if (tryMode === 'volume') { S.volStream = 'volume'; m.volume.forEach(r => S.volume.set(r.t, r)); }
  }
  render();
} else {
  render();
  watchMaker(); watchRecorder();
  setInterval(() => { watchMaker(); watchRecorder(); }, DEFAULTS.relistS * 1000);
}
// Keep "now" moving, and start a new page when the day turns.
setInterval(() => { if (Date.now() / 1000 >= day.end) location.reload(); else render(); }, 30000);
