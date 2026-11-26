// Plain SVG charts: bars and lines over named positions on the x axis.
const NSURI = 'http://www.w3.org/2000/svg';
const W = 640, PAD = { l: 52, r: 12, t: 10, b: 42 };

function s(tag, attrs, text) {
  const el = document.createElementNS(NSURI, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  if (text != null) el.textContent = text;
  return el;
}

function niceTicks(lo, hi, n = 4) {
  if (hi <= lo) hi = lo + 1;
  const raw = (hi - lo) / n, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].find(m => m * mag >= raw) * mag;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}
const tickText = v => (Math.abs(v) >= 1000 ? v.toLocaleString('en-US') : String(+v.toPrecision(4)));

function frame(lo, hi, height, labels, yLabel) {
  const svg = s('svg', { viewBox: `0 0 ${W} ${height}`, class: 'chart', role: 'img' });
  const ticks = niceTicks(lo, hi);
  lo = Math.min(lo, ticks[0]); hi = Math.max(hi, ticks[ticks.length - 1]);
  const y = v => PAD.t + (height - PAD.t - PAD.b) * (1 - (v - lo) / (hi - lo));
  for (const v of ticks) {
    svg.append(s('line', { x1: PAD.l, x2: W - PAD.r, y1: y(v), y2: y(v), class: v === 0 ? 'zero' : 'grid' }));
    svg.append(s('text', { x: PAD.l - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'tick' }, tickText(v)));
  }
  const band = (W - PAD.l - PAD.r) / labels.length;
  const every = Math.ceil(labels.length / 13);
  labels.forEach((lab, i) => {
    if (i % every === 0) svg.append(s('text', { x: PAD.l + band * (i + 0.5), y: height - PAD.b + 16, 'text-anchor': 'middle', class: 'tick' }, lab));
  });
  if (yLabel) svg.append(s('text', { x: 4, y: height - 5, class: 'tick axis' }, yLabel));
  return { svg, y, band, x: i => PAD.l + band * (i + 0.5) };
}

/** Bars: values[i] (null = no data) at labels[i]. */
export function bars({ labels, values, yLabel = '', height = 220, tip = v => v }) {
  const have = values.filter(v => v != null);
  const f = frame(Math.min(0, ...have), Math.max(0, ...have, 1e-12), height, labels, yLabel);
  values.forEach((v, i) => {
    if (v == null) return;
    const y0 = f.y(0), y1 = f.y(v), w = Math.max(2, f.band * 0.72);
    const r = s('rect', { x: f.x(i) - w / 2, y: Math.min(y0, y1), width: w, height: Math.max(1, Math.abs(y1 - y0)), class: 'cbar', rx: 2 });
    r.append(s('title', {}, `${labels[i]}: ${tip(v)}`));
    f.svg.append(r);
  });
  return f.svg;
}

/** Lines: series [{name, values, se}] over labels; se draws ±1.96 se whiskers. Returns a div with a legend. */
export function lines({ labels, series, yLabel = '', height = 260, tip = v => v }) {
  let lo = 0, hi = 1e-12;
  for (const sr of series) sr.values.forEach((v, i) => {
    if (v == null) return;
    lo = Math.min(lo, v); hi = Math.max(hi, v);
  });
  const room = (hi - lo) * 0.25;                 // whiskers get this much room, and are cut at the frame
  const f = frame(lo - (lo < 0 ? room : 0), hi + room, height, labels, yLabel);
  const [top, bottom] = [PAD.t, height - PAD.b];
  const clip = y => Math.max(top, Math.min(bottom, y));
  series.forEach((sr, k) => {
    const cls = 's' + (k % 6 + 1);
    let d = '', pen = false;
    sr.values.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      d += (pen ? 'L' : 'M') + f.x(i).toFixed(1) + ' ' + f.y(v).toFixed(1);
      pen = true;
    });
    f.svg.append(s('path', { d, class: 'line ' + cls }));
    sr.values.forEach((v, i) => {
      if (v == null) return;
      const off = (k - (series.length - 1) / 2) * 3;       // whiskers side by side, not on top of each other
      if (sr.se && sr.se[i]) {
        const e = 1.96 * sr.se[i];
        f.svg.append(s('line', { x1: f.x(i) + off, x2: f.x(i) + off, y1: clip(f.y(v - e)), y2: clip(f.y(v + e)), class: 'whisker ' + cls }));
      }
      const c = s('circle', { cx: f.x(i), cy: f.y(v), r: 3, class: 'dot ' + cls });
      c.append(s('title', {}, `${sr.name} · ${labels[i]}: ${tip(v)}`));
      f.svg.append(c);
    });
  });
  const box = document.createElement('div');
  const legend = document.createElement('div');
  legend.className = 'legend';
  series.forEach((sr, k) => {
    const item = document.createElement('span');
    item.innerHTML = `<i class="s${k % 6 + 1}"></i>`;
    item.append(sr.name);
    legend.append(item);
  });
  box.append(f.svg, legend);
  return box;
}
