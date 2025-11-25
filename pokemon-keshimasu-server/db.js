// keshimasu-server/db.js
const { Pool } = require('pg');
const { URL } = require('url'); // URLを解析するために追加

// 環境変数から接続情報を取得
const connectionString = process.env.DATABASE_URL;

// =========================================================
// ★★★ デバッグログの追加 ★★★
// =========================================================
console.log('--- DB接続デバッグ情報 ---');
if (!connectionString) {
    console.error('⚠️ エラー: DATABASE_URLが設定されていません。');
} else {
    try {
        const parsedUrl = new URL(connectionString);
        const passwordLength = parsedUrl.password ? parsedUrl.password.length : 0;
        
        // パスワードを直接表示せず、長さと存在のみ確認
        console.log(`✅ DATABASE_URLは読み込まれています。（長さ: ${connectionString.length}）`);
        console.log(`🔑 パスワードの存在: ${parsedUrl.password ? 'あり' : 'なし'}`);
        console.log(`🔑 パスワードの長さ: ${passwordLength}`);
        
        if (passwordLength === 0 && connectionString.includes('@')) {
            console.error('❌ 警告: 接続文字列にパスワードがない、または正しく解析されていません。');
        }
        
    } catch (e) {
        console.error('❌ エラー: DATABASE_URLの形式が不正です。', e.message);
    }
}
console.log('---------------------------');
// =========================================================

// 環境変数から接続情報を取得
const pool = new Pool({
    connectionString: connectionString,
    // 本番環境（production）でのSSL接続設定
    // Render/Neonの組み合わせでは通常 rejectUnauthorized: false が必要です
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// 接続テスト
pool.query('SELECT NOW()')
    .then(res => console.log('✅ PostgreSQL接続成功:', res.rows[0].now))
    .catch(err => console.error('❌ PostgreSQL接続エラー:', err.message));

module.exports = {
    // クエリ実行のラッパー関数
    query: (text, params) => pool.query(text, params),
    // トランザクションのためにpoolオブジェクト自体をエクスポートに追加
    pool: pool, 
};