const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const Game = require('../models/Game');
const { translateWord } = require('../utils/translator');

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

// [GET] 상태 확인
router.get('/:gameId/status', async (req, res) => {
    const game = await Game.findOne({ gameId: req.params.gameId });
    if (!game) return res.status(404).json({ error: '없음' });
    
    // 보여주기용 시간 계산 (DB 저장은 안함)
    let display = game.toObject();
    if (display.status === 'playing') {
        display.timers[display.currentTurn] -= (Date.now() - display.lastTurnStart) / 1000;
    }
    res.json(display);
});

module.exports = router;