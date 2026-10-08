const { createMemoryStore } = require('./matchmaking-store');

function createMatchmakingService({ io, maxQueueUsers, store = createMemoryStore() }) {
    function emitServerNotice(socketId, payload) {
        io.to(socketId).emit('server-notice', payload);
    }

    // Also finds sockets connected to other instances when the Redis adapter is enabled.
    async function socketExists(socketId) {
        const sockets = await io.in(socketId).fetchSockets();
        return sockets.length > 0;
    }

    function removeFromQueue(socketId) {
        return store.removeFromQueue(socketId);
    }

    async function unpair(socketId, reason = 'partner-left') {
        const partnerId = await store.unpair(socketId);
        if (!partnerId) {
            return null;
        }

        io.to(partnerId).emit('partner-disconnected', { reason });

        return partnerId;
    }

    // excludeId: a socket that must not be picked as the partner this time (e.g. the one just skipped).
    async function findPartnerFor(socketId, { excludeId = null } = {}) {
        const result = await store.claimOrEnqueue(socketId, maxQueueUsers, excludeId);

        if (result.status === 'full') {
            emitServerNotice(socketId, {
                code: 'QUEUE_FULL',
                message: 'Match queue is full right now. Please try again shortly.',
                maxQueueUsers,
            });
            return;
        }

        if (result.status === 'queued') {
            io.to(socketId).emit('queue-update', { status: 'waiting', waitingCount: result.waitingCount });
            return;
        }

        const partnerId = result.candidateId;
        await store.pair(socketId, partnerId);

        // Checked after pairing: a socket that left earlier is gone by now, and one that leaves later
        // finds the pair and notifies its partner. Checking before pairing would leave a gap.
        const [requesterConnected, partnerConnected] = await Promise.all([
            socketExists(socketId),
            socketExists(partnerId),
        ]);

        if (!requesterConnected || !partnerConnected) {
            await store.unpair(socketId);
            if (requesterConnected) {
                await findPartnerFor(socketId);
            }
            if (partnerConnected) {
                await findPartnerFor(partnerId);
            }
            return;
        }

        io.to(socketId).emit('matched', { partnerId, initiator: true });
        io.to(partnerId).emit('matched', { partnerId: socketId, initiator: false });

        const [partnerMediaState, ownMediaState] = await Promise.all([
            store.getMediaState(partnerId),
            store.getMediaState(socketId),
        ]);
        io.to(socketId).emit('peer-media-state', partnerMediaState);
        io.to(partnerId).emit('peer-media-state', ownMediaState);
    }

    function getPartnerId(socketId) {
        return store.getPartnerId(socketId);
    }

    async function setMediaStateForSocket(socketId, mediaState) {
        await store.setMediaState(socketId, mediaState);

        const partnerId = await store.getPartnerId(socketId);
        if (!partnerId) {
            return;
        }

        io.to(partnerId).emit('peer-media-state', mediaState);
    }

    function deleteMediaStateForSocket(socketId) {
        return store.deleteMediaState(socketId);
    }

    return {
        removeFromQueue,
        unpair,
        findPartnerFor,
        getPartnerId,
        socketExists,
        setMediaStateForSocket,
        deleteMediaStateForSocket,
    };
}

module.exports = {
    createMatchmakingService,
};
