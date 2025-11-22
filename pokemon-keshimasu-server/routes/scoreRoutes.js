const express = require('express');
const router = express.Router();
const scoreController = require('../controllers/scoreController');

// 💡 注意: このルーターは server.js で /api/score にマウントされることを想定しています。
// したがって、ここで定義するパスは / (ルート) や /leaderboard となります。

/**
 * GET /api/score/leaderboard
 * ランキングデータを取得する。
 */
router.get('/leaderboard', scoreController.getLeaderboard);

/**
 * POST /api/score/submit
 * プレイヤーがパズルをクリアした後、スコアを提出する。
 */
router.post('/submit', scoreController.submitScore);

module.exports = router;