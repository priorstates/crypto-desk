"""The live feed for other programs on this machine: a Unix socket that sends one
JSON object per line. Any number of readers; a reader that falls behind is
dropped (it connects again), so it can never slow the recorder down."""
import os
import queue
import socket
import threading


class _Client:
    def __init__(self, conn):
        self.conn = conn
        self.q = queue.Queue(maxsize=20000)


class LiveServer:
    def __init__(self, path, hello):
        self.path = path
        self.hello = hello          # () -> list of bytes lines sent first
        self.clients = []
        self.lock = threading.Lock()
        self.sock = None

    def start(self):
        try:
            os.unlink(self.path)
        except FileNotFoundError:
            pass
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        s.bind(self.path)
        os.chmod(self.path, 0o600)
        s.listen(16)
        self.sock = s
        threading.Thread(target=self._accept, daemon=True).start()

    def _accept(self):
        while True:
            try:
                conn, _ = self.sock.accept()
            except OSError:
                return
            c = _Client(conn)
            conn.settimeout(5)
            for line in self.hello():
                c.q.put(line)
            with self.lock:
                self.clients.append(c)
            threading.Thread(target=self._send, args=(c,), daemon=True).start()

    def _send(self, c):
        try:
            while True:
                chunk = [c.q.get()]
                try:
                    while len(chunk) < 500:
                        chunk.append(c.q.get_nowait())
                except queue.Empty:
                    pass
                if None in chunk:
                    break
                c.conn.sendall(b''.join(chunk))
        except OSError:
            pass
        self._drop(c)

    def _drop(self, c):
        with self.lock:
            if c in self.clients:
                self.clients.remove(c)
        try:
            c.conn.close()
        except OSError:
            pass

    def publish(self, line):
        for c in list(self.clients):
            try:
                c.q.put_nowait(line)
            except queue.Full:
                self._drop(c)

    def close(self):
        try:
            self.sock.close()
            os.unlink(self.path)
        except (OSError, AttributeError):
            pass
