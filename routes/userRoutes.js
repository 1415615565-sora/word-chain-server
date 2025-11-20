const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

// [POST] /api/users/login
router.post('/login', (req, res) => {
    const { playerType } = req.body;
    if (!playerType) return res.status(400).json({ error: 'playerType이 필요합니다.' });

    const userId = uuidv4(); // 고유 ID 생성
    
    res.json({
        message: '로그인 성공',
        userId: userId,
        playerType: playerType
    });
});

module.exports = router;