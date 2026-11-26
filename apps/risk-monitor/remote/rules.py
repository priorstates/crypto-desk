"""The checks, as plain functions of what was measured and the settings.

evaluate(m, s) -> {check: {state: ok | breach | unknown, value, limit, stops}}
stops: a breach of this check writes the stop signal for the Paper Market Maker.
"""

CHECKS = ('feed_btc', 'feed_eth', 'recorder_hb', 'maker_hb', 'position', 'loss', 'disk')


def _check(value, limit, breached, stops=False):
    state = 'unknown' if value is None else 'breach' if breached else 'ok'
    return {'state': state, 'value': value, 'limit': limit, 'stops': stops}


def evaluate(m, s):
    """m: feed_age {product: seconds}, recorder_age, maker_age (seconds since the heartbeat, None
    when there is no file), position (BTC), day_pnl (USD), free_gb. None: could not be measured."""
    stale, hb = s['stale_s'], s['hb_stale_s']
    age = m.get('feed_age') or {}
    btc, eth = age.get('BTC-USD'), age.get('ETH-USD')
    rec, mk = m.get('recorder_age'), m.get('maker_age')
    pos, pnl, free = m.get('position'), m.get('day_pnl'), m.get('free_gb')
    gone = float('inf')
    return {
        'feed_btc': _check(btc, stale, btc is not None and btc > stale, stops=True),
        'feed_eth': _check(eth, stale, eth is not None and eth > stale),
        # A heartbeat file that is not there at all is a missing heartbeat, not an unknown.
        'recorder_hb': _check(gone if rec is None else rec, hb, rec is None or rec > hb),
        'maker_hb': _check(gone if mk is None else mk, hb, mk is None or mk > hb),
        'position': _check(pos, s['max_position'], pos is not None and abs(pos) > s['max_position'], stops=True),
        'loss': _check(pnl, s['max_day_loss'],
                       pnl is not None and s['max_day_loss'] > 0 and pnl <= -s['max_day_loss'], stops=True),
        'disk': _check(free, s['min_free_gb'], free is not None and free < s['min_free_gb']),
    }


def reason(key, c):
    """One line for the stop signal and the log."""
    v, lim = c['value'], c['limit']
    if key == 'position':
        return f'position {v:+.4f} BTC beyond {lim:g}'
    if key == 'loss':
        return f'day loss {-v:.2f} USD beyond {lim:g}'
    if key in ('feed_btc', 'feed_eth'):
        return f"no {'BTC-USD' if key == 'feed_btc' else 'ETH-USD'} message for {v:.0f} s"
    if key in ('recorder_hb', 'maker_hb'):
        who = 'recorder' if key == 'recorder_hb' else 'strategy'
        return f'no {who} heartbeat' + ('' if v == float('inf') else f' for {v:.0f} s')
    if key == 'disk':
        return f'{v:.1f} GB free, below {lim:g}'
    return key
