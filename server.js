// server.js 파일 내용

// 1. 모듈 불러오기
const express = require('express');
const cors = require('cors'); // CORS 미들웨어
const app = express();
const port = 3001; // 프론트엔드와 충돌하지 않도록 3000번 대신 다른 포트 사용 추천

// 2. 미들웨어 설정
// CORS 활성화: 모든 출처에서의 요청을 허용합니다. (개발 단계에서 유용)
app.use(cors()); 
// JSON 요청 본문을 파싱할 수 있도록 설정
app.use(express.json()); 

// 3. 기본 라우트 (서버 작동 확인용)
app.get('/', (req, res) => {
  res.send('끝말 이어가기 게임 서버가 작동 중입니다!');
});

// 4. API 라우터 연결 (다음 단계에서 구현할 게임 로직)
const gameRoutes = require('./routes/gameRoutes'); // 추가
app.use('/api/games', gameRoutes); // '/api/games' 경로로 라우터 연결

// 5. 서버 시작
app.listen(port, () => {
  console.log(`서버가 http://localhost:${port} 에서 실행 중입니다.`);
});