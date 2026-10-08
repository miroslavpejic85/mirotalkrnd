const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createInstance, eventsNamed, wait, waitFor } = require('./helpers');

const redisUrl = process.env.TEST_REDIS_URL;
let redisRunId = Date.now();

// Runs the same scenarios against one server (memory store) and two servers sharing Redis.
function defineScenarios(name, { createInstances, skip = false }) {
    describe(name, { skip }, () => {
        let instances;
        let cleanup;

        // Fresh instances (and queue) per test so users left waiting by one test cannot affect the next.
        beforeEach(async () => {
            ({ instances, cleanup } = await createInstances());
        });

        afterEach(async () => {
            await cleanup();
        });

        // Spread clients over the instances so cross-server pairs are exercised.
        const clientOn = (index) => instances[index % instances.length].client();

        test('matches two users and relays signaling and media state', async () => {
            const a = await clientOn(0);
            const b = await clientOn(1);

            a.emit('media-state-update', { isMuted: true, isCameraOff: false });
            await wait(100);
            a.emit('find-partner');
            await waitFor(() => eventsNamed(a, 'queue-update').length === 1);
            b.emit('find-partner');

            await waitFor(() => eventsNamed(a, 'matched').length && eventsNamed(b, 'matched').length);
            assert.deepEqual(eventsNamed(a, 'matched'), [{ partnerId: b.id, initiator: false }]);
            assert.deepEqual(eventsNamed(b, 'matched'), [{ partnerId: a.id, initiator: true }]);

            await waitFor(() => eventsNamed(b, 'peer-media-state').length);
            assert.deepEqual(eventsNamed(b, 'peer-media-state')[0], { isMuted: true, isCameraOff: false });

            b.emit('webrtc-offer', { sdp: 'offer-sdp' });
            await waitFor(() => eventsNamed(a, 'webrtc-offer').length);
            assert.deepEqual(eventsNamed(a, 'webrtc-offer'), [{ sdp: 'offer-sdp' }]);

            b.disconnect();
            await waitFor(() => eventsNamed(a, 'partner-disconnected').length);
            assert.deepEqual(eventsNamed(a, 'partner-disconnected'), [{ reason: 'partner-left' }]);
        });

        test('skip rematches both users with someone new', async () => {
            const a = await clientOn(0);
            const b = await clientOn(1);
            const c = await clientOn(0);

            a.emit('find-partner');
            b.emit('find-partner');
            await waitFor(() => eventsNamed(a, 'matched').length && eventsNamed(b, 'matched').length);

            c.emit('find-partner');
            await waitFor(() => eventsNamed(c, 'queue-update').length);

            a.emit('skip-partner');
            await waitFor(() => eventsNamed(b, 'partner-disconnected').length);
            assert.deepEqual(eventsNamed(b, 'partner-disconnected'), [{ reason: 'partner-skipped' }]);

            await waitFor(() => eventsNamed(a, 'matched').length === 2 || eventsNamed(c, 'matched').length);
            assert.deepEqual(eventsNamed(c, 'matched'), [{ partnerId: a.id, initiator: false }]);
            await waitFor(() => eventsNamed(b, 'queue-update').length);
        });

        test('does not pair a user with themselves', async () => {
            const a = await clientOn(0);

            a.emit('find-partner');
            a.emit('find-partner');
            await wait(300);

            assert.equal(eventsNamed(a, 'matched').length, 0);
        });

        test('skips waiting users who already disconnected', async () => {
            const stale = await clientOn(0);
            stale.emit('find-partner');
            await waitFor(() => eventsNamed(stale, 'queue-update').length);
            stale.disconnect();
            await wait(200);

            const a = await clientOn(0);
            const b = await clientOn(1);
            a.emit('find-partner');
            b.emit('find-partner');

            await waitFor(() => eventsNamed(a, 'matched').length && eventsNamed(b, 'matched').length);
            assert.equal(eventsNamed(a, 'matched')[0].partnerId, b.id);
        });

        test('pairs every user exactly once when many search at the same time', async () => {
            const total = 24;
            const sockets = [];
            for (let i = 0; i < total; i += 1) {
                sockets.push(await clientOn(i));
            }

            sockets.forEach((socket) => socket.emit('find-partner'));
            await waitFor(() => sockets.every((socket) => eventsNamed(socket, 'matched').length));
            await wait(200);

            const partnerOf = new Map(sockets.map((socket) => [socket.id, eventsNamed(socket, 'matched')]));
            for (const [id, matches] of partnerOf) {
                assert.equal(matches.length, 1, `${id} matched once`);
                const partnerMatches = partnerOf.get(matches[0].partnerId);
                assert.equal(partnerMatches[0].partnerId, id, 'pairing is symmetric');
            }
            sockets.forEach((socket) => socket.disconnect());
        });
    });
}

defineScenarios('single instance (in-memory)', {
    async createInstances() {
        const instance = await createInstance();
        return { instances: [instance], cleanup: () => instance.close() };
    },
});

defineScenarios('two instances sharing Redis (set TEST_REDIS_URL to run)', {
    skip: !redisUrl && 'TEST_REDIS_URL is not set',
    async createInstances() {
        const redis = { url: redisUrl, keyPrefix: `mirotalkrnd-test-${process.pid}-${redisRunId++}:` };
        const instances = [await createInstance({ redis }), await createInstance({ redis })];
        return { instances, cleanup: () => Promise.all(instances.map((instance) => instance.close())) };
    },
});
