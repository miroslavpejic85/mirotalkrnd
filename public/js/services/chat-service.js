const MAX_LENGTH = 500;
const TYPING_IDLE_MS = 2500;
const TYPING_RESEND_MS = 2000;
const TYPING_EXPIRE_MS = 4000;

export class ChatService {
    constructor({ el, signaling, onIncoming = () => {} }) {
        this.el = el;
        this.onIncoming = onIncoming;
        this.signaling = signaling;
        this.active = false;
        this.unread = false;
        this.typingSent = false;
        this.typingSentAt = 0;
        this.typingIdleTimer = null;
        this.typingExpireTimer = null;
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
        this.el.chatInput.addEventListener('input', () => this.notifyTyping());
        this.signaling.on('chat-message', ({ text } = {}) => this.receive(text));
        this.signaling.on('chat-typing', ({ typing } = {}) => this.setPartnerTyping(this.active && typing === true));
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
        this.stopTyping(false);
        this.setPartnerTyping(false);
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
        this.stopTyping(false);
    }

    // Typing state is only a hint for the partner: throttled while typing and cleared when idle or sent.
    notifyTyping() {
        if (!this.active || !this.el.chatInput.value.trim()) {
            this.stopTyping(true);
            return;
        }

        const now = Date.now();
        if (!this.typingSent || now - this.typingSentAt >= TYPING_RESEND_MS) {
            this.typingSent = true;
            this.typingSentAt = now;
            this.signaling.emitChatTyping(true);
        }
        clearTimeout(this.typingIdleTimer);
        this.typingIdleTimer = setTimeout(() => this.stopTyping(true), TYPING_IDLE_MS);
    }

    stopTyping(notify) {
        clearTimeout(this.typingIdleTimer);
        if (this.typingSent && notify && this.active) {
            this.signaling.emitChatTyping(false);
        }
        this.typingSent = false;
    }

    setPartnerTyping(typing) {
        clearTimeout(this.typingExpireTimer);
        this.el.chatTyping.hidden = !typing;
        if (typing) {
            // Safety net in case the "stopped typing" event is lost.
            this.typingExpireTimer = setTimeout(() => this.setPartnerTyping(false), TYPING_EXPIRE_MS);
            this.scrollToEnd();
        }
    }

    receive(text) {
        if (!this.active || typeof text !== 'string' || !text.trim()) {
            return;
        }

        this.setPartnerTyping(false);
        this.append(text.slice(0, MAX_LENGTH), 'partner');
        this.onIncoming();
        if (this.el.chatPanel.hidden) {
            this.setUnread(true);
        }
    }

    append(text, author) {
        const item = document.createElement('li');
        item.className = `chat-message ${author}`;

        const body = document.createElement('span');
        body.className = 'chat-message-text';
        body.textContent = text;

        const time = document.createElement('time');
        time.className = 'chat-message-time';
        time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

        item.append(body, time);
        this.el.chatMessages.append(item);
        this.scrollToEnd();
    }

    scrollToEnd() {
        this.el.chatScroll.scrollTop = this.el.chatScroll.scrollHeight;
    }
}
