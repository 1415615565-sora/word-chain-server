// routes/gameRoutes.js 파일 내용

const express = require('express');
const router = express.Router();

// 임시 게임 상태 (실제로는 데이터베이스에 저장되어야 합니다.)
let gameState = {}; 

/**
 * [POST] /api/games/start
 * 새로운 게임을 시작하고 초기 상태를 반환합니다.
 */
router.post('/start', (req, res) => {
    const gameId = Date.now().toString(); // 간단한 게임 ID 생성
    gameState[gameId] = {
        id: gameId,
        moves: [], // 단어 기록
        currentPlayer: 'korean', // 'korean' 또는 'japanese'
        lastWord: null, // 마지막으로 제출된 단어
        requiredStartChar: null, // 다음 단어가 시작해야 할 글자
        status: 'playing' 
    };
    
    // 이 시점에서 프론트엔드에 필요한 초기 정보를 반환합니다.
    res.json({ 
        message: '게임 시작!', 
        game: gameState[gameId] 
    });
});

/**
 * [POST] /api/games/:gameId/submit
 * 플레이어가 단어를 제출합니다. (핵심 로직이 들어갈 곳)
 */
router.post('/:gameId/submit', async (req, res) => {
    const { gameId } = req.params;
    const { word, playerType } = req.body;
    
    // 1. 현재 게임 상태 확인 (gameState[gameId] 참조)
    const game = gameState[gameId];
    if (!game || game.status !== 'playing') {
        return res.status(400).json({ error: '유효하지 않거나 종료된 게임입니다.' });
    }

    // 2. 단어 유효성 검사 (시작 글자, 사용 여부 등)
    // ... 유효성 검사 로직 구현 ...
    
    // 3. 단어 번역 (예: 한국어 -> 일본어)
    // **await translateWord(word, targetLanguage)** 와 같이 외부 번역 API를 호출하는 로직이 들어갑니다.
    const translatedWord = "번역된 단어"; // 임시 값

    // 4. 게임 상태 업데이트 (단어 저장, 차례 변경, 다음 시작 글자 설정)
    // ... 상태 업데이트 로직 구현 ...

    // 5. 결과 반환
    res.json({ 
        message: '단어 제출 성공', 
        translatedWord: translatedWord,
        game: game 
    });
});

module.exports = router;