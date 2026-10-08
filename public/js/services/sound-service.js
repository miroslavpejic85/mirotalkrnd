const STORAGE_KEY = 'mirotalk-rnd-sounds';

// Each cue is a list of notes: frequency (Hz), start offset (s), duration (s), peak gain.
const CUES = {
    waiting: [{ freq: 660, at: 0, dur: 0.22, gain: 0.07 }],
    connected: [
        { freq: 523.25, at: 0, dur: 0.18, gain: 0.12 },
        { freq: 659.25, at: 0.11, dur: 0.18, gain: 0.12 },
        { freq: 783.99, at: 0.22, dur: 0.38, gain: 0.12 },
    ],
    left: [
        { freq: 523.25, at: 0, dur: 0.16, gain: 0.1 },
        { freq: 392, at: 0.12, dur: 0.3, gain: 0.1 },
    ],
};

export class SoundService {
    constructor() {
        this.context = null;
        this.enabled = this.readPreference();
    }

    readPreference() {
        try {
            return localStorage.getItem(STORAGE_KEY) !== 'off';
        } catch {
            return true;
        }
    }

    isEnabled() {
        return this.enabled;
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        try {
            localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
        } catch {
            // Preference just won't persist.
        }
        if (enabled) {
            this.play('waiting');
        }
    }

    // Call from a user gesture so browsers allow later cues (e.g. when a partner connects).
    prime() {
        const context = this.getContext();
        if (context?.state === 'suspended') {
            void context.resume().catch(() => {});
        }
    }

    getContext() {
        if (!this.context) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) {
                return null;
            }
            this.context = new AudioContextClass();
        }
        return this.context;
    }

    play(name) {
        const notes = CUES[name];
        if (!this.enabled || !notes) {
            return;
        }

        const context = this.getContext();
        if (!context) {
            return;
        }

        const schedule = () => notes.forEach((note) => this.playNote(context, note));
        if (context.state === 'suspended') {
            context.resume().then(schedule, () => {});
            return;
        }
        schedule();
    }

    playNote(context, { freq, at, dur, gain }) {
        const start = context.currentTime + at;
        const end = start + dur;

        const oscillator = context.createOscillator();
        const envelope = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(freq, start);

        // Short attack and exponential decay avoid clicks and give a soft, bell-like tone.
        envelope.gain.setValueAtTime(0.0001, start);
        envelope.gain.exponentialRampToValueAtTime(gain, start + 0.015);
        envelope.gain.exponentialRampToValueAtTime(0.0001, end);

        oscillator.connect(envelope).connect(context.destination);
        oscillator.start(start);
        oscillator.stop(end + 0.02);
    }
}
