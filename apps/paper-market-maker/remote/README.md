# Paper Market Maker: what runs on the server

One service, `maker` (`python3 maker.py`), standard library only, plus the pinned
component `_components/paper_book` (position and PnL accounting, the fill rule).

**Paper only.** It reads Market Recorder's live feed from the local socket
`~/market-recorder/live.sock` and writes files. It opens no network connection, has
no exchange credentials and no code that sends an order. Every quote, cancel and
fill below is simulated.

## The strategy (BTC-USD)

- One bid and one ask. `centre = mid − mid × skew_bps/10⁴ × (position ÷ max_position)`;
  bid = centre − half-spread, ask = centre + half-spread, rounded away from the centre
  to 0.01, and never crossing the market's own bid and ask.
- A quote is replaced when its target has moved more than `requote_bps` of the mid.
- **Fill rule:** our bid fills only when a trade prints strictly below it, our ask only
  when a trade prints strictly above it; never on a trade at our price. The fill is at
  our price, for at most the trade's size and what is left of the quote. No fees.
- Position limit: a side whose fill would take the position past `max_position` is
  not quoted (or quoted smaller).
- The feed silent for `stale_s`, or the recorder disconnected: both quotes are pulled
  (state `paused`), the position is kept, and quoting starts again with the next quote.
- **Stop** (state `stopped`): both quotes are cancelled and the position is flattened
  with one simulated fill at the far touch (sell at the bid, buy at the ask). Causes:
  the day's PnL at or below −`daily_loss_limit` (`loss`), Risk Monitor's signal
  (`risk`), the Stop button (`person`). It stays stopped until Resume is pressed or the
  next UTC day starts; a stop the person pressed stays until Resume.
- Day PnL = (realised + unrealised at the mid) now − the same at 00:00 UTC.

## The stop signal (written by Risk Monitor)

`~/paper-market-maker/control/risk.json`, written as a temp file and renamed:

    {"stop": true,  "reason": "position 0.26 BTC beyond 0.25", "t_ns": <UTC ns>}
    {"stop": false, "reason": "cleared", "t_ns": <UTC ns>}

Read once a second. A signal is acted on once, when its `t_ns` is newer than the last
one seen: `stop: true` stops and flattens; `stop: false` resumes a stop that Risk
Monitor caused. Writing the same stop again needs a new `t_ns`.

## Heartbeat (for Risk Monitor)

`~/paper-market-maker/heartbeat.json`, rewritten every second (temp file, then rename):

    t, t_ns, paper (true), product, state (quoting | paused | stopped), why,
    stopped_by ('' | loss | risk | person), since_ns, position (BTC, + long), avg_price,
    mid, bid, ask, realised (all time), unrealised, day (UTC), day_pnl, fills_today,
    volume_today, quote_bid {price, size} | null, quote_ask, exch_ns,
    feed {connected, age_s}, error, data_dir, risk_file, settings

`status/maker.json` is Studio's own health file.

## Daily log files (for Risk Monitor and Research Notebook)

Under the data folder (setting `data_dir`, default `~/paper-mm-data`), one JSON object
per line, by UTC day of `local_ns`. Today's files are plain `.jsonl` and can be
followed; a finished day becomes `.jsonl.gz`; days older than `keep_days` are removed.

    orders/<YYYY-MM-DD>.jsonl     type quote:  id, side, price, size, mid, bid, ask
                                  type cancel: id, side, price, left, reason (requote | position limit | feed stale | stop)
    fills/<YYYY-MM-DD>.jsonl      id, side (ours: buy | sell), price, size, reason (through | flatten), quote_id,
                                  fill_pnl (realised by this fill), position, avg_price, realised, mid, day, day_pnl;
                                  through: recv_ns, trade_id, trade_price, trade_size, maker_side; flatten: book_age_s
    snapshots/<YYYY-MM-DD>.jsonl  once a second: the heartbeat's state, position and PnL fields
    markouts/<YYYY-MM-DD>.jsonl   one row per fill, written 30 s after it (in the day it was completed): the fill's id,
                                  side, price, size, reason, local_ns, exch_ns, mid, day; mid1, mid5, mid30 (the mid 1, 5
                                  and 30 s after local_ns) and m1, m5, m30 (USD per BTC in the fill's favour: buy = later
                                  mid − price, sell = price − later mid; null when the feed was stale then); done_ns;
                                  from_files: true when it was filled in after a restart from Market Recorder's quote files
    events/<YYYY-MM-DD>.jsonl     type start | stop (by, reason) | resume (by) | feed_stale | feed_ok | day
    state.json                    what a restart continues from (position, day start, last signals seen)

Every row has `local_ns` (this machine's clock when it was written) and `exch_ns` (the
exchange's time of the latest market event it is based on; for a `through` fill, the
trade's own time), both UTC nanoseconds. Position and PnL can be rebuilt from the fills
alone: `paper_book.replay(rows)`.

## Streams (read by pages through Studio)

- `status`: the heartbeat, every 2 s, kept 2 days.
- `pnl`: day, day_pnl, position, realised, unrealised, mid, state, every 30 s, kept 30 days.
- `fills`: one row per simulated fill (the fills file's fields), kept 30 days.
- `markouts`: one row per fill, 30 s after it (the markouts file's fields), kept 30 days. Its `t` is when the
  row was written; the fill's own time is `local_ns`.
- `events`: one row per event, kept 30 days.

## Settings (config.json, no restart needed)

`half_spread_bps`, `quote_size`, `skew_bps`, `requote_bps`, `max_position`,
`daily_loss_limit`, `stale_s`, `data_dir`, `keep_days`, and `stop_at` / `resume_at`
(unix seconds of the page's Stop and Resume buttons; the later one wins).

`python3 test_engine.py` runs the strategy on a made-up feed.
