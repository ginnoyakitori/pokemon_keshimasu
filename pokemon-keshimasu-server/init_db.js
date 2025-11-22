// init_db.js
const db = require('./db'); 

/**
 * データベースの初期設定（テーブル作成）を行う
 */
async function initializeDatabase() {
    try {
        // 1. players テーブルの作成
        await db.query(`
            CREATE TABLE IF NOT EXISTS players (
                id SERIAL PRIMARY KEY,
                nickname VARCHAR(20) UNIQUE NOT NULL,
                passcode_hash TEXT NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                
                -- ゲームモード別のクリア情報
                pokemon_clears INTEGER DEFAULT 0,
                cleared_pokemon_ids JSONB DEFAULT '[]'::jsonb
            );
        `);
        console.log('✅ Table "players" created or already exists.');

        // 2. puzzles テーブルの作成
        await db.query(`
            CREATE TABLE IF NOT EXISTS puzzles (
                id SERIAL PRIMARY KEY,
                mode VARCHAR(50) NOT NULL,
                board_data JSONB NOT NULL,
                creator VARCHAR(20),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Table "puzzles" created or already exists.');
        
        // 3. インデックスの追加 (パフォーマンス改善のため)
        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_puzzles_mode_created_at ON puzzles (mode, created_at);
        `);
        console.log('✅ Index on puzzles created or already exists.');
        
        // 4. ダミー問題の挿入チェックを削除
        // ユーザーが問題を作るまで、テーブルは空のままにします。
        console.log('ℹ️ Skipping default puzzle insertion. Puzzles must be created by users.');

    } catch (err) {
        console.error('❌ データベース初期化中にエラーが発生しました:', err.message);
        throw err;
    }
}

// 他のファイルから require された際に実行されるようにエクスポート
module.exports = initializeDatabase;