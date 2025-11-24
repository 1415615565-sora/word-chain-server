const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const Room = require('../models/Room');
const Game = require('../models/Game');

// 1. 방 생성 (비밀번호 4자리 제한 추가됨)
router.post('/create', async (req, res) => {
    const { userId, playerType, roomName, password } = req.body;
    
    // 비밀번호가 입력되었는데 4자리가 아니거나 숫자가 아니면 에러 처리
    if (password) {
        // 정규식 설명: ^\d{4}$ -> 처음부터 끝까지 숫자(\d)가 정확히 4개({4})여야 함
        if (!/^\d{4}$/.test(password)) {
            return res.status(400).json({ error: '비밀번호는 4자리 숫자여야 합니다.' });
        }
    }

    try {
        const newRoom = await Room.create({
            roomId: uuidv4(),
            roomName,
            // 비밀번호가 있으면 저장, 없으면 null
            password: password || null,
            creatorId: userId,
            creatorType: playerType,
            status: 'waiting'
        });
        res.json({ message: '방 생성 성공', roomId: newRoom.roomId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '방 생성 중 오류 발생' });
    }
});

// 2. 방 목록 조회
router.get('/', async (req, res) => {
    const { playerType } = req.query;
    
    try {
        const query = { status: 'waiting' };
        if (playerType === 'korean') query.creatorType = 'japanese';
        else if (playerType === 'japanese') query.creatorType = 'korean';

        const rooms = await Room.find(query).sort({ createdAt: -1 });
        
        res.json(rooms.map(r => ({
            roomId: r.roomId,
            roomName: r.roomName,
            creatorType: r.creatorType,
            hasPassword: !!r.password // 비밀번호 존재 여부만 전달
        })));
    } catch (err) {
        res.status(500).json({ error: '목록 조회 실패' });
    }
});

// 3. 방 입장
router.post('/join', async (req, res) => {
    const { roomId, userId, password } = req.body;

    try {
        const room = await Room.findOne({ roomId });

        if (!room) return res.status(404).json({ error: '존재하지 않는 방입니다.' });
        if (room.status !== 'waiting') return res.status(400).json({ error: '이미 게임 중이거나 꽉 찼습니다.' });
        
        // 비밀번호 확인
        if (room.password && room.password !== password) {
            return res.status(401).json({ error: '비밀번호가 일치하지 않습니다.' });
        }

        room.guestId = userId;
        room.status = 'playing';
        await room.save();

        res.json({ message: '입장 성공', gameId: roomId });
    } catch (err) {
        res.status(500).json({ error: '입장 처리 실패' });
    }
});

// 4. 방 나가기 (게임 종료 로직 포함)
router.post('/leave', async (req, res) => {
    const { roomId, userId } = req.body;

    try {
        const room = await Room.findOne({ roomId });
        if (!room) return res.status(404).json({ error: '이미 없는 방입니다.' });

        // 진행 중인 게임 종료 처리
        if (room.gameId) {
            const game = await Game.findOne({ gameId: room.gameId });
            if (game && game.status === 'playing') {
                const leaverRole = (userId === room.creatorId) ? room.creatorType : (room.creatorType === 'korean' ? 'japanese' : 'korean');
                const winnerRole = leaverRole === 'korean' ? 'japanese' : 'korean';

                game.status = 'finished';
                game.winner = winnerRole;
                game.winnerReason = '상대방 퇴장';
                await game.save();
            }
        }

        // 방장 퇴장 -> 방 삭제
        if (room.creatorId === userId) {
            await Room.deleteOne({ roomId });
            return res.json({ message: '방장이 나가 방이 해산되었습니다.', role: 'host' });
        } 
        
        // 게스트 퇴장 -> 대기 상태로 복귀
        if (room.guestId === userId) {
            room.guestId = null;
            room.status = 'waiting';
            room.gameId = null;
            await room.save();
            return res.json({ message: '방을 나갔습니다.', role: 'guest' });
        }

        res.json({ message: '참가자가 아닙니다.' });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '나가기 처리 실패' });
    }
});

// 5. 방 정보 조회 (폴링 + 심박수 체크)
router.get('/:roomId', async (req, res) => {
    const { roomId } = req.params;
    const { userId } = req.query; //프론트에서 userId를 꼭 보내줘야 함!

    try {
        const room = await Room.findOne({ roomId });
        if (!room) return res.status(404).json({ error: '방이 삭제되었습니다.', status: 'deleted' });

        const now = Date.now();

        // 1. 요청을 보낸 사람의 시간 갱신 (Heartbeat)
        if (userId) {
            if (userId === room.creatorId) {
                room.lastActive.host = now;
            } else if (userId === room.guestId) {
                room.lastActive.guest = now;
            }
            // 변경사항이 있을 때만 저장하지 않고, 로직 단순화를 위해 일단 메모리 객체 수정
            // (완벽하게 하려면 아래에서 save() 호출)
        }

        // 2. 잠수 유저 체크 로직 (10초 기준)
        const HOST_TIMEOUT = 10000; // 10초
        const GUEST_TIMEOUT = 10000;

        // (A) 방장이 잠수탔는지 확인
        if (now - new Date(room.lastActive.host).getTime() > HOST_TIMEOUT) {
            // 방장이 10초간 연락 두절 -> 방 폭파 💣
            await Room.deleteOne({ roomId });
            console.log(`방장 잠수로 방 삭제: ${roomId}`);
            return res.status(404).json({ error: '방장이 연결을 끊어 방이 삭제되었습니다.', status: 'deleted' });
        }

        // (B) 게스트가 잠수탔는지 확인
        if (room.guestId && (now - new Date(room.lastActive.guest).getTime() > GUEST_TIMEOUT)) {
            // 게스트가 10초간 연락 두절 -> 내쫓음 쫒아내기 🚪
            console.log(`게스트 잠수로 퇴장 처리: ${roomId}`);
            room.guestId = null;
            room.status = 'waiting';
            room.gameId = null;
            await room.save(); // DB 업데이트
            // 방장에게는 "게스트 나감" 상태로 보여지게 됨
        } else {
            // 퇴장 로직이 없을 때만 시간 갱신 저장 (DB 부하를 줄이려면 조건부 저장)
             if (userId) await room.save();
        }

        res.json(room);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '조회 오류' });
    }
});

// 6. 게임 ID 연결
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