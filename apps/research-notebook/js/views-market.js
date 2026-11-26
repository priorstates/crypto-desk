// Results of the two studies of the quotes: spreads and volatility.
import { t } from './i18n.js';
import { h, num, sig, int, pct, usd, dur, table, tiles, card } from './ui.js';
import { bars, lines } from './charts.js';
import { sampleBox } from './sample.js';

const hourLabels = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const hzName = s => (s < 60 ? s + ' s' : s / 60 + ' min');

export function spreads(r) {
  const out = [sampleBox(r, [t('spUsed', { n: int(r.used) })])];
  if (!r.usd) return out.concat(h('p', { class: 'muted' }, t('noRows')));
  const q = k => r.q.indexOf(k);
  out.push(tiles([
    [t('medUsd'), usd(r.usd.q[q(0.5)])],
    [t('meanUsd'), usd(r.usd.mean, 3)],
    [t('medBps'), sig(r.bps.q[q(0.5)])],
    [t('meanBps'), sig(r.bps.mean)],
    [t('p90Bps'), sig(r.bps.q[q(0.9)])],
    [t('atTightest'), pct(r.top[0].share), usd(r.top[0].usd)],
  ]));
  out.push(card(t('spDist'),
    table(['', ...r.q.map(x => 'p' + Math.round(x * 100)), t('mean')], [
      ['USD', ...r.usd.q.map(v => usd(v)), usd(r.usd.mean, 3)],
      [t('bps'), ...r.bps.q.map(sig), sig(r.bps.mean)]]),
    h('div', { class: 'two' },
      h('div', {}, h('h3', {}, t('spTimeAt')),
        bars({ labels: [...r.top.map(x => num(x.usd, 2)), t('other')], values: [...r.top.map(x => x.share * 100), r.rest_share * 100],
          yLabel: t('pctTimeUsd'), tip: v => num(v, 2) + '%' }),
        h('p', { class: 'muted' }, t('spDistinct', { n: int(r.distinct) }))),
      h('div', {}, h('h3', {}, t('spHist')),
        bars({ labels: r.hist_bps.bins.map((_, i) => sig(r.hist_bps.hi * (i + 0.5) / r.hist_bps.bins.length)),
          values: r.hist_bps.bins.map(v => v * 100), yLabel: t('pctTimeBps'), tip: v => num(v, 2) + '%' }),
        h('p', { class: 'muted' }, t('spOver', { p: pct(r.hist_bps.over, 2), x: sig(r.hist_bps.hi) }))))));
  const hrs = r.hours.filter(x => x.hours > 0);
  out.push(card(t('byHour'),
    bars({ labels: hourLabels, values: r.hours.map(x => x.mean_bps), yLabel: t('meanBpsAxis'), tip: sig }),
    table([t('hourUtc'), t('covered'), t('meanUsd'), t('medUsd'), t('meanBps')],
      hrs.map(x => [hourLabels[x.h] + ':00', dur(x.hours * 3600), usd(x.mean_usd, 3), usd(x.med_usd), sig(x.mean_bps)]))));
  out.push(card(t('byDay'), table([t('day'), t('covered'), t('meanUsd'), t('medUsd'), t('meanBps')],
    r.daily.map(d => [d.day, dur(d.hours * 3600), usd(d.mean_usd, 3), usd(d.med_usd), sig(d.mean_bps)]))));
  out.push(card(t('method'), h('p', { class: 'note' }, t('spMethod', { s: r.params.gap_silence_s }))));
  return out;
}

export function vol(r) {
  const out = [sampleBox(r, [t('volSeconds', { n: int(r.seconds) })])];
  if (!r.horizons.some(x => x.n)) return out.concat(h('p', { class: 'muted' }, t('noRows')));
  out.push(card(t('volByHorizon'),
    table([t('horizon'), t('windows'), t('typicalMove'), t('annual')],
      r.horizons.map(x => [hzName(x.s), int(x.n), sig(x.bps), x.ann == null ? '–' : num(x.ann, 1) + '%'])),
    h('p', { class: 'muted' }, t('volHorizonNote'))));
  out.push(card(t('byHour'),
    lines({ labels: hourLabels, yLabel: t('annualAxis'), tip: v => num(v, 1) + '%',
      series: r.horizons.map((x, i) => ({ name: hzName(x.s), values: r.hours.map(hr => (hr.n[i] >= 3 ? hr.ann[i] : null)) })) }),
    table([t('hourUtc'), ...r.horizons.map(x => hzName(x.s)), t('windows1', { h: hzName(r.horizons[0].s) })],
      r.hours.filter(x => x.n[0]).map(x => [hourLabels[x.h] + ':00', ...x.ann.map(v => (v == null ? '–' : num(v, 1) + '%')), int(x.n[0])]))));
  const rel = card(t('volVsSpread'));
  if (r.groups.length) {
    rel.append(
      bars({ labels: r.groups.map(g => sig(g.spread)), values: r.groups.map(g => g.vol), yLabel: t('volVsAxis'), tip: sig }),
      table([t('group'), t('minutes'), t('spreadRange'), t('meanSpread'), t('volPerMin')],
        r.groups.map((g, i) => [String(i + 1), int(g.n), sig(g.lo) + ' – ' + sig(g.hi), sig(g.spread), sig(g.vol)])),
      h('p', {}, t('rankCorr', { r: r.rank_corr == null ? '–' : num(r.rank_corr, 2), n: int(r.pairs) })));
  } else {
    rel.append(h('p', { class: 'muted' }, t('volFewMinutes', { n: int(r.pairs) })));
  }
  out.push(rel);
  out.push(card(t('byDay'), table([t('day'), ...r.horizons.map(x => hzName(x.s))],
    r.daily.map(d => [d.day, ...d.ann.map(v => (v == null ? '–' : num(v, 1) + '%'))]))));
  out.push(card(t('method'), h('p', { class: 'note' }, t('volMethod', { s: r.params.gap_silence_s }))));
  return out;
}
