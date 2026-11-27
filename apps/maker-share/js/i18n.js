// Every label in five languages: English, 简体中文, 繁體中文, Español, Português.
const T = {
  title: ['Maker Share', '做市份额', '做市份額', 'Cuota del creador', 'Quota do market maker'],
  paper: ['Paper only', '仅限模拟', '僅限模擬', 'Solo simulación', 'Só simulação'],
  sub: ['{p} · today {d} ({z}) · simulated fills against the market\'s trading',
    '{p} · 今天 {d}（{z}）· 模拟成交与市场成交对比', '{p} · 今天 {d}（{z}）· 模擬成交與市場成交對比',
    '{p} · hoy {d} ({z}) · ejecuciones simuladas frente al mercado',
    '{p} · hoje {d} ({z}) · execuções simuladas face ao mercado'],
  local: ['local time', '本地时间', '本地時間', 'hora local', 'hora local'],
  noVolume: ['Market Recorder publishes no traded volume (its streams: {s}), so the share of the market cannot be worked out. Showing our simulated fills per hour instead.',
    'Market Recorder 没有发布成交量（它的数据流：{s}），因此无法计算市场份额。改为显示每小时的模拟成交。',
    'Market Recorder 沒有發布成交量（它的資料流：{s}），因此無法計算市場份額。改為顯示每小時的模擬成交。',
    'Market Recorder no publica volumen negociado (sus flujos: {s}), así que no se puede calcular la cuota del mercado. Se muestran nuestras ejecuciones simuladas por hora.',
    'O Market Recorder não publica volume negociado (os seus fluxos: {s}), por isso não é possível calcular a quota do mercado. Mostram-se as nossas execuções simuladas por hora.'],
  noRecorder: ['Market Recorder has published no data yet, so the share of the market cannot be worked out. Showing our simulated fills per hour instead.',
    'Market Recorder 还没有发布数据，因此无法计算市场份额。改为显示每小时的模拟成交。',
    'Market Recorder 還沒有發布資料，因此無法計算市場份額。改為顯示每小時的模擬成交。',
    'Market Recorder aún no ha publicado datos, así que no se puede calcular la cuota del mercado. Se muestran nuestras ejecuciones simuladas por hora.',
    'O Market Recorder ainda não publicou dados, por isso não é possível calcular a quota do mercado. Mostram-se as nossas execuções simuladas por hora.'],
  none: ['none', '无', '無', 'ninguno', 'nenhum'],
  partial: ['Only part of today\'s market trades could be read, so the share shown is too high.',
    '只读取到今天的部分市场成交，显示的份额偏高。', '只讀取到今天的部分市場成交，顯示的份額偏高。',
    'Solo se pudo leer parte de las operaciones de hoy, así que la cuota mostrada es demasiado alta.',
    'Só foi possível ler parte das transações de hoje, por isso a quota mostrada é demasiado alta.'],
  truncated: ['A page can read only the newest {n} rows of a stream, and today has more than that: the hours before {h} cannot be shown here.',
    '页面只能读取数据流最新的 {n} 行，而今天的数据超过了这个数量：{h} 之前的时段无法在此显示。',
    '頁面只能讀取資料流最新的 {n} 列，而今天的資料超過了這個數量：{h} 之前的時段無法在此顯示。',
    'Una página solo puede leer las {n} filas más recientes de un flujo, y hoy hay más: las horas anteriores a las {h} no se pueden mostrar aquí.',
    'Uma página só pode ler as {n} linhas mais recentes de um fluxo, e hoje há mais: as horas anteriores às {h} não podem ser mostradas aqui.'],
  ownCount: [' Today\'s totals are Paper Market Maker\'s own count.', ' 今日合计为 Paper Market Maker 自己的统计。',
    ' 今日合計為 Paper Market Maker 自己的統計。', ' Los totales de hoy son el recuento del propio Paper Market Maker.',
    ' Os totais de hoje são a contagem do próprio Paper Market Maker.'],
  tFrom: ['Hours shown from', '显示起始时间', '顯示起始時間', 'Horas mostradas desde', 'Horas mostradas desde'],
  shown: ['Shown', '已显示', '已顯示', 'Mostrado', 'Mostrado'],
  unknownTip: ['{h}:00 — too far back to read', '{h}:00 — 太早，无法读取', '{h}:00 — 太早，無法讀取',
    '{h}:00 — demasiado atrás para leerlo', '{h}:00 — demasiado atrás para ler'],
  tFills: ['Fills today', '今日成交笔数', '今日成交筆數', 'Ejecuciones hoy', 'Execuções hoje'],
  tSize: ['Size filled', '成交数量', '成交數量', 'Tamaño ejecutado', 'Tamanho executado'],
  tBuySell: ['Bought / sold', '买入 / 卖出', '買入 / 賣出', 'Comprado / vendido', 'Comprado / vendido'],
  tBusiest: ['Busiest hour', '最活跃时段', '最活躍時段', 'Hora más activa', 'Hora mais ativa'],
  tMarket: ['Market traded', '市场成交量', '市場成交量', 'Negociado en el mercado', 'Negociado no mercado'],
  tShare: ['Share today', '今日份额', '今日份額', 'Cuota hoy', 'Quota hoje'],
  chartFills: ['Simulated fills per hour', '每小时模拟成交笔数', '每小時模擬成交筆數',
    'Ejecuciones simuladas por hora', 'Execuções simuladas por hora'],
  chartShare: ['Share of the market\'s traded size caught, per hour (%)', '每小时成交份额（%）', '每小時成交份額（%）',
    'Cuota del tamaño negociado, por hora (%)', 'Quota do tamanho negociado, por hora (%)'],
  cHour: ['Hour', '小时', '小時', 'Hora', 'Hora'],
  cFills: ['Fills', '笔数', '筆數', 'Ejec.', 'Exec.'],
  cSize: ['Size BTC', '数量 BTC', '數量 BTC', 'Tamaño BTC', 'Tamanho BTC'],
  cBuy: ['Bought', '买入', '買入', 'Comprado', 'Comprado'],
  cSell: ['Sold', '卖出', '賣出', 'Vendido', 'Vendido'],
  cOurs: ['Ours BTC', '我方 BTC', '我方 BTC', 'Nuestro BTC', 'Nosso BTC'],
  cMarket: ['Market BTC', '市场 BTC', '市場 BTC', 'Mercado BTC', 'Mercado BTC'],
  cShare: ['Share', '份额', '份額', 'Cuota', 'Quota'],
  total: ['Today', '今日', '今日', 'Hoy', 'Hoje'],
  loading: ['Reading the desk\'s data…', '正在读取交易台数据…', '正在讀取交易台資料…',
    'Leyendo los datos de la mesa…', 'A ler os dados da mesa…'],
  noMaker: ['No fills data yet', '还没有成交数据', '還沒有成交資料', 'Aún no hay datos de ejecuciones', 'Ainda não há dados de execuções'],
  noMakerMore: ['Paper Market Maker has not published its fills. This page fills in by itself when it does.',
    'Paper Market Maker 还没有发布成交数据。发布后本页会自动更新。', 'Paper Market Maker 還沒有發布成交資料。發布後本頁會自動更新。',
    'Paper Market Maker no ha publicado sus ejecuciones. Esta página se completa sola cuando lo haga.',
    'O Paper Market Maker não publicou as suas execuções. Esta página preenche-se sozinha quando o fizer.'],
  noFills: ['No simulated fills yet today', '今天还没有模拟成交', '今天還沒有模擬成交',
    'Aún no hay ejecuciones simuladas hoy', 'Ainda não há execuções simuladas hoje'],
  noFillsMore: ['Bars appear as the paper quotes are filled.', '模拟报价成交后会出现柱形。', '模擬報價成交後會出現柱形。',
    'Las barras aparecen cuando se ejecutan las cotizaciones simuladas.', 'As barras aparecem quando as cotações simuladas são executadas.'],
  cantRead: ['Could not read the data', '无法读取数据', '無法讀取資料', 'No se pudieron leer los datos', 'Não foi possível ler os dados'],
  foot: ['A fill is simulated: our quote counts as filled when a market trade prints through its price. Nothing here sends an order.',
    '成交均为模拟：市场成交价穿过我方报价时视为成交。本页不会发送任何订单。', '成交均為模擬：市場成交價穿過我方報價時視為成交。本頁不會送出任何訂單。',
    'Las ejecuciones son simuladas: nuestra cotización cuenta como ejecutada cuando una operación del mercado atraviesa su precio. Nada aquí envía una orden.',
    'As execuções são simuladas: a nossa cotação conta como executada quando uma transação do mercado atravessa o seu preço. Nada aqui envia uma ordem.'],
  flattens: [' Not counted: {n} fill(s) that closed the position at a stop.', ' 未计入：{n} 笔止损平仓成交。', ' 未計入：{n} 筆停損平倉成交。',
    ' No contadas: {n} ejecución(es) que cerraron la posición en una parada.', ' Não contadas: {n} execução(ões) que fecharam a posição numa paragem.'],
  updated: [' Updated {s}.', ' 更新于 {s}。', ' 更新於 {s}。', ' Actualizado {s}.', ' Atualizado {s}.'],
  glanceFills: ['{n} fills today · {s} BTC', '今日 {n} 笔成交 · {s} BTC', '今日 {n} 筆成交 · {s} BTC',
    '{n} ejecuciones hoy · {s} BTC', '{n} execuções hoje · {s} BTC'],
  glanceShare: ['{s} of today\'s trading caught', '今日成交份额 {s}', '今日成交份額 {s}', '{s} del mercado de hoy', '{s} do mercado de hoje'],
  barTip: ['{h}:00 — {n} fills, {s} BTC', '{h}:00 — {n} 笔，{s} BTC', '{h}:00 — {n} 筆，{s} BTC',
    '{h}:00 — {n} ejecuciones, {s} BTC', '{h}:00 — {n} execuções, {s} BTC'],
};

const tag = (navigator.language || 'en').toLowerCase();
const col = tag.startsWith('zh') ? (/tw|hk|mo|hant/.test(tag) ? 2 : 1)
  : tag.startsWith('es') ? 3 : tag.startsWith('pt') ? 4 : 0;

export function t(key, vars = {}) {
  let s = (T[key] || [key])[col] || (T[key] || [key])[0];
  for (const k in vars) s = s.replace('{' + k + '}', vars[k]);
  return s;
}

export function applyLabels() {
  document.documentElement.lang = ['en', 'zh-Hans', 'zh-Hant', 'es', 'pt'][col];
  document.title = t('title');
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
}
