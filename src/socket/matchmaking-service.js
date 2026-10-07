function createMatchmakingService({ io, maxQueueUsers }) {
    const waitingQueue = [];
    const partners = new Map();
    const mediaStateBySocket = new Map();

    function emitServerNotice(socket, payload) {
        socket.emit('server-notice', payload);
    }

    function getMediaStateForSocket(socketId) {
        return mediaStateBySocket.get(socketId) ?? { isMuted: false, isCameraOff: false };
    }

    function removeFromQueue(socketId) {
        const index = waitingQueue.indexOf(socketId);
        if (index !== -1) {
            waitingQueue.splice(index, 1);
        }
    }

    function unpair(socketId, reason = 'partner-left') {
        const partnerId = partners.get(socketId);
        if (!partnerId) {
            return null;
        }

        partners.delete(socketId);
        partners.delete(partnerId);

        const partnerSocket = io.sockets.sockets.get(partnerId);
        if (partnerSocket) {
            partnerSocket.emit('partner-disconnected', { reason });
        }

        return partnerId;
    }

    function findPartnerFor(socketId) {
        removeFromQueue(socketId);

        let partnerId = null;
        while (waitingQueue.length) {
            const candidateId = waitingQueue.shift();
            if (candidateId && candidateId !== socketId && io.sockets.sockets.has(candidateId)) {
                partnerId = candidateId;
                break;
            }
        }

        if (!partnerId) {
            if (maxQueueUsers && waitingQueue.length >= maxQueueUsers) {
                const socket = io.sockets.sockets.get(socketId);
                if (socket) {
                    emitServerNotice(socket, {
                        code: 'QUEUE_FULL',
                        message: 'Match queue is full right now. Please try again shortly.',
                        maxQueueUsers,
                    });
                }
                return;
            }

            waitingQueue.push(socketId);
            io.to(socketId).emit('queue-update', { status: 'waiting', waitingCount: waitingQueue.length });
            return;
        }

        partners.set(socketId, partnerId);
        partners.set(partnerId, socketId);

        io.to(socketId).emit('matched', { partnerId, initiator: true });
        io.to(partnerId).emit('matched', { partnerId: socketId, initiator: false });

        io.to(socketId).emit('peer-media-state', getMediaStateForSocket(partnerId));
        io.to(partnerId).emit('peer-media-state', getMediaStateForSocket(socketId));
    }

    function getPartnerId(socketId) {
        return partners.get(socketId) ?? null;
    }

    function setMediaStateForSocket(socketId, mediaState) {
        mediaStateBySocket.set(socketId, mediaState);

        const partnerId = partners.get(socketId);
        if (!partnerId) {
            return;
        }

        io.to(partnerId).emit('peer-media-state', getMediaStateForSocket(socketId));
    }

    function deleteMediaStateForSocket(socketId) {
        mediaStateBySocket.delete(socketId);
    }

    return {
        removeFromQueue,
        unpair,
        findPartnerFor,
        getPartnerId,
        setMediaStateForSocket,
        deleteMediaStateForSocket,
    };
}

module.exports = {
    createMatchmakingService,
};
