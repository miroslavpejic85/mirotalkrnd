const DEFAULT_MEDIA_STATE = { isMuted: false, isCameraOff: false };

// Entries expire so that state left behind by a crashed instance does not leak forever.
const STATE_TTL_SECONDS = 24 * 60 * 60;

module.exports = {
    DEFAULT_MEDIA_STATE,
    STATE_TTL_SECONDS,
};
