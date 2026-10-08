const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createMatchmakingService } = require('../src/socket/matchmaking-service');
const { createMemoryStore } = require('../src/socket/matchmaking-store');

// Minimal Socket.IO stand-in: tracks which sockets are connected and records emitted events.
function createFakeIo(connectedIds) {
    const emitted = [];
    return {
        emitted,
        in: (id) => ({ fetchSockets: async () => (connectedIds.has(id) ? [{ id }] : []) }),
        to: (id) => ({ emit: (name, payload) => emitted.push({ id, name, payload }) }),
    };
}

const matchedIds = (io) => io.emitted.filter((event) => event.name === 'matched').map((event) => event.id);

test('a partner who disconnects while being paired is not matched and the waiting user keeps searching', async () => {
    const connected = new Set(['a', 'ghost']);
    const io = createFakeIo(connected);
    const store = createMemoryStore();
    const pair = store.pair;
    store.pair = async (...args) => {
        await pair(...args);
        connected.delete('ghost');
    };

    const matchmaking = createMatchmakingService({ io, store });
    await store.claimOrEnqueue('ghost');
    await matchmaking.findPartnerFor('a');

    assert.deepEqual(matchedIds(io), []);
    assert.equal(await matchmaking.getPartnerId('a'), null);
    assert.deepEqual(
        io.emitted.filter((event) => event.name === 'queue-update').map((event) => event.id),
        ['a']
    );

    connected.add('b');
    await matchmaking.findPartnerFor('b');
    assert.deepEqual(matchedIds(io).sort(), ['a', 'b']);
});

test('a requester who disconnects while being paired does not trap the waiting partner', async () => {
    const connected = new Set(['a', 'waiting']);
    const io = createFakeIo(connected);
    const store = createMemoryStore();
    const pair = store.pair;
    store.pair = async (...args) => {
        await pair(...args);
        connected.delete('a');
    };

    const matchmaking = createMatchmakingService({ io, store });
    await store.claimOrEnqueue('waiting');
    await matchmaking.findPartnerFor('a');

    assert.deepEqual(matchedIds(io), []);
    assert.equal(await matchmaking.getPartnerId('waiting'), null);
    assert.deepEqual(
        io.emitted.filter((event) => event.name === 'queue-update').map((event) => event.id),
        ['waiting']
    );
});
