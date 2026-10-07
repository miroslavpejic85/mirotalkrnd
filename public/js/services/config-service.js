export async function loadRtcConfig(state) {
    if (state.hasLoadedRtcConfig) {
        return;
    }

    try {
        const response = await fetch('/api/webrtc-config', { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        if (Array.isArray(data?.iceServers) && data.iceServers.length) {
            state.rtcConfig = { iceServers: data.iceServers };
        }
        state.hasLoadedRtcConfig = true;
    } catch (error) {
        console.error('Failed to load WebRTC config from server, using default STUN config.', error);
    }
}
