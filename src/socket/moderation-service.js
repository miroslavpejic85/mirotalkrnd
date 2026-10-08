const { STRIKE_TTL_SECONDS } = require('./matchmaking-store/constants');

const MAX_BAN_SECONDS = 30 * 24 * 60 * 60;

const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

function yellow(text) {
    return process.stdout.isTTY && !process.env.NO_COLOR ? `${YELLOW}${text}${RESET}` : text;
}

function formatDuration(seconds) {
    return seconds % 3600 === 0 ? `${seconds / 3600}h` : `${Math.round(seconds / 60)}m`;
}

function isUsableIp(ip) {
    return Boolean(ip) && ip !== 'unknown';
}

// Community moderation: users report their partner, and an IP reported by enough different IPs is banned.
// Media is peer-to-peer, so the server only sees who was paired with whom, never the content.
function createModerationService({
    io,
    store,
    reportBanThreshold,
    reportWindowSeconds,
    banDurationSeconds,
    log = console.log,
}) {
    const enabled = Boolean(reportBanThreshold && reportWindowSeconds && banDurationSeconds);

    // Called when two sockets are matched, so a later report knows who the reporter was talking to.
    async function rememberPair(first, second) {
        if (!enabled) {
            return;
        }

        await Promise.all([
            store.setLastPartner(first.id, { id: second.id, ip: second.ip }),
            store.setLastPartner(second.id, { id: first.id, ip: first.ip }),
        ]);
    }

    function forgetPartner(socketId) {
        return enabled ? store.deleteLastPartner(socketId) : Promise.resolve();
    }

    async function getBan(ip) {
        if (!enabled || !isUsableIp(ip)) {
            return null;
        }

        const expiresAt = await store.getBan(ip);
        return expiresAt && expiresAt > Date.now() ? { expiresAt } : null;
    }

    // Each repeated ban doubles in length, up to 30 days.
    async function banIp(ip, reporterCount) {
        const strikes = await store.incrementStrikes(ip, STRIKE_TTL_SECONDS);
        const durationSeconds = Math.min(banDurationSeconds * 2 ** (strikes - 1), MAX_BAN_SECONDS);
        const expiresAt = Date.now() + durationSeconds * 1000;

        await store.setBan(ip, expiresAt, durationSeconds);
        await store.clearReports(ip);

        // Also reaches sockets connected to other instances when the Redis adapter is enabled.
        const sockets = (await io.fetchSockets()).filter((socket) => socket.data?.clientIp === ip);
        for (const socket of sockets) {
            socket.emit('banned', { expiresAt });
            socket.disconnect(true);
        }

        log(
            yellow(
                `[${new Date().toISOString()}] [moderation] BANNED ip=${ip} duration=${formatDuration(durationSeconds)} ` +
                    `until=${new Date(expiresAt).toISOString()} strike=${strikes} reporters=${reporterCount} ` +
                    `disconnectedSockets=${sockets.length}`
            )
        );
        return { expiresAt };
    }

    // Reports the reporter's most recent partner. Resolves to 'disabled', 'no-partner' or 'recorded'.
    async function report(reporterSocketId, reporterIp) {
        if (!enabled) {
            return 'disabled';
        }

        const partner = await store.takeLastPartner(reporterSocketId);
        if (!partner) {
            return 'no-partner';
        }

        // Reports against unknown IPs or from the same network (shared IP) cannot be attributed.
        if (!isUsableIp(partner.ip) || !isUsableIp(reporterIp) || partner.ip === reporterIp) {
            return 'recorded';
        }

        if (await getBan(partner.ip)) {
            return 'recorded';
        }

        const reporterCount = await store.addReport(partner.ip, reporterIp, reportWindowSeconds);
        log(
            `[${new Date().toISOString()}] [moderation] report ip=${partner.ip} by=${reporterIp} reporters=${reporterCount}/${reportBanThreshold}`
        );

        if (reporterCount >= reportBanThreshold) {
            await banIp(partner.ip, reporterCount);
        }

        return 'recorded';
    }

    return { enabled, rememberPair, forgetPartner, getBan, report };
}

module.exports = { createModerationService, yellow };
