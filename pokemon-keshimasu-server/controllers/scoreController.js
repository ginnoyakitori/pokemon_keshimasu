// controllers/scoreController.js (PostgreSQL接続プールの初期化は省略)

const updateScore = async (req, res) => {
    // ★★★ puzzleId をリクエストボディから取得 ★★★
    const { playerId, mode, puzzleId } = req.body; 
    
    if (!playerId || !mode || puzzleId === undefined) {
        return res.status(400).json({ message: "Invalid request data." });
    }

    const clearField = `${mode}_clears`; 
    const idListField = `cleared_${mode}_ids`; 

    try {
        // 1. 現在のクリア済みIDリストを取得し、重複をチェック
        const checkQuery = `SELECT ${idListField}, ${clearField} FROM players WHERE id = $1;`;
        const checkResult = await pool.query(checkQuery, [playerId]);
        const player = checkResult.rows[0];

        if (player[idListField].includes(puzzleId)) {
            // 既にクリア済みの場合、更新せずに現在のスコアを返す (重要: 二重加算防止)
            return res.status(200).json({ 
                message: "Puzzle already cleared. Score not updated.",
                newScore: player[clearField]
            });
        }

        // 2. クリア数とIDリストを同時に更新 (JSONB結合演算子 || を使用)
        const updateQuery = `
            UPDATE players
            SET
                ${clearField} = ${clearField} + 1,
                ${idListField} = ${idListField} || $2::jsonb 
            WHERE id = $1
            RETURNING ${clearField} AS "newScore";
        `;
        
        // 追加するIDをJSON文字列の配列として渡す (例: [10])
        const updateResult = await pool.query(updateQuery, [playerId, JSON.stringify([puzzleId])]);

        return res.status(200).json({ 
            message: "Score and cleared puzzle ID updated successfully.", 
            newScore: updateResult.rows[0].newScore
        });

    } catch (error) {
        console.error("Score update error:", error);
        return res.status(500).json({ message: "Internal server error during score update." });
    }
};

module.exports = { updateScore };