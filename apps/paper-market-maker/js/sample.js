// Made-up numbers in the service's shapes, shown only with ?sample (to check the layout).
export function sample() {
  const now = Date.now() / 1000, ns = Date.now() * 1e6, day = new Date().toISOString().slice(0, 10);
  const day0 = Math.floor(now / 86400) * 86400;
  const pnl = [];
  let v = 0;
  for (let t = day0; t < now; t += 300) {
    v += Math.sin(t / 2100) * 3 + Math.cos(t / 700) * 2 + 0.15;
    pnl.push({ t, day, day_pnl: Math.round(v * 100) / 100 });
  }
  const fills = [];
  for (let i = 0; i < 12; i++) {
    const buy = i % 3 !== 0;
    fills.push({ t: now - (12 - i) * 40, local_ns: ns - (12 - i) * 40e9, id: i + 1, day, side: buy ? 'buy' : 'sell',
      price: 90120.5 + (buy ? -18 : 18) + i, size: i === 5 ? 0.0042 : 0.01, reason: i === 8 ? 'flatten' : 'through',
      day_pnl: v - 6 + i, fill_pnl: buy ? 0 : 0.36, position: (buy ? 0.01 : -0.01) * ((i % 4) + 1) });
  }
  const st = { t: now, state: 'quoting', why: '', stopped_by: '', since_ns: ns - 3600e9, position: 0.03, avg_price: 90102.4,
    mid: 90120.505, bid: 90120.5, ask: 90120.51, realised: 41.2, unrealised: 0.54, day, day_pnl: v, fills_today: 212,
    volume_today: 2.0958, quote_bid: { price: 90100.31, size: 0.01 }, quote_ask: { price: 90136.37, size: 0.01 } };
  const markouts = [];
  for (let i = 0; i < 80; i++) {
    const buy = i % 2 === 0, w = Math.sin(i * 1.7), price = 90120 + (buy ? -18 : 18);
    markouts.push({ t: now - (80 - i) * 200, local_ns: ns - (80 - i) * 200e9, id: 100 + i, day, side: buy ? 'buy' : 'sell',
      price, size: i % 5 ? 0.01 : 0.002, reason: 'through', m1: 14 + w * 6, m5: 6 + w * 12, m30: -5 + w * 25 + (buy ? -4 : 3) });
  }
  return { st, fills, pnl, markouts };
}
