// Every label, in five languages.
const T = {
  en: {
    title: 'Desk Week', paper: 'Paper only', range: '{a} to {b} · UTC days', updated: 'updated {t} UTC',
    lastData: 'The newest PnL is {age} old', weekPnl: 'Week PnL', fills: 'Fills', mk: 'Average markout',
    breaches: 'Risk breaches', stale: 'Stale-feed events', ofDays: '{a} of {b} days', allDays: '{b} days',
    day: 'Day', pnl: 'PnL', today: 'today', noData: 'No data', usd: 'USD', perBtc: 'USD per BTC, by size',
    emptyTitle: 'No desk data yet',
    emptyBody: 'This page fills in by itself once Paper Market Maker and Risk Monitor are running. Nothing to set up here.',
    partial: '* From the newest {n} fills only. A page can read the newest {limit} rows of a stream, so earlier fills are out of reach.',
    dash: '— means the number cannot be read from here.', dashTip: 'Out of reach: only the newest {limit} fills can be read',
    foot: 'Simulated fills only: this page reads, and sends no order. Markouts: the mid 1, 5 and 30 s after a fill, in the fill\'s favour.',
    glance: 'Week {pnl} USD · {n} breaches', min: 'min', h: 'h',
  },
  zh: {
    title: '交易台周报', paper: '仅模拟', range: '{a} 至 {b} · 按 UTC 日', updated: '更新于 {t} UTC',
    lastData: '最新盈亏数据已是 {age} 前', weekPnl: '本周盈亏', fills: '成交', mk: '平均成交后价差',
    breaches: '风控触发', stale: '行情停滞', ofDays: '{b} 天中的 {a} 天', allDays: '{b} 天',
    day: '日期', pnl: '盈亏', today: '今天', noData: '无数据', usd: 'USD', perBtc: '每 BTC 的 USD,按成交量加权',
    emptyTitle: '还没有交易台数据',
    emptyBody: '模拟做市和风控监控运行后,本页会自动显示。这里无需设置。',
    partial: '* 仅来自最新的 {n} 笔成交。页面只能读取数据流最新的 {limit} 行,更早的成交读不到。',
    dash: '— 表示此处读不到该数字。', dashTip: '读不到:只能读取最新的 {limit} 笔成交',
    foot: '全部为模拟成交:本页只读取,不发送任何订单。成交后价差:成交后 1、5、30 秒的中间价,对成交有利为正。',
    glance: '本周 {pnl} USD · {n} 次风控触发', min: '分钟', h: '小时',
  },
  'zh-hant': {
    title: '交易台週報', paper: '僅模擬', range: '{a} 至 {b} · 按 UTC 日', updated: '更新於 {t} UTC',
    lastData: '最新損益資料已是 {age} 前', weekPnl: '本週損益', fills: '成交', mk: '平均成交後價差',
    breaches: '風控觸發', stale: '行情停滯', ofDays: '{b} 天中的 {a} 天', allDays: '{b} 天',
    day: '日期', pnl: '損益', today: '今天', noData: '無資料', usd: 'USD', perBtc: '每 BTC 的 USD,按成交量加權',
    emptyTitle: '還沒有交易台資料',
    emptyBody: '模擬造市和風控監控運作後,本頁會自動顯示。這裡無需設定。',
    partial: '* 僅來自最新的 {n} 筆成交。頁面只能讀取資料流最新的 {limit} 列,更早的成交讀不到。',
    dash: '— 表示此處讀不到該數字。', dashTip: '讀不到:只能讀取最新的 {limit} 筆成交',
    foot: '全部為模擬成交:本頁只讀取,不送出任何訂單。成交後價差:成交後 1、5、30 秒的中間價,對成交有利為正。',
    glance: '本週 {pnl} USD · {n} 次風控觸發', min: '分鐘', h: '小時',
  },
  es: {
    title: 'Semana de la mesa', paper: 'Solo simulado', range: '{a} a {b} · días UTC', updated: 'actualizado {t} UTC',
    lastData: 'El último PnL tiene {age}', weekPnl: 'PnL de la semana', fills: 'Ejecuciones', mk: 'Markout medio',
    breaches: 'Límites superados', stale: 'Feed detenido', ofDays: '{a} de {b} días', allDays: '{b} días',
    day: 'Día', pnl: 'PnL', today: 'hoy', noData: 'Sin datos', usd: 'USD', perBtc: 'USD por BTC, por tamaño',
    emptyTitle: 'Aún no hay datos de la mesa',
    emptyBody: 'Esta página se llena sola cuando Paper Market Maker y Risk Monitor están en marcha. No hay nada que configurar aquí.',
    partial: '* Solo de las {n} ejecuciones más recientes. Una página lee las {limit} filas más nuevas de un flujo; las anteriores no se alcanzan.',
    dash: '— significa que el número no se puede leer desde aquí.', dashTip: 'Fuera de alcance: solo se leen las {limit} ejecuciones más recientes',
    foot: 'Solo ejecuciones simuladas: esta página lee y no envía ninguna orden. Markouts: el precio medio 1, 5 y 30 s después, a favor de la ejecución.',
    glance: 'Semana {pnl} USD · {n} límites superados', min: 'min', h: 'h',
  },
  pt: {
    title: 'Semana da mesa', paper: 'Só simulado', range: '{a} a {b} · dias UTC', updated: 'atualizado {t} UTC',
    lastData: 'O último PnL tem {age}', weekPnl: 'PnL da semana', fills: 'Execuções', mk: 'Markout médio',
    breaches: 'Limites violados', stale: 'Feed parado', ofDays: '{a} de {b} dias', allDays: '{b} dias',
    day: 'Dia', pnl: 'PnL', today: 'hoje', noData: 'Sem dados', usd: 'USD', perBtc: 'USD por BTC, por tamanho',
    emptyTitle: 'Ainda não há dados da mesa',
    emptyBody: 'Esta página preenche-se sozinha quando o Paper Market Maker e o Risk Monitor estão a correr. Nada a configurar aqui.',
    partial: '* Só das {n} execuções mais recentes. Uma página lê as {limit} linhas mais novas de um fluxo; as anteriores ficam fora de alcance.',
    dash: '— significa que o número não pode ser lido daqui.', dashTip: 'Fora de alcance: só se leem as {limit} execuções mais recentes',
    foot: 'Só execuções simuladas: esta página lê e não envia nenhuma ordem. Markouts: o preço médio 1, 5 e 30 s depois, a favor da execução.',
    glance: 'Semana {pnl} USD · {n} limites violados', min: 'min', h: 'h',
  },
};

function pick() {
  const k = window.kit;
  let l = (k && (typeof k.lang === 'function' ? k.lang() : k.lang)) || navigator.language || 'en';
  l = String(l).toLowerCase();
  if (/^zh[-_](hant|tw|hk|mo)/.test(l)) return 'zh-hant';
  return T[l] ? l : T[l.slice(0, 2)] ? l.slice(0, 2) : 'en';
}
export const lang = pick();
export const locale = { en: 'en-US', zh: 'zh-CN', 'zh-hant': 'zh-TW', es: 'es', pt: 'pt' }[lang];
export function t(key, vars) {
  let s = T[lang][key] ?? T.en[key] ?? key;
  for (const k in vars || {}) s = s.replaceAll('{' + k + '}', vars[k]);
  return s;
}
