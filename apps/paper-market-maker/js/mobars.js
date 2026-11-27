// Average markouts as bars: one group per horizon (1 s, 5 s, 30 s), buys and sells side by side, in bps.
// groups: [{label, buy, sell}] where buy and sell are bps or null (no fills on that side yet).
const sgn = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2);

export function drawBars(el, groups) {
  const vals = groups.flatMap(g => [g.buy, g.sell]).filter(v => v != null);
  let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  if (hi - lo < 0.2) { hi += 0.1; lo -= 0.1; }
  const pad = (hi - lo) * 0.16;          // room for the number above or below each bar
  lo -= pad; hi += pad;
  const y = v => (hi - v) / (hi - lo) * 100;
  const W = 9, GAP = 1;                  // bar width and the gap between the pair, % of the chart's width
  const bar = (v, side, left) => {
    if (v == null) return '';
    const top = y(Math.max(v, 0)), h = Math.abs(y(v) - y(0));
    return `<i class="mobar ${side}" style="left:${left}%;width:${W}%;top:${top.toFixed(2)}%;height:${h.toFixed(2)}%"></i>
      <span class="lab val ${v > 0 ? 'up' : v < 0 ? 'down' : ''}" style="left:${left + W / 2}%;top:${y(v).toFixed(2)}%;
        transform:translate(-50%,${v >= 0 ? '-100%' : '0'})">${sgn(v)}</span>`;
  };
  el.innerHTML = `<div class="plot">
      <div class="zero" style="top:${y(0).toFixed(2)}%"></div>
      ${groups.map((g, i) => {
        const c = (i + 0.5) / groups.length * 100;
        return bar(g.buy, 'buy', c - W - GAP / 2) + bar(g.sell, 'sell', c + GAP / 2);
      }).join('')}
    </div>
    ${groups.map((g, i) => `<span class="lab" style="left:${((i + 0.5) / groups.length * 100).toFixed(2)}%;bottom:0;
      transform:translateX(-50%)">${g.label}</span>`).join('')}`;
}
