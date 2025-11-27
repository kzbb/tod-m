const { exec } = require('child_process');
const { promisify } = require('util');
const { getConfig } = require('./config');

const execAsync = promisify(exec);

/**
 * ffmpegの依存関係をチェック
 * @returns {Promise<Object>} チェック結果
 */
async function checkFfmpeg() {
  const config = getConfig();
  const ffmpegCmd = config.ffmpegPath || 'ffmpeg';
  const ffprobeCmd = config.ffprobePath || 'ffprobe';
  const result = {
    ffmpeg: false,
    ffprobe: false,
    ffmpegVersion: null,
    ffprobeVersion: null,
    message: ''
  };

  try {
    // ffmpegをチェック
    const ffmpegResult = await execAsync(`${ffmpegCmd} -version`);
    if (ffmpegResult.stdout) {
      result.ffmpeg = true;
      const versionMatch = ffmpegResult.stdout.match(/ffmpeg version ([^\s]+)/);
      if (versionMatch) {
        result.ffmpegVersion = versionMatch[1];
      }
    }
  } catch (error) {
    console.log('ffmpegが見つかりません');
  }

  try {
    // ffprobeをチェック
    const ffprobeResult = await execAsync(`${ffprobeCmd} -version`);
    if (ffprobeResult.stdout) {
      result.ffprobe = true;
      const versionMatch = ffprobeResult.stdout.match(/ffprobe version ([^\s]+)/);
      if (versionMatch) {
        result.ffprobeVersion = versionMatch[1];
      }
    }
  } catch (error) {
    console.log('ffprobeが見つかりません');
  }

  // メッセージを生成
  if (result.ffmpeg && result.ffprobe) {
    result.message = `ffmpeg ${result.ffmpegVersion} と ffprobe ${result.ffprobeVersion} が利用可能です。`;
  } else if (!result.ffmpeg && !result.ffprobe) {
    result.message = 'ffmpegとffprobeがインストールされていません。Homebrewを使用してインストールしてください: brew install ffmpeg';
  } else if (!result.ffmpeg) {
    result.message = 'ffmpegがインストールされていません。Homebrewを使用してインストールしてください: brew install ffmpeg';
  } else if (!result.ffprobe) {
    result.message = 'ffprobeがインストールされていません。Homebrewを使用してインストールしてください: brew install ffmpeg';
  }

  return result;
}

/**
 * Homebrewがインストールされているかチェック
 * @returns {Promise<boolean>}
 */
async function checkHomebrew() {
  try {
    await execAsync('brew --version');
    return true;
  } catch (error) {
    return false;
  }
}

module.exports = {
  checkFfmpeg,
  checkHomebrew
};
