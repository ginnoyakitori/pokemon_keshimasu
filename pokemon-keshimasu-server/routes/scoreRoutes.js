// index.js

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config(); // 環境変数 (.env) のロード

// ルートファイルのインポート（実際のファイル名に置き換えてください）
const scoreRoutes = require('./routes/scoreRoutes');
// const playerRoutes = require('./routes/playerRoutes'); // 仮に存在すると仮定
// const puzzleRoutes = require('./routes/puzzleRoutes'); // 仮に存在すると仮定


const app = express();
const PORT = process.env.PORT || 8080;

// --- データベース接続設定 ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Renderでの外部接続に必要な設定
    }
});

// データベース接続テスト（起動時）
pool.connect((err, client, release) => {
    if (err) {
        return console.error('Error acquiring client', err.stack);
    }
    console.log('Database connected successfully!');
    release();
});
// ★★★ pool を他のコントローラーファイルで使用できるようにエクスポートする必要がある ★★★
// (ここでは便宜上、poolをグローバルに利用できるものとしています)


// --- ミドルウェア ---
// CORSを有効にする (フロントエンドからのリクエストを許可)
app.use(cors()); 

// JSONリクエストボディをパース
app.use(express.json());

// --- ルート設定 ---
// /api/score エンドポイントに scoreRoutes を適用
app.use('/api/score', scoreRoutes);

// app.use('/api/player', playerRoutes); 
// app.use('/api/puzzles', puzzleRoutes); 
// ... 他のルートも同様に設定してください ...

// --- サーバー起動 ---
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});