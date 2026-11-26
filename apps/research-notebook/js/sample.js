// What every study states first: its sample size and the gaps it skipped.
import { t } from './i18n.js';
import { h, int, dur, utc, table, card } from './ui.js';

const reason = r => {
  if (r === 'no quotes') return t('gNoQuotes');
  if (r === 'recorder restarted') return t('gRestart');
  if (r === 'trades missing') return t('gMissing');
  const m = /^(\d+) trades missing$/.exec(r);
  if (m) return t('gMissingN', { n: m[1] });
  return r.replace(/^recorder: /, t('gRecorder') + ': ');
};

export function sampleBox(r, extra = []) {
  const s = r.sample;
  const lines = [
    t('smpDays', { n: s.days.length, from: utc(s.first_ns), to: utc(s.last_ns) }),
    t('smpRows', { n: int(s.quotes), time: dur(s.covered_s) }),
    ...extra,
  ];
  if (s.bad_rows) lines.push(t('smpBad', { n: int(s.bad_rows) }));
  if (s.empty_days.length) lines.push(t('smpEmpty', { days: s.empty_days.join(', ') }));
  const box = card(t('sample'), h('ul', { class: 'facts' }, lines.map(x => h('li', {}, x))));
  if (!s.gap_count) {
    box.append(h('p', { class: 'muted' }, t('gapsNone')));
  } else {
    box.append(h('p', {}, t('gapsSome', { n: int(s.gap_count), time: dur(s.gap_s) }) + ' ' +
      s.gap_reasons.map(g => `${reason(g.reason)}: ${int(g.n)} (${dur(g.s)})`).join(' · ')));
    box.append(h('details', {}, h('summary', {}, t('gapsLongest')),
      table([t('start'), t('length'), t('reason')], s.gaps.map(g => [utc(g.start_ns), dur(g.s), reason(g.reason)]))));
  }
  return box;
}

export function fewDays(r) {
  const n = r.sample.days.length;
  return n < 3 ? h('div', { class: 'banner' }, t('fewDays', { n, time: dur(r.sample.covered_s) })) : null;
}
