// One fill's story: the header, the four mid boxes, the chart, the quotes then, and the timeline.
// fill: a fills row; mo: its markouts row or null; status: status rows around it (oldest first);
// events: [{t (unix s), tone: 'risk' | 'okev', text, sub}] already within the window.
import { t } from './i18n.js';

export const HORIZONS = [1, 5, 30];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const px = v => v == null ? '–' : Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const sgn = (v, d = 2) => v == null ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d);
export const btc = v => v == null ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(4);
export const clock = (s, ms) => new Date(s * 1000).toISOString().slice(11, ms ? 23 : 19);
const tone = v => v > 0 ? 'up' : v < 0 ? 'down' : '';
const off = s => Math.abs(s) < 0.05 ? '0 s' : sgn(s, Math.abs(s) < 10 && s % 1 ? 1 : 0) + ' s';
// USD per BTC in the fill's favour, for a mid seen later (or at the fill)
const favour = (f, mid) => mid == null ? null : f.side === 'buy' ? mid - f.price : f.price - mid;

export function renderStory(els, { fill: f, mo, status, events, cfg, riskStream, now }) {
  const t0 = f.local_ns / 1e9, win = cfg.window_s, age = now - t0;
  els.head.innerHTML = `<span class="big ${f.side === 'buy' ? 'up' : 'down'}">${esc(t(f.side))} ${esc(f.size)} BTC</span>
    <span class="big num">${px(f.price)}</span>
    <span><small>UTC</small>${new Date(t0 * 1000).toISOString().slice(0, 10)} ${clock(t0, true)}</span>
    <span><small>${t('why')}</small>${esc(t(f.reason))}</span>
    <span><small>${t('fillPnl')}</small><b class="${tone(f.fill_pnl)}">${f.fill_pnl ? sgn(f.fill_pnl) + ' USD' : '–'}</b></span>
    <span><small>${t('posAfter')}</small>${btc(f.position)} BTC</span>`;

  // the mid at the fill and 1, 5, 30 s after
  const mids = [{ s: 0, mid: f.mid ?? (mo && mo.mid), m: favour(f, f.mid ?? (mo && mo.mid)) },
    ...HORIZONS.map(h => ({ s: h, mid: mo ? mo['mid' + h] : null, m: mo ? mo['m' + h] : null }))];
  els.marks.innerHTML = mids.map(p => {
    let note;
    if (p.mid != null && p.m != null) note = `<em class="${tone(p.m)}">${t('edge', { v: sgn(p.m) })} · ${sgn(p.m / f.price * 1e4)} bps</em>`;
    else if (mo && p.s) note = `<em>${t('feedStaleThen')}</em>`;
    else note = `<em>${p.s && age < 35 ? t('waiting', { s: Math.max(1, Math.ceil(35 - age)) }) : t('noMark')}</em>`;
    return `<div class="mark"><small>${p.s ? t('midAfter', { s: p.s }) : t('midBefore')}</small><b>${px(p.mid)}</b>${note}</div>`;
  }).join('');

  chart(els.chart, f, t0, win, mids, status, events);
  els.legend.innerHTML = `<span><i style="color:var(--accent)"></i>${t('lgMid')}</span>
    <span><i class="dash" style="color:var(--bid)"></i>${t('lgBid')}</span><span><i class="dash" style="color:var(--ask)"></i>${t('lgAsk')}</span>
    <span>◆ ${t('lgFill')}</span><span>○ ${t('lgMark')}</span><span><i class="dash" style="color:var(--bad)"></i>${t('lgRisk')}</span>`;

  // what the maker was quoting: the last status row before the fill
  const before = status.filter(s => s.t <= t0 && !s.midOnly).pop();
  const side = q => q ? `${px(q.price)} × ${esc(q.size)}` : t('none');
  els.quote.innerHTML = before ? `<p class="sub" style="margin:-6px 0 8px">${t('asOf', { s: (t0 - before.t).toFixed(1) })}</p><table>
      <tr><td>${t('state')}</td><td class="pill s-${esc(before.state)}">${esc(t('s_' + before.state))}</td></tr>
      <tr><td>${t('ourAsk')}</td><td class="${f.side === 'sell' ? 'down' : ''}">${side(before.quote_ask)}</td></tr>
      <tr><td>${t('mktAsk')}</td><td>${px(before.ask)}</td></tr>
      <tr><td>${t('mktBid')}</td><td>${px(before.bid)}</td></tr>
      <tr><td>${t('ourBid')}</td><td class="${f.side === 'buy' ? 'up' : ''}">${side(before.quote_bid)}</td></tr>
      <tr><td>${t('posBefore')}</td><td>${btc(before.position)} BTC</td></tr></table>`
    : `<p class="empty">${t('noStatus')}</p>`;

  // the small timeline
  const rows = [{ s: 0, cls: 'fill0', text: t('tlFill', { side: t(f.side), size: f.size, price: px(f.price) }),
    sub: mids[0].mid != null ? t('tlMid', { m: px(mids[0].mid) }) : '' }];
  if (before) rows.push({ s: before.t - t0 - 1e-6, cls: 'q', text: t('tlQuote', { bid: before.quote_bid ? px(before.quote_bid.price) : t('none'),
    ask: before.quote_ask ? px(before.quote_ask.price) : t('none') }), sub: t('s_' + before.state) });
  for (const p of mids.slice(1)) if (p.mid != null) rows.push({ s: p.s, cls: '', text: t('tlMid', { m: px(p.mid) }),
    sub: p.m == null ? '' : `<span class="${tone(p.m)}">${sgn(p.m)} USD/BTC ${t(p.m >= 0 ? 'favour' : 'against')}</span>`, raw: true });
  for (const e of events) rows.push({ s: e.t - t0, cls: e.tone, text: e.text, sub: e.sub });
  rows.sort((a, b) => a.s - b.s);
  els.timelineTitle.textContent = t('timeline', { s: win });
  els.timeline.innerHTML = rows.map(r => `<li class="${r.cls}"><span class="off">${off(r.s)}</span><span class="pt"></span>
    <span class="what">${esc(r.text)}${r.sub ? `<small>${r.raw ? r.sub : esc(r.sub)}</small>` : ''}</span></li>`).join('')
    + (events.length ? '' : `<li class="note"><span></span><span></span><span class="empty">${t(riskStream ? 'noRisk' : 'noRiskStream', { s: win })}${riskStream ? '' : ' ' + t('noRisk', { s: win })}</span></li>`);
}

function chart(el, f, t0, win, mids, status, events) {
  const W = 1000, H = 210, T = 14, B = 22;
  const pts = status.filter(s => s.mid != null && Math.abs(s.t - t0) <= win + 2).map(s => ({ x: s.t - t0, mid: s.mid,
    bid: s.quote_bid ? s.quote_bid.price : null, ask: s.quote_ask ? s.quote_ask.price : null }));
  const marks = mids.filter(p => p.mid != null);
  if (pts.length < 2 && marks.length < 2) { el.innerHTML = `<div class="none">${t('noPath')}</div>`; return; }
  const vals = [f.price, ...marks.map(p => p.mid), ...pts.map(p => p.mid)];
  let lo = Math.min(...vals), hi = Math.max(...vals);
  // our quotes are drawn when they are near; a far one must not flatten the picture
  const span = Math.max(hi - lo, f.price * 2e-5);
  const near = v => v != null && v > lo - span * 2 && v < hi + span * 2;
  for (const p of pts) for (const v of [p.bid, p.ask]) if (near(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const pad = Math.max(hi - lo, f.price * 2e-5) * 0.12;
  lo -= pad; hi += pad;
  const x = s => (Math.max(-win, Math.min(win, s)) + win) / (2 * win) * W, y = v => T + (hi - v) / (hi - lo) * (H - T - B);
  const step = key => {
    let d = '', open = false;
    for (const p of pts) {
      const v = p[key];
      if (v == null || v < lo || v > hi) { open = false; continue; }
      d += open ? ` H${x(p.x).toFixed(1)} V${y(v).toFixed(1)}` : ` M${x(p.x).toFixed(1)} ${y(v).toFixed(1)}`;
      open = true;
    }
    return d;
  };
  const line = (d, color, extra = '') => d ? `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" ${extra}/>` : '';
  const vline = (s, color, dash) => `<line x1="${x(s)}" x2="${x(s)}" y1="${T}" y2="${H - B}" stroke="${color}" stroke-width="1" ${dash ? 'stroke-dasharray="4 3"' : ''} vector-effect="non-scaling-stroke"/>`;
  const pct = (a, b) => `left:${(a / W * 100).toFixed(2)}%;top:${(b / H * 100).toFixed(2)}%`;
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <line x1="0" x2="${W}" y1="${H - B}" y2="${H - B}" stroke="var(--line)" vector-effect="non-scaling-stroke"/>
      ${vline(0, 'var(--muted)')}${events.map(e => vline(e.t - t0, e.tone === 'okev' ? 'var(--ok)' : 'var(--bad)', true)).join('')}
      ${line(step('bid'), 'var(--bid)', 'stroke-dasharray="5 4" opacity=".7"')}${line(step('ask'), 'var(--ask)', 'stroke-dasharray="5 4" opacity=".7"')}
      ${line(step('mid'), 'var(--accent)')}
    </svg>
    ${marks.slice(1).map(p => `<span class="dot" style="${pct(x(p.s), y(p.mid))}" title="+${p.s} s: ${px(p.mid)}"></span>`).join('')}
    <span class="dot fill0 ${f.side}" style="${pct(x(0), y(f.price))}" title="${px(f.price)}"></span>
    <span class="lab" style="left:0;top:0">${px(hi)}</span>
    <span class="lab" style="left:0;bottom:${B}px">${px(lo)}</span>
    <span class="lab" style="left:0;bottom:0">−${win} s</span>
    <span class="lab" style="left:50%;bottom:0;transform:translateX(-50%)">${clock(t0)}</span>
    <span class="lab" style="right:0;bottom:0">+${win} s</span>`;
}
