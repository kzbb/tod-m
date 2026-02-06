const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { startHttpServer, stopHttpServer } = require('./server');
const { getConfig, saveConfig, resetConfig } = require('./config');
const { checkFfmpeg } = require('./ffmpeg-check');
const { checkDiskSpace } = require('./disk-check');

let mainWindow = null;
let httpServerInstance = null;

// パッケージ版でもffmpeg/ffprobeを見つけやすくするためPATHを拡張
(() => {
  const commonPaths = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'];
  const currentPath = process.env.PATH || '';
  const set = new Set(currentPath.split(':').filter(Boolean));
  for (const p of commonPaths) {
    if (!set.has(p)) set.add(p);
  }
  process.env.PATH = Array.from(set).join(':');
})();

// メインウィンドウの作成
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    title: 'TOD-M - Server Control'
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/main-window/index.html'));

  // 開発モードではDevToolsを開く
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// アプリケーション起動時
app.whenReady().then(async () => {
  // ffmpegの依存関係チェック
  const ffmpegStatus = await checkFfmpeg();
  
  createMainWindow();

  // ffmpegチェック結果をウィンドウに送信
  if (mainWindow) {
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.send('ffmpeg-status', ffmpegStatus);
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

// すべてのウィンドウが閉じられたとき
app.on('window-all-closed', () => {
  // macOS以外ではアプリケーションを終了
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// アプリケーション終了前
app.on('before-quit', async () => {
  // サーバーを停止
  await stopAllServers();
});

// サーバー起動のIPCハンドラー
ipcMain.handle('start-servers', async () => {
  try {
    const config = getConfig();
    
    // HTTPサーバーを起動（TUSサーバーは統合済み）
    httpServerInstance = await startHttpServer(config);
    
    return {
      success: true,
      httpPort: config.httpPort,
      ipAddress: getLocalIpAddress()
    };
  } catch (error) {
    console.error('サーバー起動エラー:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// サーバー停止のIPCハンドラー
ipcMain.handle('stop-servers', async () => {
  try {
    await stopAllServers();
    return { success: true };
  } catch (error) {
    console.error('サーバー停止エラー:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// サーバーステータス取得
ipcMain.handle('get-server-status', () => {
  return {
    running: !!httpServerInstance
  };
});

// 設定取得
ipcMain.handle('get-config', () => {
  return getConfig();
});

// 設定保存
ipcMain.handle('save-config', (event, newConfig) => {
  try {
    if (newConfig.archiveDir) {
      newConfig.uploadsDir = path.join(newConfig.archiveDir, 'incoming');
    }
    saveConfig(newConfig);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 設定リセット
ipcMain.handle('reset-config', () => {
  resetConfig();
  return { success: true };
});

// ディレクトリ選択ダイアログ
ipcMain.handle('select-directory', async () => {
  return await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory']
  });
});


// ディスク容量取得
ipcMain.handle('get-disk-space', async (event, dirPath) => {
  try {
    return await checkDiskSpace(dirPath);
  } catch (error) {
    console.error('ディスク容量取得エラー:', error);
    return { error: error.message };
  }
});

// 外部ブラウザで開く
ipcMain.handle('open-external', async (event, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    console.error('外部ブラウザ起動エラー:', error);
    return { success: false, error: error.message };
  }
});

// すべてのサーバーを停止する関数
async function stopAllServers() {
  if (httpServerInstance) {
    await stopHttpServer(httpServerInstance);
    httpServerInstance = null;
  }
  console.log('すべてのサーバーを停止しました');
}

// ローカルIPアドレスを取得
function getLocalIpAddress() {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // IPv4かつ内部アドレスでない場合
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  
  return 'localhost';
}
