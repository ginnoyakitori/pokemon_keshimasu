// controllers/playerController.js (PostgreSQL接続プールの初期化は省略)

// プレイヤーIDから情報を取得するコアロジックを修正
const getPlayerDetailsById = async (playerId) => {
    const query = `
        SELECT 
            id, nickname, 
            country_clears, capital_clears,
            cleared_country_ids, cleared_capital_ids -- ★★★ JSONBカラムを取得 ★★★
        FROM players 
        WHERE id = $1;
    `;
    const result = await pool.query(query, [playerId]);
    return result.rows[0];
};


// 例: ログイン成功時のレスポンスハンドラ (または /player/:id エンドポイント)
const sendPlayerResponse = (res, player, isNewUser) => {
    return res.status(200).json({ 
        message: isNewUser ? "Registration successful." : "Login successful.", 
        isNewUser: isNewUser,
        player: {
            id: player.id,
            nickname: player.nickname,
            country_clears: player.country_clears,
            capital_clears: player.capital_clears,
            // ★★★ クライアントへクリア済みIDを渡す ★★★
            cleared_country_ids: player.cleared_country_ids || [], 
            cleared_capital_ids: player.cleared_capital_ids || []
        }
    });
};

// ... (exportされる他の関数: registerPlayer, loginPlayer, getPlayerStatusなどでは、
//      getPlayerDetailsById を呼び出し、sendPlayerResponse を使ってレスポンスを返すように修正が必要です)