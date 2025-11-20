const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const Game = require('../models/Game');
const { translateWord } = require('../utils/translator');
const { checkWordExists } = require('../utils/dictionary');

// 🎲 랜덤 시작 단어 목록
const STARTING_WORDS = [
    { ko: '나무', ja: 'き' }, { ko: '바다', ja: 'うみ' },
    { ko: '하늘', ja: 'そら' }, { ko: '사랑', ja: 'あい' },
    { ko: '학교', ja: 'がっこう' }, { ko: '친구', ja: 'ともだち' }
];

/**
 * 1. 게임 시작 API
 * [POST] /api/games/start
 * - 방장이 호출하며, 선공과 시작 단어를 랜덤으로 정해 DB에 저장합니다.
 */
router.post('/start', async (req, res) => {
    const { roomId, koreanPlayerId, japanesePlayerId } = req.body;

    // 랜덤 결정: 선공(0 or 1) & 시작 단어
    const firstTurn = Math.random() < 0.5 ? 'korean' : 'japanese';
    const startWord = STARTING_WORDS[Math.floor(Math.random() * STARTING_WORDS.length)];
    const gameId = uuidv4();

    try {
        const newGame = await Game.create({
            gameId,
            roomId,
            players: { 
                korean: koreanPlayerId, 
                japanese: japanesePlayerId 
            },
            currentTurn: firstTurn,
            currentWord: startWord,
            lastTurnStart: Date.now(),
            timers: { korean: 90, japanese: 90 },
            history: []
        });

        console.log(`🎮 게임 시작 (ID: ${gameId}) - 선공: ${firstTurn}`);
        res.json({ message: '게임 시작', gameId, gameData: newGame });

    } catch (error) {
        console.error('게임 생성 실패:', error);
        res.status(500).json({ error: '게임 생성 실패' });
    }
});

/**
 * 2. 단어 제출 API (핵심 로직)
 * [POST] /api/games/:gameId/submit
 * - 끝말잇기 규칙, 사전 검사, 중복 단어 검사, 시간 계산 등을 수행합니다.
 */
router.post('/:gameId/submit', async (req, res) => {
    const { gameId } = req.params;
    const { userId, playerType, word } = req.body;

    try {
        // DB에서 게임 정보 조회
        const game = await Game.findOne({ gameId: gameId });

        // --- [1] 기본 유효성 검사 ---
        if (!game || game.status !== 'playing') {
            return res.status(400).json({ error: '종료된 게임입니다.' });
        }
        if (game.currentTurn !== playerType) {
            return res.status(400).json({ error: '당신의 차례가 아닙니다!' });
        }

        // --- [2] 시간 계산 및 타임오버 체크 ---
        const now = Date.now();
        const elapsed = (now - game.lastTurnStart) / 1000; // 경과 시간(초)
        game.timers[playerType] -= elapsed;

        if (game.timers[playerType] <= 0) {
            return await endGame(game, playerType === 'korean' ? 'japanese' : 'korean', '시간 초과', res);
        }

        // --- [3] 이미 사용한 단어인지 검사 (새로 추가됨 ✨) ---
        // history 배열을 뒤져서 같은 단어가 있는지 확인 (한국어 기준 비교)
        const isUsed = game.history.some(record => record.word === word);
        if (isUsed) {
            await applyPenalty(game, playerType, 5); // 5초 패널티
            return res.status(400).json({ error: `이미 사용된 단어입니다! (-5초)`, gameData: game });
        }

        // --- [4] 끝말잇기 규칙 검사 (글자 이어지는지) ---
        // 한국인: 이전 단어의 한국어 뜻 끝글자 <-> 입력 단어 첫글자
        // 일본인: 이전 단어의 일본어 뜻 끝글자 <-> 입력 단어 첫글자
        let targetWord = playerType === 'korean' ? game.currentWord.ko : game.currentWord.ja;
        const lastChar = targetWord.trim().slice(-1);
        const firstChar = word.trim().charAt(0);

        if (lastChar !== firstChar) {
            await applyPenalty(game, playerType, 5);
            return res.status(400).json({ error: `땡! '${lastChar}'(으)로 시작해야 합니다! (-5초)`, gameData: game });
        }

        // --- [5] 사전 유효성 검사 (외부 API) ---
        const isRealWord = await checkWordExists(word, playerType);
        if (!isRealWord) {
            await applyPenalty(game, playerType, 5);
            return res.status(400).json({ error: `사전에 없는 단어입니다! (-5초)`, gameData: game });
        }

        // --- [6] 번역 수행 ---
        const sourceLang = playerType === 'korean' ? 'ko' : 'ja';
        const targetLang = playerType === 'korean' ? 'ja' : 'ko';
        const translatedText = await translateWord(word, sourceLang, targetLang);

        // --- [7] 'ん'(응/ㄴ) 패배 규칙 검사 ---
        // 일본인이 입력했거나, 한국어가 번역된 일본어 단어의 끝이 'ん'이면 패배
        const checkJpWord = playerType === 'japanese' ? word : translatedText;
        if (checkJpWord.trim().endsWith('ん')) {
            return await endGame(game, playerType === 'korean' ? 'japanese' : 'korean', `'ん'으로 끝났습니다!`, res);
        }

        // --- [8] 성공 처리: 데이터 업데이트 및 저장 ---
        game.currentWord = {
            ko: playerType === 'korean' ? word : translatedText,
            ja: playerType === 'japanese' ? word : translatedText
        };
        game.currentTurn = playerType === 'korean' ? 'japanese' : 'korean'; // 턴 넘김
        game.lastTurnStart = Date.now(); // 시간 기준점 초기화

        // 기록 추가
        game.history.push({
            word: word,
            translated: translatedText,
            player: playerType,
            createdAt: new Date()
        });

        await game.save(); // DB 저장

        res.json({ message: '성공', translatedWord: translatedText, gameData: game });

    } catch (error) {
        console.error('제출 처리 중 오류:', error);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

/**
 * 3. 게임 상태 조회 API (폴링용)
 * [GET] /api/games/:gameId/status
 * - 0초가 되면 자동으로 게임을 종료시키는 로직 포함
 */
router.get('/:gameId/status', async (req, res) => {
    const { gameId } = req.params;

    try {
        const game = await Game.findOne({ gameId: gameId });
        if (!game) return res.status(404).json({ error: '게임 없음' });

        // 게임 중일 때만 시간 자동 감소 체크
        if (game.status === 'playing') {
            const now = Date.now();
            const elapsed = (now - game.lastTurnStart) / 1000;
            const currentTurnPlayer = game.currentTurn;
            const timeLeft = game.timers[currentTurnPlayer] - elapsed;

            // 시간이 다 되었으면 강제 종료
            if (timeLeft <= 0) {
                console.log(`⏰ 시간 초과 감지 (ID: ${gameId})`);
                game.timers[currentTurnPlayer] = 0;
                game.status = 'finished';
                game.winner = currentTurnPlayer === 'korean' ? 'japanese' : 'korean';
                await game.save();
            }
        }

        // 클라이언트에게 보낼 때는 계산된 시간을 적용해서 전송 (DB 저장 X)
        let displayGame = game.toObject();
        if (displayGame.status === 'playing') {
            const now = Date.now();
            const elapsed = (now - displayGame.lastTurnStart) / 1000;
            displayGame.timers[displayGame.currentTurn] -= elapsed;
        }

        res.json(displayGame);

    } catch (error) {
        console.error('상태 조회 오류:', error);
        res.status(500).json({ error: '상태 조회 실패' });
    }
});

// --- [헬퍼 함수들] ---

// 게임 종료 처리 함수
async function endGame(game, winner, reason, res) {
    game.status = 'finished';
    game.winner = winner;
    if (game.timers[game.currentTurn] < 0) game.timers[game.currentTurn] = 0;
    await game.save();
    return res.json({ message: `${reason} 패배했습니다.`, gameData: game });
}

// 패널티 적용 함수
async function applyPenalty(game, playerType, seconds) {
    game.timers[playerType] -= seconds;
    if (game.timers[playerType] < 0) {
        // 패널티로 인해 죽는 경우는 submit 함수 내에서 별도 처리하거나 여기서 처리 가능
        // 현재 구조상 여기서는 시간만 깎고 저장은 호출자가 수행
    }
    await game.save();
}

module.exports = router;