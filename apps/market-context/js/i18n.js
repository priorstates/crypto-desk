// Every label in five languages: English, 简体中文, 繁體中文, Español, Português.
const T = {
  title: ['Market Hours', '市场时段', '市場時段', 'Horas del mercado', 'Horas do mercado'],
  paper: ['Paper only', '仅限模拟', '僅限模擬', 'Solo simulación', 'Só simulação'],
  sub: ['Today {d} ({z}), hour by hour: the market around the desk, from Market Recorder',
    '今天 {d}（{z}），逐小时：交易台周围的市场，数据来自 Market Recorder',
    '今天 {d}（{z}），逐小時：交易台周圍的市場，資料來自 Market Recorder',
    'Hoy {d} ({z}), hora a hora: el mercado alrededor de la mesa, según Market Recorder',
    'Hoje {d} ({z}), hora a hora: o mercado à volta da mesa, segundo o Market Recorder'],
  local: ['local time', '本地时间', '本地時間', 'hora local', 'hora local'],
  pnl: ['Desk PnL', '交易台盈亏', '交易台損益', 'PnL de la mesa', 'PnL da mesa'],
  pnlUnit: ['USD per hour · paper', '美元/小时 · 模拟', '美元/小時 · 模擬', 'USD por hora · simulado', 'USD por hora · simulado'],
  spread: ['Average spread', '平均价差', '平均價差', 'Spread medio', 'Spread médio'],
  bps: ['bps of the mid', '中间价的基点', '中間價的基點', 'pb del precio medio', 'pb do preço médio'],
  usd: ['USD', '美元', '美元', 'USD', 'USD'],
  vol: ['Realized volatility', '已实现波动率', '已實現波動率', 'Volatilidad realizada', 'Volatilidade realizada'],
  volUnit: ['bps per hour', '基点/小时', '基點/小時', 'pb por hora', 'pb por hora'],
  rate: ['Trade rate', '成交频率', '成交頻率', 'Ritmo de operaciones', 'Ritmo de transações'],
  rateUnit: ['trades per minute', '笔/分钟', '筆/分鐘', 'operaciones por minuto', 'transações por minuto'],
  today: ['today', '今日', '今日', 'hoy', 'hoje'],
  high: ['high', '最高', '最高', 'máx.', 'máx.'],
  now: ['this hour', '本小时', '本小時', 'esta hora', 'esta hora'],
  noHour: ['no data for this hour', '该小时无数据', '該小時無資料', 'sin datos para esta hora', 'sem dados para esta hora'],
  partialTag: ['part of the hour', '仅部分时段', '僅部分時段', 'parte de la hora', 'parte da hora'],
  wild: ['wild', '剧烈', '劇烈', 'agitada', 'agitada'],
  quiet: ['quiet', '平静', '平靜', 'tranquila', 'calma'],
  legend: ['Each product is scaled to its own highest hour. Strong = well above the day\'s median, pale = well below, striped = only part of the hour seen, hatched = not seen.',
    '每个品种按自己当日最高的小时缩放。深色 = 明显高于当日中位数，浅色 = 明显低于，条纹 = 只看到该小时的一部分，斜线 = 未看到。',
    '每個商品按自己當日最高的小時縮放。深色 = 明顯高於當日中位數，淺色 = 明顯低於，條紋 = 只看到該小時的一部分，斜線 = 未看到。',
    'Cada producto se escala a su hora más alta. Intenso = muy por encima de la mediana del día, pálido = muy por debajo, rayado = solo se vio parte de la hora, tramado = no vista.',
    'Cada produto é escalado à sua hora mais alta. Forte = bem acima da mediana do dia, pálido = bem abaixo, riscado = só se viu parte da hora, tracejado = não vista.'],
  method: ['From the recorder\'s heartbeat, one quote every 5 s: spread and volatility are sampled at that pace; trades are counted exactly, from trade ids.',
    '来自记录器每 5 秒一次的心跳报价：价差和波动率按此频率采样；成交笔数按成交编号精确统计。',
    '來自記錄器每 5 秒一次的心跳報價：價差和波動率按此頻率取樣；成交筆數按成交編號精確統計。',
    'Del latido del grabador, una cotización cada 5 s: el spread y la volatilidad se muestrean a ese ritmo; las operaciones se cuentan exactamente, por sus identificadores.',
    'Do batimento do gravador, uma cotação a cada 5 s: o spread e a volatilidade são amostrados a esse ritmo; as transações são contadas exatamente, pelos seus identificadores.'],
  empty: ['No data from Market Recorder yet today. The charts fill in as it publishes.',
    'Market Recorder 今天还没有数据。它发布后图表会自动填充。', 'Market Recorder 今天還沒有資料。它發布後圖表會自動填入。',
    'Aún no hay datos de Market Recorder hoy. Los gráficos se llenan a medida que publica.',
    'Ainda não há dados do Market Recorder hoje. Os gráficos preenchem-se à medida que publica.'],
  noStream: ['Market Recorder publishes no "{n}" stream (it has: {s}), so there is nothing to chart yet.',
    'Market Recorder 没有发布“{n}”数据流（现有：{s}），暂时没有可绘制的数据。',
    'Market Recorder 沒有發布「{n}」資料流（現有：{s}），暫時沒有可繪製的資料。',
    'Market Recorder no publica el flujo "{n}" (tiene: {s}), así que aún no hay nada que mostrar.',
    'O Market Recorder não publica o fluxo "{n}" (tem: {s}), por isso ainda não há nada para mostrar.'],
  none: ['none', '无', '無', 'ninguno', 'nenhum'],
  readFail: ['Market Recorder\'s data could not be read: {e}', '无法读取 Market Recorder 的数据：{e}', '無法讀取 Market Recorder 的資料：{e}',
    'No se pudieron leer los datos de Market Recorder: {e}', 'Não foi possível ler os dados do Market Recorder: {e}'],
  stale: ['Market Recorder\'s last row is {s} old: the latest hour is not moving.',
    'Market Recorder 最新一行已是 {s} 前：最近一小时没有更新。', 'Market Recorder 最新一列已是 {s} 前：最近一小時沒有更新。',
    'La última fila de Market Recorder tiene {s}: la hora actual no avanza.',
    'A última linha do Market Recorder tem {s}: a hora atual não avança.'],
  reach: ['Hours before {h} were out of reach: a page gets only a stream\'s newest {n} rows (about 8 hours). Hours seen from now on are kept.',
    '{h} 之前的小时无法读取：页面只能拿到数据流最新的 {n} 行（约 8 小时）。此后看到的小时会被保留。',
    '{h} 之前的小時無法讀取：頁面只能拿到資料流最新的 {n} 列（約 8 小時）。此後看到的小時會被保留。',
    'Las horas anteriores a las {h} quedaron fuera de alcance: una página solo recibe las {n} filas más recientes de un flujo (unas 8 horas). Las horas vistas desde ahora se conservan.',
    'As horas anteriores às {h} ficaram fora de alcance: uma página só recebe as {n} linhas mais recentes de um fluxo (cerca de 8 horas). As horas vistas a partir de agora ficam guardadas.'],
  noPnl: ['no PnL published today', '今天没有发布盈亏', '今天沒有發布損益', 'sin PnL publicado hoy', 'sem PnL publicado hoje'],
  pnlWait: ['reading the desk\'s PnL…', '正在读取交易台盈亏…', '正在讀取交易台損益…', 'leyendo el PnL de la mesa…', 'a ler o PnL da mesa…'],
  pnlFail: ['the desk\'s PnL could not be read; trying again', '无法读取交易台盈亏；正在重试', '無法讀取交易台損益；正在重試',
    'no se pudo leer el PnL de la mesa; reintentando', 'não foi possível ler o PnL da mesa; a tentar de novo'],
  live: ['live · {s} ago', '实时 · {s} 前', '即時 · {s} 前', 'en vivo · hace {s}', 'ao vivo · há {s}'],
  sample: ['Made-up data, for checking the page', '虚构数据，仅用于检查页面', '虛構資料，僅用於檢查頁面',
    'Datos inventados, para revisar la página', 'Dados inventados, para verificar a página'],
  glance: ['BTC-USD this hour: vol {v} bps/h · {r} trades/min', 'BTC-USD 本小时：波动 {v} 基点/时 · {r} 笔/分',
    'BTC-USD 本小時：波動 {v} 基點/時 · {r} 筆/分', 'BTC-USD esta hora: vol {v} pb/h · {r} op./min', 'BTC-USD esta hora: vol {v} pb/h · {r} trans./min'],
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
