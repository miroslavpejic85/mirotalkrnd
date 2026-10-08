const { DEFAULT_MEDIA_STATE, STATE_TTL_SECONDS } = require('./constants');

const SWEEP_INTERVAL_MS = 60_000;

// Map whose entries expire after a TTL. Expired entries are dropped on read and swept on write, so no timer is needed.
function createExpiringMap() {
    const entries = new Map();
    let lastSweepMs = Date.now();

    function sweep(nowMs) {
        if (nowMs - lastSweepMs < SWEEP_INTERVAL_MS) {
            return;
        }

        lastSweepMs = nowMs;
        for (const [key, entry] of entries) {
            if (entry.expiresAtMs <= nowMs) {
                entries.delete(key);
            }
        }
    }

    return {
        get(key) {
            const entry = entries.get(key);
            if (!entry) {
                return undefined;
            }

            if (entry.expiresAtMs <= Date.now()) {
                entries.delete(key);
                return undefined;
            }

            return entry.value;
        },

        set(key, value, ttlSeconds) {
            const nowMs = Date.now();
            sweep(nowMs);
            entries.set(key, { value, expiresAtMs: nowMs + ttlSeconds * 1000 });
        },

        delete(key) {
            entries.delete(key);
        },
    };
}

function createMemoryStore() {
    const waitingQueue = [];
    const partners = new Map();
    const mediaStateBySocket = new Map();
    const lastPartnerBySocket = createExpiringMap();
    const reportersByIp = createExpiringMap();
    const bansByIp = createExpiringMap();
    const strikesByIp = createExpiringMap();

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

        async setLastPartner(socketId, partner) {
            lastPartnerBySocket.set(socketId, partner, STATE_TTL_SECONDS);
        },

        // Returns and removes the record, so each pairing can be reported only once.
        async takeLastPartner(socketId) {
            const partner = lastPartnerBySocket.get(socketId) ?? null;
            lastPartnerBySocket.delete(socketId);
            return partner;
        },

        async deleteLastPartner(socketId) {
            lastPartnerBySocket.delete(socketId);
        },

        // Returns how many different reporters reported this IP. The window starts at the first report.
        async addReport(ip, reporterIp, windowSeconds) {
            let reporters = reportersByIp.get(ip);
            if (!reporters) {
                reporters = new Set();
                reportersByIp.set(ip, reporters, windowSeconds);
            }

            reporters.add(reporterIp);
            return reporters.size;
        },

        async clearReports(ip) {
            reportersByIp.delete(ip);
        },

        async setBan(ip, expiresAtMs, ttlSeconds) {
            bansByIp.set(ip, expiresAtMs, ttlSeconds);
        },

        async getBan(ip) {
            return bansByIp.get(ip) ?? null;
        },

        async incrementStrikes(ip, ttlSeconds) {
            const strikes = (strikesByIp.get(ip) ?? 0) + 1;
            strikesByIp.set(ip, strikes, ttlSeconds);
            return strikes;
        },
    };
}

module.exports = {
    createMemoryStore,
};
