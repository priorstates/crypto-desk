import { t } from './i18n.js';

export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const usd = v => v == null ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') +
  Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const px = v => v == null ? '–' : Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const btc = v => v == null ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(4);
// unix seconds -> "11-26 17:02:01" (UTC), or only the time for today
export function when(s) {
  const iso = new Date(s * 1000).toISOString();
  return iso.slice(0, 10) === new Date().toISOString().slice(0, 10) ? iso.slice(11, 19) : iso.slice(5, 10) + ' ' + iso.slice(11, 19);
}
export function dur(s) {
  s = Math.max(0, s);
  if (s < 60) return Math.round(s) + ' s';
  if (s < 3600) return Math.floor(s / 60) + ' min';
  if (s < 86400) return Math.floor(s / 3600) + ' h ' + Math.floor(s % 3600 / 60) + ' min';
  return Math.floor(s / 86400) + ' d ' + Math.floor(s % 86400 / 3600) + ' h';
}
const secs = v => v == null ? '–' : v < 10 ? v.toFixed(1) : Math.round(v);

// What a check shows in its row: the number now against its limit.
export function detail(key, c) {
  const v = c.value, l = c.limit;
  if (key === 'recorder_hb' || key === 'maker_hb') return v == null ? t('d_hbNone') : t('d_hb', { v: secs(v), l });
  if (v == null) return t('d_unknown');
  if (key === 'feed_btc' || key === 'feed_eth') return t('d_feed', { v: secs(v), l });
  if (key === 'position') return t('d_position', { v: btc(v), l });
  if (key === 'loss') return t('d_loss', { v: usd(v), l });
  return t('d_disk', { v: v.toFixed(1), l });
}

// One event in words, from its numbers (the service sends no sentences).
export function describe(e) {
  if (e.kind && e.kind !== 'breach') return t('e_' + e.kind);
  const v = e.value, l = e.limit;
  if (e.check === 'position') return t('e_position', { v: btc(v), l });
  if (e.check === 'loss') return t('e_loss', { v: v == null ? '–' : Math.abs(v).toFixed(2), l });
  if (e.check === 'disk') return t('e_disk', { v: v == null ? '–' : v.toFixed(1), l });
  return t('e_' + e.check, { v: v == null ? '–' : Math.round(v) });
}
