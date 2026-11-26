"""Settings: where the recorded files are, and the numbers every study uses."""
import json
import os
import re

import forge

# Everything a person may tune. The page shows them under Data → Settings.
DEFAULTS = {
    'host': 'trade1',                 # ssh name of the server; empty = the folders below are on this computer
    'market_dir': '~/market-data',    # Market Recorder's data folder
    'fills_dir': '~/paper-mm-data',   # Paper Market Maker's data folder
    'paper_product': 'BTC-USD',       # the product the paper strategy quotes
    'gap_silence_s': 60,              # no quote for this long counts as a gap
    'markout_ms': [100, 1000, 5000, 30000, 60000],
    'vol_horizons_s': [1, 10, 60, 300],
    'size_buckets_usd': [100, 1000, 10000, 100000],   # edges of the trade size buckets, in USD
    'auto_sync_min': 10,              # bring the copy up to date on opening when it is older than this
}
PARAM_KEYS = ('gap_silence_s', 'markout_ms', 'vol_horizons_s', 'size_buckets_usd', 'paper_product')
HOST_RE = re.compile(r'^[A-Za-z0-9._@-]{1,100}$')
DIR_RE = re.compile(r'^~?[/A-Za-z0-9._-]{1,200}$')
PRODUCT_RE = re.compile(r'^[A-Z0-9]{2,12}-[A-Z0-9]{2,12}$')
DAY_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')


def _numbers(v, lo, hi, most=8):
    if isinstance(v, str):
        v = [x for x in re.split(r'[,\s]+', v) if x]
    out = sorted({float(x) for x in v})
    if not out or len(out) > most or out[0] < lo or out[-1] > hi:
        raise ValueError(f'give 1 to {most} numbers between {lo:g} and {hi:g}')
    return [int(x) if x == int(x) else x for x in out]


def clean(s):
    """A settings dict with every value checked; raises ValueError with a plain message."""
    out = dict(DEFAULTS)
    out.update({k: v for k, v in (s or {}).items() if k in DEFAULTS})
    out['host'] = str(out['host']).strip()
    if out['host'] and not HOST_RE.match(out['host']):
        raise ValueError('the server name may only have letters, digits and . _ @ -')
    for k in ('market_dir', 'fills_dir'):
        out[k] = str(out[k]).strip()
        if out[k] and not DIR_RE.match(out[k]) or '..' in out[k]:
            raise ValueError(f'{k}: a folder path with letters, digits and / . _ - only')
    out['paper_product'] = str(out['paper_product']).strip().upper()
    if not PRODUCT_RE.match(out['paper_product']):
        raise ValueError('the paper product looks like BTC-USD')
    out['gap_silence_s'] = float(out['gap_silence_s'])
    if not 1 <= out['gap_silence_s'] <= 3600:
        raise ValueError('the gap length is between 1 and 3600 seconds')
    out['markout_ms'] = _numbers(out['markout_ms'], 1, 600000)
    out['vol_horizons_s'] = [int(x) for x in _numbers(out['vol_horizons_s'], 1, 3600)]
    out['size_buckets_usd'] = _numbers(out['size_buckets_usd'], 0.01, 1e9)
    out['auto_sync_min'] = float(out['auto_sync_min'])
    return out


def load():
    try:
        return clean(json.loads(forge.read('data', 'settings.json', default='{}') or '{}'))
    except ValueError:
        return dict(DEFAULTS)


def save(s):
    s = clean(s)
    forge.write('data', 'settings.json', text=json.dumps(s, indent=1))
    return s


def params(s, given=None):
    """The numbers a study's result depends on (kept with a saved study)."""
    base = {k: s[k] for k in PARAM_KEYS}
    if given:
        base.update({k: v for k, v in given.items() if k in PARAM_KEYS})
        base = {k: clean({**DEFAULTS, **base})[k] for k in PARAM_KEYS}
    return base


def market_root(s):
    return os.path.join(forge.data, 'mirror', 'market') if s['host'] else os.path.expanduser(s['market_dir'])


def fills_root(s):
    return os.path.join(forge.data, 'mirror', 'paper') if s['host'] else os.path.expanduser(s['fills_dir'])
