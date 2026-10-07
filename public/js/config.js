export const CONNECTION_STATES = ['idle', 'searching', 'waiting', 'connected', 'reconnecting', 'error'];

export function createInitialState() {
    return {
        localStream: null,
        remoteStream: null,
        peerConnection: null,
        inQueue: false,
        hasStartedMatching: false,
        isMuted: false,
        isCameraOff: false,
        selfPreviewHidden: false,
        remotePeerMuted: false,
        remotePeerCameraOff: false,
        waitingForAudioUnlock: false,
        switchingDevices: false,
        selectedAudioInputId: '',
        selectedVideoInputId: '',
        hasLoadedRtcConfig: false,
        serverAtCapacity: false,
        userEndedSession: false,
        rtcConfig: {
            iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
        },
    };
}
