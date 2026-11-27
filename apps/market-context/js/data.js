// Settings and the rules, as plain functions. Paper only: this page reads streams and nothing else.
export const DEFAULTS = {
  products: ['BTC-USD', 'ETH-USD'],
  recorderApp: 'market-recorder',
  heartbeatStream: 'heartbeat',     // one row every 5 s: each product's last quote and last trade id
  makerApp: 'paper-market-maker',
  pnlStream: 'pnl',                 // day, day_pnl every 30 s
  hours: 'utc',                     // 'utc' (the desk's PnL day) or 'local'
  spreadUnit: 'bps',                // 'bps' of the mid, or 'usd'
  maxGapS: 30,                      // two rows further apart than this are not joined (feed gap)
  fullCover: 0.9,                   // an hour with less of it covered is drawn as partial
  wildX: 1.5,                       // an hour at or above this × the day's median is drawn strong
  quietX: 0.6,                      // … at or below this × the median, pale
  refreshMs: 5000,
  pageRows: 5000,                   // the most rows of a stream Studio hands a page: its newest ones
};

const secs = v => (v > 1e12 ? v / 1000 : Number(v));

// The day's hours: [{start (unix s), label}], for today in the chosen zone.
export function dayHours(nowS = Date.now() / 1000) {
  const d = new Date(nowS * 1000), utc = DEFAULTS.hours !== 'local', p = v => String(v).padStart(2, '0');
  const start = (utc ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    : new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 1000;
  const end = (utc ? start * 1000 + 864e5 : new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime()) / 1000;
  const hours = [];
  for (let s = start; s < end; s += 3600) {
    const h = new Date(s * 1000);
    hours.push({ start: s, label: p(utc ? h.getUTCHours() : h.getHours()) });
  }
  const date = utc ? d.toISOString().slice(0, 10) : `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return { start, end, hours, date, utc };
}

// One heartbeat row → what we need of one product, or null when it says nothing usable.
export function toSample(r, product) {
  const x = r && r.products && r.products[product], q = x && x.quote;
  if (!q || r.connected === false || x.age_s > DEFAULTS.maxGapS) return null;
  const bid = Number(q.bid), ask = Number(q.ask);
  if (!(bid > 0) || !(ask >= bid)) return null;
  const mid = (bid + ask) / 2, tid = Number(x.last_trade_id);
  return { t: secs(r.t), mid, spr: DEFAULTS.spreadUnit === 'usd' ? ask - bid : (ask - bid) / mid * 1e4,
    tid: x.last_trade_id != null && Number.isFinite(tid) ? tid : null };
}

// Sums per hour: [rows, spread sum, sum of squared log returns, trades, seconds covered, seconds with trade ids]
export function aggregate(samples, day) {
  const out = day.hours.map(() => [0, 0, 0, 0, 0, 0]);
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (s.t < day.start || s.t >= day.end) continue;
    const o = out[Math.min(out.length - 1, Math.floor((s.t - day.start) / 3600))];
    o[0]++; o[1] += s.spr;
    const a = samples[i - 1], dt = a ? s.t - a.t : 0;
    if (!a || dt <= 0 || dt > DEFAULTS.maxGapS) continue;
    const r = Math.log(s.mid / a.mid);
    o[2] += r * r; o[4] += dt;
    if (s.tid != null && a.tid != null) { o[3] += Math.max(0, s.tid - a.tid); o[5] += dt; }
  }
  return out;
}

// Of what was just worked out and what was kept from earlier, the one that covers more of the hour.
export const better = (now, kept) => (kept && kept[4] > (now ? now[4] : 0) ? kept : now);

// An hour's sums → its figures; null when under half a minute of it was seen.
export function metrics(o, elapsedS) {
  if (!o || o[0] < 2 || o[4] < 30) return null;
  return {
    spread: o[1] / o[0],
    vol: Math.sqrt(o[2] / o[4] * 3600) * 1e4,          // bps, scaled to a whole hour
    rate: o[5] >= 30 ? o[3] / (o[5] / 60) : null,      // trades per minute
    partial: o[4] < DEFAULTS.fullCover * Math.min(3600, Math.max(0, elapsedS)),
  };
}

// Which hours stand out against the day's median: 'hi', 'lo' or ''.
export function marks(values) {
  const known = values.filter(v => v != null).sort((a, b) => a - b);
  if (known.length < 4) return values.map(() => '');
  const med = (known[Math.floor((known.length - 1) / 2)] + known[Math.ceil((known.length - 1) / 2)]) / 2;
  return values.map(v => (v == null || !(med > 0) ? '' : v >= med * DEFAULTS.wildX ? 'hi' : v <= med * DEFAULTS.quietX ? 'lo' : ''));
}

// The desk's PnL per hour: day_pnl at the hour's end minus at its start. null = no rows for that hour.
export function bucketPnl(rows, day) {
  const mine = rows.filter(r => r && Number.isFinite(Number(r.day_pnl)) && secs(r.t) >= day.start && secs(r.t) < day.end
    && (!day.utc || !r.day || r.day === day.date)).sort((a, b) => secs(a.t) - secs(b.t));
  const last = day.hours.map(() => null), first = day.hours.map(() => null);
  for (const r of mine) {
    const i = Math.min(last.length - 1, Math.floor((secs(r.t) - day.start) / 3600));
    if (first[i] == null) first[i] = r;
    last[i] = r;
  }
  let prev = 0, known = true;                     // day_pnl is 0 at the start of the day
  const hours = last.map((r, i) => {
    if (!r) { known = false; return null; }
    const from = known ? prev : (secs(first[i].t) - day.hours[i].start < 120 ? Number(first[i].day_pnl) : null);
    prev = Number(r.day_pnl); known = true;
    return from == null ? null : prev - from;
  });
  return { hours, total: mine.length ? Number(mine[mine.length - 1].day_pnl) : null };
}

export function fmt(v, kind) {
  if (v == null || !Number.isFinite(v)) return '–';
  if (kind === 'pnl') return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2);
  if (kind === 'rate') return v >= 100 ? Math.round(v).toLocaleString() : v.toFixed(1);
  return v >= 100 ? Math.round(v).toLocaleString() : v >= 1 ? v.toFixed(1) : v === 0 ? '0' : String(Number(v.toPrecision(2)));
}

// Made-up data for ?try=sample: for checking the page only.
export function madeUp(day) {
  const now = Date.now() / 1000, from = day.start + 2 * 3600 + 900, samples = {}, pnl = [];
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  DEFAULTS.products.forEach((p, k) => {
    let mid = k ? 3100 : 91000, tid = 1e6;
    const rows = [];
    for (let t = from; t < now; t += 5) {
      const h = Math.floor((t - day.start) / 3600), wild = h === 9 ? 3.5 : h === 5 ? 0.3 : 1 + 0.5 * Math.sin(h);
      mid *= Math.exp((rnd() - 0.5) * 0.0004 * wild);
      tid += Math.round(rnd() * (k ? 8 : 40) * wild);
      rows.push({ t, mid, spr: (0.05 + rnd() * 0.4 * wild) * (k ? 3 : 1), tid });
    }
    samples[p] = rows;
  });
  let v = 0;
  for (let t = day.start + 20; t < now; t += 30) {
    v += (rnd() - 0.47) * (Math.floor((t - day.start) / 3600) === 9 ? 1.6 : 0.35);
    pnl.push({ t, day: day.date, day_pnl: v });
  }
  return { samples, pnl };
}
