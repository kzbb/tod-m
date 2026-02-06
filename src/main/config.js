const Store = require('electron-store');
const path = require('path');
const os = require('os');

const defaultArchiveDir = path.join(os.homedir(), 'TOD-M-Files', 'archive');
const store = new Store({
  name: 'tod-m-config',
  defaults: {
    httpPort: 3000,
    tusPort: 1080,
    archiveDir: defaultArchiveDir,
    uploadsDir: path.join(defaultArchiveDir, 'incoming'),
    downloadDir: path.join(os.homedir(), 'TOD-M-Files', 'downloads'),
    ffmpegPath: '',
    ffprobePath: '',
    allowNonVideoFiles: false,
    formatCheck: {
      container: 'QuickTime/MOV',
      videoCodec: 'ProRes',
      resolution: '1920x1080',
      frameRates: [23.98, 24, 29.97, 30],
      audioCodec: 'PCM',
      sampleRate: 48000
    }
  }
});

/**
 * 設定を取得
 * @returns {Object} 設定オブジェクト
 */
function getConfig() {
  return store.store;
}

/**
 * 設定を保存
 * @param {Object} config - 保存する設定オブジェクト
 */
function saveConfig(config) {
  store.set(config);
}

/**
 * 特定の設定項目を取得
 * @param {string} key - 設定キー
 * @param {*} defaultValue - デフォルト値
 * @returns {*} 設定値
 */
function getConfigValue(key, defaultValue) {
  return store.get(key, defaultValue);
}

/**
 * 特定の設定項目を保存
 * @param {string} key - 設定キー
 * @param {*} value - 設定値
 */
function setConfigValue(key, value) {
  store.set(key, value);
}

/**
 * 設定をリセット
 */
function resetConfig() {
  store.clear();
}

module.exports = {
  getConfig,
  saveConfig,
  getConfigValue,
  setConfigValue,
  resetConfig
};
