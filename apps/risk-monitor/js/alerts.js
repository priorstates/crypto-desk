// Alerts on this computer: a system notification through Studio (forge.notify), never the phone.
// Each event is told once, again every remind_min while it lasts and is not acknowledged,
// and once more when it recovers. What was told is kept in kv "notified", so a reload repeats nothing.
import { t } from './i18n.js';
import { describe, dur } from './format.js';

const KEY = 'notified', GAP = 61000;        // Studio shows at most one notification a minute
let lastSent = 0;

export function alertPass(events, remindMin) {
  const told = forge.kv.getJSON(KEY, {}), now = Date.now(), lines = [], marks = {};
  for (const e of events) {
    if (e.kind && e.kind !== 'breach') continue;
    const m = told[e.id], age = now / 1000 - e.opened;
    if (!e.recovered) {
      if (!m) {
        lines.push('⚠ ' + (e.stop_sent ? t('n_stop', { e: describe(e) }) : describe(e)));
        marks[e.id] = { first: now, last: now };
      } else if (!e.acked && remindMin > 0 && now - m.last >= remindMin * 60000) {
        lines.push('⚠ ' + t('n_still', { s: dur(age), e: describe(e) }));
        marks[e.id] = { ...m, last: now };
      }
    } else if (m ? !m.rec : now / 1000 - e.recovered < 600) {
      // Recovered. One that came and went between two looks is still told, once.
      lines.push('✓ ' + t('n_recovered', { s: dur(e.recovered - e.opened), e: describe(e) }));
      marks[e.id] = { first: now, last: now, ...m, rec: 1 };
    }
  }
  if (!lines.length || now - lastSent < GAP) return;      // what waits is sent with the next one
  lastSent = now;
  const keep = {};
  for (const [id, m] of Object.entries({ ...told, ...marks })) if (now - m.first < 31 * 86400000) keep[id] = m;
  forge.kv.setJSON(KEY, keep);
  const body = lines.slice(0, 4).join('\n') + (lines.length > 4 ? '\n+' + (lines.length - 4) : '');
  try { forge.notify(t('title'), body); } catch (err) { forge.log('notify', String(err)); }
  forge.toast(lines[0]);
}
