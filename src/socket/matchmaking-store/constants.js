const DEFAULT_MEDIA_STATE = { isMuted: false, isCameraOff: false };

// Entries expire so that state left behind by a crashed instance does not leak forever.
const STATE_TTL_SECONDS = 24 * 60 * 60;

// Ban strikes are remembered this long so repeat offenders get longer bans.
const STRIKE_TTL_SECONDS = 30 * 24 * 60 * 60;

module.exports = {
    DEFAULT_MEDIA_STATE,
    STATE_TTL_SECONDS,
    STRIKE_TTL_SECONDS,
};
