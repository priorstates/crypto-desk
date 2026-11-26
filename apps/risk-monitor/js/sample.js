// Made-up numbers for ?sample (a breach in progress), to check the layout. Never shown otherwise.
export function sample() {
  const now = Date.now() / 1000;
  const c = (state, value, limit, ago) => ({ state, value, limit, since: now - ago });
  const ev = (check, ago, value, limit, more) => ({ id: check + '-' + ago, kind: 'breach', check, opened: now - ago,
    value, limit, stops: false, stop_sent: false, acked: 0, recovered: 0, ...more });
  const st = {
    t: now, position: 0, avg_price: 0, realised: -287.4, unrealised: 0, day_pnl: -312.4, fills_today: 412, mid: 60412.5,
    free_gb: 14.2, day: new Date().toISOString().slice(0, 10),
    checks: {
      feed_btc: c('ok', 0.3, 10, 5400), feed_eth: c('ok', 1.2, 10, 86000), recorder_hb: c('ok', 0.4, 5, 86000),
      maker_hb: c('ok', 0.6, 5, 86000), position: c('ok', 0, 0.25, 3000), loss: c('breach', -312.4, 300, 840),
      disk: c('breach', 14.2, 20, 7300),
    },
    stop: { t: now - 840, reason: 'day loss 300.12 USD beyond 300', check: 'loss', sent: now - 840 }, can_clear: false,
    open: ['loss-840', 'disk-7300'], maker: { state: 'stopped', position: 0, day_pnl: -312.4, stopped_by: 'risk' },
    settings: {},
  };
  const events = [
    ev('loss', 840, -300.12, 300, { stops: true, stop_sent: true }),
    ev('disk', 7300, 19.9, 20, { acked: now - 7000 }),
    ev('feed_btc', 5460, 11, 10, { stops: true, stop_sent: true, recovered: now - 5400, acked: now - 5300 }),
    { id: 'clear-1', kind: 'clear', opened: now - 5200 },
    ev('feed_eth', 90000, 14, 10, { recovered: now - 89950 }),
  ];
  return { st, events };
}
