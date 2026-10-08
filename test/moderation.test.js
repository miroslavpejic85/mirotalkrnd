const { test, describe, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { createInstance, eventsNamed, wait, waitFor } = require('./helpers');
const { createModerationService } = require('../src/socket/moderation-service');
const { createMemoryStore } = require('../src/socket/matchmaking-store');

const redisUrl = process.env.TEST_REDIS_URL;
let redisRunId = Date.now();

const MODERATION = { reportBanThreshold: 3, reportWindowSeconds: 3600, banDurationSeconds: 3600 };
const trustAll = () => true;

function report(socket) {
    return new Promise((resolve) => socket.emit('report-partner', resolve));
}

// Pairs `reporter` with `offender`, waiting until both see the match.
async function pair(offender, reporter) {
    const offenderMatches = eventsNamed(offender, 'matched').length;
    const reporterMatches = eventsNamed(reporter, 'matched').length;
    offender.emit('find-partner');
    await wait(50);
    reporter.emit('find-partner');
    await waitFor(
        () =>
            eventsNamed(offender, 'matched').length > offenderMatches &&
            eventsNamed(reporter, 'matched').length > reporterMatches
    );
}

function defineScenarios(name, { createInstances, skip = false }) {
    describe(name, { skip }, () => {
        let instances;
        let cleanup;

        beforeEach(async () => {
            ({ instances, cleanup } = await createInstances());
        });

        afterEach(async () => {
            await cleanup();
        });

        const clientOn = (index, ip) => instances[index % instances.length].client({ ip });

        test('bans an IP reported by enough different IPs and rejects it on reconnect', async () => {
            const offender = await clientOn(0, '10.0.0.1');
            const reporters = [
                await clientOn(1, '10.0.0.2'),
                await clientOn(0, '10.0.0.3'),
                await clientOn(1, '10.0.0.4'),
            ];

            for (const [index, reporter] of reporters.entries()) {
                await pair(offender, reporter);
                assert.deepEqual(await report(reporter), { ok: true });
                if (index < reporters.length - 1) {
                    reporter.disconnect();
                    await waitFor(() => eventsNamed(offender, 'partner-disconnected').length === index + 1);
                }
            }

            await waitFor(() => eventsNamed(offender, 'banned').length === 1);
            assert.ok(eventsNamed(offender, 'banned')[0].expiresAt > Date.now());
            await waitFor(() => offender.disconnected);

            await assert.rejects(clientOn(0, '10.0.0.1'), (error) => error.data?.code === 'BANNED');
            await assert.rejects(clientOn(1, '10.0.0.1'), (error) => error.data?.code === 'BANNED');
            await clientOn(0, '10.0.0.9');
        });

        test('counts each reporting IP once and each pairing once', async () => {
            const offender = await clientOn(0, '10.0.1.1');
            const reporterA = await clientOn(1, '10.0.1.2');
            const reporterB = await clientOn(0, '10.0.1.2');

            await pair(offender, reporterA);
            assert.deepEqual(await report(reporterA), { ok: true });
            assert.deepEqual(await report(reporterA), { ok: false, code: 'NO_PARTNER' });
            reporterA.disconnect();
            await waitFor(() => eventsNamed(offender, 'partner-disconnected').length === 1);

            // Same reporting IP again: still one unique reporter.
            await pair(offender, reporterB);
            assert.deepEqual(await report(reporterB), { ok: true });
            reporterB.disconnect();

            await wait(200);
            assert.equal(eventsNamed(offender, 'banned').length, 0);
            assert.equal(offender.connected, true);
        });

        test('ignores reports without a partner and reports from the same IP', async () => {
            const lonely = await clientOn(0, '10.0.2.1');
            assert.deepEqual(await report(lonely), { ok: false, code: 'NO_PARTNER' });

            const first = await clientOn(0, '10.0.2.2');
            const second = await clientOn(1, '10.0.2.2');
            await pair(first, second);
            // Accepted from the reporter's view, but shared IPs cannot be attributed.
            assert.deepEqual(await report(second), { ok: true });
            await wait(100);
            assert.equal(eventsNamed(first, 'banned').length, 0);
        });

        test('lets a user report the partner who just left', async () => {
            const offender = await clientOn(0, '10.0.3.1');
            const reporter = await clientOn(1, '10.0.3.2');
            await pair(offender, reporter);

            offender.disconnect();
            await waitFor(() => eventsNamed(reporter, 'partner-disconnected').length === 1);
            assert.deepEqual(await report(reporter), { ok: true });
        });
    });
}

defineScenarios('moderation, single instance (in-memory)', {
    async createInstances() {
        const instance = await createInstance({ moderation: MODERATION, isTrustedProxy: trustAll });
        return { instances: [instance], cleanup: () => instance.close() };
    },
});

defineScenarios('moderation, two instances sharing Redis (set TEST_REDIS_URL to run)', {
    skip: !redisUrl && 'TEST_REDIS_URL is not set',
    async createInstances() {
        const redis = { url: redisUrl, keyPrefix: `mirotalkrnd-test-${process.pid}-${redisRunId++}:` };
        const instances = [
            await createInstance({ redis, moderation: MODERATION, isTrustedProxy: trustAll }),
            await createInstance({ redis, moderation: MODERATION, isTrustedProxy: trustAll }),
        ];
        return { instances, cleanup: () => Promise.all(instances.map((instance) => instance.close())) };
    },
});

describe('moderation disabled', () => {
    test('reports are refused and nobody is banned', async () => {
        const instance = await createInstance({ isTrustedProxy: trustAll });
        try {
            const client = await instance.client({ ip: '10.0.4.1' });
            assert.deepEqual(await report(client), { ok: false, code: 'DISABLED' });
        } finally {
            await instance.close();
        }
    });
});

describe('proxy trust', () => {
    test('ignores X-Forwarded-For unless the proxy is trusted', async () => {
        const instance = await createInstance({ moderation: MODERATION });
        try {
            // Both clients claim different IPs, but without a trusted proxy they share 127.0.0.1,
            // so a report between them cannot be attributed and nobody gets banned.
            const first = await instance.client({ ip: '10.0.5.1' });
            const second = await instance.client({ ip: '10.0.5.2' });
            await pair(first, second);
            await report(second);
            await wait(100);
            assert.equal(eventsNamed(first, 'banned').length, 0);
        } finally {
            await instance.close();
        }
    });
});

describe('ban escalation', () => {
    test('repeat bans last twice as long', async () => {
        mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
        try {
            const store = createMemoryStore();
            const moderation = createModerationService({
                io: { fetchSockets: async () => [] },
                store,
                log: () => {},
                ...MODERATION,
            });

            async function banOffender() {
                for (const reporterIp of ['1.1.1.1', '2.2.2.2', '3.3.3.3']) {
                    await moderation.rememberPair(
                        { id: 'offender', ip: '9.9.9.9' },
                        { id: `reporter-${reporterIp}`, ip: reporterIp }
                    );
                    await moderation.report(`reporter-${reporterIp}`, reporterIp);
                }
                return moderation.getBan('9.9.9.9');
            }

            const firstBan = await banOffender();
            assert.equal(firstBan.expiresAt - Date.now(), 3600 * 1000);

            mock.timers.tick(3600 * 1000 + 1);
            assert.equal(await moderation.getBan('9.9.9.9'), null);

            const secondBan = await banOffender();
            assert.equal(secondBan.expiresAt - Date.now(), 2 * 3600 * 1000);
        } finally {
            mock.timers.reset();
        }
    });
});
