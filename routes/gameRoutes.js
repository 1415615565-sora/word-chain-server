const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const Game = require('../models/Game');
const { translateWord } = require('../utils/translator');
const { checkWordExists } = require('../utils/dictionary');

// 🎲 시작 단어
const STARTING_WORDS = [
    { ko: '나무', ja: '木(き)' }, 
    { ko: '바다', ja: '海(うみ)' },
    { ko: '하늘', ja: '空(そら)' }, 
    { ko: '학교', ja: '学校(がっこう)' },
    { ko: '학생', ja: '学生(がくせい)' },
    { ko: '친구', ja: '友達(ともだち)' }
];

// 헬퍼 함수
function getCleanReading(text) {
    if (!text) return "";
    const match = text.match(/\(([^)]+)\)/);
    return match ? match[1] : text;
}

function normalizeKana(char) {
    const smallMap = {
        'ぁ': 'あ', 'ぃ': 'い', 'ぅ': 'う', 'ぇ': 'え', 'ぉ': 'お',
        'っ': 'つ',
        'ゃ': 'や', 'ゅ': 'ゆ', 'ょ': 'よ',
        'ゎ': 'わ'
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

// 2. 단어 제출 API
router.post('/:gameId/submit', async (req, res) => {
    const { gameId } = req.params;
    const { userId, playerType, word } = req.body;

    try {
        const game = await Game.findOne({ gameId: gameId });
        if (!game || game.status !== 'playing') return res.status(400).json({ error: '종료된 게임' });
        if (game.currentTurn !== playerType) return res.status(400).json({ error: '순서 아님' });

        // 1. 시간 계산 (현재까지 흐른 시간 차감)
        const now = Date.now();
        const elapsed = (now - game.lastTurnStart) / 1000;
        game.timers[playerType] -= elapsed;

        // 시간 초과 체크
        if (game.timers[playerType] <= 0) {
            return await endGame(game, playerType === 'korean' ? 'japanese' : 'korean', '시간 초과', res);
        }

        // 2. 중복 검사
        if (game.history.some(h => h.word.split('(')[0] === word)) {
            await applyPenalty(game, playerType, 5);
            return res.status(400).json({ error: '이미 쓴 단어! (-5초)', gameData: game });
        }

        // 3. 사전 검사
        const dictResult = await checkWordExists(word, playerType);
        if (!dictResult.isValid) {
            await applyPenalty(game, playerType, 5);
            return res.status(400).json({ error: '사전에 없는 단어! (-5초)', gameData: game });
        }

        const currentReading = dictResult.reading; 

        // 4. 끝말잇기 규칙 검사
        let previousWordRaw = playerType === 'korean' ? game.currentWord.ko : game.currentWord.ja;
        let previousSound = getCleanReading(previousWordRaw);
        let lastChar = normalizeKana(previousSound.trim().slice(-1)); 
        let firstChar = normalizeKana(currentReading.trim().charAt(0));

        // 장음(ー) 처리: 만약 끝글자가 장음이면 그 앞글자를 기준으로 함 (선택사항, 여기선 일단 장음 무시)
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

        // 5. 'ん' 패배 검사
        if (currentReading.trim().endsWith('ん')) {
            return await endGame(game, playerType === 'korean' ? 'japanese' : 'korean', `'ん'으로 끝남`, res);
        }

        // 6. 번역 및 포맷팅
        const sourceLang = playerType === 'korean' ? 'ko' : 'ja';
        const targetLang = playerType === 'korean' ? 'ja' : 'ko';
        let translatedText = await translateWord(word, sourceLang, targetLang);

        if (targetLang === 'ja') {
            const transCheck = await checkWordExists(translatedText, 'ja');
            if (transCheck.isValid && transCheck.reading !== translatedText) {
                translatedText = `${translatedText}(${transCheck.reading})`;
            }
        }

        let displayWord = word;
        if (playerType === 'japanese' && word !== currentReading) {
            displayWord = `${word}(${currentReading})`;
        }

        // 7. 성공 저장
        game.currentWord = {
            ko: playerType === 'korean' ? displayWord : translatedText,
            ja: playerType === 'japanese' ? displayWord : translatedText
        };
        game.currentTurn = playerType === 'korean' ? 'japanese' : 'korean';
        game.lastTurnStart = Date.now(); // ⭐ 성공했으니 기준 시간 초기화
        
        game.history.push({ word: displayWord, translated: translatedText, player: playerType });
        await game.save();

        res.json({ message: '성공', gameData: game });

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: '서버 오류' });
    }
});

// 상태 조회
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

async function endGame(game, winner, reason, res) {
    game.status = 'finished';
    game.winner = winner;
    await game.save();
    return res.json({ message: `${reason} 패배!`, gameData: game });
}

// ⭐ [수정된 부분] 패널티 적용 시 기준 시간(lastTurnStart)도 리셋해야 함!
async function applyPenalty(game, player, seconds) {
    game.timers[player] -= seconds;
    // 중요: 지금까지 흐른 시간은 이미 timers에서 뺐으므로,
    // 기준 시간을 '지금(Now)'으로 당겨줘야 다음 계산 때 중복으로 빼지 않음.
    game.lastTurnStart = Date.now(); 
    
    if (game.timers[player] < 0) game.timers[player] = 0;
    await game.save();
}

module.exports = router;

javascript
async function applyPenalty(game, player, seconds) {
    game.timers[player] -= seconds;
    game.lastTurnStart = Date.now(); 
    
    await game.save();
}