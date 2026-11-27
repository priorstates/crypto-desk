// What the page reads: the other desk apps' streams, through Studio. Read only.
export const DEFAULTS = {
  refreshMs: 2000,        // how often new rows are fetched
  relistS: 30,            // how often a missing stream is looked for again
  staleS: 20,             // a newest row older than this = "no update"
  feedWarnS: 10,          // feed age that counts as too old, when Risk Monitor's own limit is not known
  products: ['BTC-USD', 'ETH-USD'],
  sources: {
    hb: { app: 'market-recorder', stream: 'heartbeat', who: 'recorder' },
    status: { app: 'paper-market-maker', stream: 'status', who: 'maker' },
    pnl: { app: 'paper-market-maker', stream: 'pnl', who: 'maker', history: true },
    fill: { app: 'paper-market-maker', stream: 'fills', who: 'maker' },
    risk: { app: 'risk-monitor', stream: 'state', who: 'risk' },
  },
};

// The newest row of each stream, and today's pnl rows (oldest first).
export const data = { hb: null, status: null, fill: null, risk: null, pnl: [] };

const on = {};
const dayStart = () => Math.floor(Date.now() / 86400000) * 86400;
const err = (what, e) => forge.log(what, String(e && e.message || e));

function addPnl(rows) {
  const from = dayStart(), seen = new Set(data.pnl.map(r => r.t));
  for (const r of rows) if (r && r.t >= from && typeof r.day_pnl === 'number' && !seen.has(r.t)) { seen.add(r.t); data.pnl.push(r); }
  data.pnl = data.pnl.filter(r => r.t >= from).sort((a, b) => a.t - b.t);
}

// Today's pnl rows. Read in steps, in case one read gives only part of the day.
async function history(src) {
  let since = dayStart(), last = 0;
  for (let i = 0; i < 6; i++) {
    const rows = (await forge.stream.read(src.app, src.stream, { since, limit: 3000 })) || [];
    addPnl(rows);
    const newest = rows.length ? rows[rows.length - 1].t : 0;
    if (!rows.length || newest <= last || newest > Date.now() / 1000 - 120) break;
    last = since = newest;
  }
  return data.pnl.length ? data.pnl[data.pnl.length - 1].t : since;
}

async function watch(key, changed) {
  const src = DEFAULTS.sources[key];
  if (on[key]) return;
  let names = [];
  try { names = ((await forge.stream.list(src.app)) || []).map(x => x.name); }
  catch (e) { return err('stream.list ' + src.app, e); }
  if (!names.includes(src.stream) || on[key]) return;
  on[key] = true;
  try {
    let since, take;
    if (src.history) {
      since = await history(src);
      take = rows => addPnl(rows);
    } else {
      take = rows => { const r = rows[rows.length - 1]; if (r && (!data[key] || r.t >= data[key].t)) data[key] = r; };
      const rows = (await forge.stream.read(src.app, src.stream, { limit: 1 })) || [];
      take(rows);
      since = rows.length ? rows[rows.length - 1].t : 0;
    }
    changed();
    forge.stream.subscribe(src.app, src.stream, rows => { if (rows && rows.length) { take(rows); changed(); } },
      { every: DEFAULTS.refreshMs, since, limit: 500 });
  } catch (e) { on[key] = false; err('stream ' + src.app + '/' + src.stream, e); }
}

export function start(changed) {
  const all = () => Object.keys(DEFAULTS.sources).forEach(k => watch(k, changed));
  all();
  setInterval(all, DEFAULTS.relistS * 1000);
}

// ?try=breach: made-up rows, for checking the page only.
export function madeUp() {
  const now = Date.now() / 1000, day = new Date().toISOString().slice(0, 10);
  const q = (bid, ask) => ({ bid: String(bid), ask: String(ask) });
  data.hb = { t: now, connected: true, products: {
    'BTC-USD': { age_s: 0.2, last_ns: now * 1e9, quote: q(60234.22, 60234.23) },
    'ETH-USD': { age_s: 14.6, last_ns: (now - 14.6) * 1e9, quote: q(1678.04, 1678.31) } } };
  data.status = { t: now, day, day_pnl: -312.4, position: 0, avg_price: 0, state: 'stopped', fills_today: 412, volume_today: 4.12, mid: 60234.225 };
  data.fill = { t: now - 95, side: 'sell', size: 0.26, price: 60230.1 };
  data.risk = { t: now, checks: { loss: { state: 'breach', value: -312.4, limit: 300 }, feed_eth: { state: 'breach', value: 14.6, limit: 10 },
    position: { state: 'ok', value: 0, limit: 0.25 } }, stop: { reason: 'day PnL -312.40 USD at or below -300', t: now - 95 } };
  data.pnl = Array.from({ length: 60 }, (_, i) => ({ t: now - (60 - i) * 300, day, day_pnl: 40 * Math.sin(i / 7) - i * i / 11 }));
}
