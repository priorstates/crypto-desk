"""Daily compressed files, and the rule that keeps them under the size cap.

Layout under the data folder:
    <PRODUCT>/quotes/<YYYY-MM-DD>.<NNN>.csv.gz
    <PRODUCT>/trades/<YYYY-MM-DD>.<NNN>.csv.gz
    gaps/<YYYY-MM-DD>.jsonl
The day is the UTC day of the receive time. NNN starts at 000 and goes up by one
each time the recorder starts again that day, so a file is never appended to
after a crash. Only files with these names are ever removed.
"""
import gzip
import os
import re
import shutil
import time

QUOTE_COLS = ['recv_ns', 'exch_ns', 'seq', 'bid', 'bid_size', 'ask', 'ask_size']
TRADE_COLS = ['recv_ns', 'exch_ns', 'seq', 'trade_id', 'price', 'size', 'maker_side']
STREAMS = ('quotes', 'trades')
PRODUCT_RE = re.compile(r'^[A-Z0-9]{2,12}-[A-Z0-9]{2,12}$')
FILE_RE = re.compile(r'^(\d{4}-\d{2}-\d{2})\.(\d{3})\.csv\.gz$')
GAP_RE = re.compile(r'^(\d{4}-\d{2}-\d{2})\.jsonl$')
DAY_NS = 86400 * 10**9


def day_of(ns):
    return time.strftime('%Y-%m-%d', time.gmtime(ns // 10**9))


class DayWriter:
    def __init__(self, product, stream, cols):
        self.product, self.stream, self.cols = product, stream, cols
        self.f = None
        self.root = ''
        self.lo = self.hi = 0
        self.path = ''

    def write(self, root, recv_ns, fields):
        if self.f is None or root != self.root or not (self.lo <= recv_ns < self.hi):
            self._open(root, recv_ns)
        self.f.write((','.join(fields) + '\n').encode())

    def _open(self, root, recv_ns):
        self.close()
        day = day_of(recv_ns)
        folder = os.path.join(root, self.product, self.stream)
        os.makedirs(folder, exist_ok=True)
        part = -1
        for name in os.listdir(folder):
            m = FILE_RE.match(name)
            if m and m.group(1) == day:
                part = max(part, int(m.group(2)))
        self.path = os.path.join(folder, f'{day}.{part + 1:03d}.csv.gz')
        self.f = gzip.open(self.path, 'wb', compresslevel=6)
        self.f.write((','.join(self.cols) + '\n').encode())
        self.root = root
        self.lo = recv_ns - recv_ns % DAY_NS
        self.hi = self.lo + DAY_NS

    def flush(self):
        if self.f:
            self.f.flush()      # a sync point: what is written so far can be read

    def close(self):
        if self.f:
            try:
                self.f.close()
            except OSError:
                pass
            self.f = None


def scan(root):
    """Every file the recorder wrote: dicts {day, path, size, product, stream}."""
    out = []
    try:
        names = os.listdir(root)
    except OSError:
        return out
    for name in names:
        if name == 'gaps':
            pairs = [('', 'gaps', os.path.join(root, 'gaps'), GAP_RE)]
        elif PRODUCT_RE.match(name):
            pairs = [(name, s, os.path.join(root, name, s), FILE_RE) for s in STREAMS]
        else:
            continue
        for product, stream, folder, pattern in pairs:
            try:
                files = os.listdir(folder)
            except OSError:
                continue
            for f in files:
                m = pattern.match(f)
                if not m:
                    continue
                path = os.path.join(folder, f)
                try:
                    size = os.path.getsize(path)
                except OSError:
                    continue
                out.append({'day': m.group(1), 'path': path, 'size': size,
                            'product': product, 'stream': stream})
    return out


def enforce(root, cap_bytes, keep_days, min_free_bytes, now=None, log=print):
    """Remove days older than keep_days, then the oldest days while the folder is
    over the cap or the disk has less than min_free_bytes. Today is never removed:
    when only today is left and it is still over, the answer says paused."""
    now = time.time() if now is None else now
    today = time.strftime('%Y-%m-%d', time.gmtime(now))
    os.makedirs(root, exist_ok=True)
    files = scan(root)
    removed = []

    def drop(day, why):
        for f in [f for f in files if f['day'] == day]:
            try:
                os.remove(f['path'])
                removed.append(f['path'])
                log(f"removed {f['path']} ({f['size']} bytes): {why}")
            except OSError as e:
                log(f"could not remove {f['path']}: {e}")
            files.remove(f)

    old = sorted({f['day'] for f in files if f['day'] < today})
    if keep_days > 0:
        cutoff = time.strftime('%Y-%m-%d', time.gmtime(now - keep_days * 86400))
        for day in [d for d in old if d < cutoff]:
            drop(day, f'older than {keep_days:g} days')
            old.remove(day)
    paused, why = False, ''
    while True:
        used = sum(f['size'] for f in files)
        du = shutil.disk_usage(root)
        over = cap_bytes > 0 and used > cap_bytes
        low = du.free < min_free_bytes
        if not (over or low):
            break
        reason = 'the size cap is reached' if over else 'the disk is nearly full'
        if not old:
            paused, why = True, reason + ' and only today is left'
            break
        drop(old.pop(0), reason)
    sizes = {}
    for f in files:
        if f['day'] == today and f['product']:
            sizes.setdefault(f['product'], {s: 0 for s in STREAMS})[f['stream']] += f['size']
    days = sorted({f['day'] for f in files})
    return {'used': used, 'free': du.free, 'total': du.total, 'removed': removed,
            'paused': paused, 'why': why, 'today': sizes,
            'oldest_day': days[0] if days else '', 'days': len(days)}
