// Every label in five languages: English, 简体中文, 繁體中文, Español, Português.
const T = {
  title: ['Desk Status', '交易台状态', '交易台狀態', 'Estado de la mesa', 'Estado da mesa'],
  allRunning: ['All running', '全部运行中', '全部運行中', 'Todo en marcha', 'Tudo a funcionar'],
  need1: ['1 needs attention', '1 项需要处理', '1 項需要處理', '1 necesita atención', '1 precisa de atenção'],
  needN: ['{n} need attention', '{n} 项需要处理', '{n} 項需要處理', '{n} necesitan atención', '{n} precisam de atenção'],
  waiting: ['Waiting for data', '等待数据', '等待資料', 'Esperando datos', 'À espera de dados'],
  sub: ['Paper only. This page only reads: nothing here sends an order or stops a service.',
    '仅限模拟。本页只读取数据：不会发送订单，也不会停止服务。',
    '僅限模擬。本頁只讀取資料：不會送出訂單，也不會停止服務。',
    'Solo simulación. Esta página solo lee: nada aquí envía una orden ni detiene un servicio.',
    'Só simulação. Esta página só lê: nada aqui envia uma ordem nem para um serviço.'],
  subWait: ['No service has reported yet. Rows fill in by themselves when their data arrives.',
    '还没有服务上报。数据到达后各行会自动更新。', '還沒有服務回報。資料到達後各列會自動更新。',
    'Ningún servicio ha informado aún. Las filas se completan solas cuando llegan los datos.',
    'Nenhum serviço reportou ainda. As linhas preenchem-se sozinhas quando os dados chegam.'],
  colService: ['Service', '服务', '服務', 'Servicio', 'Serviço'],
  colHealth: ['Health', '状态', '狀態', 'Estado', 'Estado'],
  colRunning: ['Running for', '已运行', '已運行', 'En marcha', 'A funcionar há'],
  colRestarts: ['Restarts', '重启次数', '重啟次數', 'Reinicios', 'Reinícios'],
  colBeat: ['Last heartbeat', '最近心跳', '最近心跳', 'Último latido', 'Último sinal'],
  open: ['Open', '打开', '開啟', 'Abrir', 'Abrir'],
  ago: ['{s} ago', '{s}前', '{s}前', 'hace {s}', 'há {s}'],
  notReported: ['This service does not report it', '该服务未上报此项', '該服務未回報此項',
    'Este servicio no lo informa', 'Este serviço não o reporta'],
  restartsTip: ['Starts in its event log (30 days), less the first', '事件日志（30 天）中的启动次数减一',
    '事件記錄（30 天）中的啟動次數減一', 'Arranques en su registro de eventos (30 días), menos el primero',
    'Arranques no registo de eventos (30 dias), menos o primeiro'],
  foot: ['A dash means the service does not report that number in its data.', '短横线表示该服务的数据中没有这一项。',
    '短橫線表示該服務的資料中沒有這一項。', 'Un guion significa que el servicio no informa ese dato.',
    'Um traço significa que o serviço não reporta esse dado.'],
  running: ['Running', '运行中', '運行中', 'En marcha', 'A funcionar'],
  noData: ['No data yet', '暂无数据', '尚無資料', 'Sin datos aún', 'Sem dados ainda'],
  noDataNote: ['Its "{s}" stream has no rows. Is the service deployed?', '数据流“{s}”没有记录。服务部署了吗？',
    '資料流「{s}」沒有記錄。服務部署了嗎？', 'Su flujo "{s}" no tiene filas. ¿Está desplegado el servicio?',
    'O fluxo "{s}" não tem linhas. O serviço está implementado?'],
  noApp: ['Not on this computer', '此电脑上没有该应用', '這台電腦上沒有此應用', 'No está en este ordenador', 'Não está neste computador'],
  stale: ['No heartbeat for {s}', '{s}没有心跳', '{s}沒有心跳', 'Sin latido desde hace {s}', 'Sem sinal há {s}'],
  error: ['Error', '错误', '錯誤', 'Error', 'Erro'],
  feedDown: ['Feed disconnected', '行情已断开', '行情已中斷', 'Flujo desconectado', 'Fluxo desligado'],
  filesPaused: ['Recording to files paused', '文件记录已暂停', '檔案記錄已暫停', 'Grabación en archivos en pausa', 'Gravação em ficheiros em pausa'],
  gapOpen: ['Gap open on {s}', '{s} 出现数据缺口', '{s} 出現資料缺口', 'Hueco abierto en {s}', 'Falha aberta em {s}'],
  stopped: ['Stopped', '已停止', '已停止', 'Detenido', 'Parado'],
  stoppedBy: ['Stopped ({s})', '已停止（{s}）', '已停止（{s}）', 'Detenido ({s})', 'Parado ({s})'],
  by_loss: ['loss limit', '亏损限额', '虧損限額', 'límite de pérdida', 'limite de perda'],
  by_risk: ['Risk Monitor', 'Risk Monitor', 'Risk Monitor', 'Risk Monitor', 'Risk Monitor'],
  by_person: ['Stop button', '停止按钮', '停止按鈕', 'botón Detener', 'botão Parar'],
  paused: ['Paused', '已暂停', '已暫停', 'En pausa', 'Em pausa'],
  breach: ['Limit breached: {s}', '越限：{s}', '越限：{s}', 'Límite superado: {s}', 'Limite ultrapassado: {s}'],
  stopOn: ['Stop is on', '停止信号已开启', '停止訊號已開啟', 'Parada activa', 'Paragem ativa'],
  failing: ['A send is failing', '有消息发送失败', '有訊息傳送失敗', 'Un envío está fallando', 'Um envio está a falhar'],
  quoting: ['quoting', '报价中', '報價中', 'cotizando', 'a cotar'],
  position: ['position {s} BTC', '持仓 {s} BTC', '持倉 {s} BTC', 'posición {s} BTC', 'posição {s} BTC'],
  day: ['day {s} USD', '当日 {s} USD', '當日 {s} USD', 'día {s} USD', 'dia {s} USD'],
  allClear: ['all clear', '一切正常', '一切正常', 'sin incidencias', 'tudo em ordem'],
  perMin: ['{p} {n}/min', '{p} {n}/分钟', '{p} {n}/分鐘', '{p} {n}/min', '{p} {n}/min'],
  lastDaily: ['last daily {s}', '上次日报 {s}', '上次日報 {s}', 'último diario {s}', 'último diário {s}'],
  next: ['next {s} UTC', '下次 {s} UTC', '下次 {s} UTC', 'próximo {s} UTC', 'próximo {s} UTC'],
  waitingN: ['{n} waiting to send', '{n} 条待发送', '{n} 則待傳送', '{n} por enviar', '{n} por enviar'],
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
