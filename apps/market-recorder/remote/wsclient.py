"""A small websocket client on the standard library (nothing to install).

Text messages only, TLS, answers pings. Enough for a public market data feed.
"""
import base64
import os
import socket
import ssl
import struct
from urllib.parse import urlparse


class WSClosed(Exception):
    pass


class WS:
    def __init__(self, url, timeout=10):
        u = urlparse(url)
        secure = u.scheme == 'wss'
        host, port = u.hostname, u.port or (443 if secure else 80)
        sock = socket.create_connection((host, port), timeout=timeout)
        sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        if secure:
            sock = ssl.create_default_context().wrap_socket(sock, server_hostname=host)
        self.sock = sock
        self.buf = bytearray()
        self.parts = []
        key = base64.b64encode(os.urandom(16)).decode()
        path = (u.path or '/') + ('?' + u.query if u.query else '')
        sock.sendall((
            f'GET {path} HTTP/1.1\r\nHost: {host}\r\nUpgrade: websocket\r\n'
            f'Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\n'
            'Sec-WebSocket-Version: 13\r\nUser-Agent: market-recorder\r\n\r\n').encode())
        while b'\r\n\r\n' not in self.buf:
            chunk = sock.recv(4096)
            if not chunk:
                raise WSClosed('closed during handshake')
            self.buf += chunk
            if len(self.buf) > 65536:
                raise WSClosed('handshake too long')
        head, _, rest = bytes(self.buf).partition(b'\r\n\r\n')
        status = head.split(b'\r\n', 1)[0].decode('latin-1')
        if ' 101' not in status:
            raise WSClosed('handshake refused: ' + status)
        self.buf = bytearray(rest)

    def _frame(self, opcode, payload):
        mask = os.urandom(4)
        n = len(payload)
        head = bytes([0x80 | opcode])
        if n < 126:
            head += bytes([0x80 | n])
        elif n < 65536:
            head += bytes([0x80 | 126]) + struct.pack('>H', n)
        else:
            head += bytes([0x80 | 127]) + struct.pack('>Q', n)
        body = bytes(b ^ mask[i & 3] for i, b in enumerate(payload))
        self.sock.sendall(head + mask + body)

    def send(self, text):
        self._frame(0x1, text.encode())

    def _parse(self):
        """One whole frame from the buffer: (fin, opcode, payload), or None."""
        b = self.buf
        if len(b) < 2:
            return None
        n = b[1] & 0x7F
        masked = b[1] & 0x80
        pos = 2
        if n == 126:
            if len(b) < 4:
                return None
            n = struct.unpack('>H', b[2:4])[0]
            pos = 4
        elif n == 127:
            if len(b) < 10:
                return None
            n = struct.unpack('>Q', b[2:10])[0]
            pos = 10
        end = pos + (4 if masked else 0) + n
        if len(b) < end:
            return None
        payload = bytes(b[end - n:end])
        if masked:
            mask = b[pos:pos + 4]
            payload = bytes(c ^ mask[i & 3] for i, c in enumerate(payload))
        fin, opcode = b[0] & 0x80, b[0] & 0x0F
        del b[:end]
        return fin, opcode, payload

    def recv(self, timeout=1.0):
        """The next text message, or None when nothing came within timeout."""
        while True:
            frame = self._parse()
            if frame is None:
                self.sock.settimeout(timeout)
                try:
                    chunk = self.sock.recv(262144)
                except (socket.timeout, TimeoutError):
                    return None
                except ssl.SSLError as e:
                    if 'timed out' in str(e):
                        return None
                    raise
                if not chunk:
                    raise WSClosed('connection closed by the exchange')
                self.buf += chunk
                continue
            fin, opcode, payload = frame
            if opcode == 0x9:
                self.sock.settimeout(5)
                self._frame(0xA, payload)
            elif opcode == 0x8:
                code = struct.unpack('>H', payload[:2])[0] if len(payload) >= 2 else 0
                raise WSClosed(f'closed by the exchange (code {code}) '
                               + payload[2:].decode('utf-8', 'replace'))
            elif opcode in (0x0, 0x1, 0x2):
                self.parts.append(payload)
                if fin:
                    data = b''.join(self.parts)
                    self.parts = []
                    return data.decode('utf-8', 'replace')

    def close(self):
        try:
            self.sock.settimeout(1)
            self._frame(0x8, b'')
        except Exception:
            pass
        try:
            self.sock.close()
        except Exception:
            pass
