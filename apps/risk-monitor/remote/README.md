# Risk Monitor: what runs on the server

One service, `monitor` (`python3 monitor.py`), standard library only, plus the pinned
component `_components/paper_book` (the same position and PnL accounting the strategy
uses, here fed from the fills log). It opens no network connection and sends no order.
`python3 monitor.py --once` measures once, prints the result and writes nothing.
`python3 test_risk.py` runs the tests.

## What it reads

- `~/market-recorder/heartbeat.json`: the recorder's heartbeat and each product's last message.
- `~/market-recorder/live.sock`: the live feed (last message per product, the BTC-USD mid).
- `~/paper-market-maker/heartbeat.json`: only that it is fresh, its `state` and `data_dir`.
- `<strategy data folder>/fills/<day>.jsonl(.gz)`: every fill. Position, realised PnL and
  day PnL are rebuilt from these rows (`fills.py`); the strategy's own numbers are only
  passed on beside them (`maker.*`) for comparison.
  Day PnL = (realised + open at the mid) now, less the same at 00:00 UTC. The mid at 00:00
  is the one this service saw; if it was not running then and a position was carried over,
  the mid in the strategy's first snapshot of the day.
- The disk: free space of the home folder and of both data folders (the least).

## Checks (once a second; `rules.py`)

| check | breached when | writes the stop |
|---|---|---|
| `feed_btc` | no BTC-USD message for more than `stale_s` | yes |
| `feed_eth` | no ETH-USD message for more than `stale_s` | no |
| `recorder_hb` | recorder heartbeat older than `hb_stale_s`, or no file | no |
| `maker_hb` | strategy heartbeat older than `hb_stale_s`, or no file | no |
| `position` | abs(position) above `max_position` BTC | yes |
| `loss` | day PnL at or below −`max_day_loss` USD (UTC day) | yes |
| `disk` | less than `min_free_gb` GB free | no |

## The stop signal (`tracker.py`)

`~/paper-market-maker/control/risk.json`, in the format the strategy's README gives
(`{"stop": true|false, "reason", "t_ns"}`, temp file then rename). Written once when a
stopping check goes to breach and no stop is on. The stop then stays on until Clear stop
is pressed on the page; that is refused while a stopping check is still breached. If the
strategy is not stopped 30 s later and the breach lasts, the stop is written again; if it
is not stopped and nothing is breached (Resume pressed there, a new UTC day), the stop is
taken as ended (`released`).

## What it writes

- `heartbeat.json` and `status/monitor.json` here, every second.
- `~/risk-monitor-data/state.json` (open events, the stop, since-when of each check) and
  `~/risk-monitor-data/events/<YYYY-MM-DD>.jsonl` (every change of an event).

## Streams (read by the page through Studio)

- `state`, every 2 s and at once on a change, kept 2 days:
  `position, avg_price, realised, unrealised, day_pnl, day, fills_today, last_fill_ns, mid, free_gb,
  checks.<check> {state: ok | breach | unknown, value, limit, since (unix s)},
  stop {t, reason, check, event, sent, resent} | null, can_clear, note, open [event ids],
  maker {state, position, day_pnl, stopped_by, why}, error, settings`.
- `events`, one row per change of an event, kept 30 days; merge by `id`, the newest wins:
  `id, kind (breach | clear | released), check, opened, value, limit, stops, stop_sent,
  acked, recovered (unix s, 0 = not yet), reason`.

## Settings (config.json, no restart needed)

`stale_s`, `hb_stale_s`, `max_position`, `max_day_loss`, `min_free_gb`, `remind_min`
(used by the page's reminders), and the page's two buttons: `ack` (event ids, comma
separated) and `clear_at` (unix seconds).
