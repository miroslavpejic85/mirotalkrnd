import { CONNECTION_STATES } from './config.js';

export function renderLucideIcons() {
    if (window.lucide?.createIcons) {
        window.lucide.createIcons();
    }
}

export function initTooltips() {
    if (!window.tippy) {
        return;
    }

    document.querySelectorAll('[data-tippy-content]').forEach((element) => {
        const content = element.getAttribute('data-tippy-content') || '';
        const placement = element.getAttribute('data-tippy-placement') || 'top';
        if (element._tippy) {
            element._tippy.setContent(content);
            element._tippy.setProps({ placement });
            return;
        }

        window.tippy(element, {
            theme: 'mirotalk',
            animation: 'shift-away',
            delay: [120, 0],
            duration: [130, 90],
            placement,
            trigger: 'mouseenter focus',
            offset: [0, 10],
            touch: false,
            maxWidth: 220,
        });
    });
}

function getLucideSvg(iconName) {
    const icon = window.lucide?.icons?.[iconName];
    if (icon?.toSvg) {
        return icon.toSvg({ width: 17, height: 17, 'aria-hidden': 'true' });
    }
    return `<i data-lucide="${iconName}" aria-hidden="true"></i>`;
}

export function setStatus(el, message) {
    el.statusText.textContent = message;
}

export function setConnectionState(el, state, label) {
    el.connectionBadge.classList.remove(...CONNECTION_STATES);
    el.connectionBadge.classList.add(state);
    el.connectionBadge.textContent = label;
}

export function setOnboardingVisible(el, visible) {
    el.onboardingHint.hidden = !visible;
}

export function setSettingsPanelVisible(el, visible) {
    el.settingsPanel.hidden = !visible;
    el.settingsBtn.setAttribute('aria-expanded', String(visible));
}

export function setEnableSoundVisible(el, visible) {
    el.enableSoundBtn.hidden = !visible;
}

export function updateLocalCameraOverlay(el, state) {
    const localCameraTrack = state.localStream?.getVideoTracks?.()[0];
    const hasLocalCamera = Boolean(localCameraTrack);
    const showLocalCameraOff = hasLocalCamera && state.isCameraOff;
    el.localAvatarOverlay.hidden = !showLocalCameraOff;
}

export function setSelfPreviewLayout(el, hidden) {
    el.videoLayout.classList.toggle('self-preview-hidden', hidden);
}

export function updateRemoteMediaState(el, state, { hasPartner = false, hasRemoteStream = false } = {}) {
    const showMicOff = hasPartner && state.remotePeerMuted;
    const showCameraOff = hasPartner && state.remotePeerCameraOff;
    const showWaitingPlaceholder = !hasPartner || (!hasRemoteStream && !showCameraOff);
    const isSearchingForPartner = showWaitingPlaceholder && state.hasStartedMatching && state.inQueue;
    const placeholderText = isSearchingForPartner ? 'Looking for a partner...' : 'Waiting for partner...';

    el.remoteMediaStatus.hidden = !showMicOff;
    el.remoteMicStatus.hidden = !showMicOff;
    el.remoteAvatarOverlay.hidden = !showCameraOff;
    el.remotePlaceholder.style.display = showWaitingPlaceholder ? 'grid' : 'none';
    el.remotePlaceholder.classList.toggle('is-searching', isSearchingForPartner);
    if (el.remotePlaceholderText) {
        el.remotePlaceholderText.textContent = placeholderText;
    }
}

export function updatePrimaryActions(el, state, { searching = false } = {}) {
    if (state.hasStartedMatching) {
        el.startBtn.hidden = true;
        return;
    }

    el.startBtn.hidden = false;
    el.startBtn.classList.toggle('subtle-btn', searching);
    el.startBtn.classList.toggle('primary-btn', !searching);

    if (searching) {
        el.startBtn.title = 'Searching for partner';
        el.startBtn.setAttribute('aria-label', 'Searching for partner');
        el.startBtn.setAttribute('data-tippy-content', 'Searching for partner');
        initTooltips();
        return;
    }

    el.startBtn.title = 'Start matching';
    el.startBtn.setAttribute('aria-label', 'Start matching');
    el.startBtn.setAttribute('data-tippy-content', 'Start matching');
    initTooltips();
}

export function updateMediaButtons(el, state) {
    el.muteBtn.innerHTML = state.isMuted ? getLucideSvg('mic-off') : getLucideSvg('mic');
    el.cameraBtn.innerHTML = state.isCameraOff ? getLucideSvg('video-off') : getLucideSvg('video');
    el.hideSelfBtn.innerHTML = state.selfPreviewHidden ? getLucideSvg('eye') : getLucideSvg('eye-off');
    renderLucideIcons();
    el.muteBtn.classList.toggle('off', state.isMuted);
    el.cameraBtn.classList.toggle('off', state.isCameraOff);
    el.hideSelfBtn.classList.toggle('off', state.selfPreviewHidden);
    el.muteBtn.title = state.isMuted ? 'Unmute microphone' : 'Mute microphone';
    el.cameraBtn.title = state.isCameraOff ? 'Turn camera on' : 'Turn camera off';
    el.hideSelfBtn.title = state.selfPreviewHidden ? 'Show my preview' : 'Hide my preview';
    // Stable labels + aria-pressed: screen readers announce the state once instead of a changing label
    el.muteBtn.setAttribute('aria-label', 'Mute microphone');
    el.cameraBtn.setAttribute('aria-label', 'Turn off camera');
    el.hideSelfBtn.setAttribute('aria-label', 'Hide my preview');
    el.muteBtn.setAttribute('aria-pressed', String(state.isMuted));
    el.cameraBtn.setAttribute('aria-pressed', String(state.isCameraOff));
    el.hideSelfBtn.setAttribute('aria-pressed', String(state.selfPreviewHidden));
    el.muteBtn.setAttribute('data-tippy-content', el.muteBtn.title);
    el.cameraBtn.setAttribute('data-tippy-content', el.cameraBtn.title);
    el.hideSelfBtn.setAttribute('data-tippy-content', el.hideSelfBtn.title);
    initTooltips();
}

export function setControlsState(
    el,
    state,
    { searching = false, mediaReady = false, canSkip = state.hasStartedMatching, startDisabled = false } = {}
) {
    const canEndSession = mediaReady || state.hasStartedMatching || state.inQueue || Boolean(state.remoteStream);

    el.startBtn.disabled = searching || startDisabled;
    el.nextBtn.hidden = !state.hasStartedMatching;
    el.nextBtn.disabled = !mediaReady || !canSkip;
    el.muteBtn.disabled = !mediaReady;
    el.cameraBtn.disabled = !mediaReady;
    el.hideSelfBtn.disabled = !mediaReady;
    el.endSessionBtn.disabled = !canEndSession;
    el.cameraSelect.disabled = !mediaReady || state.switchingDevices;
    el.microphoneSelect.disabled = !mediaReady || state.switchingDevices;
    el.backgroundModeSelect.disabled = !mediaReady || state.switchingDevices;
    el.backgroundImageBtn.disabled = !mediaReady || state.switchingDevices;
    updatePrimaryActions(el, state, { searching });
}
