const { DEFAULT_MEDIA_STATE, STATE_TTL_SECONDS } = require('./constants');
const {
    ADD_REPORT_SCRIPT,
    CLAIM_OR_ENQUEUE_SCRIPT,
    INCREMENT_STRIKES_SCRIPT,
    PAIR_SCRIPT,
    TAKE_SCRIPT,
    UNPAIR_SCRIPT,
} = require('./redis-scripts');

function createRedisStore({ client, keyPrefix = 'mirotalkrnd:' }) {
    const queueKey = `${keyPrefix}queue`;
    const partnerPrefix = `${keyPrefix}partner:`;
    const mediaPrefix = `${keyPrefix}media:`;
    const lastPartnerPrefix = `${keyPrefix}last-partner:`;
    const reportPrefix = `${keyPrefix}reports:`;
    const banPrefix = `${keyPrefix}ban:`;
    const strikePrefix = `${keyPrefix}strikes:`;

    function parseEnqueueResult([status, value]) {
        if (status === 'claimed') {
            return { status, candidateId: value };
        }
        if (status === 'queued') {
            return { status, waitingCount: Number.parseInt(value, 10) };
        }
        return { status };
    }

    return {
        async claimOrEnqueue(socketId, maxQueueUsers, excludeId = null) {
            const result = await client.eval(CLAIM_OR_ENQUEUE_SCRIPT, {
                keys: [queueKey],
                arguments: [socketId, String(maxQueueUsers || 0), excludeId || ''],
            });
            return parseEnqueueResult(result);
        },

        async removeFromQueue(socketId) {
            await client.lRem(queueKey, 0, socketId);
        },

        async pair(socketId, partnerId) {
            await client.eval(PAIR_SCRIPT, {
                keys: [],
                arguments: [partnerPrefix, socketId, partnerId, String(STATE_TTL_SECONDS)],
            });
        },

        async unpair(socketId) {
            const partnerId = await client.eval(UNPAIR_SCRIPT, {
                keys: [],
                arguments: [partnerPrefix, socketId],
            });
            return partnerId || null;
        },

        async getPartnerId(socketId) {
            return (await client.get(`${partnerPrefix}${socketId}`)) ?? null;
        },

        async setMediaState(socketId, mediaState) {
            await client.set(`${mediaPrefix}${socketId}`, JSON.stringify(mediaState), { EX: STATE_TTL_SECONDS });
        },

        async getMediaState(socketId) {
            const value = await client.get(`${mediaPrefix}${socketId}`);
            if (!value) {
                return DEFAULT_MEDIA_STATE;
            }

            try {
                return JSON.parse(value);
            } catch {
                return DEFAULT_MEDIA_STATE;
            }
        },

        async deleteMediaState(socketId) {
            await client.del(`${mediaPrefix}${socketId}`);
        },

        async setLastPartner(socketId, partner) {
            await client.set(`${lastPartnerPrefix}${socketId}`, JSON.stringify(partner), { EX: STATE_TTL_SECONDS });
        },

        async takeLastPartner(socketId) {
            const value = await client.eval(TAKE_SCRIPT, { keys: [`${lastPartnerPrefix}${socketId}`], arguments: [] });
            if (!value) {
                return null;
            }

            try {
                return JSON.parse(value);
            } catch {
                return null;
            }
        },

        async deleteLastPartner(socketId) {
            await client.del(`${lastPartnerPrefix}${socketId}`);
        },

        async addReport(ip, reporterIp, windowSeconds) {
            const count = await client.eval(ADD_REPORT_SCRIPT, {
                keys: [`${reportPrefix}${ip}`],
                arguments: [reporterIp, String(windowSeconds)],
            });
            return Number(count);
        },

        async clearReports(ip) {
            await client.del(`${reportPrefix}${ip}`);
        },

        async setBan(ip, expiresAtMs, ttlSeconds) {
            await client.set(`${banPrefix}${ip}`, String(expiresAtMs), { EX: ttlSeconds });
        },

        async getBan(ip) {
            const value = await client.get(`${banPrefix}${ip}`);
            return value ? Number(value) : null;
        },

        async incrementStrikes(ip, ttlSeconds) {
            const strikes = await client.eval(INCREMENT_STRIKES_SCRIPT, {
                keys: [`${strikePrefix}${ip}`],
                arguments: [String(ttlSeconds)],
            });
            return Number(strikes);
        },
    };
}

module.exports = {
    createRedisStore,
};
