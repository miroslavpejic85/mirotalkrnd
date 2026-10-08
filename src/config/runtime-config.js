const DEFAULT_APP_NAME = 'Random Talk';
const DEFAULT_NODE_ENV = 'development';
const DEFAULT_ABOUT_LINK = 'https://docs.mirotalk.com/sites/rnd/';

function parseUrls(value) {
    if (!value) {
        return [];
    }

    return value
        .split(',')
        .map((url) => url.trim())
        .filter(Boolean);
}

function buildIceServersFromEnv(env) {
    const stunUrls = parseUrls(env.STUN_URLS);
    const turnUrls = parseUrls(env.TURN_URLS);
    const turnUsername = env.TURN_USERNAME?.trim();
    const turnCredential = env.TURN_PASSWORD?.trim();
    const iceServers = [];

    if (stunUrls.length) {
        iceServers.push({ urls: stunUrls });
    }

    if (turnUrls.length) {
        if (!turnUsername || !turnCredential) {
            console.warn('TURN_URLS is set but TURN_USERNAME/TURN_PASSWORD is missing. TURN will be ignored.');
        } else {
            iceServers.push({
                urls: turnUrls,
                username: turnUsername,
                credential: turnCredential,
            });
        }
    }

    if (!iceServers.length) {
        iceServers.push({
            urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
        });
    }

    return iceServers;
}

function isPositiveInteger(value) {
    return Number.isInteger(value) && value > 0;
}

function getOptionalPositiveInteger(value) {
    if (isPositiveInteger(value)) {
        return value;
    }

    return null;
}

function warnInvalidOptionalValue(env, key, optionalValue, message) {
    if (optionalValue === null && env[key]) {
        console.warn(message);
    }
}

function parseBoolean(value, fallbackValue) {
    if (value === undefined) {
        return fallbackValue;
    }

    const normalizedValue = value.trim().toLowerCase();

    if (normalizedValue === 'true' || normalizedValue === '1') {
        return true;
    }

    if (normalizedValue === 'false' || normalizedValue === '0') {
        return false;
    }

    return fallbackValue;
}

function trimString(value) {
    return value?.trim() || '';
}

function parseTrustProxy(value) {
    if (value === undefined) {
        return false;
    }

    const normalizedValue = value.trim().toLowerCase();

    if (normalizedValue === 'true') {
        return true;
    }

    if (normalizedValue === 'false') {
        return false;
    }

    const parsedNumber = Number.parseInt(value, 10);
    if (Number.isInteger(parsedNumber) && parsedNumber >= 0 && String(parsedNumber) === value.trim()) {
        return parsedNumber;
    }

    return value.trim();
}

function parseSampleRate(value, key) {
    const trimmedValue = trimString(value);
    if (!trimmedValue) {
        return 0;
    }

    const parsedValue = Number.parseFloat(trimmedValue);
    if (Number.isFinite(parsedValue) && parsedValue >= 0 && parsedValue <= 1) {
        return parsedValue;
    }

    console.warn(`Invalid ${key} value "${value}". Using 0. Use a number between 0 and 1.`);
    return 0;
}

function parseHttpUrl(value, key) {
    const trimmedValue = trimString(value);
    if (!trimmedValue) {
        return '';
    }

    try {
        const { protocol } = new URL(trimmedValue);
        if (protocol === 'http:' || protocol === 'https:') {
            return trimmedValue;
        }
    } catch {
        // fall through to the warning below
    }

    console.warn(`Invalid ${key} value "${value}". Use a full http(s) URL.`);
    return '';
}

function getUmamiConfig(env) {
    const enabled = parseBoolean(env.UMAMI_ENABLED, false);
    const scriptUrl = parseHttpUrl(env.UMAMI_SCRIPT_URL, 'UMAMI_SCRIPT_URL');
    const websiteId = trimString(env.UMAMI_WEBSITE_ID);

    if (enabled && (!scriptUrl || !websiteId)) {
        console.warn('UMAMI_ENABLED is true but UMAMI_SCRIPT_URL/UMAMI_WEBSITE_ID is missing. Umami will be disabled.');
    }

    return {
        enabled: enabled && Boolean(scriptUrl && websiteId),
        scriptUrl,
        websiteId,
        domains: trimString(env.UMAMI_DOMAINS),
        doNotTrack: parseBoolean(env.UMAMI_DO_NOT_TRACK, true),
    };
}

function getReportEmailValues(env) {
    const legacyEmail = trimString(env.REPORT_EMAIL);
    let link = trimString(env.REPORT_EMAIL_LINK);
    let text = trimString(env.REPORT_EMAIL_TEXT);

    if (!link && !text && legacyEmail) {
        link = `mailto:${legacyEmail}`;
        text = legacyEmail;
    }

    if (link && !text) {
        text = link.replace(/^mailto:/i, '').split('?')[0];
    }

    if (text && !link) {
        link = text.includes('@') ? `mailto:${text}` : text;
    }

    return {
        reportEmailLink: link || 'mailto:your-email@example.com',
        reportEmailText: text || 'your-email@example.com',
    };
}

function createRuntimeConfig(env) {
    const port = env.PORT || 4010;
    const nodeEnv = env.NODE_ENV?.trim() || DEFAULT_NODE_ENV;
    const appName = trimString(env.APP_NAME) || DEFAULT_APP_NAME;
    const aboutLink = trimString(env.ABOUT_LINK) || DEFAULT_ABOUT_LINK;
    const { reportEmailLink, reportEmailText } = getReportEmailValues(env);
    const appOffline = parseBoolean(env.APP_OFFLINE, false);
    const offlineMessage =
        trimString(env.OFFLINE_MESSAGE) || 'We are currently offline for maintenance. Please check back soon.';
    const ogTitle = trimString(env.OG_TITLE) || appName;
    const ogDescription =
        trimString(env.OG_DESCRIPTION) || `Meet someone random and start an instant video chat on ${appName}.`;
    const ogImage = trimString(env.OG_IMAGE) || '/images/social/og-image.png';
    const ogUrl = trimString(env.OG_URL);
    const twitterCard = trimString(env.TWITTER_CARD) || 'summary_large_image';
    const useHttps = nodeEnv === 'production' ? true : parseBoolean(env.USE_HTTPS, false);
    const trustProxy = parseTrustProxy(env.TRUST_PROXY);
    const sslKeyPath = trimString(env.SSL_KEY_PATH) || './ssl/key.pem';
    const sslCertPath = trimString(env.SSL_CERT_PATH) || './ssl/cert.pem';
    const maxActiveUsers = getOptionalPositiveInteger(Number.parseInt(env.MAX_ACTIVE_USERS ?? '200', 10));
    const maxQueueUsers = getOptionalPositiveInteger(Number.parseInt(env.MAX_QUEUE_USERS ?? '200', 10));
    const maxConnectionsPerIp = getOptionalPositiveInteger(Number.parseInt(env.MAX_CONNECTIONS_PER_IP ?? '5', 10));
    const skipRateLimitPer10s = getOptionalPositiveInteger(Number.parseInt(env.SKIP_RATE_LIMIT_PER_10S ?? '8', 10));
    const apiRateLimitWindowMs = getOptionalPositiveInteger(
        Number.parseInt(env.API_RATE_LIMIT_WINDOW_MS ?? '60000', 10)
    );
    const apiRateLimitMaxRequests = getOptionalPositiveInteger(
        Number.parseInt(env.API_RATE_LIMIT_MAX_REQUESTS ?? '120', 10)
    );

    const sentryDsn = trimString(env.SENTRY_DSN);
    const sentryEnabled = parseBoolean(env.SENTRY_ENABLED, false);

    if (sentryEnabled && !sentryDsn) {
        console.warn('SENTRY_ENABLED is true but SENTRY_DSN is missing. Sentry will be disabled.');
    }

    warnInvalidOptionalValue(
        env,
        'MAX_ACTIVE_USERS',
        maxActiveUsers,
        `Invalid MAX_ACTIVE_USERS value "${env.MAX_ACTIVE_USERS}". Limit disabled. Use a positive integer.`
    );
    warnInvalidOptionalValue(
        env,
        'MAX_QUEUE_USERS',
        maxQueueUsers,
        `Invalid MAX_QUEUE_USERS value "${env.MAX_QUEUE_USERS}". Limit disabled. Use a positive integer.`
    );
    warnInvalidOptionalValue(
        env,
        'MAX_CONNECTIONS_PER_IP',
        maxConnectionsPerIp,
        `Invalid MAX_CONNECTIONS_PER_IP value "${env.MAX_CONNECTIONS_PER_IP}". Limit disabled. Use a positive integer.`
    );
    warnInvalidOptionalValue(
        env,
        'SKIP_RATE_LIMIT_PER_10S',
        skipRateLimitPer10s,
        `Invalid SKIP_RATE_LIMIT_PER_10S value "${env.SKIP_RATE_LIMIT_PER_10S}". Limit disabled. Use a positive integer.`
    );
    warnInvalidOptionalValue(
        env,
        'API_RATE_LIMIT_WINDOW_MS',
        apiRateLimitWindowMs,
        `Invalid API_RATE_LIMIT_WINDOW_MS value "${env.API_RATE_LIMIT_WINDOW_MS}". HTTP API rate limit disabled. Use a positive integer in milliseconds.`
    );
    warnInvalidOptionalValue(
        env,
        'API_RATE_LIMIT_MAX_REQUESTS',
        apiRateLimitMaxRequests,
        `Invalid API_RATE_LIMIT_MAX_REQUESTS value "${env.API_RATE_LIMIT_MAX_REQUESTS}". HTTP API rate limit disabled. Use a positive integer.`
    );

    return {
        port,
        nodeEnv,
        appName,
        aboutLink,
        reportEmailLink,
        reportEmailText,
        appOffline,
        offlineMessage,
        socialMeta: {
            ogTitle,
            ogDescription,
            ogImage,
            ogUrl,
            twitterCard,
        },
        useHttps,
        trustProxy,
        sslKeyPath,
        sslCertPath,
        rtcConfig: {
            iceServers: buildIceServersFromEnv(env),
        },
        umami: getUmamiConfig(env),
        redis: {
            url: trimString(env.REDIS_URL),
        },
        socketWebsocketOnly: parseBoolean(env.SOCKET_WEBSOCKET_ONLY, false),
        skipAvoidSamePartner: parseBoolean(env.SKIP_AVOID_SAME_PARTNER, false),
        sentry: {
            enabled: sentryEnabled && Boolean(sentryDsn),
            dsn: sentryDsn,
            environment: trimString(env.SENTRY_ENVIRONMENT) || nodeEnv,
            release: trimString(env.SENTRY_RELEASE),
            tracesSampleRate: parseSampleRate(env.SENTRY_TRACES_SAMPLE_RATE, 'SENTRY_TRACES_SAMPLE_RATE'),
        },
        limits: {
            maxActiveUsers,
            maxQueueUsers,
            maxConnectionsPerIp,
            skipRateLimitPer10s,
            apiRateLimitWindowMs,
            apiRateLimitMaxRequests,
        },
    };
}

module.exports = {
    createRuntimeConfig,
};
