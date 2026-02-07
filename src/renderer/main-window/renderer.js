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
const httpPortInput = document.getElementById('httpPort');
const tusPortInput = document.getElementById('tusPort');
const archiveDirInput = document.getElementById('archiveDir');
const downloadDirInput = document.getElementById('downloadDir');
const selectArchiveDirBtn = document.getElementById('selectArchiveDir');
const selectDownloadDirBtn = document.getElementById('selectDownloadDir');
const ffmpegPathInput = document.getElementById('ffmpegPath');
const ffprobePathInput = document.getElementById('ffprobePath');
const containerInput = document.getElementById('container');
const videoCodecInput = document.getElementById('videoCodec');
const resolutionInput = document.getElementById('resolution');
const frameRatesInput = document.getElementById('frameRates');
const audioCodecInput = document.getElementById('audioCodec');
const sampleRateInput = document.getElementById('sampleRate');
const allowNonVideoFilesInput = document.getElementById('allowNonVideoFiles');
const saveBtn = document.getElementById('saveBtn');
const resetBtn = document.getElementById('resetBtn');
const alertSuccess = document.getElementById('alertSuccess');
const alertWarning = document.getElementById('alertWarning');

let isServerRunning = false;
let currentConfig = {};

// 初期化
async function init() {
  // 設定を取得
  currentConfig = await window.electronAPI.getConfig();
  updateConfigDisplay();
  loadSettingsForm(currentConfig);
  
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

  if (!currentConfig.archiveDir) {
    diskSpaceRow.classList.add('hidden');
    diskSpace.textContent = '-';
    return;
  }
  
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

// 設定フォームを読み込む
function loadSettingsForm(config) {
  httpPortInput.value = config.httpPort || 3000;
  tusPortInput.value = config.tusPort || 1080;
  archiveDirInput.value = config.archiveDir || '';
  downloadDirInput.value = config.downloadDir || '';
  ffmpegPathInput.value = config.ffmpegPath || '';
  ffprobePathInput.value = config.ffprobePath || '';
  allowNonVideoFilesInput.checked = config.allowNonVideoFiles || false;

  const formatCheck = config.formatCheck || {};
  containerInput.value = formatCheck.container || '';
  videoCodecInput.value = formatCheck.videoCodec || '';
  resolutionInput.value = formatCheck.resolution || '';
  audioCodecInput.value = formatCheck.audioCodec || '';
  sampleRateInput.value = formatCheck.sampleRate || 0;

  const frameRates = formatCheck.frameRates || [];
  frameRatesInput.value = frameRates.length > 0 ? frameRates.join(', ') : '';

  // フォーム読み込み後にフィールドの有効/無効を更新
  updateFormatCheckFieldsAvailability();
}

// 設定フォームの有効/無効を切り替え
function updateSettingsAvailability(running) {
  isServerRunning = running;
  const disabled = running;

  httpPortInput.disabled = disabled;
  tusPortInput.disabled = disabled;
  archiveDirInput.disabled = disabled;
  downloadDirInput.disabled = disabled;
  selectArchiveDirBtn.disabled = disabled;
  selectDownloadDirBtn.disabled = disabled;
  ffmpegPathInput.disabled = disabled;
  ffprobePathInput.disabled = disabled;
  
  // 形式要件フィールドは個別に制御（allowNonVideoFilesの状態を考慮）
  if (!disabled) {
    // サーバー停止時のみ、allowNonVideoFilesの状態に応じて設定
    updateFormatCheckFieldsAvailability();
  } else {
    // サーバー起動中はすべて無効
    containerInput.disabled = disabled;
    videoCodecInput.disabled = disabled;
    resolutionInput.disabled = disabled;
    frameRatesInput.disabled = disabled;
    audioCodecInput.disabled = disabled;
    sampleRateInput.disabled = disabled;
  }
  
  allowNonVideoFilesInput.disabled = disabled;
  saveBtn.disabled = disabled;
  resetBtn.disabled = disabled;

  if (running) {
    alertWarning.classList.remove('hidden');
  } else {
    alertWarning.classList.add('hidden');
  }
}

// サーバーステータス表示を更新
function updateServerStatus(running, info = {}) {
  isServerRunning = running;
  updateSettingsAvailability(running);
  
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
  const baseUrl = accessUrl.textContent.split('/')[0] + '//' + accessUrl.textContent.split('//')[1].split('/')[0];
  const url = `${baseUrl}/download`;
  await window.electronAPI.openExternal(url);
  addLog('ダウンロード画面を開きました');
});

// 管理画面を開く
openAdminBtn.addEventListener('click', async () => {
  const urlParts = accessUrl.textContent.split(':');
  const port = urlParts[urlParts.length - 1] || '3000';
  const url = `http://localhost:${port}/admin`;
  await window.electronAPI.openExternal(url);
  addLog('管理画面を開きました');
});

// ディレクトリ選択（archiveDir）
selectArchiveDirBtn.addEventListener('click', async () => {
  const result = await window.electronAPI.selectDirectory();
  if (result && !result.canceled && result.filePaths.length > 0) {
    archiveDirInput.value = result.filePaths[0];
  }
});

// ディレクトリ選択（downloadDir）
selectDownloadDirBtn.addEventListener('click', async () => {
  const result = await window.electronAPI.selectDirectory();
  if (result && !result.canceled && result.filePaths.length > 0) {
    downloadDirInput.value = result.filePaths[0];
  }
});

// 設定を保存
saveBtn.addEventListener('click', async () => {
  if (isServerRunning) {
    alert('サーバー起動中は設定を変更できません。');
    return;
  }

  const httpPort = parseInt(httpPortInput.value);
  const tusPort = parseInt(tusPortInput.value);

  if (httpPort < 1024 || httpPort > 65535) {
    alert('HTTPポート番号は1024〜65535の範囲で指定してください。');
    return;
  }

  if (tusPort < 1024 || tusPort > 65535) {
    alert('TUSポート番号は1024〜65535の範囲で指定してください。');
    return;
  }

  if (httpPort === tusPort) {
    alert('HTTPポートとTUSポートは異なる番号を指定してください。');
    return;
  }

  let frameRates = null;
  if (frameRatesInput.value.trim()) {
    frameRates = frameRatesInput.value
      .split(',')
      .map((fps) => parseFloat(fps.trim()))
      .filter((fps) => !isNaN(fps) && fps > 0);

    if (frameRates.length === 0) {
      alert('有効なフレームレートを入力してください（例: 23.98, 24, 29.97, 30）');
      return;
    }
  }

  const newConfig = {
    httpPort,
    tusPort,
    uploadsDir: deriveUploadsDir(archiveDirInput.value),
    archiveDir: archiveDirInput.value,
    downloadDir: downloadDirInput.value,
    ffmpegPath: ffmpegPathInput.value.trim(),
    ffprobePath: ffprobePathInput.value.trim(),
    allowNonVideoFiles: allowNonVideoFilesInput.checked,
    formatCheck: {
      container: containerInput.value || null,
      videoCodec: videoCodecInput.value || null,
      resolution: resolutionInput.value || null,
      frameRates: frameRates,
      audioCodec: audioCodecInput.value || null,
      sampleRate: parseInt(sampleRateInput.value) || null
    }
  };

  saveBtn.disabled = true;
  const result = await window.electronAPI.saveConfig(newConfig);
  saveBtn.disabled = false;

  if (result.success) {
    currentConfig = newConfig;
    updateConfigDisplay();
    alertSuccess.classList.remove('hidden');
    setTimeout(() => {
      alertSuccess.classList.add('hidden');
    }, 5000);
    addLog('設定を保存しました');
  } else {
    alert('設定の保存に失敗しました: ' + result.error);
  }
});

function deriveUploadsDir(archiveDir) {
  const normalized = (archiveDir || '').replace(/\/$/, '');
  return normalized ? `${normalized}/incoming` : '';
}

// デフォルトに戻す
resetBtn.addEventListener('click', async () => {
  if (isServerRunning) {
    alert('サーバー起動中は設定を変更できません。');
    return;
  }

  if (!confirm('設定をデフォルト値に戻しますか?')) {
    return;
  }

  resetBtn.disabled = true;
  await window.electronAPI.resetConfig();
  currentConfig = await window.electronAPI.getConfig();
  loadSettingsForm(currentConfig);
  updateConfigDisplay();
  resetBtn.disabled = false;

  alertSuccess.textContent = '設定をデフォルト値に戻しました。';
  alertSuccess.classList.remove('hidden');
  setTimeout(() => {
    alertSuccess.classList.add('hidden');
    alertSuccess.textContent = '設定を保存しました。';
  }, 3000);
  addLog('設定をデフォルト値に戻しました');
});

// 形式要件フィールドの有効/無効を切り替え
function updateFormatCheckFieldsAvailability() {
  const isAllowingNonVideo = allowNonVideoFilesInput.checked;
  const formatFields = [
    containerInput,
    videoCodecInput,
    resolutionInput,
    frameRatesInput,
    audioCodecInput,
    sampleRateInput
  ];
  
  formatFields.forEach(field => {
    field.disabled = isAllowingNonVideo;
  });
}

// 動画以外ファイル許可チェックボックスのリスナー
allowNonVideoFilesInput.addEventListener('change', () => {
  updateFormatCheckFieldsAvailability();
});

// 初期化実行
init();
