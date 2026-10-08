// Both stores expose the same async interface: claimOrEnqueue, removeFromQueue, pair, unpair,
// getPartnerId, setMediaState, getMediaState and deleteMediaState.
const { createMemoryStore } = require('./memory-store');
const { createRedisStore } = require('./redis-store');

module.exports = {
    createMemoryStore,
    createRedisStore,
};
