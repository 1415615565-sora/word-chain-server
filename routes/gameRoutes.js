const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const Game = require('../models/Game');
const { translateWord } = require('../utils/translator');
const { checkWordExists } = require('../utils/dictionary');

// 시작 단어 (한자+히라가나 표기)
const STARTING_WORDS = [
    { ko: '나무', ja: '木(き)' }, 
    { ko: '바다', ja: '海(うみ)' },
    { ko: '하늘', ja: '空(そら)' }, 
    { ko: '학교', ja: '学校(がっこう)' },
    { ko: '학생', ja: '学生(がくせい)' },
    { ko: '친구', ja: '友達(ともだち)' }
];

// 헬퍼: 괄호 안의 히라가나 추출 ("水(みず)" -> "みず")
function getCleanReading(text) {
    if (!text) return "";
    const match = text.match(/\(([^)]+)\)/);
    return match ? match[1] : text;
}

// 헬퍼: 작은 글자를 큰 글자로 변환 (ゃ -> や)
function normalizeKana(char) {
    const smallMap = {
        'ぁ': 'あ', 'ぃ': 'い', 'ぅ': 'う', 'ぇ': 'え', 'ぉ': 'お',
        'っ': 'つ',
        'ゃ': 'や', 'ゅ': 'ゆ', 'ょ': 'よ', 'ゎ': 'わ'
    };
    return smallMap[char] || char;
}

// 1. 게임 시작 API
router.post('/start', async (req, res) => {
    const { roomId, koreanPlayerId, japanesePlayerId } = req.body;
    const firstTurn = Math.random() < 0.5 ? 'korean' : 'japanese';
    const startWord = STARTING_WORDS[Math.floor(Math.random() * STARTING_WORDS.length)];
    const gameId = uuidv4();

    try {
        const newGame = await Game.create({
            gameId, roomId,
            players: { korean: koreanPlayerId, japanese: japanesePlayerId },
            currentTurn: firstTurn,
            currentWord: startWord,
            lastTurnStart: Date.now(),
            timers: { korean: 90, japanese: 90 },
            history: []
        });
        console.log(`🎮 게임 시작 (ID: ${gameId})`);
        res.json({ message: '게임 시작', gameId, gameData: newGame });
    } catch (error) { res.status(500).json({ error: '생성 실패' }); }
});

// 2. 단어 제출 API (핵심)
router.post('/:gameId/submit', async (req, res) => {
    const { gameId } = req.params;
    const { userId, playerType, word } = req.body;

    try {
        const game = await Game.findOne({ gameId: gameId });
        if (!game || game.status !== 'playing') return res.status(400).json({ error: '종료된 게임' });
        if (game.currentTurn !== playerType) return res.status(400).json({ error: '순서 아님' });

        // [시간 계산]
        const now = Date.now();
        const elapsed = (now - game.lastTurnStart) / 1000;
        game.timers[playerType] -= elapsed;

        if (game.timers[playerType] <= 0) {
            return await endGame(game, playerType === 'korean' ? 'japanese' : 'korean', '시간 초과', res);
        }

        // [중복 검사] 괄호 앞 단어만 비교 (水 == 水)
        if (game.history.some(h => h.word.split('(')[0] === word)) {
            await applyPenalty(game, playerType, 5);
            return res.status(400).json({ error: '이미 쓴 단어! (-5초)', gameData: game });
        }

        // [사전 검사] 존재 여부 및 읽기(히라가나) 가져오기
        const dictResult = await checkWordExists(word, playerType);
        if (!dictResult.isValid) {
            await applyPenalty(game, playerType, 5);
            return res.status(400).json({ error: '사전에 없는 단어! (-5초)', gameData: game });
        }

        const currentReading = dictResult.reading; // 예: "みず"

        // [끝말잇기 규칙 검사]
        let previousWordRaw = playerType === 'korean' ? game.currentWord.ko : game.currentWord.ja;
        let previousSound = getCleanReading(previousWordRaw); // 이전 단어 소리
        
        let lastChar = normalizeKana(previousSound.trim().slice(-1)); // 끝 글자 (큰 글자로)
        let firstChar = normalizeKana(currentReading.trim().charAt(0)); // 첫 글자 (큰 글자로)
        
        // 장음(ー) 처리: 끝이 장음이면 그 앞 글자를 기준으로 함
        if (lastChar === 'ー') {
             lastChar = normalizeKana(previousSound.trim().slice(-2, -1));
        }

        if (lastChar !== firstChar) {
            await applyPenalty(game, playerType, 5);
            return res.status(400).json({ 
                error: `땡! 소리가 '${lastChar}'(으)로 시작해야 합니다! (-5초)`, 
                gameData: game 
            });
        }

        // ['ん' 패배 검사]
        if (currentReading.trim().endsWith('ん')) {
            return await endGame(game, playerType === 'korean' ? 'japanese' : 'korean', `'ん'으로 끝남`, res);
        }

        // [번역 및 포맷팅]
        const sourceLang = playerType === 'korean' ? 'ko' : 'ja';
        const targetLang = playerType === 'korean' ? 'ja' : 'ko';
        let translatedText = await translateWord(word, sourceLang, targetLang);

        // 번역된 단어도 읽기(히라가나) 찾아서 붙이기
        if (targetLang === 'ja') {
            const transCheck = await checkWordExists(translatedText, 'ja');
            if (transCheck.isValid && transCheck.reading !== translatedText) {
                translatedText = `${translatedText}(${transCheck.reading})`;
            }
        }

        // 일본어 입력 단어 포맷팅 (한자 -> 한자(히라가나))
        let displayWord = word;
        if (playerType === 'japanese' && word !== currentReading) {
            displayWord = `${word}(${currentReading})`;
        }

        // [성공 저장]
        game.currentWord = {
            ko: playerType === 'korean' ? displayWord : translatedText,
            ja: playerType === 'japanese' ? displayWord : translatedText
        };
        game.currentTurn = playerType === 'korean' ? 'japanese' : 'korean';
        game.lastTurnStart = Date.now(); // ⭐ 시간 기준점 초기화 (중요)
        
        game.history.push({ word: displayWord, translated: translatedText, player: playerType });
        await game.save();

        res.json({ message: '성공', gameData: game });

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: '서버 오류' });
    }
});

// 3. 상태 조회 API (0초 자동 종료 포함)
router.get('/:gameId/status', async (req, res) => {
    const { gameId } = req.params;
    try {
        const game = await Game.findOne({ gameId: gameId });
        if (!game) return res.status(404).json({ error: '게임 없음' });
        
        if (game.status === 'playing') {
            const now = Date.now();
            const elapsed = (now - game.lastTurnStart) / 1000;
            const timeLeft = game.timers[game.currentTurn] - elapsed;
            
            if (timeLeft <= 0) {
                game.timers[game.currentTurn] = 0;
                game.status = 'finished';
                game.winner = game.currentTurn === 'korean' ? 'japanese' : 'korean';
                await game.save();
            }
        }
        
        let displayGame = game.toObject();
        if (displayGame.status === 'playing') {
            displayGame.timers[displayGame.currentTurn] -= (Date.now() - displayGame.lastTurnStart) / 1000;
        }
        res.json(displayGame);
    } catch (error) { res.status(500).json({ error: '실패' }); }
});

// 종료 헬퍼
async function endGame(game, winner, reason, res) {
    game.status = 'finished';
    game.winner = winner;
    await game.save();
    return res.json({ message: `${reason} 패배!`, gameData: game });
}

// 패널티 헬퍼 (시간 중복 차감 방지 적용됨 ⭐)
async function applyPenalty(game, player, seconds) {
    game.timers[player] -= seconds;
    game.lastTurnStart = Date.now(); // ⭐ 기준 시간 리셋!
    
    if (game.timers[player] < 0) game.timers[player] = 0;
    await game.save();
}

module.exports = router;