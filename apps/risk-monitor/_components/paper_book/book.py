"""A paper trading book. Standard library only, no I/O, no network.

Position keeps a signed quantity (+ long, - short), its average entry price
and the realised PnL. A fill that reduces the position realises PnL against
the average price; a fill that extends it moves the average; a fill that
crosses zero does both.
"""

EPS = 1e-9          # sizes below this are zero (1e-8 is the smallest BTC size)


def _q(x):
    return round(float(x), 8)


class Position:
    def __init__(self, qty=0.0, avg=0.0, realised=0.0):
        self.qty = _q(qty)
        self.avg = float(avg) if abs(self.qty) > EPS else 0.0
        self.realised = float(realised)

    def fill(self, side, price, size):
        """Apply one fill. side: 'buy' or 'sell' (ours). Returns the PnL it realised."""
        if side not in ('buy', 'sell'):
            raise ValueError("side is 'buy' or 'sell': %r" % (side,))
        price, size = float(price), float(size)
        if size <= 0 or price <= 0:
            raise ValueError('price and size must be above zero')
        signed = size if side == 'buy' else -size
        pnl = 0.0
        if abs(self.qty) <= EPS or (self.qty > 0) == (signed > 0):
            total = abs(self.qty) + size                      # opens or extends
            self.avg = (abs(self.qty) * self.avg + size * price) / total
            self.qty = _q(self.qty + signed)
        else:
            closed = min(size, abs(self.qty))                 # reduces, maybe flips
            pnl = closed * (price - self.avg) * (1 if self.qty > 0 else -1)
            self.realised += pnl
            self.qty = _q(self.qty + signed)
            if abs(self.qty) <= EPS:
                self.qty, self.avg = 0.0, 0.0
            elif size > closed + EPS:
                self.avg = price                              # the rest opened the other way
        return pnl

    def unrealised(self, mark):
        if abs(self.qty) <= EPS or mark is None:
            return 0.0
        return self.qty * (float(mark) - self.avg)

    def total(self, mark):
        return self.realised + self.unrealised(mark)

    def as_dict(self):
        return {'qty': self.qty, 'avg': self.avg, 'realised': self.realised}

    @classmethod
    def from_dict(cls, d):
        d = d or {}
        return cls(d.get('qty', 0.0), d.get('avg', 0.0), d.get('realised', 0.0))


def through_fill(side, quote_price, quote_size, trade_price, trade_size):
    """Size of our resting quote that a printed trade fills.

    side: 'buy' for our bid, 'sell' for our ask. Our bid fills only when the
    trade price is strictly below it, our ask only when strictly above: a
    trade at our price (a touch) never fills. The fill is at most the trade's
    size and at most what is left of the quote.
    """
    quote_price, trade_price = float(quote_price), float(trade_price)
    if side == 'buy':
        through = trade_price < quote_price
    elif side == 'sell':
        through = trade_price > quote_price
    else:
        raise ValueError("side is 'buy' or 'sell': %r" % (side,))
    if not through:
        return 0.0
    size = _q(min(float(quote_size), float(trade_size)))
    return size if size > EPS else 0.0


def replay(fills):
    """Rebuild a Position from fill rows (dicts with side, price, size), in order."""
    p = Position()
    for f in fills:
        p.fill(f['side'], f['price'], f['size'])
    return p
