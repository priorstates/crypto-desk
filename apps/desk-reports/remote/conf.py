"""Settings the person may change (Studio writes them to config.json; a change is
noticed without a restart), the places this service reads, and small helpers.

Everything outside DATA and SECRETS is only ever read."""
import json
import os
import sys
import time

sys.path.insert(0, '.studio')
try:
    import studio_config
except Exception:               # not deployed by Studio (a rehearsal, the tests): read config.json here
    studio_config = None


def _p(env, default):
    return os.path.expanduser(os.environ.get(env) or default)


MAKER_DATA = _p('DR_MAKER_DATA', '~/paper-mm-data')         # read only
RISK_DATA = _p('DR_RISK_DATA', '~/risk-monitor-data')       # read only
RECORDER = _p('DR_RECORDER', '~/market-recorder')           # read only: heartbeat.json, logs/recorder.log
MARKET_DATA = _p('DR_MARKET_DATA', '~/market-data')         # read only
DATA = _p('DR_DATA', '~/desk-reports-data')                 # this service's own state and send log
SECRETS = _p('DR_SECRETS', '~/.desk-reports-secrets')       # slack_webhook, smtp_password: mode 600, never copied
PRODUCTS = ('BTC-USD', 'ETH-USD')
DESK = 'Crypto desk'
WEEKDAYS = ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')

DEFAULTS = {
    'daily_time': '21:00',      # UTC, HH:MM
    'weekly_day': 'sun',
    'weekly_time': '21:05',     # UTC, after the daily
    'min_n': 30,                # a markout from fewer fills than this reads 'too few'
    'email_host': 'localhost',
    'email_port': 1025,
    'email_tls': 'none',        # none | starttls | ssl
    'email_user': '',           # empty: no login. The password is a secret file, not a setting.
    'email_from': 'desk-reports@example.com',
    'email_to': 'desk@example.com',
    'email_reports': True,
    'email_alerts': True,
    'slack_reports': True,      # Slack is off anyway while no webhook is set
    'slack_alerts': True,
    'alert_checks': 'position,loss,stop,feed_btc,feed_eth',
    'alert_min_gap_s': 300,     # the same check is not announced again sooner than this
    'retry_hours': 24,          # a message that cannot be sent is retried this long
    'test_at': 0,               # unix seconds of the page's 'Send a test report now'
}
_file = {'mtime': None, 'values': {}}


def value(key):
    default = DEFAULTS[key]
    if studio_config:
        try:
            v = studio_config.value(key, default)
            return default if v is None else v
        except Exception:
            return default
    try:
        mtime = os.stat('config.json').st_mtime_ns
        if mtime != _file['mtime']:
            with open('config.json') as f:
                _file['values'] = json.load(f)
            _file['mtime'] = mtime
    except (OSError, ValueError):
        pass
    return _file['values'].get(key, default)


def settings():
    out = {}
    for k, d in DEFAULTS.items():
        v = value(k)
        if isinstance(d, bool):
            v = v if isinstance(v, bool) else str(v).strip().lower() in ('1', 'true', 'yes', 'on')
        elif isinstance(d, (int, float)):
            try:
                v = float(v)
                v = d if v != v or v < 0 else v
            except (TypeError, ValueError):
                v = d
        else:
            v = str(v if v is not None else d).strip()
        out[k] = v
    for k in ('daily_time', 'weekly_time'):
        if hhmm(out[k]) is None:
            out[k] = DEFAULTS[k]
    if out['weekly_day'].lower()[:3] not in WEEKDAYS:
        out['weekly_day'] = DEFAULTS['weekly_day']
    return out


def hhmm(text):
    """'21:00' -> seconds after 00:00 UTC, or None."""
    try:
        h, m = str(text).strip().split(':')
        h, m = int(h), int(m)
        return h * 3600 + m * 60 if 0 <= h < 24 and 0 <= m < 60 else None
    except ValueError:
        return None


def day_of(t):
    return time.strftime('%Y-%m-%d', time.gmtime(t))


def day_start(day):
    import calendar
    return calendar.timegm(time.strptime(day, '%Y-%m-%d'))


def write_json(file, obj):
    """Write a temp file and rename it, so a reader never sees half a file."""
    tmp = f'{file}.tmp'
    with open(tmp, 'w') as f:
        json.dump(obj, f, separators=(',', ':'))
    os.replace(tmp, file)
