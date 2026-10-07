// Optional privacy policy sections, rendered only for the integrations that are enabled.
function buildPrivacyNotices({ umamiEnabled, sentryEnabled }) {
    const sections = [];

    if (umamiEnabled) {
        sections.push(`<h2>Analytics</h2>
            <p>
                We use Umami, a privacy-friendly analytics tool, to count page views and understand how the product is
                used. It does not use cookies and does not track you across websites. This data is used only to operate
                and improve the service. We do not sell it or share it for advertising.
            </p>`);
    }

    if (sentryEnabled) {
        sections.push(`<h2>Error reporting</h2>
            <p>
                We use Sentry to detect and fix technical errors. Reports contain technical details only (such as error
                messages and stack traces) and never include video, audio, or chat content. User data, cookies, and
                request headers are removed before reports are sent. This data is used only to improve the reliability
                of the service.
            </p>`);
    }

    return sections.join('\n\n            ');
}

module.exports = {
    buildPrivacyNotices,
};
