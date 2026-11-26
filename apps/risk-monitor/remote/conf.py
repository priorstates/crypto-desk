"""Settings the person may change (Studio writes them to config.json; a change
is noticed without a restart), the places this service reads, and one helper."""
import json
import os
import sys

sys.path.insert(0, '.studio')
try:
    import studio_config
except Exception:               # not deployed by Studio: read config.json here
    studio_config = None

RECORDER = '~/market-recorder'          # heartbeat.json, live.sock
MAKER = '~/paper-market-maker'          # heartbeat.json, control/risk.json
MAKER_DATA = '~/paper-mm-data'          # used until the strategy's heartbeat names its folder
DATA = '~/risk-monitor-data'            # this service's own state and event log
PRODUCTS = ('BTC-USD', 'ETH-USD')
BOOK = 'BTC-USD'                        # the product the strategy trades

DEFAULTS = {
    'stale_s': 10,          # no message for a product for this long: its feed is stale
    'hb_stale_s': 5,        # a heartbeat file older than this: recorder or strategy is missing
    'max_position': 0.25,   # BTC, either way
    'max_day_loss': 300,    # USD, per UTC day
    'min_free_gb': 20,      # free disk space on this machine, GB
    'remind_min': 5,        # the page reminds this often while a breach lasts (0: no reminders)
    'ack': '',              # event ids acknowledged on the page, comma separated
    'clear_at': 0,          # unix seconds of the last Clear stop pressed on the page
}
_file = {'mtime': None, 'values': {}}


def value(key):
    default = DEFAULTS[key]
    if studio_config:
        try:
            return studio_config.value(key, default)
        except Exception:
            return default
    try:
        mtime = os.stat('config.json').st_mtime
        if mtime != _file['mtime']:
            with open('config.json') as f:
                _file['values'] = json.load(f)
            _file['mtime'] = mtime
    except (OSError, ValueError):
        pass
    return _file['values'].get(key, default)


def number(key):
    try:
        v = float(value(key))
        return v if v >= 0 else float(DEFAULTS[key])
    except (TypeError, ValueError):
        return float(DEFAULTS[key])


def settings():
    out = {k: number(k) for k in DEFAULTS if k != 'ack'}
    out['ack'] = str(value('ack') or '')
    return out


def path(*parts):
    return os.path.expanduser(os.path.join(*parts))


def write_json(file, obj):
    """Write a temp file and rename it, so a reader never sees half a file."""
    tmp = f'{file}.tmp'
    with open(tmp, 'w') as f:
        json.dump(obj, f, separators=(',', ':'))
    os.replace(tmp, file)
