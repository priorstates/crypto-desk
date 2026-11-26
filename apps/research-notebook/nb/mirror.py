"""The local copy of the recorded files, kept in step with the server over ssh.

Only reads on the server (find, cat, tail). Files there only grow, so a file that
is longer there is completed from where the local copy ends. Nothing is removed
here when the server drops old days: the copy keeps them for research.
"""
import json
import os
import re
import subprocess
import time

import forge
from . import conf

REL_RE = re.compile(r'^[A-Za-z0-9._/-]{1,200}$')
MARKET_RE = re.compile(r'^([A-Z0-9]{2,12}-[A-Z0-9]{2,12}/(quotes|trades)/\d{4}-\d{2}-\d{2}\.\d{3}\.csv\.gz|gaps/\d{4}-\d{2}-\d{2}\.jsonl)$')
PAPER_RE = re.compile(r'^fills/\d{4}-\d{2}-\d{2}\.jsonl(\.gz)?$')
SSH = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10']


def _q(d):
    """A checked folder path as the remote shell takes it (~ becomes $HOME)."""
    return '"$HOME' + d[1:] + '"' if d.startswith('~') else '"' + d + '"'


def _sources(s):
    return {'market': (s['market_dir'], conf.market_root(s), MARKET_RE),
            'paper': (s['fills_dir'], conf.fills_root(s), PAPER_RE)}


def _listing(host, folder):
    r = subprocess.run(SSH + [host, f"cd {_q(folder)} 2>/dev/null && find . -type f -printf '%P\\t%s\\n' || echo MISSING"],
                       capture_output=True, text=True, timeout=60)
    if r.returncode != 0:
        raise RuntimeError((r.stderr or 'ssh failed').strip().splitlines()[-1])
    if r.stdout.strip() == 'MISSING':
        return None
    out = {}
    for line in r.stdout.splitlines():
        path, _, size = line.partition('\t')
        if size.isdigit():
            out[path] = int(size)
    return out


def plan(s):
    """What the copy lacks: [{src, path, size, have}], and the folders not found there."""
    if not s['host']:
        return {'files': [], 'missing': [], 'local': True}
    files, missing = [], []
    for src, (folder, root, pattern) in _sources(s).items():
        if not folder:
            continue
        there = _listing(s['host'], folder)
        if there is None:
            missing.append(folder)
            continue
        for path, size in sorted(there.items()):
            if not pattern.match(path):
                continue
            local = os.path.join(root, path)
            have = os.path.getsize(local) if os.path.exists(local) else 0
            if have != size:
                files.append({'src': src, 'path': path, 'size': size, 'have': have})
        if src == 'paper':          # a finished day was compressed there: drop the plain copy here
            for path in there:
                plain = os.path.join(root, path[:-3])
                if path.endswith('.jsonl.gz') and path[:-3] not in there and os.path.exists(plain):
                    os.remove(plain)
    return {'files': files, 'missing': missing, 'local': False}


def fetch(s, src, path):
    folder, root, pattern = _sources(s)[src]
    if not (REL_RE.match(path) and pattern.match(path)) or '..' in path:
        raise ValueError('not a recorded file: ' + path)
    local = os.path.join(root, path)
    os.makedirs(os.path.dirname(local), exist_ok=True)
    have = os.path.getsize(local) if os.path.exists(local) else 0
    remote = _q(folder.rstrip('/') + '/' + path)
    # longer there: take the rest; anything else: take it whole
    probe = f'n=$(stat -c %s {remote}) && if [ "$n" -ge {have} ] && [ {have} -gt 0 ]; then echo APPEND; tail -c +{have + 1} {remote}; else echo WHOLE; cat {remote}; fi'
    tmp = local + '.part'
    with open(tmp, 'wb') as f:
        r = subprocess.run(SSH + [s['host'], probe], stdout=f, stderr=subprocess.PIPE, timeout=840)
    if r.returncode != 0:
        os.remove(tmp)
        raise RuntimeError((r.stderr.decode(errors='replace') or 'ssh failed').strip().splitlines()[-1])
    with open(tmp, 'rb') as f:
        mode = f.readline().strip()
        if mode == b'APPEND':
            with open(local, 'ab') as out:
                while chunk := f.read(1 << 20):
                    out.write(chunk)
        else:
            with open(local + '.new', 'wb') as out:
                while chunk := f.read(1 << 20):
                    out.write(chunk)
            os.replace(local + '.new', local)
    os.remove(tmp)
    return {'path': path, 'size': os.path.getsize(local)}


def mark(ok, error=''):
    state = {'t': time.time(), 'ok': bool(ok), 'error': str(error)[:300]}
    forge.write('data', 'sync.json', text=json.dumps(state))
    return state


def last():
    try:
        return json.loads(forge.read('data', 'sync.json', default='') or 'null')
    except ValueError:
        return None


def scan(s):
    """What is here to study: {products: {P: {day: bytes}}, paper: {day: bytes}, gaps: {day: rows}}."""
    products, paper, total = {}, {}, 0
    root = conf.market_root(s)
    for name in sorted(os.listdir(root)) if os.path.isdir(root) else []:
        if not conf.PRODUCT_RE.match(name):
            continue
        days = {}
        for stream in ('quotes', 'trades'):
            folder = os.path.join(root, name, stream)
            for f in os.listdir(folder) if os.path.isdir(folder) else []:
                if re.match(r'^\d{4}-\d{2}-\d{2}\.\d{3}\.csv\.gz$', f):
                    size = os.path.getsize(os.path.join(folder, f))
                    days.setdefault(f[:10], {'quotes': 0, 'trades': 0})[stream] += size
                    total += size
        products[name] = dict(sorted(days.items()))
    folder = os.path.join(conf.fills_root(s), 'fills')
    for f in sorted(os.listdir(folder)) if os.path.isdir(folder) else []:
        if re.match(r'^\d{4}-\d{2}-\d{2}\.jsonl(\.gz)?$', f):
            paper[f[:10]] = os.path.getsize(os.path.join(folder, f))
    return {'products': products, 'paper': paper, 'bytes': total}
