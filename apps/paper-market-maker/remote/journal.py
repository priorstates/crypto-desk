"""Daily log files, one JSON row per line, by UTC day of the row's local time.

    <data folder>/orders/<YYYY-MM-DD>.jsonl      every simulated quote and cancel
                  fills/<YYYY-MM-DD>.jsonl       every simulated fill
                  snapshots/<YYYY-MM-DD>.jsonl   position and PnL, once a second
                  events/<YYYY-MM-DD>.jsonl      stops, resumes, feed pauses, day changes
                  markouts/<YYYY-MM-DD>.jsonl    each fill with the mid 1 s, 5 s and 30 s later

Today's files are plain text, so another program can follow them. A finished
day is compressed to .jsonl.gz, and days older than keep_days are removed.
"""
import gzip
import json
import os
import shutil
import threading
import time

FOLDER = {'quote': 'orders', 'cancel': 'orders', 'fill': 'fills', 'event': 'events', 'snapshot': 'snapshots',
          'markout': 'markouts'}       # a markout row goes in the day it was completed (done_ns)


class Journal:
    def __init__(self, root, keep_days):
        self.root_fn, self.keep_fn = root, keep_days    # both read again when used
        self.root = None
        self.open = {}                                   # folder -> (day, file)
        self.tidied = None

    def write(self, kind, row):
        folder = FOLDER[kind]
        day = time.strftime('%Y-%m-%d', time.gmtime((row.get('done_ns') or row['local_ns']) // 10**9))
        have = self.open.get(folder)
        if not have or have[0] != day:
            if have:
                have[1].close()
            root = self.root or self._root()
            os.makedirs(os.path.join(root, folder), exist_ok=True)
            self.open[folder] = have = (day, open(os.path.join(root, folder, day + '.jsonl'), 'a'))
        have[1].write(json.dumps(row, separators=(',', ':')) + '\n')

    def _root(self):
        self.root = self.root_fn()
        return self.root

    def flush(self):
        """Once a second: rows reach the disk; a moved data folder and a new day are noticed."""
        for _, f in self.open.values():
            f.flush()
        if self.root_fn() != self.root:
            self.close()
            self._root()
        today = time.strftime('%Y-%m-%d', time.gmtime())
        if self.tidied != (self.root, today):
            self.tidied = (self.root, today)
            threading.Thread(target=tidy, args=(self.root, today, self.keep_fn()), daemon=True).start()

    def close(self):
        for _, f in self.open.values():
            f.close()
        self.open = {}


def tidy(root, today, keep_days):
    """Compress finished days; remove days older than keep_days (0 keeps everything)."""
    cut = time.strftime('%Y-%m-%d', time.gmtime(time.time() - keep_days * 86400)) if keep_days > 0 else ''
    for folder in set(FOLDER.values()):
        d = os.path.join(root, folder)
        try:
            names = sorted(os.listdir(d))
        except OSError:
            continue
        for name in names:
            day, path = name[:10], os.path.join(d, name)
            try:
                if day >= today or not name.startswith('20'):
                    continue
                if day < cut:
                    os.remove(path)
                elif name.endswith('.jsonl'):
                    with open(path, 'rb') as src, gzip.open(path + '.gz.tmp', 'wb') as dst:
                        shutil.copyfileobj(src, dst)
                    os.replace(path + '.gz.tmp', path + '.gz')
                    os.remove(path)
            except OSError as e:
                print(f'journal: {name}: {e}', flush=True)
