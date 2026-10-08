require('dotenv').config();
const { createRuntimeConfig } = require('./src/config/runtime-config');
const { initSentry, setupExpressErrorHandler, captureException } = require('./src/monitoring/sentry');

const runtimeConfig = createRuntimeConfig(process.env);
// Must run before express/http are required so Sentry can instrument them.
initSentry(runtimeConfig.sentry);

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const express = require('express');
const { Server } = require('socket.io');
const { createHttpRateLimiter } = require('./src/http/create-http-rate-limiter');
const { registerHttpRoutes } = require('./src/http/register-http-routes');
const { createMatchmakingService } = require('./src/socket/matchmaking-service');
const { createMemoryStore } = require('./src/socket/matchmaking-store');
const { setupRedis } = require('./src/socket/setup-redis');
const { registerSocketHandlers } = require('./src/socket/register-socket-handlers');

const app = express();
const {
    port,
    appName,
    aboutLink,
    reportEmailLink,
    reportEmailText,
    appOffline,
    offlineMessage,
    socialMeta,
    useHttps,
    trustProxy,
    sslKeyPath,
    sslCertPath,
    rtcConfig,
    limits,
} = runtimeConfig;
app.set('trust proxy', trustProxy);
const { apiRateLimitWindowMs, apiRateLimitMaxRequests } = limits;
const apiRateLimiter =
    apiRateLimitWindowMs && apiRateLimitMaxRequests
        ? createHttpRateLimiter(apiRateLimitWindowMs, apiRateLimitMaxRequests)
        : null;

function createTransportServer() {
    if (!useHttps) {
        return http.createServer(app);
    }

    const keyPath = path.resolve(__dirname, sslKeyPath);
    const certPath = path.resolve(__dirname, sslCertPath);

    if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
        throw new Error(
            `HTTPS is enabled but SSL files are missing. Expected key at "${keyPath}" and cert at "${certPath}".`
        );
    }

    return https.createServer(
        {
            key: fs.readFileSync(keyPath),
            cert: fs.readFileSync(certPath),
        },
        app
    );
}

const server = createTransportServer();
const io = new Server(server);

if (appOffline) {
    io.use((_, next) => {
        const offlineError = new Error('APP_OFFLINE');
        offlineError.data = { message: offlineMessage };
        next(offlineError);
    });
}

registerHttpRoutes({
    app,
    staticDirPath: path.join(__dirname, 'public'),
    appName,
    aboutLink,
    reportEmailLink,
    reportEmailText,
    appOffline,
    offlineMessage,
    socialMeta,
    rtcConfig,
    apiRateLimiter,
    umami: runtimeConfig.umami,
    sentry: runtimeConfig.sentry,
});

setupExpressErrorHandler(app);

async function start() {
    let store = createMemoryStore();

    if (runtimeConfig.redis.url) {
        store = await setupRedis({ io, url: runtimeConfig.redis.url });
        console.log('Redis enabled: matchmaking is shared across all instances using the same REDIS_URL');
    }

    const matchmaking = createMatchmakingService({
        io,
        maxQueueUsers: limits.maxQueueUsers,
        store,
    });

    registerSocketHandlers({
        io,
        limits,
        matchmaking,
        captureException,
    });

    server.listen(port, () => {
        const protocol = useHttps ? 'https' : 'http';
        console.log(`${appName} running on ${protocol}://localhost:${port}`);
    });
}

start().catch((error) => {
    console.error(`Failed to start server: ${error.message}`);
    captureException(error, 'startup');
    process.exit(1);
});
