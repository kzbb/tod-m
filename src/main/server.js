const express = require('express');
const path = require('path');
const fs = require('fs');
const { Server } = require('@tus/server');
const { FileStore } = require('@tus/file-store');
const { executePostFinish } = require('./post-finish');
const { checkSufficientSpace, formatBytes } = require('./disk-check');

/**
 * HTTPサーバーを起動
 * @param {Object} config - 設定オブジェクト
 * @returns {Promise<Object>} サーバーインスタンス
 */
function startHttpServer(config) {
  return new Promise((resolve, reject) => {
    const app = express();
    
    // CORSヘッダー設定（LAN内アクセス用）
    app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Upload-Offset, Upload-Length, Tus-Resumable, Upload-Metadata');
      res.header('Access-Control-Expose-Headers', 'Upload-Offset, Location, Upload-Length, Tus-Resumable');
      
      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }
      next();
    });
    
    // アップロード画面
    app.use('/uploader', express.static(path.join(__dirname, '../renderer/upload')));
    
    // 管理画面（localhostからのアクセスのみ許可）
    app.use('/admin', (req, res, next) => {
      const host = req.hostname || req.headers.host?.split(':')[0];
      
      // localhostまたは127.0.0.1からのアクセスのみ許可
      if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
        next();
      } else {
        res.status(403).send('管理画面へのアクセスは許可されていません。');
      }
    });
    app.use('/admin', express.static(path.join(__dirname, '../renderer/admin')));
    
    // アーカイブディレクトリ（受領票、メタデータなど）
    const archiveDir = config.archiveDir || path.join(require('os').homedir(), 'TOD-M-Files', 'archives');
    const uploadsDir = config.uploadsDir || path.join(require('os').homedir(), 'TOD-M-Files', 'uploads');
    
    ensureDirectoryExists(archiveDir);
    ensureDirectoryExists(uploadsDir);
    ensureDirectoryExists(path.join(archiveDir, 'receipt'));
    ensureDirectoryExists(path.join(archiveDir, 'meta'));
    ensureDirectoryExists(path.join(archiveDir, 'hash'));
    
    // uploads.tsvへのアクセス制限（localhostのみ）
    app.use('/uploader/data', (req, res, next) => {
      const host = req.hostname || req.headers.host?.split(':')[0];
      
      // uploads.tsvへのアクセスはlocalhostのみ許可
      if (req.path.includes('uploads.tsv')) {
        if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
          next();
        } else {
          res.status(403).send('このリソースへのアクセスは許可されていません。');
        }
      } else {
        next();
      }
    });
    app.use('/uploader/data', express.static(path.join(archiveDir)));
    
    // 受領票は誰でもアクセス可能（受付IDを知っている場合のみ）
    app.use('/uploader/receipt', express.static(path.join(archiveDir, 'receipt')));
    
    // ダウンロードページ
    const downloadDir = config.downloadDir || path.join(require('os').homedir(), 'TOD-M-Files', 'downloads');
    ensureDirectoryExists(downloadDir);
    
    app.get('/download', (req, res) => {
      res.sendFile(path.join(__dirname, '../renderer/download/index.html'));
    });
    
    app.get('/download/api/files', async (req, res) => {
      try {
        const files = await fs.promises.readdir(downloadDir, { withFileTypes: true });
        const fileList = await Promise.all(
          files
            .filter(file => file.isFile() && !file.name.startsWith('.'))
            .map(async file => {
              const filePath = path.join(downloadDir, file.name);
              const stats = await fs.promises.stat(filePath);
              return {
                name: file.name,
                size: stats.size,
                mtime: stats.mtime.toISOString()
              };
            })
        );
        
        // ファイル名でソート
        fileList.sort((a, b) => a.name.localeCompare(b.name));
        
        res.json({ files: fileList });
      } catch (error) {
        console.error('[download] ファイル一覧取得エラー:', error);
        res.status(500).json({ error: 'ファイル一覧の取得に失敗しました' });
      }
    });
    
    app.get('/download/files/:filename', (req, res) => {
      const filename = decodeURIComponent(req.params.filename);
      
      // ディレクトリトラバーサル防止
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return res.status(400).send('不正なファイル名です');
      }
      
      const filePath = path.join(downloadDir, filename);
      
      // ファイルが存在するかチェック
      if (!fs.existsSync(filePath)) {
        return res.status(404).send('ファイルが見つかりません');
      }
      
      // Content-Dispositionヘッダーを正しく設定してダウンロード
      const encodedFilename = encodeURIComponent(filename);
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFilename}`);
      res.sendFile(filePath, (err) => {
        if (err) {
          console.error('[download] ダウンロードエラー:', err);
          if (!res.headersSent) {
            res.status(500).send('ダウンロードに失敗しました');
          }
        }
      });
    });
    
    // TUSサーバーを統合（プロキシではなく直接統合）
    const fileStore = new FileStore({
      directory: uploadsDir
    });
    
    const tusServer = new Server({
      path: '/files',
      datastore: fileStore,
      respectForwardedHeaders: true,
      onUploadCreate: async (req, res, upload) => {
        // アップロード開始前にディスク容量をチェック
        const uploadLength = upload.size;
        if (uploadLength) {
          try {
            const spaceCheck = await checkSufficientSpace(uploadsDir, uploadLength, 5);
            if (!spaceCheck.sufficient) {
              const errorMsg = 
                `ディスク容量不足です。必要: ${formatBytes(spaceCheck.requiredWithMargin)}, ` +
                `利用可能: ${formatBytes(spaceCheck.available)}`;
              console.error('[TUS] アップロード拒否:', errorMsg);
              
              // TUSプロトコルのエラーレスポンス
              res.statusCode = 507; // Insufficient Storage
              res.setHeader('Content-Type', 'text/plain');
              res.end(errorMsg);
              return res;
            }
          } catch (error) {
            console.error('[TUS] ディスク容量チェックエラー:', error);
          }
        }
        
        return res;
      },
      onUploadFinish: async (req, res, upload) => {
        console.log('アップロード完了:', upload.id);
        
        // post-finishフックを実行
        try {
          await executePostFinish(upload, config);
          console.log('post-finishフック実行完了:', upload.id);
        } catch (error) {
          console.error('post-finishフック実行エラー:', error);
        }
        
        return res;
      }
    });
    
    // TUSサーバーのハンドラーをExpressに統合
    app.all('/files*', (req, res) => {
      tusServer.handle(req, res);
    });
    
    // ルートへのアクセス
    app.get('/', (req, res) => {
      res.redirect('/uploader/');
    });
    
    // ヘルスチェック
    app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });
    
    // サーバー起動
    const server = app.listen(config.httpPort, () => {
      console.log(`HTTPサーバーが起動しました: http://localhost:${config.httpPort}`);
      resolve({ server, app });
    });
    
    server.on('error', (error) => {
      console.error('HTTPサーバー起動エラー:', error);
      reject(error);
    });
  });
}

/**
 * HTTPサーバーを停止
 * @param {Object} serverInstance - サーバーインスタンス
 * @returns {Promise<void>}
 */
function stopHttpServer(serverInstance) {
  return new Promise((resolve, reject) => {
    if (!serverInstance || !serverInstance.server) {
      resolve();
      return;
    }
    
    serverInstance.server.close((error) => {
      if (error) {
        console.error('HTTPサーバー停止エラー:', error);
        reject(error);
      } else {
        console.log('HTTPサーバーを停止しました');
        resolve();
      }
    });
  });
}

/**
 * ディレクトリが存在しない場合は作成
 * @param {string} dirPath - ディレクトリパス
 */
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

module.exports = {
  startHttpServer,
  stopHttpServer
};
