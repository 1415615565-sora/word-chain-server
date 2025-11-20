const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

let rooms = []; // 방 목록 (메모리 저장)

// [POST] 방 만들기
router.post('/create', (req, res) => {
    const { userId, playerType, roomName, password } = req.body;
    const newRoom = {
        roomId: uuidv4(),
        roomName,
        password: password || null,
        creatorId: userId,
        creatorType: playerType,
        status: 'waiting',
        createdAt: Date.now()
    };
    rooms.push(newRoom);
    res.json({ message: '방 생성 성공', roomId: newRoom.roomId });
});

// [GET] 방 목록 (교차 매칭)
router.get('/', (req, res) => {
    const { playerType } = req.query;
    
    // 대기 중인 방만 필터링
    let availableRooms = rooms.filter(r => r.status === 'waiting');

    // 내 국적과 반대인 방만 보여주기
    if (playerType === 'korean') {
        availableRooms = availableRooms.filter(r => r.creatorType === 'japanese');
    } else if (playerType === 'japanese') {
        availableRooms = availableRooms.filter(r => r.creatorType === 'korean');
    }

    res.json(availableRooms.map(r => ({
        roomId: r.roomId,
        roomName: r.roomName,
        creatorType: r.creatorType,
        hasPassword: !!r.password
    })));
});

// [POST] 방 입장
router.post('/join', (req, res) => {
    const { roomId, userId, password } = req.body;
    const room = rooms.find(r => r.roomId === roomId);

    if (!room) return res.status(404).json({ error: '방이 없습니다.' });
    if (room.password && room.password !== password) return res.status(401).json({ error: '비밀번호 불일치' });
    
    room.guestId = userId;
    room.status = 'playing';

    res.json({ message: '입장 성공', gameId: roomId });
});

module.exports = router;