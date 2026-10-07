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

module.exports = {
    escapeHtml,
};
