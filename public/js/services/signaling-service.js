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

    emitOffer(sdp) {
        this.socket.emit('webrtc-offer', { sdp });
    }

    emitAnswer(sdp) {
        this.socket.emit('webrtc-answer', { sdp });
    }

    emitIceCandidate(candidate) {
        this.socket.emit('webrtc-ice-candidate', { candidate });
    }

    emitMediaStateUpdate({ isMuted, isCameraOff }) {
        this.socket.emit('media-state-update', { isMuted, isCameraOff });
    }
}
