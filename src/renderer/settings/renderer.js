// DOM要素
const httpPortInput = document.getElementById('httpPort');
const tusPortInput = document.getElementById('tusPort');
const uploadsDirInput = document.getElementById('uploadsDir');
const archiveDirInput = document.getElementById('archiveDir');
const downloadDirInput = document.getElementById('downloadDir');
const selectUploadsDirBtn = document.getElementById('selectUploadsDir');
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
const saveBtn = document.getElementById('saveBtn');
const resetBtn = document.getElementById('resetBtn');
const alertSuccess = document.getElementById('alertSuccess');
const alertWarning = document.getElementById('alertWarning');

let currentConfig = {};
let serverRunning = false;

// 初期化
async function init() {
  // 設定を取得
  currentConfig = await window.electronAPI.getConfig();
  loadConfig(currentConfig);
  
  // サーバーステータスを取得
  const status = await window.electronAPI.getServerStatus();
  serverRunning = status.running;
  
  if (serverRunning) {
    alertWarning.classList.remove('hidden');
    disableAllInputs();
  }
}

// 設定を読み込んでフォームに表示
function loadConfig(config) {
  httpPortInput.value = config.httpPort || 3000;
  tusPortInput.value = config.tusPort || 1080;
  uploadsDirInput.value = config.uploadsDir || '';
  archiveDirInput.value = config.archiveDir || '';
  downloadDirInput.value = config.downloadDir || '';
  ffmpegPathInput.value = config.ffmpegPath || '';
  ffprobePathInput.value = config.ffprobePath || '';
  
  // 形式チェック設定
  const formatCheck = config.formatCheck || {};
  containerInput.value = formatCheck.container || '';
  videoCodecInput.value = formatCheck.videoCodec || '';
  resolutionInput.value = formatCheck.resolution || '';
  audioCodecInput.value = formatCheck.audioCodec || '';
  sampleRateInput.value = formatCheck.sampleRate || 0;
  
  // フレームレート（配列をカンマ区切り文字列に変換）
  const frameRates = formatCheck.frameRates || [];
  frameRatesInput.value = frameRates.length > 0 ? frameRates.join(', ') : '';
}

// すべての入力を無効化
function disableAllInputs() {
  httpPortInput.disabled = true;
  tusPortInput.disabled = true;
  selectUploadsDirBtn.disabled = true;
  selectArchiveDirBtn.disabled = true;
  containerInput.disabled = true;
  videoCodecInput.disabled = true;
  resolutionInput.disabled = true;
  frameRatesInput.disabled = true;
  audioCodecInput.disabled = true;
  sampleRateInput.disabled = true;
  saveBtn.disabled = true;
  resetBtn.disabled = true;
}

// ディレクトリ選択（uploadsDir）
selectUploadsDirBtn.addEventListener('click', async () => {
  const result = await window.electronAPI.selectDirectory();
  if (result && !result.canceled && result.filePaths.length > 0) {
    uploadsDirInput.value = result.filePaths[0];
  }
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
  if (serverRunning) {
    alert('サーバー起動中は設定を変更できません。');
    return;
  }
  
  // 入力値を検証
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
  
  // フレームレートをパース（カンマ区切り文字列を配列に変換）
  let frameRates = null;
  if (frameRatesInput.value.trim()) {
    frameRates = frameRatesInput.value
      .split(',')
      .map(fps => parseFloat(fps.trim()))
      .filter(fps => !isNaN(fps) && fps > 0);
    
    if (frameRates.length === 0) {
      alert('有効なフレームレートを入力してください（例: 23.98, 24, 29.97, 30）');
      return;
    }
  }
  
  // 新しい設定を作成
  const newConfig = {
    httpPort,
    tusPort,
    uploadsDir: uploadsDirInput.value,
    archiveDir: archiveDirInput.value,
    downloadDir: downloadDirInput.value,
    ffmpegPath: ffmpegPathInput.value.trim(),
    ffprobePath: ffprobePathInput.value.trim(),
    formatCheck: {
      container: containerInput.value || null,
      videoCodec: videoCodecInput.value || null,
      resolution: resolutionInput.value || null,
      frameRates: frameRates,
      audioCodec: audioCodecInput.value || null,
      sampleRate: parseInt(sampleRateInput.value) || null
    }
  };
  
  // 設定を保存
  saveBtn.disabled = true;
  const result = await window.electronAPI.saveConfig(newConfig);
  saveBtn.disabled = false;
  
  if (result.success) {
    alertSuccess.classList.remove('hidden');
    setTimeout(() => {
      alertSuccess.classList.add('hidden');
    }, 5000);
  } else {
    alert('設定の保存に失敗しました: ' + result.error);
  }
});

// デフォルトに戻す
resetBtn.addEventListener('click', async () => {
  if (serverRunning) {
    alert('サーバー起動中は設定を変更できません。');
    return;
  }
  
  if (!confirm('設定をデフォルト値に戻しますか?')) {
    return;
  }
  
  resetBtn.disabled = true;
  await window.electronAPI.resetConfig();
  currentConfig = await window.electronAPI.getConfig();
  loadConfig(currentConfig);
  resetBtn.disabled = false;
  
  alertSuccess.textContent = '設定をデフォルト値に戻しました。';
  alertSuccess.classList.remove('hidden');
  setTimeout(() => {
    alertSuccess.classList.add('hidden');
    alertSuccess.textContent = '設定を保存しました。変更を反映するにはサーバーを再起動してください。';
  }, 3000);
});

// 初期化実行
init();
