# Desk Reports: what runs on the server

One service, `reporter` (`python3 reporter.py`), standard library only, plus the pinned
component `_components/markouts` (size-weighted markout averages).

**Paper only.** It reads files and sends messages (SMTP, a Slack webhook). It sends no
order and writes into no other app's folder.

    python3 reporter.py --print daily     build today's report and print it; sends nothing
    python3 test_reports.py               the tests, on made-up files in a temp folder

## What it reads (read only)

- `~/paper-mm-data/{fills,markouts,snapshots,events}/<day>.jsonl(.gz)`: PnL, fills, markouts, stops.
- `~/risk-monitor-data/state.json` and `events/<day>.jsonl`: breaches, the stop, when they cleared.
- `~/market-recorder/heartbeat.json`, `logs/recorder.log`; `~/market-data/<PRODUCT>/{quotes,trades}/<day>.NNN.csv.gz`
  (rows counted) and `~/market-data/gaps/<day>.jsonl`.
- The disk: free space, and the size of the data folders.

## Reports (`report.py`, `render.py`)

Daily and weekly, at the times in the settings (UTC). There is no cron on trade1: the
service's loop is the clock, and `state.json` records the last day reported, so a restart
neither repeats nor skips one. A report missed while the service was down is sent when it
is back, marked late, and counts nothing after the time it was due. A daily report covers
its UTC day up to the report time; its PnL table also shows the day before, whole.

Fill rules are never mixed. `report.rule_of(fill)` reads the fill's mark (`fill_rule`, or
`rule`; `latency_ms` is added to the label when present). A fill with no mark was made
under the original rule. `reason: flatten` fills (a stop closing the position) are kept
apart. Every fills, volume, markout and realised-PnL table is for one rule and says which.
A markout from fewer than `min_n` fills reads "too few"; n is always shown.

## Alerts (`alerts.py`)

Risk Monitor decides what a breach is. This follows its events file (by byte offset) and
its `state.json`, and sends one message when an event opens and one when it recovers,
keyed by the event id (the stop: `stop-<ms>`), remembered in `state.json`. After a raise
for a check, another raise for the same check waits `alert_min_gap_s`; if that breach
clears while waiting, neither message is sent (it is counted and told with the next raise).
A message that cannot be sent stays in the outbox and is retried (15 s, doubling to 10
minutes) for `retry_hours`.

## Secrets

`~/.desk-reports-secrets/slack_webhook` and `smtp_password`, mode 600, written by the
app's page over ssh. Outside this folder and the data folder. Never logged: every error
text passes `channels.scrub()`. Slack is off while there is no webhook file.

## What it writes

- `~/desk-reports-data/state.json` (last reports, outbox, alerts sent, last error, hourly
  free-disk samples), `sends/<YYYY-MM>.jsonl` (one row per send attempt: t, id, kind,
  channel, ok, error, try), `cache.json` (row counts of finished days).
- Here: `status/reporter.json` every second, `logs/reporter.log`, the stream below.

## Stream (read by the page through Studio)

- `state`, on a change and once a minute, kept 2 days:
  `since, reports.{daily|weekly|test} {id, day, due, queued, sent, late_s, tries,
  ch {email, slack: sent | pending | failed | off}, err {email, slack}},
  next_daily, next_weekly (unix s), alerts [{id, check, opened, reason, recovered,
  raise (queued | held | suppressed), clear, sent {raise, clear: ch}}],
  waiting [{id, tries, next, err}], failing, last_error {t, id, channel, error},
  secrets {slack_webhook, smtp_password: true | false}, settings`.

## Settings (config.json, no restart needed)

`daily_time`, `weekly_day`, `weekly_time`, `min_n`, `email_host`, `email_port`,
`email_tls` (none | starttls | ssl), `email_user`, `email_from`, `email_to` (commas),
`email_reports`, `email_alerts`, `slack_reports`, `slack_alerts`, `alert_checks`
(Risk Monitor's check names, and `stop`), `alert_min_gap_s`, `retry_hours`, and
`test_at` (unix seconds of the page's "Send a test report now").
