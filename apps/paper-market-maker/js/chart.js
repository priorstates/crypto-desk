// The day's PnL as a line: points [{t (unix seconds), v (USD)}], from 00:00 UTC to now.
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// fills [{t, v (day PnL just after the fill), side}] are drawn as dots: green for buys, red for sells.
export function drawChart(el, points, { limit = 0, emptyText = '', fills = [] } = {}) {
  if (points.length < 2) {
    el.innerHTML = `<div class="empty">${esc(emptyText)}</div>`;
    return;
  }
  const W = 1000, H = 240, L = 0, R = 0, T = 10, B = 22;
  const day0 = Math.floor(points[points.length - 1].t / 86400) * 86400;
  const t0 = day0, t1 = Math.max(points[points.length - 1].t, day0 + 3600);
  fills = fills.filter(f => f.t >= t0 && f.t <= t1 && f.v != null);
  const vs = points.concat(fills).map(p => p.v);
  let lo = Math.min(0, ...vs), hi = Math.max(0, ...vs);
  if (hi - lo < 1) { hi += 0.5; lo -= 0.5; }
  const pad = (hi - lo) * 0.1;
  lo -= pad; hi += pad;
  const x = t => L + (t - t0) / (t1 - t0) * (W - L - R);
  const y = v => T + (hi - v) / (hi - lo) * (H - T - B);
  const path = points.map((p, i) => (i ? 'L' : 'M') + x(p.t).toFixed(1) + ' ' + y(p.v).toFixed(1)).join(' ');
  const last = points[points.length - 1];
  const col = 'var(--accent)';       // not green or red: those are the fills' dots
  const line = (v, c, dash) => `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"
    stroke="${c}" stroke-width="1" ${dash ? 'stroke-dasharray="5 5"' : ''} vector-effect="non-scaling-stroke"/>`;
  const showLimit = limit > 0 && -limit >= lo;
  const hours = [];
  const step = (t1 - t0) > 12 * 3600 ? 4 : (t1 - t0) > 4 * 3600 ? 2 : 1;
  for (let h = 0; x(day0 + h * 3600) <= W * 0.96; h += step) hours.push(h);
  const pct = (n, of) => (n / of * 100).toFixed(2) + '%';
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      ${line(0, 'var(--muted)')}${showLimit ? line(-limit, 'var(--bad)', true) : ''}
      <path d="${path}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    </svg>
    ${fills.map(f => `<i class="dot ${f.side === 'buy' ? 'buy' : 'sell'}" style="left:${pct(x(f.t), W)};top:${pct(y(f.v), H)}"></i>`).join('')}
    <span class="lab" style="left:0;top:0">${hi.toFixed(2)}</span>
    <span class="lab" style="left:0;bottom:22px">${lo.toFixed(2)}</span>
    <span class="lab" style="right:0;top:${pct(y(0), H)};transform:translateY(-100%)">0</span>
    ${showLimit ? `<span class="lab" style="right:0;top:${pct(y(-limit), H)};transform:translateY(-100%);color:var(--bad)">−${limit}</span>` : ''}
    ${hours.map(h => `<span class="lab" style="left:${pct(x(day0 + h * 3600), W)};bottom:0">${String(h).padStart(2, '0')}:00</span>`).join('')}`;
}
