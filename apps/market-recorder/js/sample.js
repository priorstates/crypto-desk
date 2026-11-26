// Made-up numbers in the recorder's heartbeat shape, shown only with ?sample (to check the layout).
export function sample() {
  const ns = Date.now() * 1e6;
  const product = (bid, ask, price, n) => ({
    last_ns: ns - 4e8, age_s: 0.4, msgs_min: n, lag_ms: 14, gaps_today: 1, gap_open: null, last_trade_id: 1,
    quote: { recv_ns: ns - 2e9, bid, bid_size: '0.10957478', ask, ask_size: '0.00008529' },
    trade: { recv_ns: ns - 2e9, price, size: '0.00282687', maker_side: 'sell' },
    files: { quotes: 8400000, trades: 7900000 },
  });
  return {
    hb: {
      t: Date.now() / 1000, t_ns: ns, connected: true, error: '', paused: false, pause_why: '',
      products: { 'BTC-USD': product('60572.48', '60572.49', '60572.49', 1204), 'ETH-USD': product('1690.93', '1691.04', '1691.04', 380) },
      disk: { data_dir: '/home/trader/market-data', used: 1.9 * 2 ** 30, cap: 5 * 2 ** 30, free: 3.4 * 2 ** 30, total: 120 * 2 ** 30, oldest_day: '2026-11-02', days: 25 },
      settings: { products: 'BTC-USD,ETH-USD', data_dir: '~/market-data', cap_gb: 5, keep_days: 30, min_free_gb: 1 },
    },
    gaps: [{ product: 'BTC-USD', start: '2026-11-26T15:59:54.614226755Z', end_ns: 1, seconds: 11.545, reason: 'the recorder was not running', missed_trades: 184 }],
  };
}
