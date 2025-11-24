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

        // [3] 규칙 검사
        const previousWordRaw = playerType === 'korean' ? game.currentWord.ko : game.currentWord.ja;
        const ruleCheck = verifyShiritoriRule(previousWordRaw, dictResult.reading);
        if (!ruleCheck.isValid) return await applyPenalty(game, playerType, 5, `땡! '${ruleCheck.requiredSound}'(으)로 시작하세요`, res);

        if (playerType === 'japanese' && (dictResult.reading.trim().endsWith('ん') || dictResult.reading.trim().endsWith('ン'))) {
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

// 3. 상태 조회 (턴인 사람만 타임아웃 체크)
router.get('/:gameId/status', async (req, res) => {
    const { gameId } = req.params;
    const { playerType } = req.query;

    try {
        const game = await Game.findOne({ gameId });
        if (!game) return res.status(404).json({ error: '게임 없음' });
        
        let responseData = game.toObject();
        const now = Date.now();

        if (game.status === 'playing') {
            // [1] 심박수 갱신 (누구든지 요청을 보내면 생존 신고)
            if (playerType) {
                game.lastActive[playerType] = now;
                // DB 업데이트 (다른 필드 영향 없이 lastActive만 갱신)
                await Game.updateOne({ gameId }, { [`lastActive.${playerType}`]: now });
            }

            // [2] "현재 턴인 플레이어" 잠수 체크
            const currentTurnPlayer = game.currentTurn; 
            const lastActiveTime = new Date(game.lastActive[currentTurnPlayer]).getTime();

            // 30초 경과 시
            if (now - lastActiveTime > 30000) {
                const winner = currentTurnPlayer === 'korean' ? 'japanese' : 'korean';
    
                game.status = 'finished';
                game.winner = winner;
                game.winnerReason = '상대방의 응답이 없습니다 (연결 끊김)'; //승리 사유
                await game.save();

                // 방도 같이 삭제 (청소)
                await Room.deleteOne({ roomId: game.roomId });

                return res.json(game); //남은 사람에게 "너가 이겼어"라고 알려줌
            }
            
            // 현재 턴인 사람이 30초(30000ms) 동안 활동이 없으면 아웃
            if (now - lastActiveTime > 30000) {
                const winner = currentTurnPlayer === 'korean' ? 'japanese' : 'korean';
                
                game.status = 'finished';
                game.winner = winner;
                game.winnerReason = '상대방의 응답이 없습니다 (30초 경과)'; // 사유 변경
                await game.save();

                // 방 삭제
                await Room.deleteOne({ roomId: game.roomId });
                console.log(`턴 플레이어 잠수(30초)로 방 삭제: ${game.roomId}`);

                return res.json(game);
            }

            // [3] 게임 타이머 및 카운트다운 로직
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