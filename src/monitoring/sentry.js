let sentry = null;

function scrubEvent(event) {
    delete event.user;

    if (event.request) {
        delete event.request.cookies;
        delete event.request.headers;
        delete event.request.data;
        delete event.request.query_string;
    }

    return event;
}

// Optional: does nothing (and never loads @sentry/node) unless explicitly enabled.
function initSentry(config) {
    if (sentry || !config?.enabled) {
        return false;
    }

    try {
        sentry = require('@sentry/node');
        sentry.init({
            dsn: config.dsn,
            environment: config.environment,
            release: config.release || undefined,
            tracesSampleRate: config.tracesSampleRate,
            sendDefaultPii: false,
            beforeSend: scrubEvent,
        });
        console.log(`Sentry enabled (environment=${config.environment})`);
        return true;
    } catch (error) {
        sentry = null;
        console.warn('Sentry initialization failed. Error reporting disabled.', error.message);
        return false;
    }
}

function captureException(error, context) {
    if (!sentry) {
        return;
    }

    sentry.withScope((scope) => {
        if (context) {
            scope.setTag('context', context);
        }
        sentry.captureException(error);
    });
}

function setupExpressErrorHandler(app) {
    if (sentry) {
        sentry.setupExpressErrorHandler(app);
    }
}

async function flushSentry(timeoutMs = 2000) {
    if (sentry) {
        await sentry.flush(timeoutMs);
    }
}

module.exports = {
    initSentry,
    captureException,
    setupExpressErrorHandler,
    flushSentry,
};
