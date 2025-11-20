// routes/userRoutes.js

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid'); // 고유 ID 생성기

// 💾 (임시) 접속한 사용자들을 기억할 장소
// 나중에 DB가 생기면 User 테이블이 됩니다.
let users = {}; 

/**
 * 사용자 등록(로그인) API
 * [POST] /api/users/login
 * 버튼을 누르면 호출됩니다.
 * 요청: { "playerType": "korean" }
 */
router.post('/login', (req, res) => {
    const { playerType } = req.body;

    // 유효성 검사
    if (playerType !== 'korean' && playerType !== 'japanese') {
        return res.status(400).json({ error: 'korean 또는 japanese 중 하나를 선택해야 합니다.' });
    }

    // 1. 고유한 인식 코드(userId) 생성
    const userId = uuidv4();

    // 2. 서버 메모리에 사용자 정보 저장 (누가 어떤 언어인지 기억)
    users[userId] = {
        userId: userId,
        playerType: playerType,
        joinedAt: Date.now()
    };

    console.log(`👤 새 사용자 접속: ${playerType} (ID: ${userId})`);

    // 3. 프론트엔드에게 인식 코드(userId)와 타입을 돌려줌
    res.json({
        message: '환영합니다!',
        userId: userId,      // ⭐ 여기가 바로 그 "인식 코드"입니다.
        playerType: playerType
    });
});

module.exports = router;