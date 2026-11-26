"""Settings the person may change (Studio writes them to config.json; a change
is noticed without a restart), and the two small helpers every part uses."""
import calendar
import json
import os
import re
import sys
import time

sys.path.insert(0, '.studio')
try:
    import studio_config
except Exception:               # not deployed by Studio: read config.json here
    studio_config = None

DEFAULTS = {
    'products': 'BTC-USD,ETH-USD',
    'data_dir': '~/market-data',
    'cap_gb': 5,
    'keep_days': 30,
    'min_free_gb': 1,
}
PRODUCT_RE = re.compile(r'^[A-Z0-9]{2,12}-[A-Z0-9]{2,12}$')
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
        return max(0.0, float(value(key)))
    except (TypeError, ValueError):
        return float(DEFAULTS[key])


def products():
    out = []
    for p in re.split(r'[\s,;]+', str(value('products')).upper()):
        if PRODUCT_RE.match(p) and p not in out:
            out.append(p)
    return out[:10] or DEFAULTS['products'].split(',')


def data_dir():
    return os.path.abspath(os.path.expanduser(str(value('data_dir')).strip()
                                              or DEFAULTS['data_dir']))


def settings():
    return {'products': ','.join(products()), 'data_dir': str(value('data_dir')),
            'cap_gb': number('cap_gb'), 'keep_days': number('keep_days'),
            'min_free_gb': number('min_free_gb')}


_secs = {}


def iso_ns(s):
    """'2026-11-26T12:34:56.123456Z' -> UTC nanoseconds, exactly (0 if unreadable)."""
    try:
        head = s[:19]
        sec = _secs.get(head)
        if sec is None:
            if len(_secs) > 500:
                _secs.clear()
            sec = _secs[head] = calendar.timegm(time.strptime(head, '%Y-%m-%dT%H:%M:%S'))
        frac = s[19:].strip('.Z')
        return sec * 10**9 + (int((frac + '000000000')[:9]) if frac else 0)
    except (TypeError, ValueError):
        return 0


def ns_iso(ns):
    return (time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime(ns // 10**9))
            + f'.{ns % 10**9:09d}Z')


def write_json(path, obj):
    """Write a temp file and rename it, so a reader never sees half a file."""
    tmp = f'{path}.tmp'
    with open(tmp, 'w') as f:
        json.dump(obj, f, separators=(',', ':'))
    os.replace(tmp, path)
