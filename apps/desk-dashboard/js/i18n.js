// Every label in five languages: English, 简体中文, 繁體中文, Español, Português.
const T = {
  title: ['Desk Today', '今日交易台', '今日交易台', 'Mesa hoy', 'Mesa hoje'],
  paper: ['Paper only', '仅限模拟', '僅限模擬', 'Solo simulación', 'Só simulação'],
  pnl: ['PnL today', '今日盈亏', '今日損益', 'PnL de hoy', 'PnL de hoje'],
  position: ['Position', '持仓', '部位', 'Posición', 'Posição'],
  btc: ['BTC-USD mid', 'BTC-USD 中间价', 'BTC-USD 中間價', 'BTC-USD medio', 'BTC-USD médio'],
  eth: ['ETH-USD mid', 'ETH-USD 中间价', 'ETH-USD 中間價', 'ETH-USD medio', 'ETH-USD médio'],
  fills: ['Fills today', '今日成交', '今日成交', 'Ejecuciones hoy', 'Execuções hoje'],
  risk: ['Risk', '风控', '風控', 'Riesgo', 'Risco'],
  feed: ['Feed age', '行情延迟', '行情延遲', 'Antigüedad del feed', 'Idade do feed'],
  foot: ['This page only reads the desk\'s data. Nothing here sends an order. Days are UTC.',
    '本页只读取交易台的数据，不会发送任何订单。日期按 UTC 计。', '本頁只讀取交易台的資料，不會送出任何訂單。日期以 UTC 計。',
    'Esta página solo lee los datos de la mesa. Nada aquí envía una orden. Los días son UTC.',
    'Esta página só lê os dados da mesa. Nada aqui envia uma ordem. Os dias são UTC.'],
  emptyAll: ['No data yet. The tiles fill in by themselves when the desk\'s services report.',
    '暂无数据。交易台的服务上报后，各项会自动显示。', '尚無資料。交易台的服務回報後，各項會自動顯示。',
    'Aún no hay datos. Los paneles se completan solos cuando los servicios de la mesa informan.',
    'Ainda sem dados. Os painéis preenchem-se sozinhos quando os serviços da mesa reportam.'],
  emptySome: ['Still waiting for: {s}', '仍在等待：{s}', '仍在等待：{s}', 'Aún esperando: {s}', 'Ainda à espera de: {s}'],
  noData: ['No data yet', '暂无数据', '尚無資料', 'Aún sin datos', 'Ainda sem dados'],
  waitFor: ['Waiting for {s}', '等待 {s}', '等待 {s}', 'Esperando a {s}', 'À espera de {s}'],
  old: ['No update for {s}', '已 {s} 未更新', '已 {s} 未更新', 'Sin actualizar desde hace {s}', 'Sem atualização há {s}'],
  ago: ['{s} ago', '{s}前', '{s}前', 'hace {s}', 'há {s}'],
  range: ['low {a} · high {b} · since 00:00 UTC', '最低 {a} · 最高 {b} · 自 00:00 UTC', '最低 {a} · 最高 {b} · 自 00:00 UTC',
    'mín {a} · máx {b} · desde 00:00 UTC', 'mín {a} · máx {b} · desde 00:00 UTC'],
  noTrend: ['The trend line appears after a few minutes of data', '有几分钟数据后会显示走势线', '有幾分鐘資料後會顯示走勢線',
    'La línea de tendencia aparece tras unos minutos de datos', 'A linha de tendência aparece após alguns minutos de dados'],
  trendAlt: ['PnL today, trend', '今日盈亏走势', '今日損益走勢', 'Tendencia del PnL de hoy', 'Tendência do PnL de hoje'],
  flat: ['flat', '空仓', '空手', 'sin posición', 'sem posição'],
  long: ['long', '多头', '多頭', 'largo', 'comprado'],
  short: ['short', '空头', '空頭', 'corto', 'vendido'],
  avg: ['avg {s}', '均价 {s}', '均價 {s}', 'medio {s}', 'médio {s}'],
  st_quoting: ['quoting', '报价中', '報價中', 'cotizando', 'a cotar'],
  st_paused: ['paused', '已暂停', '已暫停', 'en pausa', 'em pausa'],
  st_stopped: ['stopped', '已停止', '已停止', 'detenida', 'parada'],
  bidAsk: ['bid {a} · ask {b}', '买 {a} · 卖 {b}', '買 {a} · 賣 {b}', 'compra {a} · venta {b}', 'compra {a} · venda {b}'],
  volume: ['{s} BTC traded', '成交量 {s} BTC', '成交量 {s} BTC', '{s} BTC negociados', '{s} BTC negociados'],
  lastFill: ['last: {side} {size} at {price}, {ago}', '最近：{side} {size}，价格 {price}，{ago}', '最近：{side} {size}，價格 {price}，{ago}',
    'última: {side} {size} a {price}, {ago}', 'última: {side} {size} a {price}, {ago}'],
  buy: ['buy', '买入', '買進', 'compra', 'compra'],
  sell: ['sell', '卖出', '賣出', 'venta', 'venda'],
  allClear: ['All clear', '一切正常', '一切正常', 'Todo en orden', 'Tudo em ordem'],
  checksOk: ['{n} checks within limits', '{n} 项检查均在限额内', '{n} 項檢查均在限額內', '{n} controles dentro de límites',
    '{n} verificações dentro dos limites'],
  stopOn: ['Stop is on', '停止信号生效中', '停止訊號生效中', 'Parada activa', 'Paragem ativa'],
  more: ['+{n} more', '另有 {n} 项', '另有 {n} 項', '+{n} más', '+{n} mais'],
  valLimit: ['{name}: {v} (limit {l})', '{name}：{v}（限额 {l}）', '{name}：{v}（限額 {l}）', '{name}: {v} (límite {l})',
    '{name}: {v} (limite {l})'],
  since: ['since {s} UTC', '自 {s} UTC', '自 {s} UTC', 'desde {s} UTC', 'desde {s} UTC'],
  ck_feed_btc: ['BTC feed stale', 'BTC 行情中断', 'BTC 行情中斷', 'Feed BTC parado', 'Feed BTC parado'],
  ck_feed_eth: ['ETH feed stale', 'ETH 行情中断', 'ETH 行情中斷', 'Feed ETH parado', 'Feed ETH parado'],
  ck_recorder_hb: ['Recorder silent', '记录器无心跳', '記錄器無心跳', 'Grabador sin señal', 'Gravador sem sinal'],
  ck_maker_hb: ['Strategy silent', '策略无心跳', '策略無心跳', 'Estrategia sin señal', 'Estratégia sem sinal'],
  ck_position: ['Position limit', '持仓超限', '部位超限', 'Límite de posición', 'Limite de posição'],
  ck_loss: ['Loss limit', '亏损超限', '虧損超限', 'Límite de pérdida', 'Limite de perda'],
  ck_disk: ['Disk low', '磁盘空间不足', '磁碟空間不足', 'Poco disco', 'Pouco disco'],
  feedDown: ['Disconnected', '已断开', '已斷線', 'Desconectado', 'Desligado'],
  perProduct: ['{p} {s}', '{p} {s}', '{p} {s}', '{p} {s}', '{p} {s}'],
  n_recorder: ['Market Recorder', 'Market Recorder', 'Market Recorder', 'Market Recorder', 'Market Recorder'],
  n_maker: ['Paper Market Maker', 'Paper Market Maker', 'Paper Market Maker', 'Paper Market Maker', 'Paper Market Maker'],
  n_risk: ['Risk Monitor', 'Risk Monitor', 'Risk Monitor', 'Risk Monitor', 'Risk Monitor'],
};

const tag = (navigator.language || 'en').toLowerCase();
const col = tag.startsWith('zh') ? (/tw|hk|mo|hant/.test(tag) ? 2 : 1)
  : tag.startsWith('es') ? 3 : tag.startsWith('pt') ? 4 : 0;

export const has = key => key in T;
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
