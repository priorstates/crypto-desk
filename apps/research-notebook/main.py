"""Research Notebook's backend: the functions the page calls. The work is in nb/."""
import importlib
import os
import sys

import forge

if forge.dir not in sys.path:
    sys.path.insert(0, forge.dir)
from nb import common, conf, load, markout, mirror, paper, spreads, studies, vol  # noqa: E402

_MODS = [conf, load, common, mirror, spreads, vol, markout, paper, studies]     # each after what it imports
_seen = {}


def _fresh():
    """Pick up a changed file in nb/ without restarting (this process stays up between calls)."""
    changed = False
    for m in _MODS:
        t = os.path.getmtime(m.__file__)
        if _seen.setdefault(m.__name__, t) != t:
            _seen[m.__name__] = t
            changed = True
    if changed:
        for m in _MODS:
            importlib.reload(m)


def status(args):
    _fresh()
    s = conf.load()
    return {'settings': s, 'defaults': conf.DEFAULTS, 'data': mirror.scan(s), 'sync': mirror.last(),
            'params': conf.params(s)}


def save_settings(args):
    _fresh()
    return conf.save(args.get('settings') or {})


def sync_plan(args):
    _fresh()
    try:
        return mirror.plan(conf.load())
    except Exception as e:
        mirror.mark(False, e)
        raise


def sync_fetch(args):
    _fresh()
    return mirror.fetch(conf.load(), args['src'], args['path'])


def sync_done(args):
    _fresh()
    return mirror.mark(args.get('ok', True), args.get('error', ''))


def run_day(args):
    """Work out (or reuse) one day's part of a study. Small answer: the page shows progress with it."""
    _fresh()
    s = conf.load()
    part, kept = studies.day_part(s, args['study'], args['product'], args['day'], conf.params(s, args.get('params')))
    return {'day': args['day'], 'kept': kept, 'quotes': part['cov']['quotes']}


def combine(args):
    _fresh()
    s = conf.load()
    return studies.combine(s, args['study'], args['product'], args['days'], conf.params(s, args.get('params')))


def studies_list(args):
    _fresh()
    return studies.listing()


def study_get(args):
    _fresh()
    return studies.get(args.get('id'))


def study_save(args):
    _fresh()
    return studies.save(args)


def study_delete(args):
    _fresh()
    return studies.delete(args.get('id'))
