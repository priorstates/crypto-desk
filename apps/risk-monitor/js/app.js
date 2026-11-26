import { t, applyLabels } from './i18n.js';
import { esc, usd, px, btc, when, dur, detail, describe } from './format.js';
import { alertPass } from './alerts.js';
import { sample } from './sample.js';

// The same defaults as the service's (remote/conf.py).
const DEFAULTS = { stale_s: 10, hb_stale_s: 5, max_position: 0.25, max_day_loss: 300, min_free_gb: 20,
  remind_min: 5, ack: '', clear_at: 0 };
const CHECKS = ['feed_btc', 'feed_eth', 'recorder_hb', 'maker_hb', 'position', 'loss', 'disk'];
const SILENT_S = 30;                // no report from the service for this long: it is itself an alert
const $ = id => document.getElementById(id);
const sampleMode = new URLSearchParams(location.search).has('sample');   // layout check only
let st = null, events = new Map(), settings = { ...DEFAULTS }, savedAt = 0, formTouched = false, formFilled = false;
let silent = null;
const ackedHere = new Set();

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

function setHTML(el, html) { if (el._html !== html) { el.innerHTML = html; el._html = html; } }

// The service itself going quiet is tracked here, since it cannot report that.
function watchService(now) {
  if (!st || sampleMode) return;
  if (now - st.t > SILENT_S) {
    if (!silent || silent.recovered) silent = { id: 'monitor-' + Math.round(st.t), kind: 'breach', check: 'monitor', opened: st.t, recovered: 0, acked: 0 };
  } else if (silent && !silent.recovered) silent.recovered = now;
}

function render() {
  const now = Date.now() / 1000, s = settings;
  watchService(now);
  const quiet = silent && !silent.recovered;
  const b = $('banner');
  const msg = sampleMode ? t('sampleNote') : !st ? t('noData') : quiet ? t('staleRep', { s: dur(now - st.t) }) : '';
  b.hidden = !msg; b.textContent = msg; b.classList.toggle('bad', !!quiet);

  const checks = st ? st.checks : {};
  const bad = CHECKS.filter(k => checks[k] && checks[k].state === 'breach');
  const sum = $('summary');
  sum.className = 'summary ' + (!st ? '' : quiet ? 'warn' : bad.length ? 'bad' : 'ok');
  $('sumText').textContent = !st ? '–' : quiet ? t('notReporting') : bad.length ? t('nBreached', { n: bad.length }) : t('allClear');
  $('sumNote').textContent = !st ? '' : [bad.length ? bad.map(k => t('c_' + k)).join(' · ') : t('checkedAgo'),
    st.stop ? t('stopIsOn') : ''].filter(Boolean).join(' · ');

  const stop = st && st.stop;
  $('stopCard').hidden = !stop;
  if (stop) {
    $('stopWhy').textContent = t('stopWhy', { s: when(stop.t), r: stop.reason });
    $('stopNote').textContent = t(st.can_clear ? 'stopCan' : 'stopCant');
    $('clear').disabled = !st.can_clear || quiet;
  }

  const pos = st ? st.position : null, mk = (st && st.maker) || {};
  $('pos').textContent = pos == null ? '–' : pos === 0 ? t('flat') : btc(pos) + ' BTC';
  $('pos').className = pos > 0 ? 'up' : pos < 0 ? 'down' : '';
  const part = pos && s.max_position ? Math.max(-1, Math.min(1, pos / s.max_position)) : 0;
  const bar = $('posBar');
  bar.style.left = (part < 0 ? 50 + part * 50 : 50) + '%';
  bar.style.width = Math.abs(part) * 50 + '%';
  bar.className = Math.abs(part) >= 1 ? 'bad' : Math.abs(part) >= 0.8 ? 'warn' : '';
  $('posNote').textContent = t('posNote', { max: s.max_position, v: mk.position == null ? '–' : btc(mk.position) });

  const day = st ? st.day_pnl : null;
  $('dayPnl').textContent = day == null ? '–' : usd(day) + ' USD';
  $('dayPnl').className = day > 0 ? 'up' : day < 0 ? 'down' : '';
  const used = day < 0 && s.max_day_loss ? Math.min(1, -day / s.max_day_loss) : 0;
  $('lossBar').style.width = used * 100 + '%';
  $('lossBar').className = used >= 0.8 ? 'bad' : used >= 0.5 ? 'warn' : '';
  $('pnlNote').textContent = t('pnlNote', { l: s.max_day_loss, v: mk.day_pnl == null ? '–' : usd(mk.day_pnl) });

  $('maker').textContent = mk.state ? t(mk.state) : t('noReport');
  $('maker').className = 's-' + (mk.state || '');
  $('makerNote').textContent = st ? t('fillsNote', { n: (st.fills_today ?? 0).toLocaleString(), m: px(st.mid) }) : '';

  setHTML($('checks').tBodies[0], CHECKS.map(k => {
    const c = checks[k];
    if (!c) return `<tr><td>${esc(t('c_' + k))}</td><td>–</td><td></td><td></td></tr>`;
    return `<tr class="r-${c.state}" data-check="${k}"><td>${esc(t('c_' + k))}</td>
      <td><span class="st ${c.state}"><i class="dot"></i>${esc(t(c.state))}</span></td>
      <td class="wrap">${esc(detail(k, c))}</td><td>${when(c.since)} · ${dur(now - c.since)}</td></tr>`;
  }).join(''));

  const list = [...events.values()].sort((a, b) => b.opened - a.opened).slice(0, 50);
  $('histEmpty').hidden = list.length > 0;
  $('events').hidden = list.length === 0;
  setHTML($('events').tBodies[0], list.map(e => {
    if (e.kind !== 'breach') return `<tr><td>${when(e.opened)}</td><td class="wrap">${esc(describe(e))}</td><td></td><td></td><td></td></tr>`;
    const lasted = e.recovered ? dur(e.recovered - e.opened) : `<span class="chip bad">${esc(t('ongoing', { s: dur(now - e.opened) }))}</span>`;
    const ack = e.acked ? `<span class="muted">${esc(t('acked', { s: when(e.acked) }))}</span>`
      : `<button class="small" data-ack="${esc(e.id)}"${ackedHere.has(e.id) ? ' disabled' : ''}>${esc(t('ack'))}</button>`;
    return `<tr><td>${when(e.opened)}</td><td class="wrap">${esc(describe(e))}</td><td>${lasted}</td>
      <td>${e.stop_sent ? `<span class="chip bad">${esc(t('stopSent'))}</span>` : ''}</td><td>${ack}</td></tr>`;
  }).join(''));

  if (!formFilled && !formTouched) fillForm(settings, !!st);
  if (sampleMode || !st) return;
  // The card line in the space's drawing, and the notifications on this computer.
  const open = [...events.values()].filter(e => e.kind === 'breach' && !e.recovered).sort((a, b) => b.opened - a.opened);
  const line = quiet ? t('notReporting') : open.length
    ? describe(open[0]) + (open.length > 1 ? ' +' + (open.length - 1) : '') : t('allClear') + (stop ? ' · ' + t('stopIsOn') : '');
  if (window.kit && kit.glance) kit.glance({ text: line.slice(0, 60), attention: !!(quiet || open.length) });
  alertPass([...events.values(), ...(silent ? [silent] : [])], Number(s.remind_min) || 0);
}

// ---- settings and the two buttons: all go to the service as settings, through Studio
function fillForm(values, final) {
  for (const el of $('settings').elements) if (el.name) el.value = values[el.name] ?? DEFAULTS[el.name];
  formFilled = final;
}
async function send(values, done) {
  settings = { ...settings, ...values };
  savedAt = Date.now();
  if (sampleMode) return render();       // sample numbers never reach the service
  try {
    await forge.services.setSettings(settings);
    forge.toast(t(done));
  } catch (err) {
    forge.toast(t('failed', { e: err && err.message || err }));
  }
  render();
}
$('settings').addEventListener('input', () => { formTouched = true; });
$('settings').addEventListener('submit', e => {
  e.preventDefault();
  const values = {};
  for (const el of e.target.elements) if (el.name) values[el.name] = Number(el.value);
  formTouched = false;
  send(values, 'saved');
});
$('clear').addEventListener('click', () =>
  send({ clear_at: Math.max(Math.floor(Date.now() / 1000), (settings.clear_at || 0) + 1) }, 'sentClear'));
$('events').addEventListener('click', e => {
  const id = e.target.dataset && e.target.dataset.ack;
  if (!id) return;
  ackedHere.add(id);
  const ids = String(settings.ack || '').split(',').filter(Boolean);
  send({ ack: [...ids.filter(x => x !== id), id].slice(-20).join(',') }, 'sentAck');
});

// ---- data: the service's streams, read through Studio
function newest(rows) {
  for (const r of rows || []) if (r && r.checks && (!st || r.t >= st.t)) st = r;
  if (st && st.settings && Date.now() - savedAt > 10000) settings = { ...DEFAULTS, ...st.settings };
  render();
}
function moreEvents(rows) {
  for (const r of rows || []) if (r && r.id) events.set(r.id, r);       // oldest first: the newest row of an id wins
  render();
}
async function start() {
  applyLabels();
  render();
  try { forge.services.panel($('services')); } catch (e) { forge.log('services panel', String(e)); }
  if (sampleMode) {
    const s = sample();
    st = s.st;
    s.events.forEach(e => events.set(e.id, e));
    return render();
  }
  const now = Date.now() / 1000;
  try {
    moreEvents(await forge.stream.read('', 'events', { since: now - 30 * 86400, limit: 1000 }));
    newest(await forge.stream.read('', 'state', { since: now - 120, limit: 80 }));
    forge.stream.subscribe('', 'state', newest, { every: 2000 });
    forge.stream.subscribe('', 'events', moreEvents, { every: 2000 });
  } catch (e) { forge.log('streams', String(e)); }
  setInterval(render, 2000);
}
start();
