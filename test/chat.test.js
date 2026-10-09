const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createInstance, eventsNamed, wait, waitFor } = require('./helpers');

describe('chat relay', () => {
    let instance;
    let a;
    let b;

    beforeEach(async () => {
        // Without this, skipping would instantly re-match the same two users.
        instance = await createInstance({ skipAvoidSamePartner: true });
        a = await instance.client();
        b = await instance.client();
    });

    afterEach(async () => {
        await instance.close();
    });

    async function match() {
        a.emit('find-partner');
        await waitFor(() => eventsNamed(a, 'queue-update').length === 1);
        b.emit('find-partner');
        await waitFor(() => eventsNamed(a, 'matched').length && eventsNamed(b, 'matched').length);
    }

    test('relays a trimmed message to the matched partner only', async () => {
        await match();
        const c = await instance.client();

        a.emit('chat-message', { text: '  hello  ' });
        await waitFor(() => eventsNamed(b, 'chat-message').length === 1);

        assert.deepEqual(eventsNamed(b, 'chat-message'), [{ text: 'hello' }]);
        assert.equal(eventsNamed(a, 'chat-message').length, 0);
        assert.equal(eventsNamed(c, 'chat-message').length, 0);
    });

    test('ignores messages without a partner, empty, non-string or too long', async () => {
        a.emit('chat-message', { text: 'nobody home' });
        await match();

        a.emit('chat-message', { text: '   ' });
        a.emit('chat-message', { text: 42 });
        a.emit('chat-message', { text: 'x'.repeat(501) });
        a.emit('chat-message');
        await wait(150);

        assert.equal(eventsNamed(b, 'chat-message').length, 0);
    });

    test('rate limits a flooding sender', async () => {
        await match();

        for (let index = 0; index < 15; index += 1) {
            a.emit('chat-message', { text: `message ${index}` });
        }
        await waitFor(() => eventsNamed(a, 'server-notice').length > 0);

        assert.equal(eventsNamed(a, 'server-notice')[0].code, 'CHAT_RATE_LIMITED');
        assert.equal(eventsNamed(b, 'chat-message').length, 10);
    });

    test('stops relaying after the pair is split', async () => {
        await match();
        a.emit('skip-partner');
        await waitFor(() => eventsNamed(b, 'partner-disconnected').length === 1);

        a.emit('chat-message', { text: 'still there?' });
        await wait(150);

        assert.equal(eventsNamed(b, 'chat-message').length, 0);
    });

    test('relays typing state to the partner and ignores malformed payloads', async () => {
        await match();

        a.emit('chat-typing', { typing: true });
        a.emit('chat-typing', { typing: 'yes' });
        a.emit('chat-typing');
        a.emit('chat-typing', { typing: false });
        await waitFor(() => eventsNamed(b, 'chat-typing').length === 2);

        assert.deepEqual(eventsNamed(b, 'chat-typing'), [{ typing: true }, { typing: false }]);
        assert.equal(eventsNamed(a, 'chat-typing').length, 0);
    });
});
