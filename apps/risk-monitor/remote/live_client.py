"""Read Market Recorder's live feed on the same machine (a copy of its live_client.py).

    for ev in follow():
        ev['type'] is 'hello' | 'quote' | 'trade' | 'status' | 'gap'

It only reads a local Unix socket. Prices and sizes are the exchange's strings.
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
        except (OSError, ValueError) as e:
            reason = f'the recorder is not reachable: {e}'
        finally:
            s.close()
        yield {'type': 'status', 'state': 'disconnected', 'reason': reason,
               'recv_ns': time.time_ns()}
        time.sleep(retry)
