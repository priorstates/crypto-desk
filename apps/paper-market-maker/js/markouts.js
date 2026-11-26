// Markouts: the table of averages (by side and horizon) and the running average through the day.
// rows: the service's markout rows {side, price, size, local_ns, m1, m5, m30} (m: USD per BTC in the fill's favour).
import { t } from './i18n.js';

export const HORIZONS = [1, 5, 30];
const COLOR = { 1: 'var(--h1)', 5: 'var(--h5)', 30: 'var(--h30)' };
const sgn = (v, d = 2) => v == null ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d);
const tone = v => v > 0 ? 'up' : v < 0 ? 'down' : '';
const pick = (rows, side) => side === 'all' ? rows : rows.filter(r => r.side === side);

// Weighted by fill size: bps of the fill prices, and USD per BTC.
function average(rows, h) {
  let n = 0, size = 0, pnl = 0, notional = 0;
  for (const r of rows) {
    const m = r['m' + h];
    if (m == null) continue;
    n++; size += r.size; pnl += m * r.size; notional += r.price * r.size;
  }
  return { n, usd: size ? pnl / size : null, bps: notional ? pnl / notional * 1e4 : null };
}

function running(rows, h) {
  const pts = [];
  let pnl = 0, notional = 0;
  for (const r of rows) {
    const m = r['m' + h];
    if (m == null) continue;
    pnl += m * r.size; notional += r.price * r.size;
    pts.push({ t: r.local_ns / 1e9, v: pnl / notional * 1e4 });
  }
  return pts;
}

export function renderMarkouts(els, rows, side) {
  rows = rows.slice().sort((a, b) => a.local_ns - b.local_ns);
  els.empty.hidden = rows.length > 0;
  els.table.hidden = els.chartWrap.hidden = rows.length === 0;
  if (!rows.length) return;
  els.table.tBodies[0].innerHTML = [['buy', 'buys'], ['sell', 'sells'], ['all', 'allFills']].map(([s, label]) => {
    const part = pick(rows, s), a = HORIZONS.map(h => average(part, h));
    return `<tr><td>${t(label)}</td>${a.map(x => `<td class="${tone(x.bps)}"><b>${sgn(x.bps)} bps</b>
      <em>${sgn(x.usd)} USD/BTC</em></td>`).join('')}<td>${part.length.toLocaleString()}</td></tr>`;
  }).join('');
  const series = HORIZONS.map(h => ({ h, pts: running(pick(rows, side), h) })).filter(s => s.pts.length);
  els.legend.innerHTML = series.map(s => `<span><i style="background:${COLOR[s.h]}"></i>+${s.h} s:
    <b class="${tone(s.pts[s.pts.length - 1].v)}">${sgn(s.pts[s.pts.length - 1].v)} bps</b></span>`).join('');
  draw(els.chart, series);
}

function draw(el, series) {
  const all = series.flatMap(s => s.pts);
  if (!all.length) { el.innerHTML = `<div class="empty">${t('moNone')}</div>`; return; }
  const W = 1000, H = 240, T = 10, B = 22;
  let t0 = Math.min(...all.map(p => p.t)), t1 = Math.max(...all.map(p => p.t));
  if (t1 - t0 < 60) { t0 -= 30; t1 += 30; }
  let lo = Math.min(0, ...all.map(p => p.v)), hi = Math.max(0, ...all.map(p => p.v));
  if (hi - lo < 0.2) { hi += 0.1; lo -= 0.1; }
  const pad = (hi - lo) * 0.1;
  lo -= pad; hi += pad;
  const x = v => (v - t0) / (t1 - t0) * W, y = v => T + (hi - v) / (hi - lo) * (H - T - B);
  // a step line: the average holds until the next fill
  const path = pts => pts.map((p, i) => (i ? `H${x(p.t).toFixed(1)} V` : `M${x(p.t).toFixed(1)} `) + y(p.v).toFixed(1)).join(' ')
    + ` H${W}`;
  const clock = s => new Date(s * 1000).toISOString().slice(11, 16);
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <line x1="0" x2="${W}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" stroke="var(--muted)" stroke-width="1" vector-effect="non-scaling-stroke"/>
      ${series.map(s => `<path d="${path(s.pts)}" fill="none" stroke="${COLOR[s.h]}" stroke-width="2" vector-effect="non-scaling-stroke"/>`).join('')}
    </svg>
    <span class="lab" style="left:0;top:0">${sgn(hi)} bps</span>
    <span class="lab" style="left:0;bottom:22px">${sgn(lo)} bps</span>
    <span class="lab" style="right:0;top:${(y(0) / H * 100).toFixed(2)}%;transform:translateY(-100%)">0</span>
    <span class="lab" style="left:0;bottom:0">${clock(t0)}</span>
    <span class="lab" style="right:0;bottom:0">${clock(t1)}</span>`;
}
