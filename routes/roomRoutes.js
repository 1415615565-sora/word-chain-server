const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const Room = require('../models/Room'); // Room 모델 불러오기

// [POST] 방 만들기
router.post('/create', async (req, res) => {
    const { userId, playerType, roomName, password } = req.body;
    const roomId = uuidv4();

    try {
        const newRoom = await Room.create({
            roomId,
            roomName,
            password: password || null,
            creatorId: userId,
            creatorType: playerType,
            status: 'waiting'
        });
        res.json({ message: '방 생성 성공', roomId: newRoom.roomId });
    } catch (err) {
        res.status(500).json({ error: '방 생성 실패' });
    }
});

// [GET] 방 목록 (대기중 + 교차 매칭)
router.get('/', async (req, res) => {
    const { playerType } = req.query;
    
    try {
        // MongoDB 쿼리로 필터링 (훨씬 효율적)
        const query = { status: 'waiting' };
        if (playerType === 'korean') query.creatorType = 'japanese';
        else if (playerType === 'japanese') query.creatorType = 'korean';

        const rooms = await Room.find(query).select('roomId roomName creatorType password');
        
        res.json(rooms.map(r => ({
            roomId: r.roomId,
            roomName: r.roomName,
            creatorType: r.creatorType,
            hasPassword: !!r.password
        })));
    } catch (err) {
        res.status(500).json({ error: '목록 조회 실패' });
    }
});

// [POST] 방 입장
router.post('/join', async (req, res) => {
    const { roomId, userId, password } = req.body;

    try {
        const room = await Room.findOne({ roomId });
        if (!room) return res.status(404).json({ error: '방이 없습니다.' });
        if (room.password && room.password !== password) return res.status(401).json({ error: '비밀번호 불일치' });
        if (room.status !== 'waiting') return res.status(400).json({ error: '이미 게임 중입니다.' });

        room.guestId = userId;
        room.status = 'playing';
        await room.save();

        res.json({ message: '입장 성공', gameId: roomId }); // roomId를 임시 그룹 ID로 사용
    } catch (err) {
        res.status(500).json({ error: '입장 처리 실패' });
    }
});

// [GET] 특정 방 정보 조회 (폴링용)
router.get('/:roomId', async (req, res) => {
    try {
        const room = await Room.findOne({ roomId: req.params.roomId });
        if (!room) return res.status(404).json({ error: '방을 찾을 수 없습니다.' });
        res.json(room);
    } catch (err) {
        res.status(500).json({ error: '조회 오류' });
    }
});

// [POST] 방에 게임 ID 연결 (게임 시작 시 호출)
router.post('/:roomId/link', async (req, res) => {
    const { gameId } = req.body;
    try {
        await Room.findOneAndUpdate(
            { roomId: req.params.roomId }, 
            { gameId: gameId, status: 'playing' }
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: '연결 실패' });
    }
});

module.exports = router;