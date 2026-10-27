import { BackgroundEffects } from '../background-effects.js';

export class MediaManager {
    constructor({ state, el, setStatus, setControlsState, updateMediaButtons, replacePeerTracks }) {
        this.state = state;
        this.el = el;
        this.setStatus = setStatus;
        this.setControlsState = setControlsState;
        this.updateMediaButtons = updateMediaButtons;
        this.replacePeerTracks = replacePeerTracks;
        this.rawLocalStream = null;
        this.backgroundEffects = null;
        this.backgroundMode = 'off';
        this.backgroundImage = null;
        // True while the camera is turned off and the physical device is released (LED off).
        this.cameraReleased = false;
        this.cameraOffSize = { width: 640, height: 480 };
    }

    setDeviceSelectPlaceholders() {
        this.el.cameraSelect.innerHTML = '<option value="">Enable camera to list devices</option>';
        this.el.microphoneSelect.innerHTML = '<option value="">Enable microphone to list devices</option>';
    }

    bindMediaDeviceEvents(onDeviceChange) {
        if (navigator.mediaDevices?.addEventListener) {
            navigator.mediaDevices.addEventListener('devicechange', onDeviceChange);
        }
    }

    buildConstraints() {
        return {
            audio: this.state.selectedAudioInputId ? { deviceId: { exact: this.state.selectedAudioInputId } } : true,
            video: this.state.selectedVideoInputId ? { deviceId: { exact: this.state.selectedVideoInputId } } : true,
        };
    }

    applyLocalTrackState() {
        if (!this.state.localStream) {
            return;
        }
        this.state.localStream.getAudioTracks().forEach((track) => {
            track.enabled = !this.state.isMuted;
        });
        this.state.localStream.getVideoTracks().forEach((track) => {
            track.enabled = !this.state.isCameraOff;
        });
        this.updateMediaButtons();
    }

    async populateDeviceSelectors() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = devices.filter((device) => device.kind === 'audioinput');
            const videoInputs = devices.filter((device) => device.kind === 'videoinput');

            const previousAudio = this.state.selectedAudioInputId || this.el.microphoneSelect.value;
            const previousVideo = this.state.selectedVideoInputId || this.el.cameraSelect.value;

            this.el.microphoneSelect.innerHTML = '';
            this.el.cameraSelect.innerHTML = '';

            if (!audioInputs.length) {
                this.el.microphoneSelect.innerHTML = '<option value="">No microphones found</option>';
            } else {
                audioInputs.forEach((device, index) => {
                    const option = document.createElement('option');
                    option.value = device.deviceId;
                    option.textContent = device.label || `Microphone ${index + 1}`;
                    this.el.microphoneSelect.appendChild(option);
                });
            }

            if (!videoInputs.length) {
                this.el.cameraSelect.innerHTML = '<option value="">No cameras found</option>';
            } else {
                videoInputs.forEach((device, index) => {
                    const option = document.createElement('option');
                    option.value = device.deviceId;
                    option.textContent = device.label || `Camera ${index + 1}`;
                    this.el.cameraSelect.appendChild(option);
                });
            }

            const audioExists = audioInputs.some((device) => device.deviceId === previousAudio);
            const videoExists = videoInputs.some((device) => device.deviceId === previousVideo);

            if (audioExists) {
                this.el.microphoneSelect.value = previousAudio;
                this.state.selectedAudioInputId = previousAudio;
            } else if (audioInputs[0]) {
                this.state.selectedAudioInputId = audioInputs[0].deviceId;
                this.el.microphoneSelect.value = this.state.selectedAudioInputId;
            } else {
                this.state.selectedAudioInputId = '';
            }

            if (videoExists) {
                this.el.cameraSelect.value = previousVideo;
                this.state.selectedVideoInputId = previousVideo;
            } else if (videoInputs[0]) {
                this.state.selectedVideoInputId = videoInputs[0].deviceId;
                this.el.cameraSelect.value = this.state.selectedVideoInputId;
            } else {
                this.state.selectedVideoInputId = '';
            }
        } catch (error) {
            console.error('Unable to list media devices:', error);
        }
    }

    async ensureLocalMedia() {
        if (this.state.localStream) {
            return this.state.localStream;
        }

        const rawStream = await navigator.mediaDevices.getUserMedia(this.buildConstraints());
        const { stream, effect } = await this.createOutputForRaw(rawStream, this.backgroundMode);
        this.applyOutputPipeline({ rawStream, outputStream: stream, effect });

        const [audioTrack] = this.rawLocalStream.getAudioTracks();
        const [videoTrack] = this.rawLocalStream.getVideoTracks();
        this.state.selectedAudioInputId = audioTrack?.getSettings().deviceId || this.state.selectedAudioInputId;
        this.state.selectedVideoInputId = videoTrack?.getSettings().deviceId || this.state.selectedVideoInputId;

        this.el.localVideo.srcObject = this.state.localStream;
        this.applyLocalTrackState();
        await this.populateDeviceSelectors();
        this.setControlsState({ mediaReady: true });
        return this.state.localStream;
    }

    async switchInputDevices() {
        if (!this.rawLocalStream || this.state.switchingDevices) {
            return;
        }

        this.state.switchingDevices = true;
        this.setControlsState({ mediaReady: true, searching: this.state.inQueue });

        let nextRawStream = null;
        let nextOutputStream = null;
        let nextEffect = null;
        try {
            const previousRawStream = this.rawLocalStream;
            const previousOutputStream = this.state.localStream;
            const constraints = this.buildConstraints();
            if (this.cameraReleased) {
                // Keep the camera released: only switch the microphone, the new camera applies when turned back on.
                nextRawStream = await navigator.mediaDevices.getUserMedia({ audio: constraints.audio });
                nextOutputStream = new MediaStream([this.createCameraOffTrack(), ...nextRawStream.getAudioTracks()]);
            } else {
                nextRawStream = await navigator.mediaDevices.getUserMedia(constraints);
                const nextPipeline = await this.createOutputForRaw(nextRawStream, this.backgroundMode);
                nextOutputStream = nextPipeline.stream;
                nextEffect = nextPipeline.effect;
            }

            if (this.replacePeerTracks) {
                await this.replacePeerTracks(nextOutputStream);
            }

            this.applyOutputPipeline({ rawStream: nextRawStream, outputStream: nextOutputStream, effect: nextEffect });
            nextRawStream = null;
            nextOutputStream = null;
            nextEffect = null;

            previousRawStream.getTracks().forEach((track) => track.stop());
            if (previousOutputStream && previousOutputStream !== previousRawStream) {
                previousOutputStream.getVideoTracks().forEach((track) => track.stop());
            }
            this.applyLocalTrackState();
            await this.populateDeviceSelectors();
            this.setStatus('Media device updated.');
        } catch (error) {
            nextEffect?.stop(false);
            nextRawStream?.getTracks().forEach((track) => track.stop());
            if (nextOutputStream && nextOutputStream !== nextRawStream) {
                nextOutputStream.getVideoTracks().forEach((track) => track.stop());
            }
            this.setStatus('Failed to switch device. Please try another one.');
            console.error('Error switching devices:', error);
        } finally {
            this.state.switchingDevices = false;
            this.setControlsState({ mediaReady: Boolean(this.state.localStream), searching: this.state.inQueue });
        }
    }

    stopLocalMedia() {
        if (!this.rawLocalStream && !this.state.localStream) {
            return;
        }

        this.disposeBackgroundEffects();
        this.rawLocalStream?.getTracks().forEach((track) => track.stop());
        if (this.state.localStream && this.state.localStream !== this.rawLocalStream) {
            this.state.localStream.getVideoTracks().forEach((track) => track.stop());
        }
        this.rawLocalStream = null;
        this.state.localStream = null;
        this.cameraReleased = false;
        this.el.localVideo.srcObject = null;
    }

    toggleMute() {
        if (!this.state.localStream) {
            return;
        }
        this.state.isMuted = !this.state.isMuted;
        this.applyLocalTrackState();
    }

    async toggleCamera() {
        if (!this.state.localStream || this.state.switchingDevices) {
            return;
        }
        if (!this.canReleaseCamera()) {
            // Fallback: no way to build a placeholder track, so only disable the camera track.
            this.state.isCameraOff = !this.state.isCameraOff;
            this.applyLocalTrackState();
            return;
        }
        if (this.state.isCameraOff) {
            await this.turnCameraOn();
        } else {
            await this.turnCameraOff();
        }
    }

    canReleaseCamera() {
        return (
            typeof HTMLCanvasElement !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function'
        );
    }

    createCameraOffTrack() {
        const canvas = document.createElement('canvas');
        canvas.width = this.cameraOffSize.width;
        canvas.height = this.cameraOffSize.height;
        canvas.getContext('2d').fillRect(0, 0, canvas.width, canvas.height);
        const [track] = canvas.captureStream(1).getVideoTracks();
        track.enabled = false;
        return track;
    }

    async turnCameraOff() {
        // Blank the outgoing video immediately, then release the device so the camera LED turns off.
        this.state.isCameraOff = true;
        this.applyLocalTrackState();

        this.state.switchingDevices = true;
        this.setControlsState({ mediaReady: true, searching: this.state.inQueue });

        const previousRawStream = this.rawLocalStream;
        const previousOutputStream = this.state.localStream;
        const [cameraTrack] = previousRawStream.getVideoTracks();
        const { width, height } = cameraTrack?.getSettings() || {};
        if (width && height) {
            this.cameraOffSize = { width, height };
        }

        const audioTracks = previousRawStream.getAudioTracks();
        const placeholderTrack = this.createCameraOffTrack();
        const nextOutputStream = new MediaStream([placeholderTrack, ...audioTracks]);
        try {
            if (this.replacePeerTracks) {
                try {
                    await this.replacePeerTracks(nextOutputStream);
                } catch (error) {
                    // Still release the camera: the peer just receives no video until the next replace.
                    console.error('Unable to send camera-off placeholder:', error);
                }
            }

            if (this.state.localStream !== previousOutputStream) {
                placeholderTrack.stop();
                return;
            }

            this.applyOutputPipeline({
                rawStream: new MediaStream(audioTracks),
                outputStream: nextOutputStream,
                effect: null,
            });
            previousRawStream.getVideoTracks().forEach((track) => track.stop());
            if (previousOutputStream !== previousRawStream) {
                previousOutputStream.getVideoTracks().forEach((track) => track.stop());
            }
            this.cameraReleased = true;
            this.applyLocalTrackState();
        } finally {
            this.state.switchingDevices = false;
            this.setControlsState({ mediaReady: Boolean(this.state.localStream), searching: this.state.inQueue });
        }
    }

    async requestCameraStream() {
        const { video } = this.buildConstraints();
        try {
            return await navigator.mediaDevices.getUserMedia({ video });
        } catch (error) {
            // The previously selected camera may have been unplugged while turned off.
            if (!this.state.selectedVideoInputId || !['OverconstrainedError', 'NotFoundError'].includes(error?.name)) {
                throw error;
            }
            return navigator.mediaDevices.getUserMedia({ video: true });
        }
    }

    async turnCameraOn() {
        this.state.switchingDevices = true;
        this.setControlsState({ mediaReady: true, searching: this.state.inQueue });

        const previousRawStream = this.rawLocalStream;
        const previousOutputStream = this.state.localStream;
        const isStale = () => this.state.localStream !== previousOutputStream;
        let cameraStream = null;
        let nextOutputStream = null;
        let nextEffect = null;
        try {
            cameraStream = await this.requestCameraStream();
            if (isStale()) {
                return;
            }

            const nextRawStream = new MediaStream([
                ...cameraStream.getVideoTracks(),
                ...previousRawStream.getAudioTracks(),
            ]);
            const nextPipeline = await this.createOutputForRaw(nextRawStream, this.backgroundMode);
            nextOutputStream = nextPipeline.stream;
            nextEffect = nextPipeline.effect;
            if (isStale()) {
                return;
            }

            if (this.replacePeerTracks) {
                await this.replacePeerTracks(nextOutputStream);
            }

            this.applyOutputPipeline({ rawStream: nextRawStream, outputStream: nextOutputStream, effect: nextEffect });
            cameraStream = null;
            nextOutputStream = null;
            nextEffect = null;

            previousOutputStream.getVideoTracks().forEach((track) => track.stop());
            this.cameraReleased = false;
            this.state.isCameraOff = false;
            const [videoTrack] = nextRawStream.getVideoTracks();
            this.state.selectedVideoInputId = videoTrack?.getSettings().deviceId || this.state.selectedVideoInputId;
            this.applyLocalTrackState();
            await this.populateDeviceSelectors();
        } catch (error) {
            this.setStatus(`Unable to turn camera on${error?.message ? `: ${error.message}` : '.'}`);
            console.error('Error turning camera on:', error);
        } finally {
            nextEffect?.stop(false);
            cameraStream?.getTracks().forEach((track) => track.stop());
            nextOutputStream?.getVideoTracks().forEach((track) => track.stop());
            this.state.switchingDevices = false;
            this.setControlsState({ mediaReady: Boolean(this.state.localStream), searching: this.state.inQueue });
        }
    }

    async setBackgroundMode(mode) {
        if (!['off', 'blur', 'image'].includes(mode)) {
            throw new Error('Invalid background mode selected');
        }
        if (mode === 'image' && !this.backgroundImage) {
            this.backgroundMode = mode;
            return;
        }
        if (!this.rawLocalStream) {
            this.backgroundMode = mode;
            return;
        }
        if (this.cameraReleased) {
            // Applied when the camera is turned back on, without waking the camera now.
            if (mode !== 'off' && !BackgroundEffects.supported()) {
                throw new Error('Background effects are not supported in this browser');
            }
            this.backgroundMode = mode;
            this.setStatus(`Background ${mode === 'off' ? 'disabled' : `set to ${mode}`}.`);
            return;
        }

        this.state.switchingDevices = true;
        this.setControlsState({ mediaReady: true, searching: this.state.inQueue });

        let nextOutputStream = null;
        let nextEffect = null;
        try {
            const previousOutputStream = this.state.localStream;
            const nextPipeline = await this.createOutputForRaw(this.rawLocalStream, mode);
            nextOutputStream = nextPipeline.stream;
            nextEffect = nextPipeline.effect;

            if (this.replacePeerTracks) {
                await this.replacePeerTracks(nextOutputStream);
            }

            this.backgroundMode = mode;
            this.applyOutputPipeline({
                rawStream: this.rawLocalStream,
                outputStream: nextOutputStream,
                effect: nextEffect,
            });
            nextOutputStream = null;
            nextEffect = null;

            if (previousOutputStream && previousOutputStream !== this.rawLocalStream) {
                previousOutputStream.getVideoTracks().forEach((track) => track.stop());
            }
            this.applyLocalTrackState();
            this.setStatus(`Background ${mode === 'off' ? 'disabled' : `set to ${mode}`}.`);
        } catch (error) {
            nextEffect?.stop(false);
            if (nextOutputStream && nextOutputStream !== this.rawLocalStream) {
                nextOutputStream.getVideoTracks().forEach((track) => track.stop());
            }
            throw error;
        } finally {
            this.state.switchingDevices = false;
            this.setControlsState({ mediaReady: Boolean(this.state.localStream), searching: this.state.inQueue });
        }
    }

    async setBackgroundImage(file) {
        if (!file) {
            throw new Error('No image selected');
        }

        this.backgroundImage = await this.loadImageFile(file);
        if (this.backgroundMode === 'image' && this.rawLocalStream) {
            await this.setBackgroundMode('image');
        }
    }

    getBackgroundMode() {
        return this.backgroundMode;
    }

    getSelectedBackgroundImageName() {
        return this.backgroundImage?.dataset?.filename || '';
    }

    async createOutputForRaw(rawStream, mode) {
        if (mode === 'off') {
            return { stream: rawStream, effect: null };
        }

        if (!BackgroundEffects.supported()) {
            throw new Error('Background effects are not supported in this browser');
        }

        const effect = new BackgroundEffects((error) => {
            console.error('Background processing error:', error);
        });
        try {
            const stream = await effect.start(rawStream);
            await effect.setMode(mode, this.backgroundImage);
            return { stream, effect };
        } catch (error) {
            effect.stop(false);
            throw error;
        }
    }

    applyOutputPipeline({ rawStream, outputStream, effect }) {
        this.disposeBackgroundEffects();
        this.rawLocalStream = rawStream;
        this.backgroundEffects = effect;
        this.state.localStream = outputStream;
        this.el.localVideo.srcObject = this.state.localStream;
    }

    disposeBackgroundEffects() {
        if (!this.backgroundEffects) {
            return;
        }
        this.backgroundEffects.stop(false);
        this.backgroundEffects = null;
    }

    loadImageFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const image = new Image();
                image.onload = () => {
                    image.dataset.filename = file.name;
                    resolve(image);
                };
                image.onerror = () => reject(new Error('Unable to load background image'));
                image.src = String(reader.result);
            };
            reader.onerror = () => reject(new Error('Unable to read background image'));
            reader.readAsDataURL(file);
        });
    }
}
