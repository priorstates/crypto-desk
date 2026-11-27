// Settings and the rules, as plain functions. Paper only: this page reads streams and nothing else.
export const DEFAULTS = {
  product: 'BTC-USD',
  makerApp: 'paper-market-maker',
  fillsStream: 'fills',
  recorderApp: 'market-recorder',
  // Streams of Market Recorder that would carry traded size, if it ever publishes one.
  // Rows: t, an optional product, and size or volume (BTC); one row per trade or per interval.
  volumeStreams: ['volume', 'trade_volume', 'trades'],
  hours: 'utc',            // 'utc' (the desk's day, as Paper Market Maker counts it) or 'local'
  countFlatten: false,     // a flatten fill closes the position at a stop; it is not a quote being caught
  statusStream: 'status',  // the maker's heartbeat: its own count for the day (fills_today, volume_today)
  refreshMs: 5000,
  relistS: 60,
  pageRows: 5000,          // the most rows of a stream Studio hands a page: its newest ones
};

// How much of an hour the rows we could read cover. from = the oldest time the rows reach back to.
// 'future' not started · 'unknown' before what could be read · 'partial' read from part-way · 'ok'
export function hourState(h, from, nowS) {
  if (h.start > nowS) return 'future';
  if (h.start + 3600 <= from) return 'unknown';
  return h.start < from ? 'partial' : 'ok';
}
export function clock(ts, day) {
  const d = new Date(ts * 1000), p = v => String(v).padStart(2, '0');
  return day.utc ? p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) : p(d.getHours()) + ':' + p(d.getMinutes());
}

// The day's hours: [{start (unix s), label}], for today in the chosen zone.
export function dayHours(nowS = Date.now() / 1000) {
  const d = new Date(nowS * 1000);
  const utc = DEFAULTS.hours !== 'local';
  const start = (utc ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    : new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 1000;
  const next = (utc ? start * 1000 + 864e5 : new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime()) / 1000;
  const hours = [];
  for (let s = start; s < next; s += 3600) {
    const h = new Date(s * 1000);
    hours.push({ start: s, label: String(utc ? h.getUTCHours() : h.getHours()).padStart(2, '0') });
  }
  const iso = utc ? d.toISOString().slice(0, 10)
    : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start, end: next, hours, date: iso, utc };
}

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// When a fill happened: its own clock when it has one, else when the row was written.
export const fillTime = r => (r.local_ns ? Number(r.local_ns) / 1e9 : num(r.t));

// Our simulated fills, by hour. Returns one entry per hour, and how many flatten fills were left out.
export function bucketFills(rows, day) {
  const out = day.hours.map(() => ({ n: 0, size: 0, buy: 0, sell: 0 }));
  let flattens = 0;
  for (const r of rows) {
    if (r.product && r.product !== DEFAULTS.product) continue;
    const ts = fillTime(r);
    if (ts < day.start || ts >= day.end) continue;
    if (r.reason === 'flatten' && !DEFAULTS.countFlatten) { flattens++; continue; }
    const b = out[Math.min(out.length - 1, Math.floor((ts - day.start) / 3600))];
    const size = Math.abs(num(r.size));
    b.n++; b.size += size;
    if (r.side === 'sell') b.sell += size; else b.buy += size;
  }
  return { hours: out, flattens };
}

// The market's traded size, by hour, from a volume stream's rows.
export function bucketVolume(rows, day) {
  const out = day.hours.map(() => 0);
  for (const r of rows) {
    if (r.product && r.product !== DEFAULTS.product) continue;
    const ts = num(r.t);
    if (ts < day.start || ts >= day.end) continue;
    out[Math.min(out.length - 1, Math.floor((ts - day.start) / 3600))] += Math.abs(num(r.size != null ? r.size : r.volume));
  }
  return out;
}

// Does a row of a would-be volume stream carry a traded size?
export const hasSize = r => !!r && (Number.isFinite(Number(r.size)) && r.size !== null && r.size !== ''
  || Number.isFinite(Number(r.volume)) && r.volume !== null && r.volume !== '');

// Share of the market's traded size that our fills were; null when the market traded nothing we know of.
export const share = (ours, market) => (market > 0 ? ours / market : null);

export const fmtSize = v => (v ? v.toFixed(v >= 100 ? 1 : v >= 1 ? 3 : 4) : '0');
export const fmtPct = v => (v == null ? '—' : (v * 100).toFixed(v >= 0.1 ? 1 : v >= 0.001 ? 2 : 3) + '%');

// Made-up rows for ?try=sample and ?try=volume: for checking the page only.
export function madeUp(day, withVolume) {
  const now = Date.now() / 1000, fills = [], volume = [];
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let s = day.start; s < now; s += 3600) {
    const k = Math.floor(rnd() * 9);
    for (let i = 0; i < k; i++) {
      const t = s + rnd() * 3600;
      if (t < now) fills.push({ t, id: 'f' + fills.length, side: rnd() < 0.5 ? 'buy' : 'sell',
        size: +(0.002 + rnd() * 0.01).toFixed(4), reason: 'through' });
    }
    if (withVolume) volume.push({ t: s + 1, product: DEFAULTS.product, volume: 150 + rnd() * 600 });
  }
  return { fills, volume };
}
