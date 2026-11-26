// Results of the two studies of trades: after trades (markouts) and the paper strategy.
import { t } from './i18n.js';
import { h, num, sig, int, signed, usd, big, horizon, table, tiles, card } from './ui.js';
import { lines } from './charts.js';
import { sampleBox } from './sample.js';

const pm = p => (p.mean == null ? '–' : h('span', {}, signed(p.mean, 3), p.se != null ? h('small', {}, '± ' + num(1.96 * p.se, 3)) : null));
const DRAW_MIN = 30;        // a group with fewer trades than this is in the table but not drawn
const money = v => (v >= 1e6 ? '$' + v / 1e6 + 'M' : v >= 1000 ? '$' + v / 1000 + 'k' : '$' + v);
const bucket = b => (b.lo == null ? t('under', { x: money(b.hi) }) : b.hi == null ? t('over', { x: money(b.lo) }) : money(b.lo) + ' – ' + money(b.hi));
const skips = (sk, names) => Object.entries(sk).filter(([, n]) => n).map(([k, n]) => `${t(names[k])}: ${int(n)}`).join(' · ');
const SKIP = { no_quote_before: 'skNoQuote', stale_quote: 'skStale', gap: 'skGap', end_of_data: 'skEnd', no_market_data: 'skNoMarket', flatten: 'skFlatten' };

export function markout(r) {
  const a = r.all, labels = r.horizons.map(horizon);
  const skipped = Object.values(r.skipped).reduce((x, y) => x + y, 0);
  const out = [sampleBox(r, [
    t('moTrades', { n: int(a.n), prints: int(a.prints), all: int(r.prints) }),
    skipped ? t('moSkipped', { n: int(skipped) }) + ' ' + skips(r.skipped, SKIP) : t('moNoSkips')])];
  if (!a.n) return out.concat(h('p', { class: 'muted' }, t('noRows')));
  const at = ms => a.curve.find(p => p.ms === ms) || a.curve[a.curve.length - 1];
  const mid = r.horizons[Math.min(2, r.horizons.length - 1)], last = r.horizons[r.horizons.length - 1];
  out.push(tiles([
    [t('trades'), int(a.n), big(a.usd) + ' USD'],
    [t('effHalf'), sig(a.eff) + ' ' + t('bps')],
    [t('quotedHalf'), sig(a.hs) + ' ' + t('bps')],
    [t('moveAfter', { h: horizon(mid) }), signed(at(mid).mean, 3) + ' ' + t('bps')],
    [t('moveAfter', { h: horizon(last) }), signed(at(last).mean, 3) + ' ' + t('bps')],
  ]));
  const shown = r.buckets.filter(b => b.n >= DRAW_MIN);
  out.push(card(t('moBySize'),
    lines({ labels, yLabel: t('moAxis'), tip: v => signed(v, 3),
      series: shown.map(b => ({ name: `${bucket(b)} (${int(b.n)})`, values: b.curve.map(p => p.mean), se: b.curve.map(p => p.se) })) }),
    table([t('size'), t('trades'), t('volumeUsd'), t('effHalf'), ...labels],
      [...r.buckets, { ...a, all: true }].map(b => [b.all ? t('allTrades') : bucket(b), int(b.n), big(b.usd), sig(b.eff), ...b.curve.map(pm)])),
    h('p', { class: 'muted' }, t('moTableNote') + ' ' + t('moDrawMin', { n: DRAW_MIN }))));
  out.push(card(t('moBySide'),
    lines({ labels, yLabel: t('moAxis'), tip: v => signed(v, 3), height: 220,
      series: [['buy', 'takerBuy'], ['sell', 'takerSell']].map(([k, name]) =>
        ({ name: `${t(name)} (${int(r[k].n)})`, values: r[k].curve.map(p => p.mean), se: r[k].curve.map(p => p.se) })) }),
    table([t('side'), t('trades'), t('weighted'), ...labels], [
      ...['buy', 'sell'].map(k => [t(k === 'buy' ? 'takerBuy' : 'takerSell'), int(r[k].n), '', ...r[k].curve.map(pm)]),
      [t('allTrades'), int(a.n), t('bySize'), ...a.curve.map(p => signed(p.vw, 3))]])));
  if (r.delay) {
    const d = r.delay;
    out.push(card(t('delay'),
      tiles([[t('median'), d.q[1] + ' ms'], ['p90', d.q[2] + ' ms'], ['p99', d.q[3] + ' ms'], [t('max'), d.max + ' ms'], [t('mean'), num(d.mean, 1) + ' ms']]),
      h('p', { class: 'note' }, t('delayNote', { med: d.q[1], p99: d.q[3] }))));
  }
  out.push(card(t('method'), h('p', { class: 'note' }, t('moMethod', { s: r.params.gap_silence_s }))));
  return out;
}

export function paper(r) {
  const T = r.totals, all = r.curves.all, labels = r.horizons.map(horizon);
  const out = [sampleBox(r, [
    t('paFills', { n: int(T.fills), buys: int(T.buys), sells: int(T.sells), used: int(all.n) }),
    skips(r.skipped, SKIP) ? t('paSkipped') + ' ' + skips(r.skipped, SKIP) : t('paNoSkips')])];
  if (!T.fills && !r.daily.length) return out.concat(h('p', { class: 'muted' }, t('paNone')));
  out.push(tiles([
    [t('pnlTotal'), usd(T.total), t('markedToMid')],
    [t('spreadEarned'), usd(T.spread), T.spread_bps == null ? '' : sig(T.spread_bps) + ' ' + t('bpsOfVolume')],
    [t('inventory'), usd(T.inventory)],
    [t('flattenCost'), usd(T.flatten)],
    [t('fills'), int(T.fills), big(T.volume) + ' USD'],
  ]));
  out.push(card(t('paMarkout'),
    lines({ labels, yLabel: t('paAxis'), tip: v => signed(v, 3), series: [['all', 'allFills'], ['buy', 'ourBuys'], ['sell', 'ourSells']]
      .filter(([k]) => r.curves[k].n)
      .map(([k, name]) => ({ name: `${t(name)} (${int(r.curves[k].n)})`, values: r.curves[k].curve.map(p => p.mean), se: r.curves[k].curve.map(p => p.se) })) }),
    table(['', t('fills'), ...labels], [
      ...[['all', 'allFills'], ['buy', 'ourBuys'], ['sell', 'ourSells']].map(([k, name]) => [t(name) + ' · ' + t('bps'), int(r.curves[k].n), ...r.curves[k].curve.map(pm)]),
      [t('allFills') + ' · USD', int(all.n), ...all.curve.map(p => usd(p.usd))]]),
    h('p', { class: 'muted' }, t('paMarkoutNote'))));
  out.push(card(t('paSplit'),
    table([t('day'), t('fills'), t('volumeUsd'), t('spreadEarned'), t('flattenCost'), t('inventory'), t('pnlTotal'), t('posEnd'), t('check')],
      r.daily.map(d => [d.day, int(d.fills), big(d.volume), usd(d.spread), usd(d.flatten), d.no_market ? '–' : usd(d.inventory),
        usd(d.total), num(d.pos_end, 4),
        d.own_day_pnl == null ? '–' : `${usd(d.at_last_fill)} / ${usd(d.own_day_pnl)}`])),
    h('p', { class: 'muted' }, t('paCheckNote'))));
  out.push(card(t('method'), h('p', { class: 'note' }, t('paMethod', { p: r.product }))));
  return out;
}
