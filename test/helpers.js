const http = require('http');
const { mock } = require('node:test');
const { Server } = require('socket.io');
const { io: connect } = require('socket.io-client');
const { createMatchmakingService } = require('../src/socket/matchmaking-service');
const { createMemoryStore } = require('../src/socket/matchmaking-store');
const { setupRedis } = require('../src/socket/setup-redis');
const { registerSocketHandlers } = require('../src/socket/register-socket-handlers');

// The app logs every connect/disconnect; keep the test output readable.
mock.method(console, 'log', () => {});

const EVENTS = ['matched', 'queue-update', 'partner-disconnected', 'webrtc-offer', 'peer-media-state', 'server-notice'];

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(condition, timeoutMs = 3000) {
    const start = Date.now();
    while (!condition()) {
        if (Date.now() - start > timeoutMs) {
            throw new Error('Timed out waiting for condition');
        }
        await wait(20);
    }
}

// One app instance, as server.js builds it, without HTTP routes. Instances created with the same
// redis.url and keyPrefix behave like several servers sharing one matchmaking pool.
async function createInstance({ redis, limits = {} } = {}) {
    const server = http.createServer();
    const io = new Server(server);
    const store = redis ? await setupRedis({ io, ...redis }) : createMemoryStore();
    const matchmaking = createMatchmakingService({ io, store });
    registerSocketHandlers({ io, limits, matchmaking });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    const clients = [];

    return {
        port,
        async client() {
            const socket = connect(`http://127.0.0.1:${port}`, { transports: ['websocket'], forceNew: true });
            socket.events = [];
            for (const name of EVENTS) {
                socket.on(name, (payload) => socket.events.push({ name, payload }));
            }
            await new Promise((resolve, reject) => {
                socket.once('connect', resolve);
                socket.once('connect_error', reject);
            });
            clients.push(socket);
            return socket;
        },
        async close() {
            clients.forEach((socket) => socket.disconnect());
            await io.close();
            // Let the async disconnect handlers finish before the Redis connections go away.
            await wait(100);
            await store.close?.();
        },
    };
}

function eventsNamed(socket, name) {
    return socket.events.filter((event) => event.name === name).map((event) => event.payload);
}

module.exports = { createInstance, eventsNamed, wait, waitFor };
