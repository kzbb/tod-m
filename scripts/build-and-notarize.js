#!/usr/bin/env node

require('dotenv').config();
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 環境変数をチェック
const requiredEnvVars = ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID'];
const missing = requiredEnvVars.filter(v => !process.env[v]);

if (missing.length > 0) {
  console.error(`❌ .env に必要な環境変数がありません: ${missing.join(', ')}`);
  process.exit(1);
}

console.log('✅ 環境変数OK');

try {
  // 1. ビルド
  console.log('\n📦 ビルド中...');
  execSync('electron-builder --mac --publish=never', { stdio: 'inherit' });
  
  // 2. DMGファイルを探す (dist/ 直下)
  const distDir = 'dist';
  const files = fs.readdirSync(distDir);
  const dmgFile = files.find(f => f.endsWith('.dmg') && f.includes('arm64'));
  
  if (!dmgFile) {
    throw new Error('DMGファイルが見つかりません');
  }
  
  const dmgPath = path.join(distDir, dmgFile);
  console.log(`\n✅ ビルド完了: ${dmgPath}`);
  
  // 3. Notarize
  console.log('\n📤 Notarizing中... (数分かかります)');
  execSync(
    `xcrun notarytool submit "${dmgPath}" --apple-id "${process.env.APPLE_ID}" --password "${process.env.APPLE_APP_SPECIFIC_PASSWORD}" --team-id "${process.env.APPLE_TEAM_ID}" --wait`,
    { stdio: 'inherit' }
  );
  
  console.log(`\n✅ 完了！Gatekeeperで通るDMGができました。`);
  console.log(`   場所: ${dmgPath}`);
  
} catch (error) {
  console.error('❌ エラー:', error.message);
  process.exit(1);
}
