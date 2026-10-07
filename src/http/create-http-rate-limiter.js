const { rateLimit } = require('express-rate-limit');

function createHttpRateLimiter(windowMs, maxRequests) {
    return rateLimit({
        windowMs,
        limit: maxRequests,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        handler: (_, res) => {
            res.status(429).json({
                error: 'Too many requests. Please try again shortly.',
                code: 'HTTP_RATE_LIMITED',
            });
        },
    });
}

module.exports = {
    createHttpRateLimiter,
};
