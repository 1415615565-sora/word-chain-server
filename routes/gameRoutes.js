const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const Game = require('../models/Game');
const { translateWord } = require('../utils/translator');
const { checkWordExists } = require('../utils/dictionary');

const STARTING_WORDS = [
    { ko: '나무', ja: 'き' }, { ko: '바다', ja: 'うみ' },
    { ko: '하늘', ja: 'そら' }, { ko: '사랑', ja: 'あい' }
];

// [POST] 게임 시작 (DB 저장)
router.post('/start', async (req, res) => {
    const { roomId, koreanPlayerId, japanesePlayerId } = req.body;
    const gameId = uuidv4();
    const firstTurn = Math.random() < 0.5 ? 'korean' : 'japanese';
    const startWord = STARTING_WORDS[Math.floor(Math.random() * STARTING_WORDS.length)];

    try {
        const newGame = await Game.create({
            gameId, roomId,
            players: { korean: koreanPlayerId, japanese: japanesePlayerId },
            currentTurn: firstTurn,
            currentWord: startWord,
            lastTurnStart: Date.now()
        });
        res.json({ message: '게임 시작', gameId, gameData: newGame });
    } catch (e) { res.status(500).json({ error: '생성 실패' }); }
});

// [POST] 단어 제출
router.post('/:gameId/submit', async (req, res) => {
    const { userId, playerType, word } = req.body;
    const { gameId } = req.params;

    try {
        const game = await Game.findOne({ gameId });
        if (!game || game.status !== 'playing') return res.status(400).json({ error: '게임 종료됨' });
        if (game.currentTurn !== playerType) return res.status(400).json({ error: '당신 차례 아님' });

        // 1. 시간 계산
        const now = Date.now();
        game.timers[playerType] -= (now - game.lastTurnStart) / 1000;
        
        if (game.timers[playerType] <= 0) { // 시간 초과 패배
            game.status = 'finished';
            game.winner = playerType === 'korean' ? 'japanese' : 'korean';
            await game.save();
            return res.json({ message: '시간 초과 패배', gameData: game });
        }

        // 한국인이든 일본인이든 입력한 단어를 검사합니다.
        const isRealWord = await checkWordExists(word, playerType);
    
        if (!isRealWord) {
            // 사전에 없는 단어면 패널티
            game.timers[playerType] -= 5; // 5초 차감
        
            // (중요) 시간이 0 이하로 떨어졌는지 바로 확인
            if (game.timers[playerType] <= 0) {
                game.status = 'finished';
                game.winner = playerType === 'korean' ? 'japanese' : 'korean';
                await game.save();
                return res.json({ message: '시간 초과! 패배했습니다.', gameData: game });
            }

            return res.status(400).json({ 
                error: `사전에 없는 단어입니다! (-5초)`, 
                gameData: game 
            });
        }

        // 2. 번역
        const source = playerType === 'korean' ? 'ko' : 'ja';
        const target = playerType === 'korean' ? 'ja' : 'ko';
        const translated = await translateWord(word, source, target);

        // 3. 'ん' 패배 규칙
        const checkWord = playerType === 'japanese' ? word : translated;
        if (checkWord.trim().endsWith('ん')) {
            game.status = 'finished';
            game.winner = playerType === 'korean' ? 'japanese' : 'korean';
            game.currentWord = { ko: word, ja: translated };
            await game.save();
            return res.json({ message: '"ん"으로 끝나 패배!', gameData: game });
        }

        // 4. 업데이트
        game.currentWord = { ko: playerType === 'korean' ? word : translated, ja: playerType === 'japanese' ? word : translated };
        game.currentTurn = playerType === 'korean' ? 'japanese' : 'korean';
        game.lastTurnStart = Date.now();
        game.history.push({ word, translated, player: playerType });
        
        await game.save();
        res.json({ message: '성공', translatedWord: translated, gameData: game });

    } catch (e) { res.status(500).json({ error: '서버 오류' }); }
});

/**
 * 3. 게임 상태 조회 API (수정됨: 시간 초과 자동 감지 기능 추가)
 * [GET] /api/games/:gameId/status
 */
router.get('/:gameId/status', async (req, res) => {
    const { gameId } = req.params;

    try {
        const game = await Game.findOne({ gameId: gameId });
        if (!game) return res.status(404).json({ error: '게임 없음' });

        // 게임이 진행 중일 때만 시간을 체크합니다.
        if (game.status === 'playing') {
            const now = Date.now();
            const elapsed = (now - game.lastTurnStart) / 1000; // 흐른 시간(초)
            const currentTurnPlayer = game.currentTurn;
            
            // 남은 시간 계산
            const timeLeft = game.timers[currentTurnPlayer] - elapsed;

            // 🚨 [핵심] 시간이 0초 이하로 떨어졌다면? -> 즉시 게임 종료 처리!
            if (timeLeft <= 0) {
                console.log(`⏰ 시간 초과 감지! 게임 종료: ${gameId}`);
                
                // 1. 시간 0으로 고정
                game.timers[currentTurnPlayer] = 0;
                
                // 2. 상태 종료로 변경
                game.status = 'finished';
                
                // 3. 승자 결정 (시간 다 쓴 사람의 반대편)
                game.winner = currentTurnPlayer === 'korean' ? 'japanese' : 'korean';
                
                // 4. ⭐ DB에 저장해버림 (영구 종료)
                await game.save();
            } 
            else {
                // 시간이 아직 남았다면, DB는 건드리지 않고 
                // 보여주는 데이터(displayGame)만 계산해서 보냄 (이전 방식 유지)
                // 주의: 여기서 game.save()를 하면 안 됨 (DB 부하 방지)
            }
        }

        // 프론트엔드에 보낼 때는 실시간 계산된 시간을 적용해서 보냄
        let displayGame = game.toObject();
        if (displayGame.status === 'playing') {
            const now = Date.now();
            const elapsed = (now - game.lastTurnStart) / 1000;
            displayGame.timers[displayGame.currentTurn] -= elapsed;
        }

        res.json(displayGame);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '상태 조회 실패' });
    }
});

module.exports = router;