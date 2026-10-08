const fs = require('fs');
const path = require('path');
const express = require('express');
const { escapeHtml } = require('./escape-html');
const { buildPrivacyNotices } = require('./privacy-notices');
const { buildUmamiScriptTag } = require('../monitoring/umami');

const APP_NAME_PLACEHOLDER = '{{APP_NAME}}';
const ABOUT_LINK_PLACEHOLDER = '{{ABOUT_LINK}}';
const REPORT_EMAIL_LINK_PLACEHOLDER = '{{REPORT_EMAIL_LINK}}';
const REPORT_EMAIL_TEXT_PLACEHOLDER = '{{REPORT_EMAIL_TEXT}}';
const OFFLINE_MESSAGE_PLACEHOLDER = '{{OFFLINE_MESSAGE}}';
const OG_TITLE_PLACEHOLDER = '{{OG_TITLE}}';
const OG_DESCRIPTION_PLACEHOLDER = '{{OG_DESCRIPTION}}';
const OG_IMAGE_PLACEHOLDER = '{{OG_IMAGE}}';
const OG_URL_PLACEHOLDER = '{{OG_URL}}';
const TWITTER_CARD_PLACEHOLDER = '{{TWITTER_CARD}}';
const SOCKET_TRANSPORTS_PLACEHOLDER = '{{SOCKET_TRANSPORTS}}';
const ANALYTICS_SCRIPT_PLACEHOLDER = '{{ANALYTICS_SCRIPT}}';
const PRIVACY_NOTICES_PLACEHOLDER = '{{PRIVACY_NOTICES}}';
const REPORT_NOTICE_PLACEHOLDER = '{{REPORT_NOTICE}}';
const REPORTING_ENABLED_PLACEHOLDER = '{{REPORTING_ENABLED}}';
function renderHtmlTemplate(staticDirPath, fileName, replacements, rawReplacements = {}) {
    const templatePath = path.join(staticDirPath, fileName);
    const template = fs.readFileSync(templatePath, 'utf8');
    const escapedHtml = Object.entries(replacements).reduce(
        (html, [placeholder, value]) => html.replaceAll(placeholder, () => escapeHtml(value)),
        template
    );

    // Raw values are trusted HTML built server-side (inputs already escaped).
    return Object.entries(rawReplacements).reduce(
        (html, [placeholder, value]) => html.replaceAll(placeholder, () => value),
        escapedHtml
    );
}

function registerHttpRoutes({
    app,
    staticDirPath,
    appName,
    aboutLink,
    reportEmailLink,
    reportEmailText,
    appOffline,
    offlineMessage,
    socialMeta,
    rtcConfig,
    socketWebsocketOnly = false,
    apiRateLimiter,
    umami,
    sentry,
    reportingEnabled = false,
}) {
    const { ogTitle, ogDescription, ogImage, ogUrl, twitterCard } = socialMeta;
    const templateReplacements = {
        [APP_NAME_PLACEHOLDER]: appName,
        [ABOUT_LINK_PLACEHOLDER]: aboutLink,
        [REPORT_EMAIL_LINK_PLACEHOLDER]: reportEmailLink,
        [REPORT_EMAIL_TEXT_PLACEHOLDER]: reportEmailText,
        [OFFLINE_MESSAGE_PLACEHOLDER]: offlineMessage,
        [OG_TITLE_PLACEHOLDER]: ogTitle,
        [OG_DESCRIPTION_PLACEHOLDER]: ogDescription,
        [OG_IMAGE_PLACEHOLDER]: ogImage,
        [OG_URL_PLACEHOLDER]: ogUrl,
        [TWITTER_CARD_PLACEHOLDER]: twitterCard,
        // Empty keeps the Socket.IO default (long-polling, then WebSocket upgrade).
        [SOCKET_TRANSPORTS_PLACEHOLDER]: socketWebsocketOnly ? 'websocket' : '',
        [REPORTING_ENABLED_PLACEHOLDER]: String(reportingEnabled),
    };
    const rawReplacements = {
        [ANALYTICS_SCRIPT_PLACEHOLDER]: buildUmamiScriptTag(umami),
        [PRIVACY_NOTICES_PLACEHOLDER]: buildPrivacyNotices({
            umamiEnabled: Boolean(umami?.enabled),
            sentryEnabled: Boolean(sentry?.enabled),
            reportingEnabled,
        }),
        [REPORT_NOTICE_PLACEHOLDER]: reportingEnabled
            ? `<p>
                While connected, use the Report button to report your partner. When several different users report the
                same person within a short period, their IP address is temporarily banned and repeat offenders are banned
                for longer. Please only report real violations.
            </p>`
            : '',
    };
    const render = (fileName) => renderHtmlTemplate(staticDirPath, fileName, templateReplacements, rawReplacements);
    const indexHtml = render('pages/index.html');
    const offlineHtml = render('pages/offline.html');
    const privacyHtml = render('pages/privacy.html');
    const termsHtml = render('pages/terms.html');
    const safetyHtml = render('pages/safety.html');

    app.get(['/', '/index.html'], (_, res) => {
        if (appOffline) {
            res.status(503).type('html').send(offlineHtml);
            return;
        }

        res.type('html').send(indexHtml);
    });

    app.get('/offline.html', (_, res) => {
        res.status(503).type('html').send(offlineHtml);
    });

    app.get('/privacy.html', (_, res) => {
        res.type('html').send(privacyHtml);
    });

    app.get('/terms.html', (_, res) => {
        res.type('html').send(termsHtml);
    });

    app.get('/safety.html', (_, res) => {
        res.type('html').send(safetyHtml);
    });

    app.use(express.static(staticDirPath));

    if (apiRateLimiter) {
        app.use('/health', apiRateLimiter);
        app.use('/api', apiRateLimiter);
    }

    app.get('/health', (_, res) => {
        res.status(appOffline ? 503 : 200).json({ ok: !appOffline, offline: appOffline });
    });

    app.get('/api/webrtc-config', (_, res) => {
        if (appOffline) {
            res.status(503).json({
                error: 'APP_OFFLINE',
                message: offlineMessage,
            });
            return;
        }

        res.json(rtcConfig);
    });
}

module.exports = {
    registerHttpRoutes,
};
