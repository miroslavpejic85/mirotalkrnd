// Optional privacy policy sections, rendered only for the integrations that are enabled.
function buildPrivacyNotices({ umamiEnabled, sentryEnabled, reportingEnabled = false }) {
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

    if (reportingEnabled) {
        sections.push(`<h2>Reports and bans</h2>
            <p>
                Users can report their partner. A report is linked to the IP address of the reported user and the IP
                address of the reporter. No video, audio, or screenshots are recorded or sent. When several different
                users report the same IP address within a short period, that address is temporarily banned. Reports and
                bans are stored only while they are needed and expire automatically.
            </p>`);
    }

    return sections.join('\n\n            ');
}

module.exports = {
    buildPrivacyNotices,
};
