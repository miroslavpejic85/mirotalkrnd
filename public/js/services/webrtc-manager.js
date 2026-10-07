export class WebRtcManager {
    constructor({ state, el, signaling, setStatus, setEnableSoundVisible, onRemoteTrack }) {
        this.state = state;
        this.el = el;
        this.signaling = signaling;
        this.setStatus = setStatus;
        this.setEnableSoundVisible = setEnableSoundVisible;
        this.onRemoteTrack = onRemoteTrack;
    }

    resetRemoteStream() {
        this.state.remoteStream = null;
        this.el.remoteVideo.srcObject = null;
        this.state.waitingForAudioUnlock = false;
        this.setEnableSoundVisible(false);
        this.el.remotePlaceholder.style.display = 'grid';
    }

    cleanupPeerConnection() {
        if (this.state.peerConnection) {
            this.state.peerConnection.ontrack = null;
            this.state.peerConnection.onicecandidate = null;
            this.state.peerConnection.close();
            this.state.peerConnection = null;
        }
        this.resetRemoteStream();
    }

    createPeerConnection() {
        this.cleanupPeerConnection();
        this.state.peerConnection = new RTCPeerConnection(this.state.rtcConfig);

        this.state.localStream.getTracks().forEach((track) => {
            this.state.peerConnection.addTrack(track, this.state.localStream);
        });

        this.state.peerConnection.ontrack = (event) => {
            if (!this.state.remoteStream) {
                this.state.remoteStream = new MediaStream();
                this.el.remoteVideo.srcObject = this.state.remoteStream;
            }
            this.state.remoteStream.addTrack(event.track);
            this.el.remotePlaceholder.style.display = 'none';
            this.onRemoteTrack();
        };

        this.state.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.signaling.emitIceCandidate(event.candidate);
            }
        };
    }

    async createOffer() {
        const offer = await this.state.peerConnection.createOffer();
        await this.state.peerConnection.setLocalDescription(offer);
        this.signaling.emitOffer(offer);
    }

    async applyOfferAndReply(sdp) {
        await this.state.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await this.state.peerConnection.createAnswer();
        await this.state.peerConnection.setLocalDescription(answer);
        this.signaling.emitAnswer(answer);
    }

    async applyAnswer(sdp) {
        await this.state.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
    }

    async addIceCandidate(candidate) {
        await this.state.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }

    async replaceLocalTracks(localStream) {
        if (!this.state.peerConnection) {
            return;
        }

        const senders = this.state.peerConnection.getSenders();
        const audioSender = senders.find((sender) => sender.track?.kind === 'audio');
        const videoSender = senders.find((sender) => sender.track?.kind === 'video');
        const [newAudioTrack] = localStream.getAudioTracks();
        const [newVideoTrack] = localStream.getVideoTracks();

        if (audioSender && newAudioTrack) {
            await audioSender.replaceTrack(newAudioTrack);
        }
        if (videoSender && newVideoTrack) {
            await videoSender.replaceTrack(newVideoTrack);
        }
    }

    async unlockRemoteAudio() {
        this.el.remoteVideo.muted = false;
        this.el.remoteVideo.volume = 1;
        await this.el.remoteVideo.play();
        this.setEnableSoundVisible(false);
        this.setStatus('Connected! Audio enabled.');
    }
}
