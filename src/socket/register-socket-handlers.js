function normalizeIp(ip) {
    if (!ip) {
        return 'unknown';
    }

    if (ip.startsWith('::ffff:')) {
        return ip.slice(7);
    }

    return ip;
}

function getSocketIp(socket) {
    const forwardedFor = socket.handshake.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
        const firstIp = forwardedFor.split(',')[0]?.trim();
        if (firstIp) {
            return normalizeIp(firstIp);
        }
    }

    return normalizeIp(socket.handshake.address);
}

function registerSocketHandlers({
    io,
    limits,
    matchmaking,
    skipAvoidSamePartner = false,
    captureException = () => {},
}) {
    const socketsByIp = new Map();
    const skipRateWindowsBySocket = new Map();
    const { maxActiveUsers, maxConnectionsPerIp, skipRateLimitPer10s } = limits;

    function safeHandler(eventName, handler) {
        const handleError = (error) => {
            console.error(`Socket handler "${eventName}" failed:`, error);
            captureException(error, `socket:${eventName}`);
        };

        return async (...args) => {
            try {
                return await handler(...args);
            } catch (error) {
                handleError(error);
            }
        };
    }

    function trackSocketForIp(socketId, ip) {
        const socketIds = socketsByIp.get(ip) ?? new Set();
        socketIds.add(socketId);
        socketsByIp.set(ip, socketIds);
    }

    function untrackSocketForIp(socketId, ip) {
        const socketIds = socketsByIp.get(ip);
        if (!socketIds) {
            return;
        }

        socketIds.delete(socketId);
        if (!socketIds.size) {
            socketsByIp.delete(ip);
        }
    }

    function getConnectionsForIp(ip) {
        const socketIds = socketsByIp.get(ip);
        return socketIds?.size ?? 0;
    }

    function isSkipRateLimited(socketId) {
        if (!skipRateLimitPer10s) {
            return false;
        }

        const now = Date.now();
        const windowMs = 10_000;
        const currentWindow = skipRateWindowsBySocket.get(socketId);

        if (!currentWindow || now - currentWindow.windowStartMs >= windowMs) {
            skipRateWindowsBySocket.set(socketId, { windowStartMs: now, count: 1 });
            return false;
        }

        if (currentWindow.count >= skipRateLimitPer10s) {
            return true;
        }

        currentWindow.count += 1;
        return false;
    }

    function clearSkipRateLimit(socketId) {
        skipRateWindowsBySocket.delete(socketId);
    }

    function logConnectedUsers(eventLabel, socketId, reason, ip) {
        const connectedUsers = io.of('/').sockets.size;
        const limitLabel = maxActiveUsers ? `/${maxActiveUsers}` : '';
        const reasonLabel = reason ? ` reason="${reason}"` : '';
        const ipLabel = ip ? ` ip=${ip}` : '';
        const timestamp = new Date().toISOString();
        console.log(
            `[${timestamp}] [users] ${eventLabel} socket=${socketId}${ipLabel} connected=${connectedUsers}${limitLabel}${reasonLabel}`
        );
    }

    io.use((socket, next) => {
        const socketIp = getSocketIp(socket);

        if (!maxActiveUsers) {
            if (!maxConnectionsPerIp) {
                socket.data.clientIp = socketIp;
                next();
                return;
            }
        }

        if (maxActiveUsers) {
            const activeUsers = io.of('/').sockets.size;
            if (activeUsers >= maxActiveUsers) {
                const error = new Error('Server is at full capacity. Please try again shortly.');
                error.data = {
                    code: 'SERVER_FULL',
                    maxActiveUsers,
                };

                console.warn(`Connection rejected (capacity reached): ${socket.id} (${activeUsers}/${maxActiveUsers})`);
                next(error);
                return;
            }
        }

        if (maxConnectionsPerIp) {
            const ipConnections = getConnectionsForIp(socketIp);
            if (ipConnections >= maxConnectionsPerIp) {
                const error = new Error(
                    'Too many connections from this network. Please close another tab/device and retry.'
                );
                error.data = {
                    code: 'TOO_MANY_CONNECTIONS_FROM_IP',
                    maxConnectionsPerIp,
                };

                console.warn(
                    `Connection rejected (ip limit): ${socket.id} ip=${socketIp} (${ipConnections}/${maxConnectionsPerIp})`
                );
                next(error);
                return;
            }
        }

        socket.data.clientIp = socketIp;
        next();
    });

    io.on('connection', (socket) => {
        const clientIp = socket.data.clientIp || 'unknown';
        trackSocketForIp(socket.id, clientIp);
        logConnectedUsers('connected', socket.id, null, clientIp);

        socket.on(
            'find-partner',
            safeHandler('find-partner', async () => {
                await matchmaking.unpair(socket.id, 'partner-skipped');
                await matchmaking.findPartnerFor(socket.id);
            })
        );

        socket.on(
            'skip-partner',
            safeHandler('skip-partner', async () => {
                if (isSkipRateLimited(socket.id)) {
                    socket.emit('server-notice', {
                        code: 'SKIP_RATE_LIMITED',
                        message: 'You are skipping too quickly. Please wait a few seconds and try again.',
                        retryAfterSeconds: 10,
                        maxSkipsPerWindow: skipRateLimitPer10s,
                    });
                    return;
                }

                const previousPartnerId = await matchmaking.unpair(socket.id, 'partner-skipped');
                const excludeId = skipAvoidSamePartner ? previousPartnerId : null;
                await matchmaking.findPartnerFor(socket.id, { excludeId });

                if (previousPartnerId && (await matchmaking.socketExists(previousPartnerId))) {
                    await matchmaking.findPartnerFor(previousPartnerId, { excludeId: excludeId && socket.id });
                }
            })
        );

        socket.on(
            'webrtc-offer',
            safeHandler('webrtc-offer', async (payload) => {
                const partnerId = await matchmaking.getPartnerId(socket.id);
                if (!partnerId || !payload?.sdp) {
                    return;
                }
                io.to(partnerId).emit('webrtc-offer', { sdp: payload.sdp });
            })
        );

        socket.on(
            'webrtc-answer',
            safeHandler('webrtc-answer', async (payload) => {
                const partnerId = await matchmaking.getPartnerId(socket.id);
                if (!partnerId || !payload?.sdp) {
                    return;
                }
                io.to(partnerId).emit('webrtc-answer', { sdp: payload.sdp });
            })
        );

        socket.on(
            'webrtc-ice-candidate',
            safeHandler('webrtc-ice-candidate', async (payload) => {
                const partnerId = await matchmaking.getPartnerId(socket.id);
                if (!partnerId || !payload?.candidate) {
                    return;
                }
                io.to(partnerId).emit('webrtc-ice-candidate', { candidate: payload.candidate });
            })
        );

        socket.on(
            'media-state-update',
            safeHandler('media-state-update', async (payload) => {
                if (typeof payload?.isMuted !== 'boolean' || typeof payload?.isCameraOff !== 'boolean') {
                    return;
                }

                await matchmaking.setMediaStateForSocket(socket.id, {
                    isMuted: payload.isMuted,
                    isCameraOff: payload.isCameraOff,
                });
            })
        );

        socket.on(
            'disconnect',
            safeHandler('disconnect', async (reason) => {
                clearSkipRateLimit(socket.id);
                untrackSocketForIp(socket.id, clientIp);
                logConnectedUsers('disconnected', socket.id, reason, clientIp);

                await matchmaking.removeFromQueue(socket.id);
                const previousPartnerId = await matchmaking.unpair(socket.id, 'partner-left');
                await matchmaking.deleteMediaStateForSocket(socket.id);

                if (previousPartnerId && (await matchmaking.socketExists(previousPartnerId))) {
                    await matchmaking.findPartnerFor(previousPartnerId);
                }
            })
        );
    });
}

module.exports = {
    registerSocketHandlers,
};
