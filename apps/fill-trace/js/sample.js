// Made-up rows for a layout check (?sample). Never shown otherwise.
export function sample(now) {
  const fills = [], markouts = [], status = [], risk = [];
  let mid = 91250;
  for (let i = 0; i < 14; i++) {
    const t0 = now - 400 - i * 317, side = i % 3 ? 'buy' : 'sell';
    const price = +(mid + (side === 'buy' ? -1.8 : 1.8)).toFixed(2), local_ns = Math.round(t0 * 1e9);
    fills.push({ t: t0, id: 100 - i, side, price, size: 0.01, reason: i === 3 ? 'flatten' : 'through', fill_pnl: i % 2 ? 0.04 : 0,
      position: +(0.03 - i * 0.01).toFixed(4), mid, local_ns, day: new Date(t0 * 1000).toISOString().slice(0, 10) });
    const drift = [0.6, -1.1, 2.4].map(d => (side === 'buy' ? 1 : -1) * d * (i % 4 === 1 ? -1 : 1));
    const m = drift.map(d => +(mid + d).toFixed(2));
    markouts.push({ t: t0 + 30, id: 100 - i, side, price, size: 0.01, local_ns, mid, mid1: m[0], mid5: m[1], mid30: m[2],
      m1: +((side === 'buy' ? m[0] - price : price - m[0])).toFixed(2), m5: +((side === 'buy' ? m[1] - price : price - m[1])).toFixed(2),
      m30: +((side === 'buy' ? m[2] - price : price - m[2])).toFixed(2) });
    for (let s = -62; s <= 62; s += 2) {
      const v = +(mid + Math.sin((s + i * 7) / 9) * 1.6 + (s > 0 ? drift[2] * Math.min(1, s / 30) : 0)).toFixed(2);
      const stopped = i === 3 && s > 0;
      status.push({ t: t0 + s + 0.4, state: stopped ? 'stopped' : 'quoting', mid: v, bid: v - 0.005, ask: v + 0.005, position: 0.03 - i * 0.01 + (s < 0 ? (side === 'buy' ? -0.01 : 0.01) : 0),
        quote_bid: stopped ? null : { price: +(v - 1.83).toFixed(2), size: 0.01 }, quote_ask: stopped ? null : { price: +(v + 1.83).toFixed(2), size: 0.01 } });
    }
    mid += (i % 2 ? 7 : -11);
  }
  const f3 = fills[3].local_ns / 1e9;
  risk.push({ t: f3 - 2, id: 'e1', kind: 'breach', check: 'position', opened: f3 - 2, value: 0.26, limit: 0.25, stops: true, stop_sent: true, recovered: f3 + 21, reason: 'position 0.26 BTC beyond 0.25' });
  const maker = [{ t: f3 - 1, type: 'stop', by: 'risk', reason: 'position 0.26 BTC beyond 0.25', local_ns: (f3 - 1) * 1e9 }];
  return { fills, markouts, status, risk, maker };
}
