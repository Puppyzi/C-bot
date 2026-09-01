const test = require('node:test');
const assert = require('node:assert/strict');
const summarizeCommand = require('../commands/summarize.js');

function message(id, createdTimestamp, overrides = {}) {
    return {
        id,
        createdTimestamp,
        content: 'message',
        author: { bot: false, username: 'user' },
        ...overrides
    };
}

test('summary fetching paginates beyond Discord’s 100-message page size', async () => {
    const newestPage = new Map();
    for (let timestamp = 299; timestamp >= 200; timestamp--) {
        const item = message(`m${timestamp}`, timestamp);
        newestPage.set(item.id, item);
    }
    const older = message('m199', 199);
    const calls = [];
    const channel = {
        messages: {
            fetch: async options => {
                calls.push(options);
                return options.before ? new Map([[older.id, older]]) : newestPage;
            }
        }
    };

    const result = await summarizeCommand._test.fetchMessagesSince(channel, 0);

    assert.equal(calls.length, 2);
    assert.equal(calls[1].before, 'm200');
    assert.equal(result.messages.length, 101);
    assert.equal(result.messages[0].id, 'm199');
});

test('summary fetching excludes bot messages, empty messages, and old messages', async () => {
    const page = new Map([
        ['new', message('new', 1000)],
        ['bot', message('bot', 900, { author: { bot: true, username: 'bot' } })],
        ['empty', message('empty', 800, { content: '   ' })],
        ['old', message('old', 100)]
    ]);
    const channel = { messages: { fetch: async () => page } };

    const result = await summarizeCommand._test.fetchMessagesSince(channel, 500);

    assert.deepEqual(result.messages.map(item => item.id), ['new']);
});
