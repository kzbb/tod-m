const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const crypto = require('crypto');
const { checkSufficientSpace, checkDiskUsageWarning, formatBytes } = require('./disk-check');
const { getConfig } = require('./config');

const execAsync = promisify(exec);

/**
 * post-finishフック処理
 * @param {Object} upload - アップロード情報
 * @param {Object} config - 設定オブジェクト
 * @returns {Promise<void>}
 */
async function executePostFinish(upload, config) {
  const uploadId = upload.id;
  const uploadsDir = config.uploadsDir || path.join(require('os').homedir(), 'TOD-M-Files', 'uploads');
  const archiveDir = config.archiveDir || path.join(require('os').homedir(), 'TOD-M-Files', 'archive');
  
  const uploadedFile = path.join(uploadsDir, uploadId);
  const uploadedInfoFile = path.join(uploadsDir, uploadId + '.info');
  
  console.log(`[post-finish] 処理開始: ${uploadId}`);
  
  try {
    // ディスク容量チェック
    const uploadedFileStats = await fs.stat(uploadedFile);
    const fileSize = uploadedFileStats.size;
    
    // アーカイブディレクトリの空き容量をチェック
    const spaceCheck = await checkSufficientSpace(archiveDir, fileSize, 2); // 2GBの安全マージン
    if (!spaceCheck.sufficient) {
      const error = new Error(
        `ディスク容量不足: 必要=${formatBytes(spaceCheck.requiredWithMargin)}, ` +
        `利用可能=${formatBytes(spaceCheck.available)}`
      );
      console.error('[post-finish]', error.message);
      throw error;
    }
    
    // ディスク使用率の警告チェック
    const usageCheck = await checkDiskUsageWarning(archiveDir, 90);
    if (usageCheck.warning) {
      console.warn(
        `[post-finish] ディスク使用率が高くなっています: ${usageCheck.capacityPercent}%`
      );
    }
    
    // メタデータを取得
    const metadata = upload.metadata || {};
    console.log(`[post-finish] 受信メタデータ:`, JSON.stringify(metadata, null, 2));
    
    const filename = decodeBase64(metadata.filename || '');
    const displayname = decodeBase64(metadata.displayname || '');
    const studentId = decodeBase64(metadata.studentId || '');
    const name = decodeBase64(metadata.name || '');
    
    console.log(`[post-finish] デコード結果: filename="${filename}", displayname="${displayname}", studentId="${studentId}", name="${name}"`);
    
    // 安全なファイル名を生成（DCP naming convention: 作品タイトル_学籍番号_氏名）
    const ext = path.extname(filename);
    let safeFilename = buildDcpFilename(studentId, name, displayname) + ext;
    
    // ファイル名の重複をチェックして連番を付ける
    safeFilename = await getUniqueFilename(archiveDir, safeFilename);
    
    // アーカイブディレクトリにハードリンク
    const archivedFile = path.join(archiveDir, safeFilename);
    await createHardLink(uploadedFile, archivedFile);
    console.log(`[post-finish] ハードリンク作成: ${archivedFile}`);
    
    // ffprobeでメタデータ取得
    const videoMetadata = await getVideoMetadata(archivedFile);
    const hasMetadata = videoMetadata && Object.keys(videoMetadata).length > 0;
    
    if (hasMetadata) {
      console.log(`[post-finish] 動画メタデータ取得完了`);
    } else {
      console.warn(`[post-finish] 動画メタデータ取得スキップ（ffprobe未検出）`);
    }
    
    // メタデータをJSONファイルとして保存
    const metaFile = path.join(archiveDir, 'meta', `${uploadId}.json`);
    await fs.writeFile(metaFile, JSON.stringify(videoMetadata, null, 2));
    console.log(`[post-finish] メタデータ保存: ${metaFile}`);
    
    // SHA-256チェックサム計算
    const hash = await calculateSha256(archivedFile);
    console.log(`[post-finish] SHA-256: ${hash}`);
    
    // ハッシュをファイルに保存
    const hashFile = path.join(archiveDir, 'hash', `${uploadId}.sha256`);
    await fs.writeFile(hashFile, hash);
    
    // 形式チェック
    const formatCheck = checkFormat(videoMetadata, config.formatCheck || {});
    if (hasMetadata) {
      console.log(`[post-finish] 形式チェック: ${formatCheck.valid ? '合格' : '不合格'}`);
    } else {
      console.log(`[post-finish] 形式チェックスキップ（メタデータなし）`);
    }
    
    // 実際のファイルサイズを取得（videoMetadataに含まれない場合に備えて）
    const actualFileSize = videoMetadata.format?.size || fileSize;
    console.log(`[post-finish] ファイルサイズ: actualFileSize=${actualFileSize}, videoMetadata.format?.size=${videoMetadata.format?.size}, fileSize=${fileSize}`);
    
    // 受領票HTML生成
    const receiptHtml = generateReceiptHtml({
      receiptId: uploadId,
      filename: safeFilename,
      displayname,
      size: actualFileSize,
      hash,
      metadata: videoMetadata,
      formatCheck,
      timestamp: new Date().toISOString(),
      hasMetadata
    });
    
    const receiptFile = path.join(archiveDir, 'receipt', `${uploadId}.html`);
    await fs.writeFile(receiptFile, receiptHtml);
    console.log(`[post-finish] 受領票生成: ${receiptFile}`);
    
    // uploads.tsvに記録
    await appendToUploadsTsv(archiveDir, {
      id: uploadId,
      safeFilename,
      studentId,
      name,
      size: actualFileSize,
      path: archivedFile,
      finishedAt: new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
    });
    console.log(`[post-finish] uploads.tsvに記録`);
    
    console.log(`[post-finish] 処理完了: ${uploadId}`);
  } catch (error) {
    console.error(`[post-finish] エラー:`, error);
    throw error;
  }
}

/**
 * Base64デコード（TUSメタデータ形式）
 * @param {string} str - Base64エンコードされた文字列またはプレーンテキスト
 * @returns {string} デコードされた文字列
 */
function decodeBase64(str) {
  if (!str) return '';
  
  // @tus/serverは既にBase64デコード済みのメタデータを提供する
  // そのまま返す
  return str;
}

/**
 * ファイル名をサニタイズ
 * @param {string} filename - ファイル名
 * @returns {string} サニタイズされたファイル名
 */
/**
 * DCP naming conventionに準拠したファイル名を生成
 * 形式: 作品タイトル_学籍番号_氏名
 * 要素内のスペースはハイフン、区切りはアンダースコア
 * @param {string} studentId - 学籍番号
 * @param {string} name - 氏名
 * @param {string} title - 作品タイトル
 * @returns {string} DCP形式のファイル名
 */
function buildDcpFilename(studentId, name, title) {
  // 各要素を正規化：不正文字を削除、スペースをハイフンに
  const sanitize = (str) => {
    return str
      .replace(/[\/\\:*?"<>|]/g, '') // 不正文字削除
      .replace(/\s+/g, '-')            // スペース→ハイフン
      .replace(/_/g, '-')              // 既存のアンダースコアもハイフンに
      .trim();
  };
  
  const parts = [
    sanitize(title || 'untitled'),
    sanitize(studentId || 'unknown'),
    sanitize(name || 'unknown')
  ];
  
  // アンダースコアで連結、長すぎる場合は切り詰め
  return parts.join('_').substring(0, 200);
}

function sanitizeFilename(filename) {
  return filename
    .replace(/[\/\\:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 200);
}

/**
 * 重複しないファイル名を取得（連番付き）
 * @param {string} dirPath - ディレクトリパス
 * @param {string} filename - 元のファイル名
 * @returns {Promise<string>} 重複しないファイル名
 */
async function getUniqueFilename(dirPath, filename) {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  let testFilename = filename;
  let counter = 1;
  
  // ファイルが存在しなくなるまでループ
  while (true) {
    try {
      await fs.access(path.join(dirPath, testFilename));
      // ファイルが存在する場合は連番を付ける
      testFilename = `${base}_${counter}${ext}`;
      counter++;
    } catch (error) {
      // ファイルが存在しない場合は使用可能
      break;
    }
  }
  
  if (counter > 1) {
    console.log(`[post-finish] ファイル名重複のため連番付与: ${testFilename}`);
  }
  
  return testFilename;
}

/**
 * ハードリンクを作成
 * @param {string} source - ソースファイルパス
 * @param {string} target - ターゲットファイルパス
 */
async function createHardLink(source, target) {
  try {
    await fs.link(source, target);
  } catch (error) {
    // ハードリンクが失敗した場合はコピー
    console.warn('[post-finish] ハードリンク失敗、コピーします');
    await fs.copyFile(source, target);
  }
}

/**
 * ffprobeで動画メタデータを取得
 * @param {string} filePath - 動画ファイルパス
 * @returns {Promise<Object>} メタデータオブジェクト
 */
async function getVideoMetadata(filePath) {
  try {
    const config = getConfig();
    const ffprobeCmd = config.ffprobePath || 'ffprobe';
    
    const { stdout } = await execAsync(
      `${ffprobeCmd} -v quiet -print_format json -show_format -show_streams "${filePath}"`
    );
    return JSON.parse(stdout);
  } catch (error) {
    console.error('[post-finish] ffprobeエラー:', error);
    return {};
  }
}

/**
 * SHA-256チェックサムを計算
 * @param {string} filePath - ファイルパス
 * @returns {Promise<string>} SHA-256ハッシュ
 */
async function calculateSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = require('fs').createReadStream(filePath);
    
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * 動画形式をチェック
 * @param {Object} metadata - 動画メタデータ
 * @param {Object} requirements - 形式要件
 * @returns {Object} チェック結果
 */
function checkFormat(metadata, requirements) {
  const result = {
    valid: true,
    errors: [],
    warnings: []
  };
  
  if (!metadata.streams || metadata.streams.length === 0) {
    result.valid = false;
    result.errors.push('動画ストリームが見つかりません');
    return result;
  }
  
  const videoStream = metadata.streams.find(s => s.codec_type === 'video');
  const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
  
  if (!videoStream) {
    result.valid = false;
    result.errors.push('動画ストリームが見つかりません');
    return result;
  }
  
  // 解像度チェック
  if (requirements.resolution) {
    const [reqWidth, reqHeight] = requirements.resolution.split('x').map(Number);
    if (videoStream.width !== reqWidth || videoStream.height !== reqHeight) {
      result.warnings.push(
        `解像度が要件と異なります（要件: ${requirements.resolution}, 実際: ${videoStream.width}x${videoStream.height}）`
      );
    }
  }
  
  // コーデックチェック
  if (requirements.videoCodec) {
    const codec = videoStream.codec_name;
    if (requirements.videoCodec === 'ProRes') {
      if (!['prores', 'prores_ks', 'prores_aw'].includes(codec)) {
        result.warnings.push(
          `映像コーデックが要件と異なります（要件: ProRes, 実際: ${codec}）`
        );
      }
    }
  }
  
  // フレームレートチェック
  if (requirements.frameRates && videoStream.r_frame_rate) {
    const fps = eval(videoStream.r_frame_rate); // "24000/1001" などを計算
    const validFps = requirements.frameRates.some(reqFps => 
      Math.abs(fps - reqFps) < 0.1
    );
    if (!validFps) {
      result.warnings.push(
        `フレームレートが要件と異なります（要件: ${requirements.frameRates.join('/')}, 実際: ${fps.toFixed(2)}）`
      );
    }
  }
  
  // 音声コーデックチェック
  if (audioStream && requirements.audioCodec) {
    const audioCodec = audioStream.codec_name;
    if (requirements.audioCodec === 'PCM') {
      if (!audioCodec.startsWith('pcm_')) {
        result.warnings.push(
          `音声コーデックが要件と異なります（要件: PCM, 実際: ${audioCodec}）`
        );
      }
    }
  }
  
  // サンプルレートチェック
  if (audioStream && requirements.sampleRate) {
    const sampleRate = parseInt(audioStream.sample_rate);
    if (sampleRate !== requirements.sampleRate) {
      result.warnings.push(
        `サンプルレートが要件と異なります（要件: ${requirements.sampleRate}Hz, 実際: ${sampleRate}Hz）`
      );
    }
  }
  
  return result;
}

/**
 * 受領票HTMLを生成
 * @param {Object} data - 受領票データ
 * @returns {string} HTML文字列
 */
function generateReceiptHtml(data) {
  // ffmpeg未検出警告
  const ffmpegWarningHtml = !data.hasMetadata
    ? `<div class="warning">
        <strong>⚠ 注意</strong><br>
        ffmpegがインストールされていないため、動画メタデータの取得とフォーマットチェックが行われませんでした。
        アップロードは正常に完了していますが、詳細情報は「N/A」と表示されます。
       </div>`
    : '';
  
  const formatCheckHtml = data.formatCheck.errors.length > 0
    ? `<div class="error">
        <h3>形式エラー</h3>
        <ul>${data.formatCheck.errors.map(e => `<li>${e}</li>`).join('')}</ul>
       </div>`
    : '';
    
  const warningsHtml = data.formatCheck.warnings.length > 0
    ? `<div class="warning">
        <h3>形式に関する注意</h3>
        <ul>${data.formatCheck.warnings.map(w => `<li>${w}</li>`).join('')}</ul>
       </div>`
    : '';
  
  const videoStream = data.metadata.streams?.find(s => s.codec_type === 'video') || {};
  const audioStream = data.metadata.streams?.find(s => s.codec_type === 'audio') || {};
  
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>受領票 - ${data.receiptId}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      max-width: 800px;
      margin: 40px auto;
      padding: 20px;
      line-height: 1.6;
    }
    h1 { color: #333; border-bottom: 3px solid #007bff; padding-bottom: 10px; }
    h2 { color: #555; margin-top: 30px; }
    h3 { color: #666; margin-top: 20px; }
    .info-table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    .info-table th,
    .info-table td {
      border: 1px solid #ddd;
      padding: 12px;
      text-align: left;
    }
    .info-table th {
      background: #f5f5f5;
      font-weight: 600;
      width: 30%;
    }
    .info-table td {
      font-family: 'Courier New', monospace;
      word-break: break-all;
    }
    .error {
      background: #ffebee;
      border-left: 4px solid #f44336;
      padding: 15px;
      margin: 20px 0;
    }
    .warning {
      background: #fff3e0;
      border-left: 4px solid #ff9800;
      padding: 15px;
      margin: 20px 0;
    }
    .success {
      background: #e8f5e9;
      border-left: 4px solid #4caf50;
      padding: 15px;
      margin: 20px 0;
    }
    .hash {
      font-size: 11px;
      word-break: break-all;
    }
    @media print {
      body { margin: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <h1>動画ファイル受領票</h1>
  
  <div class="success">
    <strong>✓ アップロードが完了しました</strong><br>
    この受領票を保存または印刷して保管してください。
  </div>
  
  ${ffmpegWarningHtml}
  ${formatCheckHtml}
  ${warningsHtml}
  
  <h2>受付情報</h2>
  <table class="info-table">
    <tr>
      <th>受付ID</th>
      <td>${data.receiptId}</td>
    </tr>
    <tr>
      <th>受付日時</th>
      <td>${new Date(data.timestamp).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</td>
    </tr>
    <tr>
      <th>ファイル名</th>
      <td>${data.filename}</td>
    </tr>
    <tr>
      <th>ファイルサイズ</th>
      <td>${formatBytes(data.size)} (${data.size.toLocaleString()} bytes)</td>
    </tr>
  </table>
  
  <h2>ファイル完全性検証</h2>
  <table class="info-table">
    <tr>
      <th>SHA-256ハッシュ</th>
      <td class="hash">${data.hash}</td>
    </tr>
  </table>
  
  <h2>動画情報</h2>
  <h3>映像</h3>
  <table class="info-table">
    <tr>
      <th>コーデック</th>
      <td>${videoStream.codec_long_name || videoStream.codec_name || 'N/A'}</td>
    </tr>
    <tr>
      <th>解像度</th>
      <td>${videoStream.width || 'N/A'} x ${videoStream.height || 'N/A'}</td>
    </tr>
    <tr>
      <th>フレームレート</th>
      <td>${videoStream.r_frame_rate || 'N/A'}</td>
    </tr>
    <tr>
      <th>ビットレート</th>
      <td>${videoStream.bit_rate ? formatBitrate(videoStream.bit_rate) : 'N/A'}</td>
    </tr>
  </table>
  
  <h3>音声</h3>
  <table class="info-table">
    <tr>
      <th>コーデック</th>
      <td>${audioStream.codec_long_name || audioStream.codec_name || 'N/A'}</td>
    </tr>
    <tr>
      <th>サンプルレート</th>
      <td>${audioStream.sample_rate || 'N/A'} Hz</td>
    </tr>
    <tr>
      <th>チャンネル</th>
      <td>${audioStream.channels || 'N/A'}</td>
    </tr>
    <tr>
      <th>ビットレート</th>
      <td>${audioStream.bit_rate ? formatBitrate(audioStream.bit_rate) : 'N/A'}</td>
    </tr>
  </table>
  
  <div class="no-print" style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd;">
    <button onclick="window.print()" style="padding: 10px 20px; font-size: 14px; cursor: pointer;">
      この受領票を印刷
    </button>
  </div>
  
  <script>
    function formatBytes(bytes) {
      if (!bytes) return '0 B';
      const units = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(1024));
      return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + units[i];
    }
    
    function formatBitrate(bitrate) {
      if (!bitrate) return 'N/A';
      const kbps = bitrate / 1000;
      if (kbps >= 1000) {
        return (kbps / 1000).toFixed(2) + ' Mbps';
      }
      return kbps.toFixed(2) + ' kbps';
    }
  </script>
</body>
</html>`;
}

/**
 * ビットレートを人間が読みやすい形式に変換
 * @param {number} bitrate - ビットレート
 * @returns {string} フォーマットされた文字列
 */
function formatBitrate(bitrate) {
  if (!bitrate) return 'N/A';
  const kbps = bitrate / 1000;
  if (kbps >= 1000) {
    return (kbps / 1000).toFixed(2) + ' Mbps';
  }
  return kbps.toFixed(2) + ' kbps';
}

/**
 * uploads.tsvに記録を追加
 * @param {string} archiveDir - アーカイブディレクトリ
 * @param {Object} data - 記録データ
 */
async function appendToUploadsTsv(archiveDir, data) {
  const tsvFile = path.join(archiveDir, 'uploads.tsv');
  const line = `${data.id}\t${data.safeFilename}\t${data.studentId || ''}\t${data.name || ''}\t${data.size}\t${data.path}\t${data.finishedAt}\n`;
  
  try {
    await fs.appendFile(tsvFile, line);
  } catch (error) {
    console.error('[post-finish] uploads.tsv書き込みエラー:', error);
    throw error;
  }
}

module.exports = {
  executePostFinish
};
