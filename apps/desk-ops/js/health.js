// What the page watches, and how each service's health is judged from its own stream.
// forge.services reaches only an app's own services, so these rows come from the streams.
import { t } from './i18n.js';

export const DEFAULTS = {
  refreshMs: 3000,                 // how often new rows are fetched
  relistS: 30,                     // how often a missing stream is looked for again
  staleS: { recorder: 30, maker: 20, monitor: 20, reporter: 150 },   // no row for this long = no heartbeat
  services: [
    { key: 'recorder', app: 'market-recorder', name: 'Market Recorder', icon: '📼', stream: 'heartbeat' },
    { key: 'maker', app: 'paper-market-maker', name: 'Paper Market Maker', icon: '🧾', stream: 'status', events: 'events' },
    { key: 'monitor', app: 'risk-monitor', name: 'Risk Monitor', icon: '🛡️', stream: 'state' },
    { key: 'reporter', app: 'desk-reports', name: 'Desk Reports', icon: '📨', stream: 'state' },
  ],
};

export function dur(s) {
  s = Math.max(0, Math.round(s));
  if (s < 60) return s + ' s';
  if (s < 3600) return Math.floor(s / 60) + ' m ' + String(s % 60).padStart(2, '0') + ' s';
  if (s < 86400) return Math.floor(s / 3600) + ' h ' + String(Math.floor(s % 3600 / 60)).padStart(2, '0') + ' m';
  return Math.floor(s / 86400) + ' d ' + Math.floor(s % 86400 / 3600) + ' h';
}
const signed = (n, d) => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(d);
const num = v => (typeof v === 'number' && isFinite(v) ? v : 0);
const whenUTC = s => new Date(s * 1000).toLocaleString(undefined,
  { timeZone: 'UTC', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
const book = r => [t('position', { s: signed(num(r.position), 4) }), t('day', { s: signed(num(r.day_pnl), 2) })];
const say = (level, label, note) => ({ level, label, note: (Array.isArray(note) ? note.filter(Boolean).join(' · ') : note) || '' });

// Each returns {level: ok | warn | bad, label, note} from the newest row of the service's stream.
const JUDGE = {
  recorder(r) {
    const products = Object.entries(r.products || {});
    const note = products.map(([p, v]) => t('perMin', { p, n: num(v.msgs_min).toLocaleString() }));
    if (r.error) return say('bad', t('error'), r.error);
    if (r.connected === false) return say('bad', t('feedDown'), note);
    const gap = products.find(([, v]) => v && v.gap_open);
    if (gap) return say('warn', t('gapOpen', { s: gap[0] }), [gap[1].gap_open.reason, ...note]);
    if (r.paused) return say('warn', t('filesPaused'), [r.pause_why, ...note]);
    return say('ok', t('running'), note);
  },
  maker(r) {
    if (r.error) return say('bad', t('error'), r.error);
    if (r.state === 'stopped')
      return say('warn', r.stopped_by ? t('stoppedBy', { s: t('by_' + r.stopped_by) }) : t('stopped'), [r.why, ...book(r)]);
    if (r.state === 'paused') return say('warn', t('paused'), [r.why, ...book(r)]);
    if (r.feed && r.feed.connected === false) return say('warn', t('feedDown'), book(r));
    return say('ok', t('running'), [t('quoting'), ...book(r)]);
  },
  monitor(r) {
    if (r.error) return say('bad', t('error'), r.error);
    const breached = Object.entries(r.checks || {}).filter(([, c]) => c && c.state === 'breach').map(([k]) => k);
    if (breached.length) return say('warn', t('breach', { s: breached.join(', ') }), [r.stop && r.stop.reason, ...book(r)]);
    if (r.stop) return say('warn', t('stopOn'), [r.stop.reason, ...book(r)]);
    return say('ok', t('running'), [t('allClear'), ...book(r)]);
  },
  reporter(r) {
    const daily = r.reports && r.reports.daily;
    const note = [daily && t('lastDaily', { s: daily.day }), r.next_daily && t('next', { s: whenUTC(r.next_daily) }),
      r.waiting && r.waiting.length && t('waitingN', { n: r.waiting.length })];
    if (r.failing) return say('bad', t('failing'), [r.last_error && r.last_error.error, ...note]);
    return say('ok', t('running'), note);
  },
};

// One service's whole line: health, running time and restarts (null = the service does not report it).
export function judge(svc, now) {
  const out = { level: 'wait', label: t('noData'), note: '', since: null, restarts: null, age: null };
  if (svc.missing) return { ...out, label: t('noApp') };
  const r = svc.row;
  if (!r) return { ...out, note: svc.listed ? t('noDataNote', { s: svc.stream }) : '' };
  out.age = Math.max(0, now - r.t);
  if (svc.key === 'reporter' && r.since) out.since = r.since;
  if (svc.key === 'maker' && svc.starts && svc.starts.length) {
    out.since = svc.starts[svc.starts.length - 1];
    out.restarts = svc.starts.length - 1;
  }
  if (out.age > DEFAULTS.staleS[svc.key]) {
    // Not running as far as we can tell: its running time would mislead.
    return { ...out, level: 'bad', label: t('stale', { s: dur(out.age) }), since: null };
  }
  let h;
  try { h = JUDGE[svc.key](r); } catch (e) { h = say('bad', t('error'), String(e && e.message || e)); }
  return { ...out, ...h };
}
