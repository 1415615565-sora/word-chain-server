const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const Room = require('../models/Room');
const Game = require('../models/Game');

// 1. 방 만들기 (청소 포함)
router.post('/create', async (req, res) => {
    const { userId, playerType, roomName, password } = req.body;
    
    if (password && !/^\d{4}$/.test(password)) return res.status(400).json({ error: '비밀번호는 4자리 숫자여야 합니다.' });

    try {
        await Room.deleteMany({ creatorId: userId });
        await Room.updateMany({ guestId: userId }, { $set: { guestId: null, status: 'waiting', gameId: null } });

        const newRoom = await Room.create({
            roomId: uuidv4(),
            roomName,
            password: password || null,
            creatorId: userId,
            creatorType: playerType,
            status: 'waiting',
            lastActive: { host: Date.now(), guest: Date.now() }
        });
        res.json({ message: '방 생성 성공', roomId: newRoom.roomId });
    } catch (err) { res.status(500).json({ error: '오류' }); }
});

// 2. 방 목록 조회 (죽은 방 청소)
router.get('/', async (req, res) => {
    const { playerType } = req.query;
    try {
        const now = Date.now();
        const CLEANUP_TIMEOUT = 180000; // 3분

        await Room.deleteMany({
            status: 'waiting',
            'lastActive.host': { $lt: new Date(now - CLEANUP_TIMEOUT) }
        });

        const query = { status: 'waiting' };
        if (playerType === 'korean') query.creatorType = 'japanese';
        else if (playerType === 'japanese') query.creatorType = 'korean';

        const rooms = await Room.find(query).sort({ createdAt: -1 });
        res.json(rooms.map(r => ({
            roomId: r.roomId, roomName: r.roomName, creatorType: r.creatorType, hasPassword: !!r.password
        })));
    } catch (err) { res.status(500).json({ error: '실패' }); }
});

// 3. 방 입장
router.post('/join', async (req, res) => {
    const { roomId, userId, password } = req.body;
    try {
        const room = await Room.findOne({ roomId });
        if (!room) return res.status(404).json({ error: '방 없음' });
        if (room.status !== 'waiting') return res.status(400).json({ error: '게임 중/꽉 참' });
        if (room.password && room.password !== password) return res.status(401).json({ error: '비번 틀림' });

        room.guestId = userId;
        room.status = 'playing';
        room.lastActive.guest = Date.now();
        await room.save();
        res.json({ message: '성공', gameId: roomId });
    } catch (err) { res.status(500).json({ error: '실패' }); }
});

// 4. 방 나가기
router.post('/leave', async (req, res) => {
    const { roomId, userId } = req.body;
    try {
        const room = await Room.findOne({ roomId });
        if (!room) return res.status(404).json({ error: '방 없음' });

        if (room.gameId) {
            const game = await Game.findOne({ gameId: room.gameId });
            if (game && game.status === 'playing') {
                const winnerRole = (userId === room.creatorId) ? (room.creatorType === 'korean' ? 'japanese' : 'korean') : room.creatorType;
                game.status = 'finished';
                game.winner = winnerRole;
                game.winnerReason = '상대방 퇴장';
                await game.save();
            }
        }

        if (room.creatorId === userId) {
            await Room.deleteOne({ roomId });
            return res.json({ message: '방 해산됨', role: 'host' });
        } 
        if (room.guestId === userId) {
            room.guestId = null;
            room.status = 'waiting';
            room.gameId = null;
            await room.save();
            return res.json({ message: '나갔습니다', role: 'guest' });
        }
        res.json({ message: '참가자 아님' });
    } catch (err) { res.status(500).json({ error: '오류' }); }
});

// 5. 방 상태 조회 (대기실 타임아웃)
router.get('/:roomId', async (req, res) => {
    const { roomId } = req.params;
    const { userId } = req.query;

    try {
        const room = await Room.findOne({ roomId });
        if (!room) return res.status(404).json({ error: '방이 삭제되었습니다.', status: 'deleted' });

        const now = Date.now();
        if (userId) {
            if (userId === room.creatorId) room.lastActive.host = now;
            else if (userId === room.guestId) room.lastActive.guest = now;
        }

        const HOST_TIMEOUT = 180000;  // 3분
        const GUEST_TIMEOUT = 180000; // 3분

        if (room.status === 'waiting') {
            if (now - new Date(room.lastActive.host).getTime() > HOST_TIMEOUT) {
                await Room.deleteOne({ roomId });
                return res.status(404).json({ error: '방장 잠수로 삭제됨', status: 'deleted' });
            }
            if (room.guestId && (now - new Date(room.lastActive.guest).getTime() > GUEST_TIMEOUT)) {
                room.guestId = null;
                room.gameId = null;
                await room.save();
            }
        } else {
            if (userId) await room.save();
        }
        res.json(room);
    } catch (err) { res.status(500).json({ error: '오류' }); }
});

router.post('/:roomId/link', async (req, res) => {
    const { gameId } = req.body;
    try {
        await Room.findOneAndUpdate({ roomId: req.params.roomId }, { gameId, status: 'playing' });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: '실패' }); }
});

module.exports = router;