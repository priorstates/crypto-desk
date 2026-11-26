"""Reading the other services' files. Read only: nothing here opens a file for writing."""
import glob
import gzip
import json
import os
import shutil
import zlib

import conf

BROKEN = (EOFError, OSError, zlib.error)      # a file being written, or one a crash left without its end


def read_json(path):
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def rows(folder, day):
    """The rows of <folder>/<day>.jsonl, or of the finished day's .jsonl.gz."""
    for name, opener in ((day + '.jsonl', open), (day + '.jsonl.gz', gzip.open)):
        path = os.path.join(folder, name)
        if not os.path.exists(path):
            continue
        try:
            with opener(path, 'rt', encoding='utf-8') as f:
                for line in f:
                    try:
                        row = json.loads(line)
                    except ValueError:
                        continue
                    if isinstance(row, dict):
                        yield row
        except BROKEN:
            pass
        return


def upto(folder, day, as_of_ns, key='local_ns'):
    return [r for r in rows(folder, day) if (r.get(key) or 0) <= as_of_ns]


def last_snapshot(day, as_of_ns):
    """The strategy's last once-a-second snapshot of the day, at or before as_of."""
    folder, best = os.path.join(conf.MAKER_DATA, 'snapshots'), None
    for name, opener in ((day + '.jsonl', open), (day + '.jsonl.gz', gzip.open)):
        path = os.path.join(folder, name)
        if not os.path.exists(path):
            continue
        try:
            with opener(path, 'rt', encoding='utf-8') as f:
                for line in f:
                    try:        # rows begin {"local_ns":<ns>, ... : no need to parse every one
                        ns = int(line[12:line.index(',')]) if line.startswith('{"local_ns":') else json.loads(line)['local_ns']
                    except (ValueError, KeyError, TypeError):
                        continue
                    if ns > as_of_ns:
                        break
                    best = line
        except BROKEN:
            pass
        break
    try:
        return json.loads(best) if best else None
    except ValueError:
        return None


def csv_stats(product, kind, day, as_of_ns):
    """Rows of the recorder's <product>/<kind>/<day>.NNN.csv.gz at or before as_of:
    {rows, first_ns, last_ns, parts}."""
    files = sorted(glob.glob(os.path.join(conf.MARKET_DATA, product, kind, day + '.*.csv.gz')))
    n, first, last = 0, 0, 0
    for path in files:
        try:
            with gzip.open(path, 'rb') as f:
                for line in f:
                    if not line[:1].isdigit():
                        continue                    # the header
                    try:
                        ns = int(line[:line.index(b',')])
                    except ValueError:
                        continue
                    if ns > as_of_ns:
                        break
                    n, last = n + 1, ns
                    first = first or ns
        except BROKEN:
            pass
    return {'rows': n, 'first_ns': first, 'last_ns': last, 'parts': len(files)}


def folder_bytes(path, prefix=None):
    """Size of a folder; with prefix, only of the files whose name starts with it (a day)."""
    total = 0
    for root, _, names in os.walk(path):
        for name in names:
            if prefix and not name.startswith(prefix):
                continue
            try:
                total += os.lstat(os.path.join(root, name)).st_size
            except OSError:
                pass
    return total


def disk():
    try:
        u = shutil.disk_usage(os.path.expanduser('~'))
        return {'free': u.free, 'total': u.total, 'used': u.used}
    except OSError:
        return None
