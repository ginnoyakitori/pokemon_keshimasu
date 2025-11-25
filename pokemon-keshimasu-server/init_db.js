// keshimasu-server/init_db.js
// PostgreSQLのテーブルを初期化するためのスクリプト

const db = require('./db');
// 初期パズルのデータ構造が { id: 1, data: [...], creator: "..." } であることを前提とする
const COUNTRY_PUZZLES = require('./data/country_puzzles.json');
const CAPITAL_PUZZLES = require('./data/capital_puzzles.json');

/**
 * データベースを初期化し、必要なテーブルを作成する。
 */
async function initializeDatabase() {
    try {
        // --- 1. players テーブルの定義 ---
        // ★★★ 修正箇所: cleared_country_ids と cleared_capital_ids を追加 ★★★
        const createPlayersTable = `
            CREATE TABLE IF NOT EXISTS players (
                id SERIAL PRIMARY KEY,
                nickname VARCHAR(10) UNIQUE NOT NULL,
                passcode_hash TEXT NOT NULL,
                country_clears INTEGER DEFAULT 0,
                capital_clears INTEGER DEFAULT 0, -- 前回のご報告のbigintではなく、他のclearsと合わせてINTEGERに統一
                cleared_country_ids JSONB DEFAULT '[]'::jsonb, -- クリア済みパズルIDを格納 (JSONB型推奨)
                cleared_capital_ids JSONB DEFAULT '[]'::jsonb,  -- クリア済みパズルIDを格納 (JSONB型推奨)
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `;
        await db.query(createPlayersTable);
        console.log('✅ Table "players" created or already exists.');

        // --- 2. puzzles テーブルの定義 ---
        const createPuzzlesTable = `
            CREATE TABLE IF NOT EXISTS puzzles (
                id SERIAL PRIMARY KEY,
                mode VARCHAR(10) NOT NULL CHECK (mode IN ('country', 'capital')),
                board_data JSONB NOT NULL,
                creator VARCHAR(255) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `;
        await db.query(createPuzzlesTable);
        console.log('✅ Table "puzzles" created or already exists.');
        
        // --- 3. 初期パズルの投入（データが存在しない場合のみ） ---
        const countResult = await db.query('SELECT COUNT(*) FROM puzzles');
        const puzzleCount = parseInt(countResult.rows[0].count, 10);

        if (puzzleCount === 0) {
            console.log('ℹ️ Initializing puzzles...');

            // DBの列名 'board_data' にパズルデータの 'data' を正しくマッピングする
            const countryPuzzles = COUNTRY_PUZZLES.map(p => ({ 
                mode: 'country', 
                board_data: p.data, 
                creator: p.creator 
            }));
            const capitalPuzzles = CAPITAL_PUZZLES.map(p => ({ 
                mode: 'capital', 
                board_data: p.data, 
                creator: p.creator 
            }));

            const allInitialPuzzles = [...countryPuzzles, ...capitalPuzzles];
            
            for (const puzzle of allInitialPuzzles) {
                // JSON.stringify() で明示的に文字列化する
                const jsonBoardData = JSON.stringify(puzzle.board_data);

                await db.query(
                    'INSERT INTO puzzles (mode, board_data, creator) VALUES ($1, $2, $3)',
                    [puzzle.mode, jsonBoardData, puzzle.creator]
                );
            }
            console.log(`✅ ${allInitialPuzzles.length} initial puzzles inserted.`);
        } else {
            console.log(`ℹ️ Puzzles already exist (${puzzleCount} total). Skipping initial insertion.`);
        }

        return true;

    } catch (error) {
        console.error('❌ Failed to initialize database tables:', error.message);
        throw error;
    }
}

module.exports = initializeDatabase;