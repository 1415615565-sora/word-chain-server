const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const Game = require('../models/Game');
const Room = require('../models/Room');
const { translateWord } = require('../utils/translator');
const { checkWordExists } = require('../utils/dictionary');
const { verifyShiritoriRule } = require('../utils/gameRules');

// 시작 단어 리스트
const STARTING_WORDS = [
    { ko: '나무', ja: '木(き)' }, 
    { ko: '바다', ja: '海(うみ)' },
    { ko: '하늘', ja: '空(そら)' }, 
    { ko: '학교', ja: '学校(がっこう)' },
    { ko: '학생', ja: '学生(がくせい)' }, 
    { ko: '친구', ja: '友達(ともだち)' }
];

// 1. 게임 시작
router.post('/start', async (req, res) => {
    const { roomId, koreanPlayerId, japanesePlayerId } = req.body;
    const gameId = uuidv4();
    const startTime = Date.now() + 3000;

    try {
        await Game.create({
            gameId, roomId,
            players: { korean: koreanPlayerId, japanese: japanesePlayerId },
            currentTurn: Math.random() < 0.5 ? 'korean' : 'japanese',
            currentWord: STARTING_WORDS[Math.floor(Math.random() * STARTING_WORDS.length)],
            startTime: startTime,
            lastTurnStart: startTime, 
            timers: { korean: 90, japanese: 90 },
            lastActive: { korean: Date.now(), japanese: Date.now() },
            history: []
        });
        res.json({ message: '게임 생성 완료', gameId, startTime });
    } catch (e) { res.status(500).json({ error: '생성 실패' }); }
});

// 2. 단어 제출
router.post('/:gameId/submit', async (req, res) => {
    const { gameId } = req.params;
    const { userId, playerType, word } = req.body;

    try {
        const game = await Game.findOne({ gameId });
        if (!game || game.status !== 'playing') return res.status(400).json({ error: '종료된 게임' });
        
        if (Date.now() < game.startTime) return res.status(400).json({ error: '아직 게임 시작 전입니다.' });
        if (game.currentTurn !== playerType) return res.status(400).json({ error: '순서 아님' });

        game.lastActive[playerType] = Date.now();

        // 시간 계산
        const now = Date.now();
        const elapsed = (now - game.lastTurnStart) / 1000;
        game.timers[playerType] = Math.max(0, game.timers[playerType] - elapsed);

        if (game.timers[playerType] <= 0) return await endGame(game, playerType === 'korean' ? 'japanese' : 'korean', '시간 초과', res);

        // [1] 중복 검사
        const cleanInput = word.split('(')[0];
        const isDuplicate = game.history.some(h => {
            const cleanHistoryWord = h.word.split('(')[0];
            const cleanHistoryTranslated = h.translated.split('(')[0];
            return cleanHistoryWord === cleanInput || cleanHistoryTranslated === cleanInput;
        });

        if (isDuplicate) {
            return await applyPenalty(game, playerType, 5, '이미 사용된 단어(또는 번역어)입니다', res);
        }

        // [2] 사전 검사
        const dictResult = await checkWordExists(word, playerType);
        if (!dictResult.isValid) return await applyPenalty(game, playerType, 5, '사전에 없는 단어입니다.', res);

        // [3] 끝말잇기 규칙 검사
        const previousWordRaw = playerType === 'korean' ? game.currentWord.ko : game.currentWord.ja;
        const ruleCheck = verifyShiritoriRule(previousWordRaw, dictResult.reading);
        if (!ruleCheck.isValid) return await applyPenalty(game, playerType, 5, `땡! '${ruleCheck.requiredSound}'(으)로 시작하세요`, res);

        // 🚀 [수정됨] 일본어 플레이어가 입력한 단어가 'ん' 또는 'ン'으로 끝나는지 확인
        const reading = dictResult.reading.trim();
        if (playerType === 'japanese' && (reading.endsWith('ん') || reading.endsWith('ン'))) {
             return await endGame(game, 'korean', `'ん(ン)'으로 끝남`, res);
        }

        // [4] 번역
        const sourceLang = playerType === 'korean' ? 'ko' : 'ja';
        const targetLang = playerType === 'korean' ? 'ja' : 'ko';
        let translatedText = await translateWord(word, sourceLang, targetLang);

        // [5] 교차 검증
        const transCheck = await checkWordExists(translatedText, targetLang);
        if (!transCheck.isValid) {
            return await applyPenalty(game, playerType, 5, `번역된 결과(${translatedText})가 사전에 없어 사용할 수 없습니다.`, res);
        }

        // 🚀 [수정됨] 번역된 일본어 단어가 'ん' 또는 'ン'으로 끝나는지 확인
        // 예: '라면' -> 'ラーメン'(라-멘) -> 패배
        if (targetLang === 'ja') {
            const transReading = transCheck.reading.trim();
            if (transReading.endsWith('ん') || transReading.endsWith('ン')) {
                return await endGame(game, playerType === 'korean' ? 'japanese' : 'korean', 
                    `번역된 단어(${translatedText})가 'ん(ン)'으로 끝나 패배!`, res);
            }
        }

        if (targetLang === 'ja' && transCheck.reading !== translatedText) {
            translatedText = `${translatedText}(${transCheck.reading})`;
        }

        let displayWord = word;
        if (playerType === 'japanese' && word !== dictResult.reading) {
            displayWord = `${word}(${dictResult.reading})`;
        }

        game.currentWord = {
            ko: playerType === 'korean' ? displayWord : translatedText,
            ja: playerType === 'japanese' ? displayWord : translatedText
        };
        game.currentTurn = playerType === 'korean' ? 'japanese' : 'korean';
        game.lastTurnStart = Date.now();
        game.history.push({ word: displayWord, translated: translatedText, player: playerType });
        
        await game.save();
        res.json({ message: '성공', gameData: game });

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: '오류' });
    }
});

// ... (status, endGame 등 나머지 코드는 기존과 동일)
// 3. 상태 조회
router.get('/:gameId/status', async (req, res) => {
    const { gameId } = req.params;
    const { playerType } = req.query;

    try {
        const game = await Game.findOne({ gameId });
        if (!game) return res.status(404).json({ error: '게임 없음' });
        
        let responseData = game.toObject();
        const now = Date.now();

        if (game.status === 'playing') {
            if (playerType) {
                game.lastActive[playerType] = now;
                await Game.updateOne({ gameId }, { [`lastActive.${playerType}`]: now });
            
                const opponent = playerType === 'korean' ? 'japanese' : 'korean';
                const lastSeen = new Date(game.lastActive[opponent]).getTime();
                
                if (now - lastSeen > 15000) {
                    game.status = 'finished';
                    game.winner = playerType;
                    game.winnerReason = '상대방 연결 끊김';
                    await game.save();
                    await Room.deleteOne({ roomId: game.roomId });
                    return res.json(game);
                }
            }

            if (now < game.startTime) {
                responseData.countdown = Math.ceil((game.startTime - now) / 1000);
                responseData.isStarting = true; 
            } else {
                responseData.isStarting = false;
                const elapsed = (now - game.lastTurnStart) / 1000;
                responseData.timers[game.currentTurn] = Math.max(0, game.timers[game.currentTurn] - elapsed);
                
                if (responseData.timers[game.currentTurn] <= 0) {
                    return await endGame(game, game.currentTurn === 'korean' ? 'japanese' : 'korean', '시간 초과', res);
                }
            }
        }
        res.json(responseData);
    } catch (error) { res.status(500).json({ error: '실패' }); }
});

async function endGame(game, winner, reason, res) {
    game.status = 'finished';
    game.winner = winner;
    game.winnerReason = reason;
    await game.save();
    await Room.deleteOne({ roomId: game.roomId });
    return res.json({ message: `${reason} 패배!`, gameData: game });
}

async function applyPenalty(game, player, seconds, message, res) {
    game.timers[player] = Math.max(0, game.timers[player] - seconds);
    game.lastTurnStart = Date.now();
    await game.save();
    return res.status(400).json({ error: `${message} (-${seconds}초)`, gameData: game });
}

module.exports = router;