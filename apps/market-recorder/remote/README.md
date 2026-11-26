# Market Recorder: what runs on the server

One service, `recorder` (`python3 recorder.py`), standard library only. It holds the
only connection to Coinbase's public market data websocket
(`wss://ws-feed.exchange.coinbase.com`, no account, no key) and subscribes to
`ticker` (top of book), `matches` (trades) and `heartbeat`. It never sends an order.

## Recorded files (for Research Notebook)

Under the data folder (setting `data_dir`, default `~/market-data`):

    <PRODUCT>/quotes/<YYYY-MM-DD>.<NNN>.csv.gz   recv_ns,exch_ns,seq,bid,bid_size,ask,ask_size
    <PRODUCT>/trades/<YYYY-MM-DD>.<NNN>.csv.gz   recv_ns,exch_ns,seq,trade_id,price,size,maker_side
    gaps/<YYYY-MM-DD>.jsonl                      product,start_ns,end_ns,start,end,seconds,reason,missed_trades

- The day is the UTC day of the receive time. `NNN` is 000, then one more each time
  the recorder starts again that day. Read a day with `sorted(glob('<day>.*.csv.gz'))`.
- `recv_ns`: local receive time, UTC nanoseconds. `exch_ns`: the exchange's time, UTC
  nanoseconds (Coinbase gives microseconds). `seq`: Coinbase's sequence number for the
  product. It counts every book event, so it has holes here; `trade_id` goes up by one
  per trade and is what shows a missed trade.
- `maker_side` is the side of the resting order: `sell` means the taker bought.
- A quote row is written when Coinbase sends a ticker: on each trade, not on each
  change of the book between trades.
- Today's files are being written. They get a readable sync point every 10 s; a file
  left by a crash ends without a gzip trailer (`zcat` prints the rows, then an error).
- Prices and sizes are the exchange's own strings, unchanged.

## Live feed (for Paper Market Maker and Risk Monitor)

`~/market-recorder/live.sock`, a Unix socket: connect and read one JSON object per
line. `live_client.py` does it (`for ev in follow(): ...`), reconnecting by itself.

    hello   products, connected
    quote   product, recv_ns, exch_ns, seq, bid, bid_size, ask, ask_size   (snapshot: true for the first one)
    trade   product, recv_ns, exch_ns, seq, trade_id, price, size, maker_side
    status  state (connected | disconnected), reason
    gap     the same fields as a row of the gaps file

A reader that falls 20,000 messages behind is disconnected.

## Heartbeat (for Risk Monitor)

`~/market-recorder/heartbeat.json`, rewritten every second (temp file, then rename):

    t, t_ns, connected, error, paused, pause_why, readers, source, live_socket, settings
    products.<P>: last_ns (last message of any kind, incl. the exchange's own 1 s heartbeat),
                  age_s, quote, trade, last_trade_id, msgs_min (quotes + trades, last 60 s),
                  lag_ms, gaps_today, gap_open {start_ns, reason} | null, files {quotes, trades} (bytes today)
    disk: data_dir, used, cap, free, total (bytes), oldest_day, days

`status/recorder.json` is Studio's own health file.

## Streams (read by pages through Studio)

- `heartbeat`: the heartbeat object, every 5 s, kept 2 days.
- `gaps`: one row per gap (the fields above), kept 30 days.

## Settings (config.json, no restart needed)

`products` (comma separated), `data_dir`, `cap_gb`, `keep_days`, `min_free_gb`.
Every minute: days older than `keep_days` are removed, then the oldest days while
the folder is over `cap_gb` or the disk has less than `min_free_gb` free. Today is
never removed; if it alone is over, writing files pauses (logged as a gap) and the
live feed goes on.
