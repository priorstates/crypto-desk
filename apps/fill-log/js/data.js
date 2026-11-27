// What the page reads: Paper Market Maker's streams, through Studio. Read only.
export const DEFAULTS = {
  app: 'paper-market-maker',
  fills: 'fills',          // one row per simulated fill
  events: 'events',        // stop events: why a position was flattened
  status: 'status',        // the maker's own count of today's fills
  days: 7,                 // "Last 7 days" = today and the 6 UTC days before
  readLimit: 5000,         // Studio gives a page a stream's newest 5,000 rows
  keepRows: 30000,         // most fills kept in the page while it stays open
  pageRows: 300,           // rows shown before "Show more"
  refreshMs: 2000,         // how often new fills are fetched
  relistS: 30,             // how often a missing stream is looked for again
};

// state: loading | missing (no fills stream yet) | error | ready
// reachFrom: unix seconds of the oldest fill this page could read, when older ones exist; else 0
export const data = { state: 'loading', fills: [], stops: [], reachFrom: 0, makerToday: null };

const seen = new Set();
const num = v => { const n = Number(v); return v != null && v !== '' && isFinite(n) ? n : null; };
const err = (what, e) => forge.log(what, String(e && e.message || e));
export const dayStart = () => Math.floor(Date.now() / 86400000) * 86400;
export const weekStart = () => dayStart() - (DEFAULTS.days - 1) * 86400;

function addFills(rows) {
  let added = 0;
  for (const r of rows || []) {
    if (!r || (r.side !== 'buy' && r.side !== 'sell')) continue;
    const time = num(r.local_ns) ? r.local_ns / 1e9 : num(r.t), price = num(r.price), size = num(r.size);
    if (time == null || price == null || size == null) continue;
    const key = r.id + '|' + (r.local_ns || r.t);
    if (seen.has(key)) continue;
    seen.add(key);
    data.fills.push({ time, id: r.id, side: r.side, price, size, reason: r.reason || '', pnl: num(r.fill_pnl),
      position: num(r.position), tradePrice: num(r.trade_price), tradeSize: num(r.trade_size) });
    added++;
  }
  if (!added) return 0;
  data.fills.sort((a, b) => b.time - a.time);            // newest first
  const from = weekStart();
  while (data.fills.length && data.fills[data.fills.length - 1].time < from) data.fills.pop();
  if (data.fills.length > DEFAULTS.keepRows) {
    data.fills.length = DEFAULTS.keepRows;
    data.reachFrom = data.fills[data.fills.length - 1].time;
  }
  return added;
}

function addStops(rows) {
  for (const r of rows || []) if (r && r.type === 'stop') data.stops.push({ time: num(r.local_ns) ? r.local_ns / 1e9 : r.t, by: r.by || '' });
}

// The stop that caused a 'flatten' fill: the stop event within a few seconds of it.
export function stopFor(fill) {
  let best = null;
  for (const s of data.stops) if (Math.abs(s.time - fill.time) <= 5 && (!best || Math.abs(s.time - fill.time) < Math.abs(best.time - fill.time))) best = s;
  return best;
}

let on = false;
async function watch(changed) {
  if (on) return;
  const A = DEFAULTS.app;
  let names;
  try { names = ((await forge.stream.list(A)) || []).map(x => x.name); }
  catch (e) { if (data.state !== 'ready') { data.state = 'error'; changed(); } return err('stream.list ' + A, e); }
  if (on) return;
  if (!names.includes(DEFAULTS.fills)) { data.state = 'missing'; return changed(); }
  on = true;
  try {
    const from = weekStart();
    const rows = (await forge.stream.read(A, DEFAULTS.fills, { since: from, limit: DEFAULTS.readLimit })) || [];
    addFills(rows);
    // A full read means older fills of the week exist beyond what a page is given.
    if (rows.length >= DEFAULTS.readLimit && data.fills.length) data.reachFrom = data.fills[data.fills.length - 1].time;
    const since = rows.length ? rows[rows.length - 1].t : from;
    data.state = 'ready';
    changed();
    forge.stream.subscribe(A, DEFAULTS.fills, r => { if (addFills(r)) changed(); },
      { every: DEFAULTS.refreshMs, since, limit: DEFAULTS.readLimit });
    if (names.includes(DEFAULTS.events)) {
      const ev = (await forge.stream.read(A, DEFAULTS.events, { since: from, limit: 2000 })) || [];
      addStops(ev);
      forge.stream.subscribe(A, DEFAULTS.events, r => { addStops(r); changed(); },
        { every: 10000, since: ev.length ? ev[ev.length - 1].t : from, limit: 200 });
    }
    if (names.includes(DEFAULTS.status)) {
      const take = r => { const s = r && r[r.length - 1]; if (s && num(s.fills_today) != null) data.makerToday = { day: s.day, n: num(s.fills_today) }; };
      take(await forge.stream.read(A, DEFAULTS.status, { limit: 1 }));
      forge.stream.subscribe(A, DEFAULTS.status, r => { take(r); changed(); }, { every: 10000, since: Date.now() / 1000, limit: 1 });
    }
    changed();
  } catch (e) {
    err('stream ' + A, e);
    if (data.state !== 'ready') { on = false; data.state = 'error'; changed(); }
  }
}

export function start(changed) {
  watch(changed);
  setInterval(() => watch(changed), DEFAULTS.relistS * 1000);
}

// ?try=sample / ?try=partial: made-up fills, for checking the page only.
export function madeUp(partial) {
  const now = Date.now() / 1000, rows = [];
  let p = 59800;
  for (let i = 0; i < 420; i++) {
    const side = (i * 7) % 5 < 2 ? 'sell' : 'buy', t = now - i * 610 - (i % 9) * 13;
    p += Math.sin(i * 1.7) * 9;
    const price = Math.round(p * 100) / 100, flat = i === 3;
    rows.push({ t, local_ns: t * 1e9, id: 9000 - i, side, price, size: flat ? 0.0327 : 0.01, reason: flat ? 'flatten' : 'through',
      fill_pnl: Math.round(Math.cos(i) * 40) / 100, position: 0.01 * ((i % 7) - 3),
      trade_price: String(price + (side === 'buy' ? -0.44 : 0.44)), trade_size: '0.18019925' });
  }
  addFills(rows);
  data.stops = [{ time: rows[3].t - 1, by: 'risk' }];
  data.state = 'ready';
  if (partial) { data.reachFrom = data.fills[data.fills.length - 1].time; data.makerToday = { day: new Date().toISOString().slice(0, 10), n: 28412 }; }
}
