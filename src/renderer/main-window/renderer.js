// DOM要素
const statusIndicator = document.getElementById('statusIndicator');
const serverStatus = document.getElementById('serverStatus');
const httpPortRow = document.getElementById('httpPortRow');
const tusPortRow = document.getElementById('tusPortRow');
const ipAddressRow = document.getElementById('ipAddressRow');
const httpPort = document.getElementById('httpPort');
const tusPort = document.getElementById('tusPort');
const ipAddress = document.getElementById('ipAddress');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const accessSection = document.getElementById('accessSection');
const accessUrl = document.getElementById('accessUrl');
const openUploadBtn = document.getElementById('openUploadBtn');
const openAdminBtn = document.getElementById('openAdminBtn');
const logContainer = document.getElementById('logContainer');
const ffmpegAlert = document.getElementById('ffmpegAlert');
const configHttpPort = document.getElementById('configHttpPort');
const configTusPort = document.getElementById('configTusPort');
const configArchiveDir = document.getElementById('configArchiveDir');
const diskSpaceRow = document.getElementById('diskSpaceRow');
const diskSpace = document.getElementById('diskSpace');

let isServerRunning = false;
let currentConfig = {};

// 初期化
async function init() {
  // 設定を取得
  currentConfig = await window.electronAPI.getConfig();
  updateConfigDisplay();
  
  // サーバーステータスを取得
  const status = await window.electronAPI.getServerStatus();
  updateServerStatus(status.running);
  
  // ffmpegステータスを受信
  window.electronAPI.onFfmpegStatus((status) => {
    if (!status.ffmpeg || !status.ffprobe) {
      let message = status.message;
      if (!status.ffmpeg && !status.ffprobe) {
        message += ' アップロードは可能ですが、動画メタデータ取得とフォーマットチェックが行われません。';
      } else if (!status.ffprobe) {
        message += ' 動画メタデータ取得が行われません。';
      }
      ffmpegAlert.textContent = message;
      ffmpegAlert.className = 'alert alert-warning';
      ffmpegAlert.classList.remove('hidden');
    } else {
      ffmpegAlert.textContent = status.message;
      ffmpegAlert.className = 'alert alert-success';
      ffmpegAlert.classList.remove('hidden');
    }
  });
}

// 設定表示を更新
async function updateConfigDisplay() {
  configHttpPort.textContent = currentConfig.httpPort;
  configTusPort.textContent = currentConfig.tusPort;
  configArchiveDir.textContent = currentConfig.archiveDir;
  
  // ディスク容量を取得して表示
  if (currentConfig.archiveDir) {
    try {
      const diskInfo = await window.electronAPI.getDiskSpace(currentConfig.archiveDir);
      if (!diskInfo.error) {
        const availableGB = (diskInfo.available / (1024 * 1024 * 1024)).toFixed(2);
        const totalGB = (diskInfo.total / (1024 * 1024 * 1024)).toFixed(2);
        diskSpace.textContent = `${availableGB} GB / ${totalGB} GB (${diskInfo.capacityPercent}% 使用中)`;
        
        // 使用率が90%以上の場合は警告色で表示
        if (diskInfo.capacityPercent >= 90) {
          diskSpace.style.color = '#f44336';
          diskSpace.style.fontWeight = 'bold';
        } else {
          diskSpace.style.color = '#333';
          diskSpace.style.fontWeight = 'normal';
        }
        
        diskSpaceRow.classList.remove('hidden');
      }
    } catch (error) {
      console.error('ディスク容量取得エラー:', error);
    }
  }
}

// サーバーステータス表示を更新
function updateServerStatus(running, info = {}) {
  isServerRunning = running;
  
  if (running) {
    statusIndicator.className = 'status-indicator running';
    serverStatus.textContent = '起動中';
    startBtn.disabled = true;
    stopBtn.disabled = false;
    
    // ポートとIPアドレスを表示
    if (info.httpPort) {
      httpPort.textContent = info.httpPort;
      httpPortRow.classList.remove('hidden');
    }
    if (info.tusPort) {
      tusPort.textContent = info.tusPort;
      tusPortRow.classList.remove('hidden');
    }
    if (info.ipAddress) {
      ipAddress.textContent = info.ipAddress;
      ipAddressRow.classList.remove('hidden');
      
      // アクセスURLを表示
      const url = `http://${info.ipAddress}:${info.httpPort}`;
      accessUrl.textContent = url;
      accessSection.classList.remove('hidden');
    }
  } else {
    statusIndicator.className = 'status-indicator stopped';
    serverStatus.textContent = '停止中';
    startBtn.disabled = false;
    stopBtn.disabled = true;
    
    // 詳細情報を非表示
    httpPortRow.classList.add('hidden');
    tusPortRow.classList.add('hidden');
    ipAddressRow.classList.add('hidden');
    accessSection.classList.add('hidden');
  }
}

// ログを追加
function addLog(message, type = 'info') {
  const now = new Date().toLocaleTimeString('ja-JP');
  const logEntry = document.createElement('div');
  logEntry.className = 'log-entry';
  logEntry.innerHTML = `<span class="log-time">[${now}]</span> ${message}`;
  logContainer.appendChild(logEntry);
  logContainer.scrollTop = logContainer.scrollHeight;
}

// サーバー起動
startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  addLog('サーバーを起動しています...');
  
  const result = await window.electronAPI.startServers();
  
  if (result.success) {
    updateServerStatus(true, result);
    addLog(`サーバーが起動しました (HTTP: ${result.httpPort}, TUS: ${result.tusPort})`);
  } else {
    addLog(`サーバー起動エラー: ${result.error}`, 'error');
    startBtn.disabled = false;
  }
});

// サーバー停止
stopBtn.addEventListener('click', async () => {
  stopBtn.disabled = true;
  addLog('サーバーを停止しています...');
  
  const result = await window.electronAPI.stopServers();
  
  if (result.success) {
    updateServerStatus(false);
    addLog('サーバーを停止しました');
  } else {
    addLog(`サーバー停止エラー: ${result.error}`, 'error');
    stopBtn.disabled = false;
  }
});

// アップロード画面を開く
openUploadBtn.addEventListener('click', async () => {
  const url = accessUrl.textContent;
  await window.electronAPI.openExternal(url);
  addLog('アップロード画面を開きました');
});

// ダウンロード画面を開く
const openDownloadBtn = document.getElementById('openDownloadBtn');
openDownloadBtn.addEventListener('click', async () => {
  const urlParts = accessUrl.textContent.split(':');
  const port = urlParts[urlParts.length - 1] || '3000';
  const url = `http://localhost:${port}/download`;
  await window.electronAPI.openExternal(url);
  addLog('ダウンロード画面を開きました');
});

// 管理画面を開く
openAdminBtn.addEventListener('click', async () => {
  // 管理画面はlocalhostでアクセス（セキュリティのため）
  // accessUrl.textContent は "http://192.168.x.x:3000" のような形式
  const urlParts = accessUrl.textContent.split(':');
  const port = urlParts[urlParts.length - 1] || '3000'; // 最後の部分がポート番号
  const url = `http://localhost:${port}/admin`;
  await window.electronAPI.openExternal(url);
  addLog('管理画面を開きました');
});

// 設定画面を開く
const openSettingsBtn = document.getElementById('openSettingsBtn');
openSettingsBtn.addEventListener('click', async () => {
  await window.electronAPI.openSettings();
  addLog('設定画面を開きました');
});

// 初期化実行
init();
