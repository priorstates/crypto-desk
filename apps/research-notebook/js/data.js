// The Data screen: what is copied here, bringing it up to date, and the settings.
import { t } from './i18n.js';
import { $, h, bytes, utcSec, table, card } from './ui.js';

let busy = false;

/** Copy what the server has and this computer lacks. say(text) shows progress. */
export async function sync(say) {
  if (busy) return false;
  busy = true;
  try {
    say(t('syncLooking'));
    const plan = await forge.py('sync_plan', {});
    if (plan.local) { say(t('syncLocal')); return true; }
    let i = 0;
    for (const f of plan.files) {
      say(t('syncCopying', { i: ++i, n: plan.files.length }));
      await forge.py('sync_fetch', { src: f.src, path: f.path });
    }
    await forge.py('sync_done', { ok: true });
    if (plan.missing.length) say(t('syncMissing', { dirs: plan.missing.join(', ') }));
    return true;
  } catch (e) {
    const msg = String(e.message || e).split('\n').pop();
    try { await forge.py('sync_done', { ok: false, error: msg }); } catch (_) { /* the message below says it */ }
    say(t('syncFailed', { e: msg }), true);
    return false;
  } finally {
    busy = false;
  }
}

export function syncLine(st) {
  const s = st.sync;
  if (!st.settings.host) return t('syncLocal');
  if (!s) return t('syncNever');
  return s.ok ? t('syncOk', { host: st.settings.host, time: utcSec(s.t) }) : t('syncFailed', { e: s.error });
}

const FIELDS = [
  ['host', 'sHost'], ['market_dir', 'sMarket'], ['fills_dir', 'sFills'], ['paper_product', 'sPaper'],
  ['gap_silence_s', 'sGap'], ['markout_ms', 'sMarkout'], ['vol_horizons_s', 'sVol'], ['size_buckets_usd', 'sBuckets'],
  ['auto_sync_min', 'sAuto'],
];

export function renderData(st, onSaved) {
  const page = $('dataPage');
  page.replaceChildren(h('header', {}, h('h2', {}, t('tabData')), h('p', { class: 'muted' }, t('dataSub'))));
  const days = new Set();
  const products = Object.keys(st.data.products);
  products.forEach(p => Object.keys(st.data.products[p]).forEach(d => days.add(d)));
  Object.keys(st.data.paper).forEach(d => days.add(d));
  const rows = [...days].sort().reverse().map(d => [d,
    ...products.map(p => { const x = st.data.products[p][d]; return x ? bytes(x.quotes + x.trades) : '–'; }),
    st.data.paper[d] ? bytes(st.data.paper[d]) : '–']);
  page.append(card(t('dataHere'),
    rows.length ? table([t('day'), ...products, t('paperFills')], rows) : h('p', { class: 'muted' }, t('dataNone')),
    h('p', { class: 'muted' }, t('dataNote', { n: days.size, size: bytes(st.data.bytes) }))));
  const form = h('form', { class: 'settings' },
    FIELDS.map(([k, label]) => h('label', {}, h('span', {}, t(label)),
      h('input', { name: k, value: Array.isArray(st.settings[k]) ? st.settings[k].join(', ') : st.settings[k] }))),
    h('button', {}, t('saveSettings')));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const s = {};
    for (const [k] of FIELDS) s[k] = form.elements[k].value;
    try {
      await forge.py('save_settings', { settings: s });
      forge.toast(t('settingsSaved'));
      onSaved();
    } catch (err) {
      forge.toast(String(err.message || err).split('\n').pop());
    }
  });
  page.append(card(t('settings'), form, h('p', { class: 'muted' }, t('settingsNote'))));
}
