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
    winnerReason: { type: String, default: null },
    currentWord: { 
        ko: String, 
        ja: String 
    },
    timers: {
        korean: { type: Number, default: 90 },
        japanese: { type: Number, default: 90 }
    },
    startTime: { type: Number }, 
    
    lastActive: {
        korean: { type: Date, default: Date.now },
        japanese: { type: Date, default: Date.now }
    },
    lastTurnStart: { type: Number },
    history: [{
        word: String,
        translated: String,
        player: String,
        createdAt: { type: Date, default: Date.now }
    }]
});

module.exports = mongoose.model('Game', GameSchema);