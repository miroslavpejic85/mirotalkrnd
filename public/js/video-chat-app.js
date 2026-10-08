import { createInitialState } from './config.js';
import {
    initTooltips,
    renderLucideIcons,
    setConnectionState,
    setControlsState,
    setEnableSoundVisible,
    setOnboardingVisible,
    setSelfPreviewLayout,
    updateLocalCameraOverlay,
    updateRemoteMediaState,
    setSettingsPanelVisible,
    setStatus,
    updateMediaButtons,
} from './ui.js';
import { loadRtcConfig } from './services/config-service.js';
import { MediaManager } from './services/media-manager.js';
import { SignalingService } from './services/signaling-service.js';
import { SoundService } from './services/sound-service.js';
import { WebRtcManager } from './services/webrtc-manager.js';

export class RandomVideoChatApp {
    constructor() {
        const transports = document.querySelector('meta[name="socket-transports"]')?.content;
        this.socket = transports ? io({ transports: transports.split(',') }) : io();

        this.el = {
            videoLayout: document.getElementById('videoLayout'),
            localVideo: document.getElementById('localVideo'),
            localAvatarOverlay: document.getElementById('localAvatarOverlay'),
            remoteVideo: document.getElementById('remoteVideo'),
            remotePlaceholder: document.getElementById('remotePlaceholder'),
            remotePlaceholderText: document.getElementById('remotePlaceholderText'),
            remoteMediaStatus: document.getElementById('remoteMediaStatus'),
            remoteMicStatus: document.getElementById('remoteMicStatus'),
            remoteAvatarOverlay: document.getElementById('remoteAvatarOverlay'),
            statusText: document.getElementById('statusText'),
            connectionBadge: document.getElementById('connectionBadge'),
            onboardingHint: document.getElementById('onboardingHint'),
            capacityModal: document.getElementById('capacityModal'),
            capacityMessage: document.getElementById('capacityMessage'),
            capacityRetryBtn: document.getElementById('capacityRetryBtn'),
            enableSoundBtn: document.getElementById('enableSoundBtn'),
            startBtn: document.getElementById('startBtn'),
            settingsBtn: document.getElementById('settingsBtn'),
            settingsPanel: document.getElementById('settingsPanel'),
            nextBtn: document.getElementById('nextBtn'),
            muteBtn: document.getElementById('muteBtn'),
            cameraBtn: document.getElementById('cameraBtn'),
            hideSelfBtn: document.getElementById('hideSelfBtn'),
            endSessionBtn: document.getElementById('endSessionBtn'),
            cameraSelect: document.getElementById('cameraSelect'),
            microphoneSelect: document.getElementById('microphoneSelect'),
            backgroundModeSelect: document.getElementById('backgroundModeSelect'),
            backgroundImagePickerRow: document.getElementById('backgroundImagePickerRow'),
            backgroundImageBtn: document.getElementById('backgroundImageBtn'),
            backgroundImageInput: document.getElementById('backgroundImageInput'),
            backgroundImageName: document.getElementById('backgroundImageName'),
            soundEffectsToggle: document.getElementById('soundEffectsToggle'),
        };

        this.state = createInitialState();
        this.sounds = new SoundService();

        this.signaling = new SignalingService(this.socket);
        this.webrtc = new WebRtcManager({
            state: this.state,
            el: this.el,
            signaling: this.signaling,
            setStatus: (message) => this.setStatus(message),
            setEnableSoundVisible: (visible) => this.setEnableSoundVisible(visible),
            onRemoteTrack: () => void this.ensureRemotePlayback(),
        });
        this.media = new MediaManager({
            state: this.state,
            el: this.el,
            setStatus: (message) => this.setStatus(message),
            setControlsState: (options) => this.setControlsState(options),
            updateMediaButtons: () => this.updateMediaButtons(),
            replacePeerTracks: async (localStream) => this.webrtc.replaceLocalTracks(localStream),
        });
    }

    init() {
        this.bindDomEvents();
        this.bindSocketEvents();
        this.bindMediaDeviceEvents();

        this.media.setDeviceSelectPlaceholders();
        this.el.backgroundModeSelect.value = this.media.getBackgroundMode();
        this.syncBackgroundImagePickerUi();
        this.el.soundEffectsToggle.checked = this.sounds.isEnabled();
        this.updateMediaButtons();
        this.setConnectionState('idle', 'Idle');
        this.setEnableSoundVisible(false);
        this.setSettingsPanelVisible(false);
        this.setControlsState({ mediaReady: false, searching: false, canSkip: false });
        this.syncRemoteMediaUi();
        renderLucideIcons();
        this.initializeTooltips();
    }

    initializeTooltips() {
        this.el.startBtn.setAttribute('data-tippy-content', this.el.startBtn.title);
        this.el.startBtn.setAttribute('data-tippy-placement', 'top');
        this.el.nextBtn.setAttribute('data-tippy-content', this.el.nextBtn.title);
        this.el.nextBtn.setAttribute('data-tippy-placement', 'top');
        this.el.hideSelfBtn.setAttribute('data-tippy-content', this.el.hideSelfBtn.title);
        this.el.hideSelfBtn.setAttribute('data-tippy-placement', 'top');
        this.el.settingsBtn.setAttribute('data-tippy-content', this.el.settingsBtn.title);
        this.el.settingsBtn.setAttribute('data-tippy-placement', 'bottom');
        this.el.backgroundImageBtn.setAttribute('data-tippy-content', 'Choose background image');
        this.el.backgroundImageBtn.setAttribute('data-tippy-placement', 'left');
        this.el.enableSoundBtn.setAttribute('data-tippy-content', this.el.enableSoundBtn.title);
        this.el.enableSoundBtn.setAttribute('data-tippy-placement', 'top');
        this.el.endSessionBtn.setAttribute('data-tippy-content', this.el.endSessionBtn.title);
        this.el.endSessionBtn.setAttribute('data-tippy-placement', 'top');
        this.el.remoteMicStatus.setAttribute('data-tippy-content', this.el.remoteMicStatus.getAttribute('aria-label'));
        this.el.remoteMicStatus.setAttribute('data-tippy-placement', 'left');
        initTooltips();
    }

    setStatus(message) {
        setStatus(this.el, message);
    }

    setConnectionState(state, label) {
        setConnectionState(this.el, state, label);
    }

    setOnboardingVisible(visible) {
        setOnboardingVisible(this.el, visible);
    }

    setSettingsPanelVisible(visible) {
        setSettingsPanelVisible(this.el, visible);
    }

    syncBackgroundImagePickerUi() {
        const isImageMode = this.el.backgroundModeSelect.value === 'image';
        this.el.backgroundImagePickerRow.hidden = !isImageMode;
        this.el.backgroundImageName.textContent = this.media.getSelectedBackgroundImageName() || 'No image selected';
    }

    setEnableSoundVisible(visible) {
        setEnableSoundVisible(this.el, visible);
    }

    updateMediaButtons() {
        updateMediaButtons(this.el, this.state);
        this.syncLocalMediaUi();
    }

    setControlsState(options) {
        const mergedOptions = {
            ...options,
            startDisabled: this.state.serverAtCapacity || Boolean(options?.startDisabled),
        };
        setControlsState(this.el, this.state, mergedOptions);
    }

    syncRemoteMediaUi() {
        updateRemoteMediaState(this.el, this.state, {
            hasPartner: this.state.hasStartedMatching && !this.state.inQueue,
            hasRemoteStream: Boolean(this.state.remoteStream),
        });
    }

    syncLocalMediaUi() {
        setSelfPreviewLayout(this.el, this.state.selfPreviewHidden);
        updateLocalCameraOverlay(this.el, this.state);
    }

    resetRemoteMediaState() {
        this.state.remotePeerMuted = false;
        this.state.remotePeerCameraOff = false;
        this.syncRemoteMediaUi();
    }

    setRemoteMediaState({ isMuted, isCameraOff }) {
        this.state.remotePeerMuted = isMuted;
        this.state.remotePeerCameraOff = isCameraOff;
        this.syncRemoteMediaUi();
    }

    broadcastLocalMediaState() {
        this.signaling.emitMediaStateUpdate({
            isMuted: this.state.isMuted,
            isCameraOff: this.state.isCameraOff,
        });
    }

    setQueueState(isInQueue) {
        this.state.inQueue = isInQueue;
        this.syncRemoteMediaUi();
        if (isInQueue) {
            this.resetRemoteMediaState();
        }
    }

    setStartedMatching(value = true) {
        this.state.hasStartedMatching = value;
    }

    setSearchingUi(
        message,
        { mediaReady = Boolean(this.state.localStream), canSkip = this.state.hasStartedMatching } = {}
    ) {
        this.setConnectionState('searching', 'Searching');
        this.setStatus(message);
        this.setControlsState({ mediaReady, searching: true, canSkip });
    }

    setErrorUi(message) {
        this.setConnectionState('error', 'Error');
        this.setStatus(message);
    }

    setCapacityModalVisible(visible, message) {
        this.el.capacityModal.hidden = !visible;
        if (message) {
            this.el.capacityMessage.textContent = message;
        }
    }

    setServerAtCapacity(isAtCapacity, message) {
        this.state.serverAtCapacity = isAtCapacity;
        this.setCapacityModalVisible(isAtCapacity, message);

        if (isAtCapacity) {
            this.webrtc.cleanupPeerConnection();
            this.setStartedMatching(false);
            this.setQueueState(false);
            this.setConnectionState('error', 'Full');
            this.setStatus(message || 'Server is currently full. Please try again soon.');
            this.setControlsState({ mediaReady: Boolean(this.state.localStream), searching: false, canSkip: false });
            return;
        }

        this.setControlsState({
            mediaReady: Boolean(this.state.localStream),
            searching: this.state.inQueue,
            canSkip: this.state.hasStartedMatching,
        });
    }

    handleConnectionLimitError(error) {
        const code = error?.data?.code;
        const isKnownLimit = code === 'SERVER_FULL' || code === 'TOO_MANY_CONNECTIONS_FROM_IP';
        if (!isKnownLimit) {
            return false;
        }

        if (code === 'SERVER_FULL') {
            const message =
                typeof error?.data?.maxActiveUsers === 'number'
                    ? `All ${error.data.maxActiveUsers} chat slots are currently busy. Please try again in a minute.`
                    : 'All chat slots are currently busy. Please try again in a minute.';
            this.setServerAtCapacity(true, message);
            return true;
        }

        const ipLimitMessage =
            typeof error?.data?.maxConnectionsPerIp === 'number'
                ? `Too many open tabs/devices on this network (limit ${error.data.maxConnectionsPerIp}). Please close one and try again.`
                : 'Too many open tabs/devices on this network. Please close one and try again.';
        this.setServerAtCapacity(true, ipLimitMessage);
        return true;
    }

    handleServerNotice(notice) {
        if (!notice?.code) {
            return;
        }

        if (notice.code === 'QUEUE_FULL') {
            this.setQueueState(false);
            this.setConnectionState('error', 'Queue full');
            this.setStatus(notice.message || 'Queue is full right now. Please try again shortly.');
            this.setControlsState({ mediaReady: Boolean(this.state.localStream), searching: false, canSkip: false });
            return;
        }

        if (notice.code === 'SKIP_RATE_LIMITED') {
            this.setStatus(notice.message || 'You are skipping too quickly. Please wait and try again.');
        }
    }

    registerAudioUnlockHint() {
        if (this.state.waitingForAudioUnlock) {
            this.setEnableSoundVisible(true);
            return;
        }

        this.state.waitingForAudioUnlock = true;
        this.setEnableSoundVisible(true);

        const unlockAudio = async () => {
            try {
                await this.webrtc.unlockRemoteAudio();
            } catch (error) {
                console.error('Audio unlock failed:', error);
            } finally {
                this.state.waitingForAudioUnlock = false;
                document.removeEventListener('click', unlockAudio);
                document.removeEventListener('touchstart', unlockAudio);
            }
        };

        document.addEventListener('click', unlockAudio, { once: true });
        document.addEventListener('touchstart', unlockAudio, { once: true });
    }

    async ensureRemotePlayback() {
        try {
            await this.webrtc.unlockRemoteAudio();
        } catch (error) {
            this.setStatus('Connected, but audio is blocked by browser. Tap anywhere to enable sound.');
            this.registerAudioUnlockHint();
            console.error('Remote playback blocked:', error);
        }
    }

    async ensureSocketConnected(timeoutMs = 5000) {
        if (this.socket.connected) {
            return;
        }

        this.socket.connect();

        await new Promise((resolve, reject) => {
            let finished = false;

            const finish = (callback, value) => {
                if (finished) {
                    return;
                }
                finished = true;
                clearTimeout(timeoutId);
                this.socket.off('connect', handleConnect);
                this.socket.off('connect_error', handleConnectError);
                callback(value);
            };

            const handleConnect = () => finish(resolve);
            const handleConnectError = (error) => finish(reject, error);
            const timeoutId = setTimeout(() => finish(reject, new Error('Server connection timed out.')), timeoutMs);

            this.socket.on('connect', handleConnect);
            this.socket.on('connect_error', handleConnectError);
        });
    }

    async startMatching() {
        this.sounds.prime();
        if (this.state.serverAtCapacity) {
            this.setCapacityModalVisible(true, 'Server is currently full. Please try again shortly.');
            return;
        }

        await this.ensureSocketConnected();

        await loadRtcConfig(this.state);
        await this.media.ensureLocalMedia();
        this.webrtc.cleanupPeerConnection();
        this.webrtc.createPeerConnection();
        this.setStartedMatching(true);
        this.setQueueState(true);
        this.setOnboardingVisible(false);
        this.setSearchingUi('Searching for a random partner...', { mediaReady: true, canSkip: true });
        this.signaling.emitFindPartner();
    }

    endSession() {
        this.setSettingsPanelVisible(false);
        this.setCapacityModalVisible(false);
        this.state.serverAtCapacity = false;
        this.state.userEndedSession = true;

        this.webrtc.cleanupPeerConnection();
        this.media.stopLocalMedia();
        this.media.setDeviceSelectPlaceholders();

        this.state.isMuted = false;
        this.state.isCameraOff = false;
        this.state.selfPreviewHidden = false;
        this.state.switchingDevices = false;
        this.setStartedMatching(false);
        this.setQueueState(false);
        this.resetRemoteMediaState();
        this.syncLocalMediaUi();
        this.updateMediaButtons();

        this.setOnboardingVisible(true);
        this.setConnectionState('idle', 'Idle');
        this.setStatus('Session ended. Press Start to begin a new chat.');
        this.setControlsState({ mediaReady: false, searching: false, canSkip: false });

        if (this.socket.connected) {
            this.socket.disconnect();
            return;
        }

        this.state.userEndedSession = false;
    }

    bindDomEvents() {
        this.el.startBtn.addEventListener('click', async () => {
            try {
                await this.startMatching();
                this.setSettingsPanelVisible(false);
            } catch (error) {
                if (this.handleConnectionLimitError(error)) {
                    return;
                }

                if (error?.message === 'Server connection timed out.') {
                    this.setErrorUi('Connection to server timed out. Please retry.');
                    return;
                }

                this.setErrorUi('Camera/Microphone access failed. Please allow permissions and retry.');
                console.error(error);
            }
        });

        this.el.settingsBtn.addEventListener('click', async () => {
            const willOpen = this.el.settingsPanel.hidden;
            this.setSettingsPanelVisible(willOpen);

            if (!willOpen || this.state.localStream) {
                return;
            }

            try {
                await this.media.ensureLocalMedia();
                this.setStatus('Devices ready. Press Start when you want to find a partner.');
                this.setConnectionState('idle', 'Ready');
                this.setControlsState({ mediaReady: true, searching: false, canSkip: false });
            } catch (error) {
                this.setErrorUi('Camera/Microphone access failed. Please allow permissions and retry.');
                console.error('Preparing devices failed:', error);
            }
        });

        document.addEventListener('click', (event) => {
            if (this.el.settingsPanel.hidden) {
                return;
            }
            const clickedInsidePanel = this.el.settingsPanel.contains(event.target);
            const clickedSettingsButton = this.el.settingsBtn.contains(event.target);
            if (!clickedInsidePanel && !clickedSettingsButton) {
                this.setSettingsPanelVisible(false);
            }
        });

        this.el.nextBtn.addEventListener('click', async () => {
            if (!this.state.hasStartedMatching) {
                return;
            }

            try {
                await this.media.ensureLocalMedia();
                this.webrtc.cleanupPeerConnection();
                this.webrtc.createPeerConnection();
                this.setQueueState(true);
                this.setOnboardingVisible(false);
                this.setSearchingUi('Skipping... searching for a new partner.', { mediaReady: true, canSkip: true });
                this.signaling.emitSkipPartner();
            } catch (error) {
                this.setErrorUi('Unable to continue call. Please retry.');
                console.error(error);
            }
        });

        this.el.enableSoundBtn.addEventListener('click', async () => {
            try {
                await this.webrtc.unlockRemoteAudio();
            } catch (error) {
                this.setStatus('Audio is still blocked. Tap anywhere on page to enable sound.');
                console.error('Enable sound button failed:', error);
            }
        });

        this.el.soundEffectsToggle.addEventListener('change', (event) => {
            this.sounds.setEnabled(event.target.checked);
        });

        this.el.capacityRetryBtn.addEventListener('click', () => {
            this.setCapacityModalVisible(false);
            this.socket.connect();
            this.setStatus('Trying to reconnect...');
        });

        this.el.muteBtn.addEventListener('click', () => {
            this.media.toggleMute();
            this.broadcastLocalMediaState();
        });
        this.el.cameraBtn.addEventListener('click', () => {
            this.media.toggleCamera();
            this.broadcastLocalMediaState();
        });
        this.el.hideSelfBtn.addEventListener('click', () => {
            this.state.selfPreviewHidden = !this.state.selfPreviewHidden;
            this.syncLocalMediaUi();
            this.updateMediaButtons();
        });
        this.el.endSessionBtn.addEventListener('click', () => {
            this.endSession();
        });

        this.el.cameraSelect.addEventListener('change', async (event) => {
            this.state.selectedVideoInputId = event.target.value;
            await this.media.switchInputDevices();
        });

        this.el.microphoneSelect.addEventListener('change', async (event) => {
            this.state.selectedAudioInputId = event.target.value;
            await this.media.switchInputDevices();
        });

        this.el.backgroundModeSelect.addEventListener('change', async (event) => {
            const mode = event.target.value;
            this.syncBackgroundImagePickerUi();
            try {
                await this.media.setBackgroundMode(mode);
                if (mode === 'image' && !this.media.getSelectedBackgroundImageName()) {
                    this.setStatus('Choose a background image to apply image mode.');
                }
            } catch (error) {
                this.setStatus(error?.message || 'Unable to update background mode.');
                this.el.backgroundModeSelect.value = this.media.getBackgroundMode();
                this.syncBackgroundImagePickerUi();
            }
        });

        this.el.backgroundImageBtn.addEventListener('click', () => {
            this.el.backgroundImageInput.click();
        });

        this.el.backgroundImageInput.addEventListener('change', async (event) => {
            const [selectedFile] = event.target.files || [];
            if (!selectedFile) {
                return;
            }
            try {
                await this.media.setBackgroundImage(selectedFile);
                this.syncBackgroundImagePickerUi();
                this.setStatus('Background image selected.');
            } catch (error) {
                this.setStatus(error?.message || 'Unable to load background image.');
            } finally {
                this.el.backgroundImageInput.value = '';
            }
        });
    }

    bindSocketEvents() {
        this.signaling.on('queue-update', () => {
            this.sounds.play('waiting');
            this.setQueueState(true);
            this.setConnectionState('waiting', 'Waiting');
            this.setStatus('Waiting in queue for an available partner...');
            this.setControlsState({ mediaReady: Boolean(this.state.localStream), searching: true });
        });

        this.signaling.on('matched', async ({ initiator }) => {
            try {
                this.sounds.play('connected');
                this.setQueueState(false);
                this.setConnectionState('connected', 'Connected');
                this.setStatus('Connected! Say hi 👋 (if no sound, tap once)');
                this.setControlsState({ mediaReady: true, searching: false, canSkip: true });

                if (!this.state.peerConnection) {
                    await this.media.ensureLocalMedia();
                    this.webrtc.createPeerConnection();
                }

                if (initiator) {
                    await this.webrtc.createOffer();
                }

                this.broadcastLocalMediaState();
            } catch (error) {
                this.setErrorUi('Connection setup failed. Trying next partner...');
                console.error(error);
                this.signaling.emitSkipPartner();
            }
        });

        this.signaling.on('webrtc-offer', async ({ sdp }) => {
            try {
                if (!this.state.peerConnection) {
                    await this.media.ensureLocalMedia();
                    this.webrtc.createPeerConnection();
                }
                await this.webrtc.applyOfferAndReply(sdp);
            } catch (error) {
                this.setErrorUi('Failed to accept offer.');
                console.error(error);
            }
        });

        this.signaling.on('webrtc-answer', async ({ sdp }) => {
            try {
                if (!this.state.peerConnection) {
                    return;
                }
                await this.webrtc.applyAnswer(sdp);
            } catch (error) {
                this.setErrorUi('Failed to finalize connection.');
                console.error(error);
            }
        });

        this.signaling.on('webrtc-ice-candidate', async ({ candidate }) => {
            try {
                if (!this.state.peerConnection) {
                    return;
                }
                await this.webrtc.addIceCandidate(candidate);
            } catch (error) {
                console.error('Error adding ICE candidate:', error);
            }
        });

        this.signaling.on('partner-disconnected', ({ reason }) => {
            this.sounds.play('left');
            this.webrtc.cleanupPeerConnection();
            this.setQueueState(true);

            if (reason === 'partner-skipped') {
                this.setSearchingUi('Partner skipped. Searching for a new partner...', { mediaReady: true });
                return;
            }
            this.setSearchingUi('Partner left. Searching for a new partner...', { mediaReady: true });
        });

        this.signaling.on('peer-media-state', ({ isMuted, isCameraOff }) => {
            if (typeof isMuted !== 'boolean' || typeof isCameraOff !== 'boolean') {
                return;
            }
            this.setRemoteMediaState({ isMuted, isCameraOff });
        });

        this.signaling.on('disconnect', () => {
            if (this.state.userEndedSession) {
                this.state.userEndedSession = false;
                return;
            }

            this.webrtc.cleanupPeerConnection();
            this.setQueueState(false);
            this.setConnectionState('reconnecting', 'Reconnecting');
            this.setStatus('Disconnected from server. Reconnecting...');
            this.setControlsState({ mediaReady: Boolean(this.state.localStream), searching: true });
        });

        this.signaling.on('connect', () => {
            if (this.state.serverAtCapacity) {
                this.setServerAtCapacity(false);
            }
            if (!this.state.inQueue) {
                this.setConnectionState('idle', 'Idle');
            }
            if (this.state.inQueue) {
                this.signaling.emitFindPartner();
            }
        });

        this.signaling.on('connect_error', (error) => {
            this.handleConnectionLimitError(error);
        });

        this.signaling.on('server-notice', (notice) => {
            this.handleServerNotice(notice);
        });
    }

    bindMediaDeviceEvents() {
        this.media.bindMediaDeviceEvents(() => {
            void this.media.populateDeviceSelectors();
        });
    }
}
