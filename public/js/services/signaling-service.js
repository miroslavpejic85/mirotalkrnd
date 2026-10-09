export class SignalingService {
    constructor(socket) {
        this.socket = socket;
    }

    on(event, handler) {
        this.socket.on(event, handler);
    }

    emitFindPartner() {
        this.socket.emit('find-partner');
    }

    emitSkipPartner() {
        this.socket.emit('skip-partner');
    }

    // Reports the most recent partner. The server decides who that is; callback receives { ok, code }.
    emitReportPartner(callback) {
        this.socket.emit('report-partner', callback);
    }

    emitOffer(sdp) {
        this.socket.emit('webrtc-offer', { sdp });
    }

    emitAnswer(sdp) {
        this.socket.emit('webrtc-answer', { sdp });
    }

    emitIceCandidate(candidate) {
        this.socket.emit('webrtc-ice-candidate', { candidate });
    }

    emitChatMessage(text) {
        this.socket.emit('chat-message', { text });
    }

    emitChatTyping(typing) {
        this.socket.emit('chat-typing', { typing });
    }

    emitMediaStateUpdate({ isMuted, isCameraOff }) {
        this.socket.emit('media-state-update', { isMuted, isCameraOff });
    }
}
