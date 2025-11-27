const { contextBridge, ipcRenderer } = require('electron');

// レンダラープロセスに安全なAPIを公開
contextBridge.exposeInMainWorld('electronAPI', {
  // サーバー制御
  startServers: () => ipcRenderer.invoke('start-servers'),
  stopServers: () => ipcRenderer.invoke('stop-servers'),
  getServerStatus: () => ipcRenderer.invoke('get-server-status'),
  
  // 設定管理
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  resetConfig: () => ipcRenderer.invoke('reset-config'),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  openSettings: () => ipcRenderer.invoke('open-settings'),
  getDiskSpace: (dirPath) => ipcRenderer.invoke('get-disk-space', dirPath),
  
  // 外部ブラウザで開く
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  
  // ffmpegステータスの受信
  onFfmpegStatus: (callback) => {
    ipcRenderer.on('ffmpeg-status', (event, status) => callback(status));
  }
});
