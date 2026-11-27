// Every label in five languages.
const T = {
  title: ['Market Recorder', '行情记录器', '行情記錄器', 'Grabador de mercado', 'Gravador de mercado'],
  sub: ['Public market data from Coinbase, recorded on the server. It never sends orders.',
    '在服务器上记录 Coinbase 的公开行情数据。绝不发送订单。',
    '在伺服器上記錄 Coinbase 的公開行情資料。絕不送出訂單。',
    'Datos públicos de mercado de Coinbase, grabados en el servidor. Nunca envía órdenes.',
    'Dados públicos de mercado da Coinbase, gravados no servidor. Nunca envia ordens.'],
  disk: ['Disk', '磁盘', '磁碟', 'Disco', 'Disco'],
  used: ['used by recordings', '录制数据已用', '錄製資料已用', 'usado por las grabaciones', 'usado pelas gravações'],
  cap: ['size cap', '容量上限', '容量上限', 'límite de tamaño', 'limite de tamanho'],
  free: ['free on the disk', '磁盘剩余', '磁碟剩餘', 'libre en el disco', 'livre no disco'],
  diskNote: ['{dir} · {days} days kept, oldest {oldest}', '{dir} · 保留 {days} 天，最早 {oldest}', '{dir} · 保留 {days} 天，最早 {oldest}',
    '{dir} · {days} días guardados, el más antiguo {oldest}', '{dir} · {days} dias guardados, o mais antigo {oldest}'],
  gaps: ['Gaps', '缺口', '缺口', 'Huecos', 'Lacunas'],
  noGaps: ['No gaps recorded yet.', '还没有缺口记录。', '還沒有缺口記錄。', 'Aún no hay huecos registrados.', 'Ainda não há lacunas registadas.'],
  product: ['Product', '品种', '商品', 'Producto', 'Produto'],
  start: ['Start (UTC)', '开始 (UTC)', '開始 (UTC)', 'Inicio (UTC)', 'Início (UTC)'],
  length: ['Length', '时长', '時長', 'Duración', 'Duração'],
  reason: ['Reason', '原因', '原因', 'Motivo', 'Motivo'],
  missed: ['Trades missed', '漏掉的成交', '漏掉的成交', 'Operaciones perdidas', 'Negócios perdidos'],
  settings: ['Settings', '设置', '設定', 'Ajustes', 'Definições'],
  sProducts: ['Products', '品种', '商品', 'Productos', 'Produtos'],
  sFolder: ['Data folder', '数据文件夹', '資料夾', 'Carpeta de datos', 'Pasta de dados'],
  sCap: ['Size cap (GB)', '容量上限 (GB)', '容量上限 (GB)', 'Límite de tamaño (GB)', 'Limite de tamanho (GB)'],
  sKeep: ['Keep days', '保留天数', '保留天數', 'Días que se guardan', 'Dias a guardar'],
  sFree: ['Keep free on disk (GB)', '磁盘保留空间 (GB)', '磁碟保留空間 (GB)', 'Dejar libre en disco (GB)', 'Manter livre no disco (GB)'],
  save: ['Save', '保存', '儲存', 'Guardar', 'Guardar'],
  settingsNote: ['The recorder picks up a change within a minute, without a restart. The oldest days are removed first; today is never removed.',
    '记录器会在一分钟内应用更改，无需重启。最早的日期先被删除；今天的数据不会被删除。',
    '記錄器會在一分鐘內套用變更，不需重新啟動。最早的日期先被刪除；今天的資料不會被刪除。',
    'El grabador aplica el cambio en un minuto, sin reiniciar. Se borran primero los días más antiguos; hoy nunca se borra.',
    'O gravador aplica a alteração num minuto, sem reiniciar. Os dias mais antigos são removidos primeiro; hoje nunca é removido.'],
  saved: ['Settings saved', '设置已保存', '設定已儲存', 'Ajustes guardados', 'Definições guardadas'],
  saveFailed: ['Could not save: {e}. Deploy the recorder first (open Build and ask for it), then change settings here or on the Services page.',
    '无法保存：{e}。请先部署记录器（打开“构建”提出即可），然后在这里或“服务”页面更改设置。',
    '無法儲存：{e}。請先部署記錄器（開啟「構建」提出即可），然後在這裡或「服務」頁面變更設定。',
    'No se pudo guardar: {e}. Despliega primero el grabador (abre Crear y pídelo) y cambia los ajustes aquí o en la página Servicios.',
    'Não foi possível guardar: {e}. Implante primeiro o gravador (abra Criar e peça) e altere as definições aqui ou na página Serviços.'],
  noData: ['Nothing from the recorder yet. To start it, open Build and say: “Deploy this as a service on trade1” (or name your own server). It then shows under Services, and this page fills in a few seconds after it starts.',
    '还没有收到记录器的数据。要启动它，请打开“构建”并说：“把它作为服务部署到 trade1”（或写你自己的服务器）。之后它会出现在“服务”中，启动几秒后此页会显示数据。',
    '還沒有收到記錄器的資料。要啟動它，請開啟「構建」並說：「把它作為服務部署到 trade1」（或寫你自己的伺服器）。之後它會出現在「服務」中，啟動幾秒後此頁會顯示資料。',
    'Aún no hay nada del grabador. Para iniciarlo, abre Crear y di: “Despliega esto como servicio en trade1” (o nombra tu propio servidor). Luego aparece en Servicios y esta página se llena unos segundos después de arrancar.',
    'Ainda não há nada do gravador. Para iniciá-lo, abra Criar e diga: “Implante isto como serviço em trade1” (ou indique o seu próprio servidor). Depois ele aparece em Serviços e esta página se preenche alguns segundos após o início.'],
  stale: ['No heartbeat from the recorder for {s}. The numbers below are the last ones it sent.',
    '已有 {s} 没有收到记录器的心跳。下面是它最后发送的数据。', '已有 {s} 沒有收到記錄器的心跳。下面是它最後送出的資料。',
    'Sin señal del grabador desde hace {s}. Los números de abajo son los últimos que envió.',
    'Sem sinal do gravador há {s}. Os números abaixo são os últimos que enviou.'],
  down: ['Not connected to the exchange: {e}', '未连接到交易所：{e}', '未連線到交易所：{e}', 'Sin conexión con el exchange: {e}', 'Sem ligação à exchange: {e}'],
  paused: ['Files are not being written: {e}', '文件未在写入：{e}', '檔案未在寫入：{e}', 'No se están escribiendo archivos: {e}', 'Os ficheiros não estão a ser escritos: {e}'],
  feedAge: ['feed age {s}', '行情延迟 {s}', '行情延遲 {s}', 'antigüedad {s}', 'idade {s}'],
  bid: ['Best bid', '最优买价', '最佳買價', 'Mejor compra', 'Melhor compra'],
  ask: ['Best ask', '最优卖价', '最佳賣價', 'Mejor venta', 'Melhor venda'],
  lastQuote: ['Last quote', '最新报价', '最新報價', 'Última cotización', 'Última cotação'],
  lastTrade: ['Last trade', '最新成交', '最新成交', 'Última operación', 'Último negócio'],
  spread: ['Spread', '价差', '價差', 'Diferencial', 'Spread'],
  rate: ['Messages per minute', '每分钟消息数', '每分鐘訊息數', 'Mensajes por minuto', 'Mensagens por minuto'],
  gapsToday: ['Gaps today', '今日缺口', '今日缺口', 'Huecos hoy', 'Lacunas hoje'],
  filesToday: ['Files today', '今日文件', '今日檔案', 'Archivos de hoy', 'Ficheiros de hoje'],
  filesVal: ['quotes {q} · trades {t}', '报价 {q} · 成交 {t}', '報價 {q} · 成交 {t}', 'cotizaciones {q} · operaciones {t}', 'cotações {q} · negócios {t}'],
  takerBuy: ['buy', '买入', '買入', 'compra', 'compra'],
  takerSell: ['sell', '卖出', '賣出', 'venta', 'venda'],
  ago: ['{s} ago', '{s}前', '{s}前', 'hace {s}', 'há {s}'],
  gapOpen: ['Gap open since {s}: {e}', '缺口自 {s} 起未恢复：{e}', '缺口自 {s} 起未恢復：{e}', 'Hueco abierto desde {s}: {e}', 'Lacuna aberta desde {s}: {e}'],
};

const tag = (navigator.language || 'en').toLowerCase();
const col = tag.startsWith('zh') ? (/tw|hk|mo|hant/.test(tag) ? 2 : 1)
  : tag.startsWith('es') ? 3 : tag.startsWith('pt') ? 4 : 0;

export function t(key, vars = {}) {
  let s = (T[key] || [key])[col] || T[key][0];
  for (const k in vars) s = s.replace('{' + k + '}', vars[k]);
  return s;
}

export function applyLabels() {
  document.documentElement.lang = ['en', 'zh-Hans', 'zh-Hant', 'es', 'pt'][col];
  document.title = t('title');
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
}
