const { escapeHtml } = require('../http/escape-html');

// Returns the Umami tracking tag, or an empty string when analytics are disabled.
function buildUmamiScriptTag(config) {
    if (!config?.enabled) {
        return '';
    }

    const attributes = [
        'defer',
        `src="${escapeHtml(config.scriptUrl)}"`,
        `data-website-id="${escapeHtml(config.websiteId)}"`,
    ];

    if (config.domains) {
        attributes.push(`data-domains="${escapeHtml(config.domains)}"`);
    }

    if (config.doNotTrack) {
        attributes.push('data-do-not-track="true"');
    }

    return `<script ${attributes.join(' ')}></script>`;
}

module.exports = {
    buildUmamiScriptTag,
};
