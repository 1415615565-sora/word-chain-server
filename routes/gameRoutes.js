const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const Game = require('../models/Game');
const { translateWord } = require('../utils/translator');
const { checkWordExists } = require('../utils/dictionary');
const { verifyShiritoriRule } = require('../utils/gameRules'); // 분리된 로직 임포트

// 시작 단어
const STARTING_WORDS = [
    { ko: '나무', ja: '木(き)' }, { ko: '바다', ja: '海(うみ)' },
    { ko: '하늘', ja: '空(そら)' }, { ko: '학교', ja: '学校(がっこう)' },
    { ko: '학생', ja: '学生(がくせい)' }, { ko: '친구', ja: '友達(ともだち)' }
];

// [1] 게임 시작
router.post('/start', async (req, res) => {
    const { roomId, koreanPlayerId, japanesePlayerId } = req.body;
    const gameId = uuidv4();

    try {
        const newGame = await Game.create({
            gameId, roomId,
            players: { korean: koreanPlayerId, japanese: japanesePlayerId },
            currentTurn: Math.random() < 0.5 ? 'korean' : 'japanese',
            currentWord: STARTING_WORDS[Math.floor(Math.random() * STARTING_WORDS.length)],
            lastTurnStart: Date.now(),
            timers: { korean: 90, japanese: 90 },
            history: []
        });
        console.log(`🎮 게임 시작 (ID: ${gameId})`);
        res.json({ message: '게임 시작', gameId, gameData: newGame });
    } catch (error) { res.status(500).json({ error: '게임 생성 실패' }); }
});

// [2] 단어 제출 (핵심)
router.post('/:gameId/submit', async (req, res) => {
    const { gameId } = req.params;
    const { userId, playerType, word } = req.body; // word: 유저가 입력한 원본 텍스트

    try {
        const game = await Game.findOne({ gameId });
        if (!game || game.status !== 'playing') return res.status(400).json({ error: '종료된 게임' });
        if (game.currentTurn !== playerType) return res.status(400).json({ error: '당신의 턴이 아닙니다.' });

        // 1. 시간 차감 로직
        const now = Date.now();
        const elapsed = (now - game.lastTurnStart) / 1000;
        game.timers[playerType] = Math.max(0, game.timers[playerType] - elapsed); // 음수 방지

        if (game.timers[playerType] <= 0) {
            return await endGame(game, playerType === 'korean' ? 'japanese' : 'korean', '시간 초과', res);
        }

        // 2. 중복 검사
        // (입력된 단어 앞부분만 잘라서 히스토리와 비교)
        const cleanInput = word.split('(')[0]; 
        if (game.history.some(h => h.word.split('(')[0] === cleanInput)) {
            return await applyPenalty(game, playerType, 5, '이미 사용한 단어입니다.', res);
        }

        // 3. 사전 검사 (존재 여부 + 읽기 가져오기)
        const dictResult = await checkWordExists(word, playerType);
        if (!dictResult.isValid) {
            return await applyPenalty(game, playerType, 5, '사전에 없는 단어입니다.', res);
        }
        const currentReading = dictResult.reading; // 일본어면 히라가나, 한국어면 원문

        // 4. 끝말잇기 규칙 검사 (별도 유틸 함수 사용)
        const previousWordRaw = playerType === 'korean' ? game.currentWord.ko : game.currentWord.ja;
        const ruleCheck = verifyShiritoriRule(previousWordRaw, currentReading);

        if (!ruleCheck.isValid) {
            return await applyPenalty(game, playerType, 5, 
                `땡! '${ruleCheck.requiredSound}'(으)로 시작해야 합니다.`, res);
        }

        // 5. 'ん' 패배 조건 (일본어 입력 시)
        if (currentReading.trim().endsWith('ん')) {
            return await endGame(game, playerType === 'korean' ? 'japanese' : 'korean', `'ん'(응)으로 끝났습니다.`, res);
        }

        // 6. 번역 및 데이터 포맷팅
        const sourceLang = playerType === 'korean' ? 'ko' : 'ja';
        const targetLang = playerType === 'korean' ? 'ja' : 'ko';
        let translatedText = await translateWord(word, sourceLang, targetLang);

        // 번역된 일본어에도 후리가나 붙이기 시도
        if (targetLang === 'ja') {
            const transCheck = await checkWordExists(translatedText, 'ja');
            if (transCheck.isValid && transCheck.reading !== translatedText) {
                translatedText = `${translatedText}(${transCheck.reading})`;
            }
        }

        // 일본어 플레이어가 한자를 입력했을 때 포맷팅: "漢字" -> "漢字(かんじ)"
        let displayWord = word;
        if (playerType === 'japanese' && word !== currentReading) {
            displayWord = `${word}(${currentReading})`;
        }

        // 7. 저장 및 턴 넘기기
        game.currentWord = {
            ko: playerType === 'korean' ? displayWord : translatedText,
            ja: playerType === 'japanese' ? displayWord : translatedText
        };
        game.currentTurn = playerType === 'korean' ? 'japanese' : 'korean';
        game.lastTurnStart = Date.now(); // 시간 리셋
        game.history.push({ word: displayWord, translated: translatedText, player: playerType });
        
        await game.save();
        res.json({ message: '성공', gameData: game });

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: '서버 내부 오류' });
    }
});

// [3] 상태 조회 (폴링)
router.get('/:gameId/status', async (req, res) => {
    try {
        const game = await Game.findOne({ gameId: req.params.gameId });
        if (!game) return res.status(404).json({ error: '게임 없음' });

        // 실시간 타이머 계산 (DB저장 X, 보여주기용 계산)
        let displayGame = game.toObject();
        if (displayGame.status === 'playing') {
            const now = Date.now();
            const elapsed = (now - displayGame.lastTurnStart) / 1000;
            displayGame.timers[displayGame.currentTurn] = Math.max(0, displayGame.timers[displayGame.currentTurn] - elapsed);

            // 시간이 0이 되면 실제로 게임 종료 처리 (여기서 트리거)
            if (displayGame.timers[displayGame.currentTurn] <= 0) {
                await endGame(game, displayGame.currentTurn === 'korean' ? 'japanese' : 'korean', '시간 초과', { json: () => {} }); 
                // 주의: 여기서 res.json을 바로 하지 않고, 갱신된 game 객체를 반환하도록 로직 수정 필요할 수 있음. 
                // 편의상 클라이언트는 다음 폴링 때 종료를 알게 됨.
                displayGame.status = 'finished'; 
            }
        }
        res.json(displayGame);
    } catch (error) { res.status(500).json({ error: '조회 실패' }); }
});

// --- 헬퍼 함수 ---

async function endGame(game, winner, reason, res) {
    game.status = 'finished';
    game.winner = winner;
    await game.save();
    // res가 실제 응답 객체일 때만 json 호출
    if (res.json) res.json({ message: `${reason} 패배!`, gameData: game });
}

async function applyPenalty(game, player, seconds, message, res) {
    game.timers[player] = Math.max(0, game.timers[player] - seconds);
    game.lastTurnStart = Date.now(); // 패널티 먹고 턴 시간 리셋
    await game.save();
    res.status(400).json({ error: `${message} (-${seconds}초)`, gameData: game });
}

module.exports = router;