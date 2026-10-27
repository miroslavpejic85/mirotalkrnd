const presetPath = (id) => `/images/backgrounds/${id}`;

export const BACKGROUND_PRESETS = [
    { id: 'aurora', name: 'Aurora' },
    { id: 'sunset', name: 'Sunset' },
    { id: 'ocean', name: 'Ocean' },
    { id: 'bokeh', name: 'Bokeh' },
    { id: 'studio', name: 'Studio' },
    { id: 'pastel', name: 'Pastel' },
].map((preset) => ({
    ...preset,
    src: `${presetPath(preset.id)}.webp`,
    thumb: `${presetPath(preset.id)}-thumb.webp`,
}));

const STORAGE_KEY = 'backgroundPreset';

export function getBackgroundPreset(id) {
    return BACKGROUND_PRESETS.find((preset) => preset.id === id) || null;
}

export function getPreferredBackgroundPreset() {
    try {
        return getBackgroundPreset(localStorage.getItem(STORAGE_KEY)) || BACKGROUND_PRESETS[0];
    } catch {
        return BACKGROUND_PRESETS[0];
    }
}

export function savePreferredBackgroundPreset(id) {
    try {
        localStorage.setItem(STORAGE_KEY, id);
    } catch {
        // Storage can be unavailable (private mode, blocked cookies); the choice just won't persist.
    }
}
