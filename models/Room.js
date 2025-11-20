const mongoose = require('mongoose');

const RoomSchema = new mongoose.Schema({
    roomId: { type: String, required: true, unique: true },
    roomName: { type: String, required: true },
    password: { type: String, default: null },
    creatorId: { type: String, required: true }, // 방장 ID
    creatorType: { type: String, required: true }, // 'korean' or 'japanese'
    guestId: { type: String, default: null },      // 참가자 ID
    gameId: { type: String, default: null },       // 연결된 게임 ID
    status: { type: String, default: 'waiting' },  // waiting, playing
    createdAt: { type: Date, default: Date.now, expires: 3600 } // (옵션) 1시간 뒤 자동 삭제
});

module.exports = mongoose.model('Room', RoomSchema);