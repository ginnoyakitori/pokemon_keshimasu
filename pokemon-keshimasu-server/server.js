require('dotenv').config(); // .envファイルをロード
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db'); 
const initializeDatabase = require('./init_db'); 
const { hashPasscode, comparePasscode } = require('./utils/auth');
// scoreRoutes.js が不要になったためコメントアウト（または削除）
// const scoreRoutes = require('./routes/scoreRoutes'); 

const app = express();
const PORT = process.env.PORT || 3000;

// 辞書データを読み込む
const POKEMON_WORDS = require('./data/pokemon_words.json');


// --- 初期化と起動 ---
(async () => {
    // データベースの初期化（テーブル作成など）をサーバー起動前に実行
    await initializeDatabase(); 
    
    // CORS設定
    app.use(cors());
    // JSONリクエストボディの解析を有効化
    app.use(express.json());
    
    // 静的ファイル配信 (keshimasu-clientディレクトリを想定)
    // ★ 修正: 正しいクライアントフォルダ名 (pokemon-keshimasu-client) を使用 ★
    app.use(express.static(path.join(__dirname, '..', 'pokemon-keshimasu-client')));

    // ★ 修正 1: ルート ('/') へのGETリクエストが index.html を返すように明示的に設定 ★
    app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, '..', 'pokemon-keshimasu-client', 'index.html'));
    });

    // --- API エンドポイント ---

    /**
     * POST /api/player/register
     * ニックネームとパスコードでログインまたは新規登録を行う
     */
    app.post('/api/player/register', async (req, res) => {
        const { nickname, passcode } = req.body;
        const trimmedNickname = nickname ? nickname.trim().slice(0, 10) : null;
        
        if (!trimmedNickname || !passcode) {
            return res.status(400).json({ message: 'ニックネームとパスコードは必須です。' });
        }

        try {
            // 1. 既存ユーザーのチェック
            const existingPlayer = await db.query(
                'SELECT id, nickname, passcode_hash, pokemon_clears, cleared_pokemon_ids FROM players WHERE nickname = $1',
                [trimmedNickname]
            );

            if (existingPlayer.rows.length > 0) {
                // ログイン処理 (既存ユーザー)
                const player = existingPlayer.rows[0];
                const match = await comparePasscode(passcode, player.passcode_hash);

                if (match) {
                    // ログイン成功
                    return res.json({ 
                        player: { 
                            id: player.id, 
                            nickname: player.nickname,
                            pokemon_clears: player.pokemon_clears,
                            cleared_pokemon_ids: player.cleared_pokemon_ids 
                        },
                        isNewUser: false 
                    });
                } else {
                    // パスコード不一致
                    return res.status(401).json({ message: 'パスコードが一致しません。', isNewUser: false });
                }
            } else {
                // 新規登録処理 (新規ユーザー)
                const hashedPasscode = await hashPasscode(passcode);
                
                const newPlayer = await db.query(
                    `INSERT INTO players (nickname, passcode_hash, cleared_pokemon_ids) 
                     VALUES ($1, $2, '[]'::jsonb) 
                     RETURNING id, nickname, pokemon_clears, cleared_pokemon_ids`,
                    [trimmedNickname, hashedPasscode]
                );

                const player = newPlayer.rows[0];
                // 新規登録成功
                return res.status(201).json({ 
                    player: { 
                        id: player.id, 
                        nickname: player.nickname,
                        pokemon_clears: player.pokemon_clears,
                        cleared_pokemon_ids: player.cleared_pokemon_ids
                    },
                    isNewUser: true 
                });
            }

        } catch (err) {
            console.error('認証/登録エラー:', err.message);
            // サーバーエラー
            res.status(500).json({ message: 'サーバーエラーが発生しました。' });
        }
    });
    
    /**
     * GET /api/player/:id
     * プレイヤーの最新情報を取得（リロード時など）
     */
    app.get('/api/player/:id', async (req, res) => {
        try {
            const result = await db.query(
                'SELECT id, nickname, pokemon_clears, cleared_pokemon_ids FROM players WHERE id = $1',
                [req.params.id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ message: 'プレイヤーが見つかりません。' });
            }

            const player = result.rows[0];
            res.json({ player: player });
        } catch (err) {
            console.error('プレイヤー取得エラー:', err.message);
            res.status(500).json({ message: 'サーバーエラー' });
        }
    });

    /**
     * POST /api/score/update
     * プレイヤーのクリアスコアを+1し、クリアした問題IDを記録する
     */
    app.post('/api/score/update', async (req, res) => {
        const { playerId, mode, puzzleId } = req.body;
        
        const clearCountColumn = 'pokemon_clears';
        const clearedIdsColumn = 'cleared_pokemon_ids';
        const puzzleIdInt = parseInt(puzzleId);
        
        if (!playerId || mode !== 'pokemon' || isNaN(puzzleIdInt)) {
            return res.status(400).json({ message: '無効なリクエストです。' });
        }
        
        const client = await db.pool.connect(); 
        try {
            await client.query('BEGIN');
            
            const checkResult = await client.query(
                `SELECT ${clearCountColumn}, ${clearedIdsColumn} FROM players WHERE id = $1 FOR UPDATE`, 
                [playerId]
            );
            
            if (checkResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ message: 'プレイヤーが見つかりません。' });
            }
            
            const currentRow = checkResult.rows[0];
            const currentScore = currentRow[clearCountColumn];
            let clearedIds = currentRow[clearedIdsColumn] || []; 
            
            clearedIds = clearedIds.map(id => parseInt(id)); 

            if (clearedIds.includes(puzzleIdInt)) {
                await client.query('ROLLBACK');
                return res.status(200).json({ 
                    newScore: currentScore, 
                    message: 'この問題は既にクリア済みです。' 
                });
            }

            clearedIds.push(puzzleIdInt);
            const newClearedIdsJson = JSON.stringify(clearedIds);

            const updateResult = await client.query(
                `UPDATE players SET ${clearCountColumn} = ${clearCountColumn} + 1, ${clearedIdsColumn} = $2 WHERE id = $1 RETURNING ${clearCountColumn} AS newscore`,
                [playerId, newClearedIdsJson]
            );
            
            await client.query('COMMIT');
            
            if (updateResult.rows.length === 0) {
                return res.status(404).json({ message: 'プレイヤーが見つかりません。' });
            }

            res.json({ newScore: updateResult.rows[0].newscore, message: 'スコアを更新しました。' });
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('❌ スコア更新エラー:', err.message);
            res.status(500).json({ message: 'サーバーエラーによりスコアを更新できませんでした。' });
        } finally {
            client.release();
        }
    });
    
    // ★ 修正 2: GET /api/score/leaderboard ルートを追加 ★
    /**
     * GET /api/score/leaderboard
     * ランキングデータを取得する (GET /api/rankings/pokemon と同じ機能を提供)
     */
    app.get('/api/score/leaderboard', async (req, res) => {
        const column = 'pokemon_clears';

        try {
            const result = await db.query(
                `SELECT nickname, ${column} AS score FROM players ORDER BY score DESC, created_at ASC LIMIT 100`
            );
            
            const rankings = result.rows.map((row, index) => ({
                rank: index + 1,
                nickname: row.nickname,
                score: row.score
            }));

            res.json(rankings);
        } catch (err) {
            console.error('リーダーボード取得エラー:', err.message);
            res.status(500).json({ message: 'サーバーエラーによりランキングを取得できませんでした。' });
        }
    });


    /**
     * GET /api/puzzles/:mode
     * 指定されたモードの問題リストを取得する
     */
    app.get('/api/puzzles/:mode', async (req, res) => {
        const { mode } = req.params;
        const { playerId } = req.query; 
        
        if (mode !== 'pokemon') {
            return res.status(400).json({ message: '無効なモードです。' });
        }
        
        let clearedIds = [];
        let playerIdentified = false; 
        
        if (playerId) {
            try {
                const clearedIdsColumn = 'cleared_pokemon_ids';
                const playerResult = await db.query(
                    `SELECT ${clearedIdsColumn} FROM players WHERE id = $1`,
                    [playerId]
                );

                if (playerResult.rows.length > 0) {
                    const clearedIdsData = playerResult.rows[0][clearedIdsColumn];
                    clearedIds = clearedIdsData || []; 
                    playerIdentified = true; 
                }
            } catch (err) {
                console.error('クリア済みID取得エラー:', err.message);
            }
        }

        try {
            const sql = 'SELECT id, board_data AS data, creator FROM puzzles WHERE mode = $1 ORDER BY created_at ASC';
            
            const result = await db.query(sql, [mode]);
            
            res.json({ 
                puzzles: result.rows, 
                cleared_ids: clearedIds,
                player_identified: playerIdentified, 
                message: playerIdentified ? '問題リストと最新のクリア済みIDを返却しました。' : 'ゲスト/未ログイン用の全問題リストを返却しました。'
            });

        } catch (err) {
            console.error('問題リスト取得エラー:', err.message);
            res.status(500).json({ message: 'サーバーエラーにより問題を取得できませんでした。' });
        }
    });

    /**
     * GET /api/rankings/:type
     * ランキングデータを取得
     */
    app.get('/api/rankings/:type', async (req, res) => {
        const { type } = req.params;
        let column;

        if (type === 'pokemon') column = 'pokemon_clears';
        else return res.status(400).json({ message: '無効なランキングタイプです。' });

        try {
            const result = await db.query(
                `SELECT nickname, ${column} AS score FROM players ORDER BY score DESC, created_at ASC LIMIT 100`
            );
            
            const rankings = result.rows.map((row, index) => ({
                rank: index + 1,
                nickname: row.nickname,
                score: row.score
            }));

            res.json(rankings);
        } catch (err) {
            console.error('ランキング取得エラー:', err.message);
            res.status(500).json({ message: 'サーバーエラーによりランキングを取得できませんでした。' });
        }
    });

    /**
     * GET /api/words/:mode
     * 利用可能なワードリストをクライアントに提供
     */
    app.get('/api/words/:mode', (req, res) => {
        const { mode } = req.params;
        if (mode === 'pokemon') {
            return res.json(POKEMON_WORDS);
        }
        return res.status(400).json({ message: '無効なモードです。' });
    });

    /**
     * POST /api/puzzles
     * ユーザーが制作した問題をデータベースに登録する
     */
    app.post('/api/puzzles', async (req, res) => {
        const { mode, boardData, creator } = req.body;
        
        if (!mode || !boardData || !creator) {
            return res.status(400).json({ message: '問題のデータが不完全です。' });
        }
        
        try {
            const newPuzzle = await db.query(
                'INSERT INTO puzzles (mode, board_data, creator) VALUES ($1, $2, $3) RETURNING id, creator',
                [mode, JSON.stringify(boardData), creator]
            );

            res.status(201).json({ 
                puzzle: { id: newPuzzle.rows[0].id, creator: newPuzzle.rows[0].creator }, 
                message: '問題が正常に登録されました。'
            });
        } catch (err) {
            console.error('問題登録エラー:', err.message);
            res.status(500).json({ message: '問題の登録中にサーバーエラーが発生しました。' });
        }
    });

    // --- サーバー起動 ---
    app.listen(PORT, () => {
        console.log(`🚀 サーバーはポート ${PORT} で稼働中です！`);
    });

})().catch(err => {
    console.error('❌ 致命的なサーバー起動エラー:', err.message);
    process.exit(1);
});