const { DEFAULT_MEDIA_STATE } = require('./constants');

function createMemoryStore() {
    const waitingQueue = [];
    const partners = new Map();
    const mediaStateBySocket = new Map();

    return {
        async claimOrEnqueue(socketId, maxQueueUsers, excludeId = null) {
            const index = waitingQueue.indexOf(socketId);
            if (index !== -1) {
                waitingQueue.splice(index, 1);
            }

            const candidateIndex = waitingQueue.findIndex((id) => id !== excludeId);
            if (candidateIndex !== -1) {
                const [candidateId] = waitingQueue.splice(candidateIndex, 1);
                return { status: 'claimed', candidateId };
            }

            if (maxQueueUsers && waitingQueue.length >= maxQueueUsers) {
                return { status: 'full' };
            }

            waitingQueue.push(socketId);
            return { status: 'queued', waitingCount: waitingQueue.length };
        },

        async removeFromQueue(socketId) {
            const index = waitingQueue.indexOf(socketId);
            if (index !== -1) {
                waitingQueue.splice(index, 1);
            }
        },

        async pair(socketId, partnerId) {
            partners.set(socketId, partnerId);
            partners.set(partnerId, socketId);
        },

        async unpair(socketId) {
            const partnerId = partners.get(socketId);
            if (!partnerId) {
                return null;
            }

            partners.delete(socketId);
            if (partners.get(partnerId) === socketId) {
                partners.delete(partnerId);
            }

            return partnerId;
        },

        async getPartnerId(socketId) {
            return partners.get(socketId) ?? null;
        },

        async setMediaState(socketId, mediaState) {
            mediaStateBySocket.set(socketId, mediaState);
        },

        async getMediaState(socketId) {
            return mediaStateBySocket.get(socketId) ?? DEFAULT_MEDIA_STATE;
        },

        async deleteMediaState(socketId) {
            mediaStateBySocket.delete(socketId);
        },
    };
}

module.exports = {
    createMemoryStore,
};
