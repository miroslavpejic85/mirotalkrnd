const { DEFAULT_MEDIA_STATE, STATE_TTL_SECONDS } = require('./constants');
const { CLAIM_OR_ENQUEUE_SCRIPT, PAIR_SCRIPT, UNPAIR_SCRIPT } = require('./redis-scripts');

function createRedisStore({ client, keyPrefix = 'mirotalkrnd:' }) {
    const queueKey = `${keyPrefix}queue`;
    const partnerPrefix = `${keyPrefix}partner:`;
    const mediaPrefix = `${keyPrefix}media:`;

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
    };
}

module.exports = {
    createRedisStore,
};
