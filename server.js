require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

// 미들웨어 설정
app.use(cors({
    origin: '*', // 모든 주소에서 접속 허용 (개발용)
    methods: ['GET', 'POST'], // 허용할 HTTP 메서드
    credentials: true // 인증 정보 허용
}));
app.use(express.json());

// 데이터베이스 연결
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ MongoDB 연결 성공'))
    .catch(err => console.error('❌ DB 연결 실패:', err));

// 라우트 연결
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/rooms', require('./routes/roomRoutes'));
app.use('/api/games', require('./routes/gameRoutes'));

// 서버 시작
app.listen(PORT, () => {
    console.log(`🚀 서버 실행 중: http://localhost:${PORT}`);

});
