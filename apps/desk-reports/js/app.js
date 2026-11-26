import { t, applyLabels } from './i18n.js';

// The same defaults as the service's (remote/conf.py).
const DEFAULTS = { daily_time: '21:00', weekly_day: 'sun', weekly_time: '21:05', min_n: 30,
  email_host: 'localhost', email_port: 1025, email_tls: 'none', email_user: '', email_from: 'desk-reports@example.com',
  email_to: 'desk@example.com', email_reports: true, email_alerts: true, slack_reports: true, slack_alerts: true,
  alert_checks: 'position,loss,stop,feed_btc,feed_eth', alert_min_gap_s: 300, retry_hours: 24, test_at: 0 };
const SILENT_S = 150;               // the service writes at least once a minute
const $ = id => document.getElementById(id);
let st = null, svc = null, settings = { ...DEFAULTS }, savedAt = 0, formTouched = false, formFilled = false, testId = null;

// ---- light and dark
function theme() {
  let m = document.documentElement.getAttribute('data-palmtop-theme') || localStorage.getItem('desk:theme');
  if (m !== 'light' && m !== 'dark') m = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = m;
}
theme();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', theme);
new MutationObserver(theme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-palmtop-theme'] });
if (forge.onTheme) forge.onTheme(theme);

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const when = s => new Date(s * 1000).toLocaleString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
function dur(s) {
  s = Math.max(0, Math.round(s));
  if (s < 60) return s + ' s';
  if (s < 3600) return Math.floor(s / 60) + ' m ' + String(s % 60).padStart(2, '0') + ' s';
  if (s < 86400) return Math.floor(s / 3600) + ' h ' + String(Math.floor(s % 3600 / 60)).padStart(2, '0') + ' m';
  return Math.floor(s / 86400) + ' d ' + Math.floor(s % 86400 / 3600) + ' h';
}
function setHTML(el, html) { if (el._html !== html) { el.innerHTML = html; el._html = html; } }

// One chip per channel: sent, sending, failed (with the reason), off.
function chips(ch, err) {
  return ['email', 'slack'].map(c => {
    const state = (ch || {})[c] || 'off', why = (err || {})[c] || '';
    const key = state === 'pending' && why ? 'c_retry' : 'c_' + state;
    const cls = state === 'sent' ? 'ok' : state === 'failed' ? 'bad' : key === 'c_retry' ? 'warn' : '';
    return `<span class="chip ${cls}">${c === 'email' ? esc(t('email')) : 'Slack'}: ${esc(t(key))}${why ? ' · ' + esc(why) : ''}</span>`;
  }).join('');
}

function reportTile(kind, r, next) {
  $(kind).textContent = r ? when(r.due) + ' UTC' : t('none');
  setHTML($(kind + 'Ch'), r ? chips(r.ch, r.err) : '');
  $(kind + 'Next').textContent = [r && r.late_s ? t('late', { s: dur(r.late_s) }) : '', next ? t('next', { s: when(next) }) : '']
    .filter(Boolean).join(' · ');
}

function render() {
  const now = Date.now() / 1000;
  const quiet = st && now - st.t > SILENT_S;
  const b = $('banner');
  const msg = !st ? t('noData') : quiet ? t('stale', { s: dur(now - st.t) }) : '';
  b.hidden = !msg; b.textContent = msg;

  const health = svc ? svc.health : !st ? 'undeployed' : quiet ? 'stale' : st.failing ? 'error' : 'ok';
  $('svc').textContent = t('h_' + health);
  $('svc').className = health === 'ok' ? 's-ok' : health === 'error' || health === 'stale' ? 's-warn' : 's-bad';
  $('svcNote').textContent = [st ? t('since', { s: when(st.since) + ' UTC' }) : '',
    st && st.waiting.length ? t('waiting', { n: st.waiting.length }) : ''].filter(Boolean).join(' · ');

  const reports = (st && st.reports) || {};
  reportTile('daily', reports.daily, st && st.next_daily);
  reportTile('weekly', reports.weekly, st && st.next_weekly);

  const e = st && st.last_error;
  $('errCard').hidden = !e;
  if (e) {
    $('errCard').classList.toggle('bad', !!st.failing);
    $('errText').textContent = e.error;
    $('errNote').textContent = t('errAt', { s: when(e.t), c: e.channel === 'email' ? t('email') : 'Slack', id: e.id }) + ' · ' + t(st.failing ? 'errNow' : 'errOld');
  }

  const test = reports.test;
  const mine = testId && !(test && test.id === testId);
  $('test').disabled = !st || quiet || mine;
  setHTML($('testResult'), mine ? `<span class="chip">${esc(t('testWait'))}</span>` : !test ? ''
    : Object.values(test.ch).every(v => v === 'off') ? `<span class="chip warn">${esc(t('testNoCh'))}</span>`
      : `<span class="chip">${esc(when(test.due))} UTC</span>` + chips(test.ch, test.err));

  const list = st ? [...st.alerts].reverse() : [];
  $('alertsEmpty').hidden = list.length > 0;
  $('alerts').hidden = list.length === 0;
  setHTML($('alerts').tBodies[0], list.map(a => {
    const sent = a.sent || {};
    const raise = a.raise === 'held' || a.raise === 'suppressed' ? `<span class="chip">${esc(t(a.raise))}</span>` : chips(sent.raise);
    return `<tr><td>${esc(when(a.opened))}</td><td class="wrap"><b>${esc(a.check)}</b> ${esc(a.reason)}</td>
      <td>${a.recovered ? dur(a.recovered - a.opened) : `<span class="chip bad">${esc(t('stillOpen'))}</span>`}</td>
      <td><div class="chips">${raise}</div></td><td><div class="chips">${sent.clear ? chips(sent.clear) : ''}</div></td></tr>`;
  }).join(''));

  for (const name of ['slack_webhook', 'smtp_password']) {
    const on = st && st.secrets && st.secrets[name], el = $('st_' + name);
    el.textContent = !st ? '–' : t(on ? 'isSet' : 'notSet');
    el.className = 'chip' + (on ? ' ok' : '');
  }
  if (!formFilled && !formTouched) fillForm(settings, !!st);
  if (!st) return;
  // The card line in the space's drawing.
  const last = Math.max(0, ...['daily', 'weekly'].map(k => (reports[k] && reports[k].due) || 0));
  const line = st.failing ? t('gFail') + (e ? ': ' + e.error : '') : last ? t('gLast', { s: when(last) }) : t('gNone');
  if (window.kit && kit.glance) kit.glance({ text: line.slice(0, 60), attention: !!st.failing });
}

// ---- settings: they go to the service through Studio (config.json on trade1)
function fillForm(values, final) {
  for (const el of $('settings').elements) {
    if (!el.name) continue;
    const v = values[el.name] ?? DEFAULTS[el.name];
    if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
  }
  formFilled = final;
}
async function send(values, done) {
  settings = { ...settings, ...values };
  savedAt = Date.now();
  try {
    await forge.services.setSettings(settings);
    forge.toast(t(done));
    return true;
  } catch (err) {
    forge.toast(t('failed', { e: err && err.message || err }));
    return false;
  } finally { render(); }
}
$('settings').addEventListener('input', () => { formTouched = true; });
$('settings').addEventListener('submit', e => {
  e.preventDefault();
  const values = {};
  for (const el of e.target.elements) {
    if (!el.name) continue;
    values[el.name] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value.trim();
  }
  formTouched = false;
  send(values, 'saved');
});
$('test').addEventListener('click', async () => {
  const at = Math.max(Math.floor(Date.now() / 1000), (Number(settings.test_at) || 0) + 1);
  testId = 'test-' + at;
  render();
  if (!await send({ test_at: at }, 'asked')) { testId = null; render(); }
});

// ---- the two secrets: saved on trade1 by this computer (main.py); the page never reads them back
$('secretsCard').addEventListener('click', async e => {
  const act = e.target.dataset && e.target.dataset.act;
  if (!act) return;
  const box = e.target.closest('.secret'), input = box.querySelector('input'), name = box.dataset.secret;
  if (act === 'set' && !input.value.trim()) return input.focus();
  e.target.disabled = true;
  try {
    await forge.py(act === 'set' ? 'set_secret' : 'clear_secret', { name, value: input.value });
    input.value = '';
    forge.toast(t(act === 'set' ? 'secretSaved' : 'secretRemoved'));
  } catch (err) {
    forge.toast(t('failed', { e: err && err.message || err }));
  }
  e.target.disabled = false;
});

// ---- data: the service's stream and its health, read through Studio
function newest(rows) {
  for (const r of rows || []) if (r && r.reports && (!st || r.t >= st.t)) st = r;
  if (st && st.settings && Date.now() - savedAt > 10000) settings = { ...DEFAULTS, ...st.settings };
  render();
}
async function health() {
  try {
    const list = await forge.services.list();
    svc = (list || []).find(s => s.name === 'reporter') || null;
  } catch (e) { svc = null; }
  render();
}
async function start() {
  applyLabels();
  render();
  try { forge.services.panel($('services')); } catch (e) { forge.log('services panel', String(e)); }
  const now = Date.now() / 1000;
  try {
    let rows = await forge.stream.read('', 'state', { since: now - 900, limit: 50 });
    if (!rows || !rows.length) rows = await forge.stream.read('', 'state', { since: now - 2 * 86400, limit: 3000 });
    newest(rows);
    forge.stream.subscribe('', 'state', newest, { every: 3000 });
  } catch (e) { forge.log('stream', String(e)); }
  health();
  setInterval(health, 10000);
  setInterval(render, 5000);
}
start();
