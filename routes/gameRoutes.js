const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { translateWord } = require('../utils/translator'); // 번역기

// 💾 게임 상태 저장소 (DB 대용)
let games = {};

// 🎲 랜덤 시작 단어 목록 (한국어/일본어 쌍)
const STARTING_WORDS = [
    { ko: '나무', ja: 'き' },
    { ko: '바다', ja: 'うみ' },
    { ko: '하늘', ja: 'そら' },
    { ko: '사랑', ja: 'あい' },
    { ko: '학교', ja: 'がっこう' }
];

/**
 * 1. 게임 시작 API (방장이 누름)
 * [POST] /api/games/start
 * - 선공 랜덤 결정, 시작 단어 랜덤 결정
 */
router.post('/start', (req, res) => {
    const { roomId, koreanPlayerId, japanesePlayerId } = req.body;

    // 1. 선공 랜덤 결정 (0 또는 1)
    const firstTurn = Math.random() < 0.5 ? 'korean' : 'japanese';

    // 2. 시작 단어 랜덤 뽑기
    const randomWordObj = STARTING_WORDS[Math.floor(Math.random() * STARTING_WORDS.length)];

    // 3. 게임 세션 생성
    const gameId = uuidv4();
    games[gameId] = {
        gameId: gameId,
        roomId: roomId,
        players: {
            korean: koreanPlayerId,
            japanese: japanesePlayerId
        },
        timers: {
            korean: 90,  // 90초
            japanese: 90 // 90초
        },
        lastTurnStart: Date.now(), // 턴 시작 시간 기록
        currentTurn: firstTurn,    // 현재 차례
        currentWord: randomWordObj, // 현재 단어 (한/일 쌍)
        status: 'playing',         // 게임 중
        winner: null               // 승자
    };

    console.log(`🎮 게임 시작! ID: ${gameId}, 선공: ${firstTurn}, 단어: ${randomWordObj.ko}`);

    res.json({
        message: '게임이 시작되었습니다!',
        gameId: gameId,
        gameData: games[gameId]
    });
});

/**
 * 2. 단어 제출 API (심판 로직의 핵심!)
 * [POST] /api/games/:gameId/submit
 */
router.post('/:gameId/submit', async (req, res) => {
    const { gameId } = req.params;
    const { userId, playerType, word } = req.body; // word: 플레이어가 입력한 단어

    const game = games[gameId];

    // --- [검사 1] 유효한 게임인가? ---
    if (!game || game.status !== 'playing') {
        return res.status(400).json({ error: '종료되었거나 없는 게임입니다.' });
    }

    // --- [검사 2] 당신 차례인가? ---
    if (game.currentTurn !== playerType) {
        return res.status(400).json({ error: '당신의 차례가 아닙니다!' });
    }

    // --- [⏱️ 시간 계산] ---
    const now = Date.now();
    const timeSpent = (now - game.lastTurnStart) / 1000; // 소요 시간(초)
    
    // 남은 시간 차감
    game.timers[playerType] -= timeSpent;

    // 시간 초과 패배 확인
    if (game.timers[playerType] <= 0) {
        game.timers[playerType] = 0;
        game.status = 'finished';
        game.winner = playerType === 'korean' ? 'japanese' : 'korean'; // 상대방 승리
        return res.json({ message: '시간 초과! 패배했습니다.', gameData: game });
    }

    // --- [번역 수행] ---
    let sourceLang = playerType === 'korean' ? 'ko' : 'ja';
    let targetLang = playerType === 'korean' ? 'ja' : 'ko';
    let translatedText = '';

    try {
        // 플레이어가 입력한 단어를 번역
        translatedText = await translateWord(word, sourceLang, targetLang);
    } catch (e) {
        return res.status(500).json({ error: '번역 서버 오류' });
    }

    // --- [📜 규칙 검사 로직] ---
    
    // A. 끝말잇기 규칙 (이전 단어의 끝 글자와 일치하는가?)
    // (주의: 일본어 끝말잇기 규칙 등 복잡한 처리는 간소화했습니다. 실제로는 히라가나 변환 필요)
    // 여기서는 간단히 로직 흐름만 구현합니다.
    
    // B. 'ん' (응/ㄴ) 패배 규칙 검사
    // 입력한 단어(일본어인 경우) 혹은 번역된 단어(일본어인 경우)의 끝이 'ん'인가?
    let japaneseWordToCheck = playerType === 'japanese' ? word : translatedText;
    
    // 일본어 텍스트의 마지막 글자가 'ん' 인지 확인
    if (japaneseWordToCheck.trim().endsWith('ん')) {
        game.status = 'finished';
        game.winner = playerType === 'korean' ? 'japanese' : 'korean'; // 'ん'을 쓴 사람 패배
        return res.json({ 
            message: `끝글자가 'ん'(${japaneseWordToCheck})입니다! 패배!`, 
            gameData: game 
        });
    }

    // C. (옵션) 오답 패널티 로직
    // 만약 끝말이 안 이어지는 오답이라면? (여기서는 예시로 '틀렸다'고 가정하는 플래그를 받거나 로직 추가 필요)
    /*
    if ( isWrongWord ) {
        game.timers[playerType] -= 5; // 5초 삭감
        if (game.timers[playerType] <= 0) { ...패배처리... }
        return res.status(400).json({ error: '틀린 단어입니다! -5초', gameData: game });
    }
    */

    // --- [✅ 성공 처리] ---
    
    // 1. 현재 단어 업데이트
    game.currentWord = {
        ko: playerType === 'korean' ? word : translatedText,
        ja: playerType === 'japanese' ? word : translatedText
    };

    // 2. 턴 넘기기
    game.currentTurn = playerType === 'korean' ? 'japanese' : 'korean';
    game.lastTurnStart = Date.now(); // 타이머 기준 시간 초기화

    res.json({
        message: '성공!',
        translatedWord: translatedText,
        gameData: game
    });
});

/**
 * 3. 게임 상태 조회 (폴링용)
 * [GET] /api/games/:gameId/status
 * 프론트엔드가 1초마다 이 API를 호출해서 시간과 턴을 확인합니다.
 */
router.get('/:gameId/status', (req, res) => {
    const { gameId } = req.params;
    const game = games[gameId];

    if (!game) return res.status(404).json({ error: '게임 없음' });

    // (옵션) 조회 시점에도 시간이 흐르고 있음을 계산해서 보여줄 수 있음
    let currentInfo = { ...game };
    if (game.status === 'playing') {
        const now = Date.now();
        const elapsed = (now - game.lastTurnStart) / 1000;
        // 현재 턴인 사람의 시간을 임시로 깎아서 보여줌 (저장은 안 함)
        currentInfo.timers[game.currentTurn] -= elapsed;
    }

    res.json(currentInfo);
});

module.exports = router;