// routes/roomRoutes.js

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

// 💾 임시 방 데이터 저장소
let rooms = [];

/**
 * 1. 방 만들기 API
 * [POST] /api/rooms/create
 * - userId(인식코드)를 받아서 방장(creatorId)으로 기록합니다.
 */
router.post('/create', (req, res) => {
    const { userId, playerType, roomName, password } = req.body;

    // 필수 정보 확인
    if (!userId || !playerType || !roomName) {
        return res.status(400).json({ error: '필수 정보(userId, playerType, 방제목)가 부족합니다.' });
    }

    // 비밀번호 유효성 검사 (숫자 3자리)
    if (password && !/^\d{3}$/.test(password)) {
        return res.status(400).json({ error: '비밀번호는 숫자 3자리여야 합니다.' });
    }

    // 방 생성
    const newRoom = {
        roomId: uuidv4(),
        roomName: roomName,
        password: password || null, // 비밀번호가 없으면 null
        creatorId: userId,          // ⭐ 방장의 인식 코드를 저장
        creatorType: playerType,    // 방장의 국적 (korean/japanese)
        guestId: null,              // 게스트 ID (아직 없음)
        guestType: null,            // 게스트 국적
        status: 'waiting',          // 대기 중
        createdAt: Date.now()
    };

    rooms.push(newRoom);
    console.log(`🏠 방 생성: "${roomName}" by ${playerType} (${userId})`);

    res.json({
        message: '방이 생성되었습니다.',
        roomId: newRoom.roomId,
        room: newRoom
    });
});

/**
 * 2. 방 목록 가져오기 API (교차 매칭 적용)
 * [GET] /api/rooms?playerType=korean
 * - 내 국적(playerType)과 반대되는 방만 보여줍니다.
 */
router.get('/', (req, res) => {
    const { playerType } = req.query; // ?playerType=...

    // 1. 대기 중인 방만 필터링
    let availableRooms = rooms.filter(r => r.status === 'waiting');

    // 2. 국적에 따른 교차 필터링 (한국인은 일본방, 일본인은 한국방)
    if (playerType === 'korean') {
        availableRooms = availableRooms.filter(r => r.creatorType === 'japanese');
    } else if (playerType === 'japanese') {
        availableRooms = availableRooms.filter(r => r.creatorType === 'korean');
    }

    // 3. 보안을 위해 비밀번호는 숨기고 '잠금 여부'만 전송
    const responseData = availableRooms.map(room => ({
        roomId: room.roomId,
        roomName: room.roomName,
        creatorType: room.creatorType,
        hasPassword: !!room.password // true/false
    }));

    res.json(responseData);
});

/**
 * 3. 방 입장하기 API
 * [POST] /api/rooms/join
 * - userId를 받아서 게스트(guestId)로 기록합니다.
 */
router.post('/join', (req, res) => {
    const { roomId, userId, playerType, password } = req.body;

    // 1. 방 찾기
    const room = rooms.find(r => r.roomId === roomId);
    if (!room) {
        return res.status(404).json({ error: '방을 찾을 수 없습니다.' });
    }

    // 2. 입장 불가능 조건 체크
    if (room.status !== 'waiting') {
        return res.status(400).json({ error: '이미 게임이 시작되었습니다.' });
    }
    if (room.password && room.password !== password) {
        return res.status(401).json({ error: '비밀번호가 틀렸습니다.' });
    }
    if (room.creatorId === userId) {
        return res.status(400).json({ error: '자신이 만든 방에는 들어갈 수 없습니다.' });
    }

    // 3. 입장 처리 (방 상태 업데이트)
    room.guestId = userId;          // ⭐ 게스트의 인식 코드 저장
    room.guestType = playerType;    // 게스트 국적 저장
    room.status = 'playing';        // 게임 시작!

    console.log(`🤝 게임 성사! 방: ${room.roomName} (${room.creatorType} vs ${playerType})`);

    res.json({
        message: '입장 성공! 게임을 시작합니다.',
        gameId: roomId,
        opponentId: room.creatorId // 상대방 ID 정보 (필요시 사용)
    });
});

module.exports = router;