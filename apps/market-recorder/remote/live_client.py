"""Read Market Recorder's live feed from another program on the same machine.

    from live_client import follow
    for ev in follow():
        if ev['type'] == 'quote': ...   # product, bid, bid_size, ask, ask_size, exch_ns, recv_ns, seq
        if ev['type'] == 'trade': ...   # product, price, size, maker_side, trade_id, exch_ns, recv_ns, seq
        if ev['type'] == 'status': ...  # state: connected | disconnected, reason

Copy this file into the app that reads the feed. It needs nothing installed.
Prices and sizes are strings exactly as the exchange sent them: use
decimal.Decimal(ev['bid']) or float(ev['bid']).
"""
import json
import os
import socket
import time

SOCKET = '~/market-recorder/live.sock'


def follow(path=SOCKET, retry=1.0):
    """Yield events for ever. When the recorder is not reachable it yields a
    status event with state 'disconnected' and tries again."""
    path = os.path.expanduser(path)
    while True:
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        try:
            s.connect(path)
            with s.makefile('rb') as f:
                for line in f:
                    yield json.loads(line)
            reason = 'the recorder closed the live feed'
        except OSError as e:
            reason = f'the recorder is not reachable: {e}'
        finally:
            s.close()
        yield {'type': 'status', 'state': 'disconnected', 'reason': reason,
               'recv_ns': time.time_ns()}
        time.sleep(retry)


if __name__ == '__main__':
    for event in follow():
        print(event, flush=True)
