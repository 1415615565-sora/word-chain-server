const mongoose = require('mongoose');

const RoomSchema = new mongoose.Schema({
    roomId: { type: String, required: true, unique: true },
    roomName: { type: String, required: true },
    password: { type: String, default: null },
    creatorId: { type: String, required: true },
    creatorType: { type: String, required: true },
    guestId: { type: String, default: null },
    gameId: { type: String, default: null },
    status: { type: String, default: 'waiting' },
    createdAt: { type: Date, default: Date.now }, // TTL 제거 (수동 관리)
    lastActive: {   //대기실 심박수 체크용
        host: { type: Date, default: Date.now },
        guest: { type: Date, default: Date.now }
    }
});

module.exports = mongoose.model('Room', RoomSchema);