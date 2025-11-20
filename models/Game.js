const mongoose = require('mongoose');

const GameSchema = new mongoose.Schema({
    gameId: { type: String, required: true, unique: true },
    roomId: { type: String },
    players: {
        korean: { type: String },
        japanese: { type: String }
    },
    currentTurn: { type: String, enum: ['korean', 'japanese'] },
    status: { type: String, default: 'playing' },
    winner: { type: String, default: null },
    currentWord: { 
        ko: String, 
        ja: String 
    },
    timers: {
        korean: { type: Number, default: 90 },
        japanese: { type: Number, default: 90 }
    },
    lastTurnStart: { type: Number }, // 시간 계산용
    history: [{
        word: String,
        translated: String,
        player: String,
        createdAt: { type: Date, default: Date.now }
    }]
});

module.exports = mongoose.model('Game', GameSchema);