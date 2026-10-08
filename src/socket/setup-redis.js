const { createClient } = require('redis');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createRedisStore } = require('./matchmaking-store');

// Short grace period for Redis starting at the same time as the app, then fail fast.
const MAX_STARTUP_RETRIES = 3;
const MAX_RECONNECT_DELAY_MS = 2000;

// Connection failures come as an AggregateError with an empty message, so fall back to the error code.
function describeError(error) {
    return error.message || error.code || error.errors?.[0]?.code || 'unknown error';
}

function createRedisClient(url) {
    let wasReady = false;
    let errorLogged = false;

    const client = createClient({
        url,
        socket: {
            reconnectStrategy: (retries, cause) => {
                if (!wasReady && retries >= MAX_STARTUP_RETRIES) {
                    return new Error(
                        `Could not connect to Redis (${describeError(cause)}). Check REDIS_URL and that Redis is running.`
                    );
                }
                return Math.min((retries + 1) * 200, MAX_RECONNECT_DELAY_MS);
            },
        },
    });

    // Startup failures are reported by the error thrown from connect(). Afterwards, log once per outage
    // instead of once per retry.
    client.on('error', (error) => {
        if (wasReady && !errorLogged) {
            errorLogged = true;
            console.error(`Redis error: ${describeError(error)}`);
        }
    });
    client.on('ready', () => {
        if (wasReady && errorLogged) {
            console.log('Redis connection restored');
        }
        wasReady = true;
        errorLogged = false;
    });

    return client;
}

async function setupRedis({ io, url, keyPrefix }) {
    const client = createRedisClient(url);
    const subClient = createRedisClient(url);

    try {
        await Promise.all([client.connect(), subClient.connect()]);
    } catch (error) {
        client.destroy();
        subClient.destroy();
        throw error;
    }

    io.adapter(createAdapter(client, subClient));

    const store = createRedisStore({ client, keyPrefix });
    store.close = () => Promise.all([client.quit(), subClient.quit()]);

    return store;
}

module.exports = {
    setupRedis,
};
