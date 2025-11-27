const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');

const execAsync = promisify(exec);

/**
 * ディスクの空き容量をチェック
 * @param {string} dirPath - チェックするディレクトリパス
 * @returns {Promise<Object>} ディスク情報
 */
async function checkDiskSpace(dirPath) {
  try {
    // macOSのdfコマンドを使用
    const { stdout } = await execAsync(`df -k "${dirPath}"`);
    const lines = stdout.trim().split('\n');
    
    if (lines.length < 2) {
      throw new Error('df command output format error');
    }
    
    // 2行目がディスク情報
    const info = lines[1].split(/\s+/);
    
    // dfの出力: Filesystem 1K-blocks Used Available Capacity Mounted on
    const totalKB = parseInt(info[1]);
    const usedKB = parseInt(info[2]);
    const availableKB = parseInt(info[3]);
    const capacityPercent = parseInt(info[4]);
    
    return {
      total: totalKB * 1024, // バイトに変換
      used: usedKB * 1024,
      available: availableKB * 1024,
      capacityPercent: capacityPercent,
      path: dirPath
    };
  } catch (error) {
    console.error('[disk-check] ディスク容量チェックエラー:', error);
    // エラーが発生した場合は十分な容量があると仮定
    return {
      total: 0,
      used: 0,
      available: Number.MAX_SAFE_INTEGER,
      capacityPercent: 0,
      path: dirPath,
      error: error.message
    };
  }
}

/**
 * ファイルサイズに対して十分な空き容量があるかチェック
 * @param {string} dirPath - チェックするディレクトリパス
 * @param {number} requiredBytes - 必要なバイト数
 * @param {number} safetyMarginGB - 安全マージン（GB）デフォルト: 5GB
 * @returns {Promise<Object>} チェック結果
 */
async function checkSufficientSpace(dirPath, requiredBytes, safetyMarginGB = 5) {
  const diskInfo = await checkDiskSpace(dirPath);
  const safetyMarginBytes = safetyMarginGB * 1024 * 1024 * 1024;
  const requiredWithMargin = requiredBytes + safetyMarginBytes;
  
  const result = {
    sufficient: diskInfo.available >= requiredWithMargin,
    available: diskInfo.available,
    required: requiredBytes,
    safetyMargin: safetyMarginBytes,
    requiredWithMargin: requiredWithMargin,
    diskInfo: diskInfo
  };
  
  if (!result.sufficient) {
    console.warn(`[disk-check] ディスク容量不足: 必要=${formatBytes(requiredWithMargin)}, 利用可能=${formatBytes(diskInfo.available)}`);
  }
  
  return result;
}

/**
 * バイト数を人間が読みやすい形式に変換
 * @param {number} bytes - バイト数
 * @returns {string} フォーマットされた文字列
 */
function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + units[i];
}

/**
 * ディスク使用率が危険なレベルかチェック
 * @param {string} dirPath - チェックするディレクトリパス
 * @param {number} warningThreshold - 警告閾値（パーセント）デフォルト: 90%
 * @returns {Promise<Object>} チェック結果
 */
async function checkDiskUsageWarning(dirPath, warningThreshold = 90) {
  const diskInfo = await checkDiskSpace(dirPath);
  
  const result = {
    warning: diskInfo.capacityPercent >= warningThreshold,
    capacityPercent: diskInfo.capacityPercent,
    threshold: warningThreshold,
    diskInfo: diskInfo
  };
  
  if (result.warning) {
    console.warn(`[disk-check] ディスク使用率警告: ${diskInfo.capacityPercent}% (閾値: ${warningThreshold}%)`);
  }
  
  return result;
}

module.exports = {
  checkDiskSpace,
  checkSufficientSpace,
  checkDiskUsageWarning,
  formatBytes
};
