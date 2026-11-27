// Every label in five languages: English, 简体中文, 繁體中文, Español, Português.
const T = {
  title: ['Fill Log', '成交记录', '成交紀錄', 'Registro de ejecuciones', 'Registo de execuções'],
  paper: ['Paper only', '仅限模拟', '僅限模擬', 'Solo simulación', 'Só simulação'],
  today: ['Today', '今天', '今天', 'Hoy', 'Hoje'],
  week: ['Last {n} days', '最近 {n} 天', '最近 {n} 天', 'Últimos {n} días', 'Últimos {n} dias'],
  period: ['Period', '时段', '時段', 'Periodo', 'Período'],
  side: ['Side', '方向', '方向', 'Lado', 'Lado'],
  all: ['All', '全部', '全部', 'Todas', 'Todas'],
  buys: ['Buys', '买入', '買入', 'Compras', 'Compras'],
  sells: ['Sells', '卖出', '賣出', 'Ventas', 'Vendas'],
  buy: ['Buy', '买入', '買入', 'Compra', 'Compra'],
  sell: ['Sell', '卖出', '賣出', 'Venta', 'Venda'],
  export: ['Export CSV', '导出 CSV', '匯出 CSV', 'Exportar CSV', 'Exportar CSV'],
  tFills: ['Fills', '成交笔数', '成交筆數', 'Ejecuciones', 'Execuções'],
  tBought: ['Bought', '买入量', '買入量', 'Comprado', 'Comprado'],
  tSold: ['Sold', '卖出量', '賣出量', 'Vendido', 'Vendido'],
  tVolume: ['Volume', '成交额', '成交額', 'Volumen', 'Volume'],
  tPnl: ['Realised PnL', '已实现盈亏', '已實現損益', 'PnL realizado', 'PnL realizado'],
  split: ['{b} buys · {s} sells', '买入 {b} · 卖出 {s}', '買入 {b} · 賣出 {s}', '{b} compras · {s} ventas', '{b} compras · {s} vendas'],
  avg: ['avg price {p}', '均价 {p}', '均價 {p}', 'precio medio {p}', 'preço médio {p}'],
  pnlSub: ['realised by these fills', '由这些成交实现', '由這些成交實現', 'realizado por estas ejecuciones', 'realizado por estas execuções'],
  cTime: ['Time (UTC)', '时间 (UTC)', '時間 (UTC)', 'Hora (UTC)', 'Hora (UTC)'],
  cPrice: ['Price', '价格', '價格', 'Precio', 'Preço'],
  cSize: ['Size', '数量', '數量', 'Tamaño', 'Tamanho'],
  cWhy: ['Why it filled', '成交原因', '成交原因', 'Por qué se ejecutó', 'Porque foi executada'],
  bid: ['bid', '买价', '買價', 'bid', 'bid'],
  ask: ['ask', '卖价', '賣價', 'ask', 'ask'],
  whyThrough: ['A trade of {s} BTC at {p} went through our {q}', '一笔 {s} BTC、价格 {p} 的成交穿过了我们的{q}',
    '一筆 {s} BTC、價格 {p} 的成交穿過了我們的{q}', 'Una operación de {s} BTC a {p} atravesó nuestro {q}',
    'Um negócio de {s} BTC a {p} atravessou o nosso {q}'],
  whyThroughBare: ['A trade went through our {q}', '有成交穿过了我们的{q}', '有成交穿過了我們的{q}',
    'Una operación atravesó nuestro {q}', 'Um negócio atravessou o nosso {q}'],
  whyFlatten: ['Stop: position closed at the market\'s {q}', '停止：按市场{q}平仓', '停止：按市場{q}平倉',
    'Parada: posición cerrada al {q} del mercado', 'Paragem: posição fechada ao {q} do mercado'],
  by_loss: ['day loss limit', '当日亏损限额', '當日虧損限額', 'límite de pérdida diaria', 'limite de perda diária'],
  by_risk: ['Risk Monitor', 'Risk Monitor', 'Risk Monitor', 'Risk Monitor', 'Risk Monitor'],
  by_person: ['Stop button', '停止按钮', '停止按鈕', 'botón Parar', 'botão Parar'],
  count: ['{n} fills', '{n} 笔成交', '{n} 筆成交', '{n} ejecuciones', '{n} execuções'],
  showing: ['Showing the newest {a} of {n}', '显示最新 {a} 笔，共 {n} 笔', '顯示最新 {a} 筆，共 {n} 筆',
    'Se muestran las {a} más recientes de {n}', 'A mostrar as {a} mais recentes de {n}'],
  more: ['Show more', '显示更多', '顯示更多', 'Mostrar más', 'Mostrar mais'],
  coverFull: ['Totals: every fill of {p}', '合计：{p}的全部成交', '合計：{p}的全部成交',
    'Totales: todas las ejecuciones de {p}', 'Totais: todas as execuções de {p}'],
  coverPart: ['The list and totals start at {t} UTC. Studio gives a page only a stream\'s newest {n} rows, so earlier fills of this period are not here.',
    '列表和合计从 {t} UTC 开始。Studio 只向页面提供数据流最新的 {n} 行，因此本时段更早的成交不在此处。',
    '列表和合計從 {t} UTC 開始。Studio 只向頁面提供資料流最新的 {n} 列，因此本時段更早的成交不在此處。',
    'La lista y los totales empiezan a las {t} UTC. Studio solo da a una página las {n} filas más recientes, así que las ejecuciones anteriores de este periodo no están aquí.',
    'A lista e os totais começam às {t} UTC. O Studio só dá a uma página as {n} linhas mais recentes, por isso as execuções anteriores deste período não estão aqui.'],
  makerCount: ['The maker counts {n} fills today in all.', '做市程序统计今天共 {n} 笔成交。', '造市程式統計今天共 {n} 筆成交。',
    'El maker cuenta {n} ejecuciones hoy en total.', 'O maker conta {n} execuções hoje no total.'],
  eLoading: ['Reading the fills…', '正在读取成交…', '正在讀取成交…', 'Leyendo las ejecuciones…', 'A ler as execuções…'],
  eMissing: ['No fills yet. The Paper Market Maker has not published any; they show here by themselves once it runs.',
    '暂无成交。Paper Market Maker 还没有发布成交；它运行后会自动显示在这里。', '尚無成交。Paper Market Maker 還沒有發布成交；它執行後會自動顯示在這裡。',
    'Aún no hay ejecuciones. Paper Market Maker no ha publicado ninguna; aparecerán aquí solas cuando funcione.',
    'Ainda sem execuções. O Paper Market Maker não publicou nenhuma; aparecem aqui sozinhas quando estiver a funcionar.'],
  eError: ['The desk\'s data can\'t be read right now. The page tries again by itself.', '暂时无法读取交易台数据，页面会自动重试。',
    '暫時無法讀取交易台資料，頁面會自動重試。', 'Ahora no se pueden leer los datos de la mesa. La página lo reintenta sola.',
    'Não é possível ler os dados da mesa agora. A página tenta de novo sozinha.'],
  eNone: ['No fills in this period yet.', '本时段暂无成交。', '本時段尚無成交。', 'Aún no hay ejecuciones en este periodo.', 'Ainda sem execuções neste período.'],
  eSide: ['No fills on this side in this period.', '本时段该方向没有成交。', '本時段該方向沒有成交。',
    'No hay ejecuciones de este lado en este periodo.', 'Sem execuções deste lado neste período.'],
  saved: ['Exported {n} fills', '已导出 {n} 笔成交', '已匯出 {n} 筆成交', '{n} ejecuciones exportadas', '{n} execuções exportadas'],
  glance: ['{n} fills today', '今日 {n} 笔成交', '今日 {n} 筆成交', '{n} ejecuciones hoy', '{n} execuções hoje'],
  foot: ['This page only reads the Paper Market Maker\'s simulated fills. Nothing here sends an order. Days and times are UTC.',
    '本页只读取 Paper Market Maker 的模拟成交，不会发送任何订单。日期和时间按 UTC 计。',
    '本頁只讀取 Paper Market Maker 的模擬成交，不會送出任何訂單。日期和時間以 UTC 計。',
    'Esta página solo lee las ejecuciones simuladas de Paper Market Maker. Nada aquí envía una orden. Días y horas en UTC.',
    'Esta página só lê as execuções simuladas do Paper Market Maker. Nada aqui envia uma ordem. Dias e horas em UTC.'],
};

const tag = (navigator.language || 'en').toLowerCase();
const col = tag.startsWith('zh') ? (/tw|hk|mo|hant/.test(tag) ? 2 : 1)
  : tag.startsWith('es') ? 3 : tag.startsWith('pt') ? 4 : 0;

export function t(key, vars = {}) {
  let s = (T[key] || [key])[col] || (T[key] || [key])[0];
  for (const k in vars) s = s.replace('{' + k + '}', vars[k]);
  return s;
}

export function applyLabels(vars = {}) {
  document.documentElement.lang = ['en', 'zh-Hans', 'zh-Hant', 'es', 'pt'][col];
  document.title = t('title');
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t, vars);
}
