const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const Room = require('../models/Room');
const Game = require('../models/Game');

// 1. 방 만들기 (기존 유지)
router.post('/create', async (req, res) => {
    const { userId, playerType, roomName, password } = req.body;
    
    if (password && !/^\d{4}$/.test(password)) {
        return res.status(400).json({ error: '비밀번호는 4자리 숫자여야 합니다.' });
    }

    try {
        // 내 명의의 이전 방들 정리
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

// 2. 방 목록 조회 (수정됨: 1분 이상 잠수 탄 방만 청소)
router.get('/', async (req, res) => {
    const { playerType } = req.query;
    
    try {
        const now = Date.now();
        const CLEANUP_TIMEOUT = 60000; // 1분 (방장이 1분간 연락 없으면 삭제)

        // 죽은 방 청소
        await Room.deleteMany({
            status: 'waiting',
            'lastActive.host': { $lt: new Date(now - CLEANUP_TIMEOUT) }
        });

        const query = { status: 'waiting' };
        if (playerType === 'korean') query.creatorType = 'japanese';
        else if (playerType === 'japanese') query.creatorType = 'korean';

        const rooms = await Room.find(query).sort({ createdAt: -1 });
        
        res.json(rooms.map(r => ({
            roomId: r.roomId,
            roomName: r.roomName,
            creatorType: r.creatorType,
            hasPassword: !!r.password
        })));
    } catch (err) { res.status(500).json({ error: '실패' }); }
});

// 3. 방 입장 (기존 유지)
router.post('/join', async (req, res) => {
    const { roomId, userId, password } = req.body;
    try {
        const room = await Room.findOne({ roomId });
        if (!room) return res.status(404).json({ error: '방 없음' });
        if (room.status !== 'waiting') return res.status(400).json({ error: '게임 중/꽉 참' });
        if (room.password && room.password !== password) return res.status(401).json({ error: '비번 틀림' });

        room.guestId = userId;
        room.status = 'playing';
        // 입장 시 게스트 시간 초기화
        room.lastActive.guest = Date.now(); 
        await room.save();
        res.json({ message: '성공', gameId: roomId });
    } catch (err) { res.status(500).json({ error: '실패' }); }
});

// 4. 방 나가기 (기존 유지)
router.post('/leave', async (req, res) => {
    const { roomId, userId } = req.body;
    try {
        const room = await Room.findOne({ roomId });
        if (!room) return res.status(404).json({ error: '방 없음' });

        if (room.gameId) {
            const game = await Game.findOne({ gameId: room.gameId });
            if (game && game.status === 'playing') {
                const winnerRole = (userId === room.creatorId) 
                    ? (room.creatorType === 'korean' ? 'japanese' : 'korean')
                    : room.creatorType;
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

// 5. 대기실 상태 조회 (핵심 수정: 타임아웃 시간 변경 및 처리 로직)
router.get('/:roomId', async (req, res) => {
    const { roomId } = req.params;
    const { userId } = req.query;

    try {
        const room = await Room.findOne({ roomId });
        if (!room) return res.status(404).json({ error: '방이 삭제되었습니다.', status: 'deleted' });

        const now = Date.now();

        // [1] 심박수 갱신
        if (userId) {
            if (userId === room.creatorId) room.lastActive.host = now;
            else if (userId === room.guestId) room.lastActive.guest = now;
        }

        // [2] 타임아웃 설정 (요청하신 시간 적용)
        const HOST_TIMEOUT = 60000;  // 1분 (방장)
        const GUEST_TIMEOUT = 20000; // 20초 (게스트)

        // (A) 방장 잠수 체크
        if (now - new Date(room.lastActive.host).getTime() > HOST_TIMEOUT) {
            await Room.deleteOne({ roomId });
            console.log(`방장 1분 잠수로 방 삭제: ${roomId}`);
            return res.status(404).json({ error: '방장이 응답이 없어 방이 삭제되었습니다.', status: 'deleted' });
        }

        // (B) 게스트 잠수 체크
        if (room.guestId && (now - new Date(room.lastActive.guest).getTime() > GUEST_TIMEOUT)) {
            console.log(`게스트 20초 잠수로 퇴장 처리: ${roomId}`);
            room.guestId = null;
            room.status = 'waiting'; // 대기 모드로 복귀
            room.gameId = null;
            await room.save();
            
            // 여기서 room 정보를 반환하면, 방장 화면에서는 guestId가 null인 상태를 받게 됨
            // -> 프론트엔드에서 "게스트 나감" 처리 가능
        } else {
            // 변경 사항이 있을 때만 저장 (부하 방지)
            if (userId) await room.save();
        }

        res.json(room);

    } catch (err) { res.status(500).json({ error: '오류' }); }
});

// 6. 게임 연결 (기존 유지)
router.post('/:roomId/link', async (req, res) => {
    const { gameId } = req.body;
    try {
        await Room.findOneAndUpdate({ roomId: req.params.roomId }, { gameId, status: 'playing' });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: '실패' }); }
});

module.exports = router;