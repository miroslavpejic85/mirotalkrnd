const MAX_LENGTH = 500;

export class ChatService {
    constructor({ el, signaling }) {
        this.el = el;
        this.signaling = signaling;
        this.active = false;
        this.unread = false;
    }

    init() {
        this.el.chatInput.maxLength = MAX_LENGTH;
        this.el.chatBtn.addEventListener('click', () => this.setPanelVisible(this.el.chatPanel.hidden));
        this.el.chatCloseBtn.addEventListener('click', () => this.setPanelVisible(false));
        this.el.chatForm.addEventListener('submit', (event) => {
            event.preventDefault();
            this.send();
        });
        this.el.chatPanel.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                this.setPanelVisible(false);
                this.el.chatBtn.focus();
            }
        });
        this.signaling.on('chat-message', ({ text } = {}) => this.receive(text));
        this.endSession();
    }

    // A chat only lives as long as the current partner: it starts on a match and is wiped when it ends.
    startSession() {
        this.endSession();
        this.active = true;
        this.el.chatBtn.disabled = false;
    }

    endSession() {
        this.active = false;
        this.setPanelVisible(false);
        this.el.chatMessages.replaceChildren();
        this.el.chatInput.value = '';
        this.el.chatBtn.disabled = true;
        this.setUnread(false);
    }

    setPanelVisible(visible) {
        this.el.chatPanel.hidden = !visible;
        this.el.chatBtn.setAttribute('aria-expanded', String(visible));
        if (visible) {
            this.setUnread(false);
            this.el.chatInput.focus();
            this.scrollToEnd();
        }
    }

    setUnread(value) {
        this.unread = value;
        this.el.chatBtn.classList.toggle('has-unread', value);
    }

    send() {
        const text = this.el.chatInput.value.trim();
        if (!this.active || !text) {
            return;
        }

        this.signaling.emitChatMessage(text);
        this.append(text, 'me');
        this.el.chatInput.value = '';
    }

    receive(text) {
        if (!this.active || typeof text !== 'string' || !text.trim()) {
            return;
        }

        this.append(text.slice(0, MAX_LENGTH), 'partner');
        if (this.el.chatPanel.hidden) {
            this.setUnread(true);
        }
    }

    append(text, author) {
        const item = document.createElement('li');
        item.className = `chat-message ${author}`;
        item.textContent = text;
        this.el.chatMessages.append(item);
        this.scrollToEnd();
    }

    scrollToEnd() {
        this.el.chatMessages.scrollTop = this.el.chatMessages.scrollHeight;
    }
}
