// Reads the desk's streams and turns them into one row per UTC day. Read only.
export const DEFAULTS = {
  days: 7,                               // how many UTC days, today included
  maker: 'paper-market-maker',           // streams: pnl, markouts, events, status
  risk: 'risk-monitor',                  // streams: state, events
  staleChecks: ['feed_btc', 'feed_eth'], // Risk Monitor checks counted as stale-feed events; the rest are risk breaches
  countFlatten: false,                   // fills that only close the position on a stop: left out of the markout averages
  readLimit: 5000,                       // the most rows Studio gives a page from one stream
  refreshS: 60,                          // full reload
  staleDataS: 300,                       // newest PnL row older than this: say so
};

const HORIZONS = [1, 5, 30];
const dayOf = t => new Date(t * 1000).toISOString().slice(0, 10);
const startOf = day => Date.parse(day + 'T00:00:00Z') / 1000;

export function dayList(now, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(dayOf(now - i * 86400));
  return out;                            // newest first
}

async function names(app) {
  try { return ((await forge.stream.list(app)) || []).map(s => s.name); } catch (e) { return null; }
}

export async function load(S = DEFAULTS) {
  const now = Date.now() / 1000;
  const days = dayList(now, S.days);
  const since = startOf(days[days.length - 1]);
  const [mk, rk] = await Promise.all([names(S.maker), names(S.risk)]);
  const rd = (app, list, name, o) => list && list.includes(name)
    ? forge.stream.read(app, name, o || { since, limit: S.readLimit }).catch(() => null) : Promise.resolve(null);
  const [pnl, marks, events, status, risk] = await Promise.all([
    rd(S.maker, mk, 'pnl'), rd(S.maker, mk, 'markouts'),
    rd(S.maker, mk, 'events', { since: since - 86400, limit: S.readLimit }),
    rd(S.maker, mk, 'status', { since: now - 120, limit: 1 }), rd(S.risk, rk, 'events'),
  ]);
  const model = build({ now, days, since, pnl, marks, events, status, risk, riskOn: !!(rk && rk.length) }, S);
  model.sources = { maker: !!(mk && mk.length), risk: !!(rk && rk.length) };
  return model;
}

export function build(d, S = DEFAULTS) {
  const rows = d.days.map((day, i) => ({
    day, today: i === 0, pnl: null, fills: null, mk: null, mkPart: false, mkN: 0,
    breaches: d.riskOn ? 0 : null, stale: d.riskOn ? 0 : null, checks: [], seen: false,
  }));
  const by = Object.fromEntries(rows.map(r => [r.day, r]));

  // PnL: the day's last pnl row; a day beyond reach = the difference of two midnight totals.
  const starts = {};
  for (const e of d.events || []) {
    if (e.type === 'day' && e.day) starts[e.day] = +e.day_start;
    const r = by[dayOf(e.t)]; if (r) r.seen = true;
  }
  for (const p of d.pnl || []) { const r = by[p.day]; if (r && p.day_pnl != null) { r.pnl = +p.day_pnl; r.seen = true; } }
  for (const r of rows) {
    const next = dayOf(startOf(r.day) + 86400 + 1);
    if (r.pnl == null && starts[r.day] != null && starts[next] != null) { r.pnl = starts[next] - starts[r.day]; r.seen = true; }
  }
  const lastPnl = d.pnl && d.pnl.length ? d.pnl[d.pnl.length - 1] : null;

  // Fills and markouts: one markout row per fill, by the fill's own UTC day.
  const marks = d.marks || [];
  const fillT = m => (m.local_ns ? m.local_ns / 1e9 : m.t - 30);
  const capped = marks.length >= S.readLimit;
  const reach = capped ? fillT(marks[0]) : d.since;      // fills before this cannot be read
  if (d.marks) for (const r of rows) {
    const a = startOf(r.day), b = a + 86400;
    if (reach >= b) continue;                             // wholly beyond reach
    r.mk = Object.fromEntries(HORIZONS.map(h => [h, { sum: 0, size: 0, n: 0 }]));
    r.mkPart = reach > a;
    if (!r.mkPart) r.fills = 0;
  }
  for (const m of marks) {
    const r = by[dayOf(fillT(m))];
    if (!r || !r.mk) continue;
    r.seen = true; r.mkN++;
    if (r.fills != null) r.fills++;
    if (m.reason === 'flatten' && !S.countFlatten) continue;
    const w = +m.size || 0;
    for (const h of HORIZONS) {
      const v = m['m' + h];
      if (v == null) continue;
      const c = r.mk[h]; c.sum += v * w; c.size += w; c.n++;
    }
  }
  const st = d.status && d.status.length ? d.status[d.status.length - 1] : null;
  if (st && by[st.day] && st.fills_today != null) { by[st.day].fills = +st.fills_today; by[st.day].seen = true; }

  // Risk Monitor's events: one event per id, the newest row wins; counted on the day it opened.
  const ev = {};
  for (const e of d.risk || []) if (e.id != null) ev[e.id] = e;
  for (const e of Object.values(ev)) {
    const r = by[dayOf(+e.opened || e.t)];
    if (!r) continue;
    r.seen = true; r.checks.push(e.check);
    if (S.staleChecks.includes(e.check)) r.stale++; else r.breaches++;
  }
  return { now: d.now, rows, capped, limit: S.readLimit, lastPnlT: lastPnl ? lastPnl.t : 0, state: st ? st.state : '' };
}

export function totals(rows) {
  const t = { pnl: 0, pnlDays: 0, fills: 0, fillDays: 0, breaches: 0, stale: 0, riskDays: 0, seen: 0, mkN: 0, mkPart: false,
    mk: Object.fromEntries(HORIZONS.map(h => [h, { sum: 0, size: 0, n: 0 }])) };
  for (const r of rows) {
    if (!r.seen) continue;
    t.seen++;
    if (r.pnl != null) { t.pnl += r.pnl; t.pnlDays++; }
    if (r.fills != null) { t.fills += r.fills; t.fillDays++; }
    if (r.breaches != null) { t.breaches += r.breaches; t.stale += r.stale; t.riskDays++; }
    if (r.mk) { t.mkN += r.mkN; if (r.mkPart) t.mkPart = true;
      for (const h of HORIZONS) { t.mk[h].sum += r.mk[h].sum; t.mk[h].size += r.mk[h].size; t.mk[h].n += r.mk[h].n; } }
    else t.mkPart = true;
  }
  return t;
}

export const avg = c => (c && c.size > 0 ? c.sum / c.size : null);
export { HORIZONS };
