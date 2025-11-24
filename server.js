require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

// 미들웨어
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
}));
app.use(express.json());

// DB 연결
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ MongoDB 연결 성공'))
    .catch(err => console.error('❌ DB 연결 실패:', err));

// 라우트
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/rooms', require('./routes/roomRoutes'));
app.use('/api/games', require('./routes/gameRoutes'));

// 서버 시작
app.listen(PORT, () => {
    console.log(`🚀 서버 실행 중: http://localhost:${PORT}`);
});