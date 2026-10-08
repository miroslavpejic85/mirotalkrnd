// Both stores expose the same async interface: claimOrEnqueue, removeFromQueue, pair, unpair,
// getPartnerId, setMediaState, getMediaState and deleteMediaState, plus the moderation methods:
// setLastPartner, takeLastPartner, deleteLastPartner, addReport, clearReports, setBan, getBan and
// incrementStrikes.
const { createMemoryStore } = require('./memory-store');
const { createRedisStore } = require('./redis-store');

module.exports = {
    createMemoryStore,
    createRedisStore,
};
