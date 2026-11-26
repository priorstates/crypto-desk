"""Settings the person may change (Studio writes them to config.json; a change
is noticed without a restart), and two small helpers."""
import json
import os
import sys

sys.path.insert(0, '.studio')
try:
    import studio_config
except Exception:               # not deployed by Studio: read config.json here
    studio_config = None

PRODUCT = 'BTC-USD'
DEFAULTS = {
    'half_spread_bps': 2,       # each quote this far from the (skewed) mid, in basis points of the mid
    'quote_size': 0.01,         # BTC per quote
    'skew_bps': 2,              # both quotes move this far against the position when it is at the limit
    'requote_bps': 1,           # a quote is replaced when its target has moved more than this
    'max_position': 0.25,       # BTC, either way
    'daily_loss_limit': 300,    # USD, per UTC day
    'stale_s': 10,              # no BTC-USD message for this long: quotes are pulled
    'data_dir': '~/paper-mm-data',
    'keep_days': 30,
    'stop_at': 0,               # unix seconds of the last Stop pressed on the page
    'resume_at': 0,             # unix seconds of the last Resume pressed on the page
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


def data_dir():
    return os.path.abspath(os.path.expanduser(str(value('data_dir')).strip()
                                              or DEFAULTS['data_dir']))


def settings():
    out = {k: number(k) for k in DEFAULTS if k != 'data_dir'}
    out['data_dir'] = str(value('data_dir'))
    return out


def write_json(path, obj):
    """Write a temp file and rename it, so a reader never sees half a file."""
    tmp = f'{path}.tmp'
    with open(tmp, 'w') as f:
        json.dump(obj, f, separators=(',', ':'))
    os.replace(tmp, path)
