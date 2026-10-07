const fs = require('fs');
const path = require('path');
const express = require('express');

const APP_NAME_PLACEHOLDER = '{{APP_NAME}}';
const REPORT_EMAIL_LINK_PLACEHOLDER = '{{REPORT_EMAIL_LINK}}';
const REPORT_EMAIL_TEXT_PLACEHOLDER = '{{REPORT_EMAIL_TEXT}}';
const OFFLINE_MESSAGE_PLACEHOLDER = '{{OFFLINE_MESSAGE}}';
const OG_TITLE_PLACEHOLDER = '{{OG_TITLE}}';
const OG_DESCRIPTION_PLACEHOLDER = '{{OG_DESCRIPTION}}';
const OG_IMAGE_PLACEHOLDER = '{{OG_IMAGE}}';
const OG_URL_PLACEHOLDER = '{{OG_URL}}';
const TWITTER_CARD_PLACEHOLDER = '{{TWITTER_CARD}}';
const HTML_ESCAPE_ENTITIES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
};

function escapeHtml(value) {
    return value.replace(/[&<>"']/g, (character) => HTML_ESCAPE_ENTITIES[character]);
}

function renderHtmlTemplate(staticDirPath, fileName, replacements) {
    const templatePath = path.join(staticDirPath, fileName);
    const template = fs.readFileSync(templatePath, 'utf8');
    return Object.entries(replacements).reduce(
        (html, [placeholder, value]) => html.replaceAll(placeholder, () => escapeHtml(value)),
        template
    );
}

function getReportEmailValues(reportEmail) {
    if (!reportEmail) {
        return {
            reportEmailLink: 'mailto:your-email@example.com',
            reportEmailText: 'your-email@example.com',
        };
    }

    return {
        reportEmailLink: `mailto:${reportEmail}`,
        reportEmailText: reportEmail,
    };
}

function registerHttpRoutes({
    app,
    staticDirPath,
    appName,
    reportEmail,
    appOffline,
    offlineMessage,
    socialMeta,
    rtcConfig,
    apiRateLimiter,
}) {
    const { ogTitle, ogDescription, ogImage, ogUrl, twitterCard } = socialMeta;
    const { reportEmailLink, reportEmailText } = getReportEmailValues(reportEmail);
    const templateReplacements = {
        [APP_NAME_PLACEHOLDER]: appName,
        [REPORT_EMAIL_LINK_PLACEHOLDER]: reportEmailLink,
        [REPORT_EMAIL_TEXT_PLACEHOLDER]: reportEmailText,
        [OFFLINE_MESSAGE_PLACEHOLDER]: offlineMessage,
        [OG_TITLE_PLACEHOLDER]: ogTitle,
        [OG_DESCRIPTION_PLACEHOLDER]: ogDescription,
        [OG_IMAGE_PLACEHOLDER]: ogImage,
        [OG_URL_PLACEHOLDER]: ogUrl,
        [TWITTER_CARD_PLACEHOLDER]: twitterCard,
    };
    const indexHtml = renderHtmlTemplate(staticDirPath, 'pages/index.html', templateReplacements);
    const offlineHtml = renderHtmlTemplate(staticDirPath, 'pages/offline.html', templateReplacements);
    const privacyHtml = renderHtmlTemplate(staticDirPath, 'pages/privacy.html', templateReplacements);
    const termsHtml = renderHtmlTemplate(staticDirPath, 'pages/terms.html', templateReplacements);
    const safetyHtml = renderHtmlTemplate(staticDirPath, 'pages/safety.html', templateReplacements);

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
