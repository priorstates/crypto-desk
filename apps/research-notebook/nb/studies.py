"""Run a study day by day (each day's part is kept and reused), and keep saved studies."""
import hashlib
import json
import os
import re
import time

import forge
from . import conf, load, markout, paper, spreads, vol

VERSION = 1                         # raise when a study's method changes: kept day results are redone
KINDS = {'spreads': spreads, 'vol': vol, 'markout': markout, 'paper': paper}
ID_RE = re.compile(r'^[a-z0-9]{6,20}$')


def _check(study, product, day=None):
    if study not in KINDS:
        raise ValueError('no such study: ' + str(study))
    if not conf.PRODUCT_RE.match(product or ''):
        raise ValueError('no such product: ' + str(product))
    if day is not None and not conf.DAY_RE.match(day):
        raise ValueError('not a day: ' + str(day))


def day_part(s, study, product, day, P):
    """One day's part of a study, from the kept copy when the files have not changed."""
    _check(study, product, day)
    root, froot = conf.market_root(s), conf.fills_root(s)
    src = load.sizes(root, product, day) + load.sizes(root, product, load.next_day(day))[:1]
    src.append(bool(load.files(root, product, 'quotes', load.next_day(day, -1))))     # the day before is here
    if study == 'paper':
        src += [(e, os.path.getsize(os.path.join(froot, 'fills', day + e)))
                for e in ('.jsonl', '.jsonl.gz') if os.path.exists(os.path.join(froot, 'fills', day + e))]
    key = hashlib.sha1(json.dumps([VERSION, study, P, src], sort_keys=True).encode()).hexdigest()
    path = os.path.join(forge.data, 'cache', study, product, day + '.json')
    try:
        with open(path) as f:
            kept = json.load(f)
        if kept.get('key') == key:
            return kept['part'], True
    except (OSError, ValueError):
        pass
    part = paper.day(root, froot, day, P) if study == 'paper' else KINDS[study].day(root, product, day, P)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path + '.tmp', 'w') as f:
        json.dump({'key': key, 'part': part}, f, separators=(',', ':'))
    os.replace(path + '.tmp', path)
    with open(path) as f:               # as it reads back, so a fresh and a kept part are the same
        return json.load(f)['part'], False


def combine(s, study, product, days, P):
    _check(study, product)
    parts = [day_part(s, study, product, d, P)[0] for d in sorted(set(days))]
    out = KINDS[study].combine(parts, P)
    out.update({'study': study, 'product': product, 'params': P, 'ran_at': time.time()})
    return out


# ---- saved studies: data/studies/<id>.json

def _folder():
    d = os.path.join(forge.data, 'studies')
    os.makedirs(d, exist_ok=True)
    return d


def listing():
    out = []
    for name in os.listdir(_folder()):
        if not name.endswith('.json'):
            continue
        try:
            with open(os.path.join(_folder(), name)) as f:
                st = json.load(f)
            res = st.get('result') or {}
            out.append({k: st.get(k) for k in ('id', 'name', 'study', 'product', 'from', 'to', 'open_end', 'saved_at')}
                       | {'ran_at': res.get('ran_at'), 'days': len((res.get('sample') or {}).get('days', []))})
        except (OSError, ValueError):
            pass
    return sorted(out, key=lambda x: -(x.get('saved_at') or 0))


def get(sid):
    if not ID_RE.match(sid or ''):
        raise ValueError('no such saved study')
    with open(os.path.join(_folder(), sid + '.json')) as f:
        return json.load(f)


def save(st):
    sid = st.get('id') or hashlib.sha1(f'{time.time()}{st.get("name")}'.encode()).hexdigest()[:10]
    if not ID_RE.match(sid):
        raise ValueError('no such saved study')
    _check(st.get('study'), st.get('product'))
    keep = {k: st.get(k) for k in ('name', 'study', 'product', 'from', 'to', 'open_end', 'params', 'result')}
    keep['name'] = str(keep['name'] or '').strip()[:80] or 'Study'
    keep.update({'id': sid, 'saved_at': time.time()})
    path = os.path.join(_folder(), sid + '.json')
    with open(path + '.tmp', 'w') as f:
        json.dump(keep, f, separators=(',', ':'))
    os.replace(path + '.tmp', path)
    return {'id': sid}


def delete(sid):
    if not ID_RE.match(sid or ''):
        raise ValueError('no such saved study')
    os.remove(os.path.join(_folder(), sid + '.json'))
    return {'ok': True}
