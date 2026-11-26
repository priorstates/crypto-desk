import { t, applyLabels } from './i18n.js';
import { $, h, initTheme, utcSec, table, card } from './ui.js';
import { spreads, vol } from './views-market.js';
import { markout, paper } from './views-trades.js';
import { fewDays } from './sample.js';
import { sync, syncLine, renderData } from './data.js';

const STUDIES = { spreads, vol, markout, paper };
const TABS = ['spreads', 'vol', 'markout', 'paper', 'saved', 'data'];
const ICON = { spreads: '↔', vol: '〰', markout: '⤴', paper: '📝', saved: '★', data: '🗄' };
let st = null;              // what the backend has: settings, days here, last copy
let tab = new URLSearchParams(location.search).get('tab');
if (!TABS.includes(tab)) tab = 'spreads';
const view = {};            // per study: {product, from, to, open, result, saved, name}
let runNo = 0;
let openAt = +new URLSearchParams(location.search).get('at') || 0;

initTheme();
applyLabels();

// ---- which days a study can use
function daysFor(study, product) {
  const set = new Set(Object.keys(st.data.products[product] || {}));
  if (study === 'paper') Object.keys(st.data.paper).forEach(d => set.add(d));
  return [...set].sort();
}
function productsFor(study) {
  return study === 'paper' ? [st.params.paper_product] : Object.keys(st.data.products);
}
function ensureView(study) {
  if (view[study]) return view[study];
  const product = productsFor(study)[0] || '';
  const days = daysFor(study, product);
  const last = days[days.length - 1] || new Date().toISOString().slice(0, 10);
  const from = days[Math.max(0, days.length - 7)] || last;
  return (view[study] = { product, from, to: last, open: true, result: null, saved: null, name: '' });
}

// ---- navigation
function showTab(next) {
  tab = next;
  history.replaceState(null, '', '?tab=' + tab);
  $('tabs').replaceChildren(...TABS.map(k => h('button', { class: k === tab ? 'on' : '', onclick: () => showTab(k) },
    h('i', {}, ICON[k]), t('tab' + k[0].toUpperCase() + k.slice(1)))));
  $('studyPage').hidden = !STUDIES[tab];
  $('savedPage').hidden = tab !== 'saved';
  $('dataPage').hidden = tab !== 'data';
  if (tab === 'saved') return renderSaved();
  if (tab === 'data') return renderData(st, refresh);
  const v = ensureView(tab);
  $('studyTitle').textContent = t('tab' + tab[0].toUpperCase() + tab.slice(1));
  $('studySub').textContent = t(tab + 'Sub');
  $('product').replaceChildren(...productsFor(tab).map(p => h('option', { value: p, selected: p === v.product }, p)));
  $('from').value = v.from; $('to').value = v.to;
  $('openEnd').checked = v.open; $('to').disabled = v.open;
  $('saveName').value = v.name || `${$('studyTitle').textContent} · ${v.product}`;
  showResult();
  if (!v.result) run();
}

function showResult() {
  const v = view[tab];
  $('savedLine').hidden = !v.saved;
  if (v.saved) $('savedLine').textContent = t('savedLine', { name: v.name, time: utcSec(v.result && v.result.ran_at) });
  $('save').disabled = !v.result;
  $('result').replaceChildren(...(v.result ? [fewDays(v.result), ...STUDIES[tab](v.result)].filter(Boolean) : []));
  if (v.result && openAt && $('result').children[openAt - 1]) {    // ?at=3 opens at the result's third part
    $('result').children[openAt - 1].scrollIntoView();
    openAt = 0;
  }
}

function readControls() {
  const v = view[tab];
  if (v.product !== $('product').value) v.name = '';
  v.product = $('product').value;
  v.open = $('openEnd').checked;
  const days = daysFor(tab, v.product);
  v.from = $('from').value || v.from;
  v.to = v.open ? (days[days.length - 1] || v.to) : ($('to').value || v.to);
  $('to').value = v.to; $('to').disabled = v.open;
  return v;
}

// ---- running a study: one day at a time (each day's part is kept), then put together
async function run(study = tab) {
  const v = study === tab ? readControls() : view[study];
  const mine = ++runNo;
  const days = daysFor(study, v.product).filter(d => d >= v.from && d <= v.to);
  const params = v.saved ? v.saved.params : null;
  const show = study === tab;
  if (!days.length) {
    v.result = null;
    if (show) { showResult(); $('result').replaceChildren(card('', h('p', {}, t('noDays', { from: v.from, to: v.to })), h('p', { class: 'muted' }, t('noDaysHint')))); }
    return false;
  }
  $('progress').hidden = false; $('run').disabled = true;
  try {
    for (let i = 0; i < days.length; i++) {
      $('progressBar').style.width = (i / days.length * 100) + '%';
      $('progressText').textContent = t('working', { i: i + 1, n: days.length, day: days[i] });
      await forge.py('run_day', { study, product: v.product, day: days[i], params });
      if (mine !== runNo) return false;
    }
    $('progressBar').style.width = '100%';
    v.result = await forge.py('combine', { study, product: v.product, days, params });
    if (mine !== runNo) return false;
    if (study === tab) showResult();
    return true;
  } catch (e) {
    forge.log('run failed', e.traceback || String(e));
    if (study === tab) $('result').replaceChildren(h('div', { class: 'banner bad' }, t('runFailed', { e: String(e.message || e).split('\n').pop() })));
    return false;
  } finally {
    if (mine === runNo) { $('progress').hidden = true; $('run').disabled = false; }
  }
}

async function save() {
  const v = view[tab];
  if (!v.result) return;
  v.name = $('saveName').value.trim() || $('studyTitle').textContent;
  const res = await forge.py('study_save', { id: v.saved && v.saved.id, name: v.name, study: tab, product: v.product,
    from: v.from, to: v.to, open_end: v.open, params: v.result.params, result: v.result });
  v.saved = { id: res.id, params: v.result.params };
  showResult();
  forge.toast(t('savedToast', { name: v.name }));
}

// ---- saved studies
async function openSaved(id, again) {
  const s = await forge.py('study_get', { id });
  view[s.study] = { product: s.product, from: s.from, to: s.to, open: !!s.open_end, result: s.result, name: s.name,
    saved: { id: s.id, params: s.params } };
  showTab(s.study);
  if (again && await run()) await save();
}

async function renderSaved() {
  const page = $('savedPage');
  const list = await forge.py('studies_list', {});
  page.replaceChildren(h('header', {}, h('h2', {}, t('tabSaved')), h('p', { class: 'muted' }, t('savedSub'))));
  if (!list.length) return page.append(card('', h('p', { class: 'muted' }, t('savedNone'))));
  page.append(card('', table([t('name'), t('study'), t('product'), t('range'), t('days'), t('lastRun'), ''], list.map(s => [
    s.name, t('tab' + s.study[0].toUpperCase() + s.study.slice(1)), s.product,
    s.from + ' → ' + (s.open_end ? t('latest') : s.to), String(s.days), utcSec(s.ran_at),
    h('span', { class: 'acts' },
      h('button', { class: 'quiet', onclick: () => openSaved(s.id, false) }, t('open')),
      h('button', { onclick: () => openSaved(s.id, true) }, t('runAgain')),
      h('button', { class: 'quiet danger', onclick: async () => {
        if (!confirm(t('deleteAsk', { name: s.name }))) return;
        await forge.py('study_delete', { id: s.id });
        for (const k in view) if (view[k].saved && view[k].saved.id === s.id) view[k].saved = null;
        renderSaved();
      } }, t('delete')))]))));
}

// ---- the copy of the recorded files
const say = (text, bad) => { $('syncState').textContent = text; $('syncState').classList.toggle('bad', !!bad); };
async function refresh() {
  st = await forge.py('status', {});
  say(syncLine(st), st.sync && !st.sync.ok);
  if (tab === 'data') renderData(st, refresh);
}
async function syncNow() {
  $('syncNow').disabled = true;
  const ok = await sync(say);
  $('syncNow').disabled = false;
  if (ok) await refresh(); else st = await forge.py('status', {});
  return ok;
}

$('controls').addEventListener('submit', e => { e.preventDefault(); run(); });
$('openEnd').addEventListener('change', readControls);
$('product').addEventListener('change', () => { readControls(); $('saveName').value = `${$('studyTitle').textContent} · ${view[tab].product}`; });
$('save').addEventListener('click', () => save().catch(e => forge.toast(String(e.message || e))));
const syncThenRun = async () => { if (await syncNow() && STUDIES[tab] && view[tab] && view[tab].open) run(); };
$('syncNow').addEventListener('click', syncThenRun);

(async () => {
  try {
    await refresh();
    const age = st.sync ? (Date.now() / 1000 - st.sync.t) / 60 : Infinity;
    const empty = !Object.keys(st.data.products).length;
    if (st.settings.host && (empty || age > st.settings.auto_sync_min)) {
      if (empty) await syncNow();                    // nothing here yet: wait for the first copy
      else setTimeout(syncThenRun, 0);               // show what is here, then again with the new rows
    }
    showTab(tab);
  } catch (e) {
    forge.log('start failed', e.traceback || String(e));
    $('result').replaceChildren(h('div', { class: 'banner bad' }, String(e.message || e)));
  }
})();
