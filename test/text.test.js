const test = require('node:test');
const assert = require('node:assert/strict');
const { chunkLines, truncateText } = require('../utils/text.js');

test('chunkLines preserves line order and respects the requested size', () => {
    const chunks = chunkLines(['alpha beta', 'gamma', 'delta epsilon'], 16);

    assert.deepEqual(chunks, ['alpha beta\ngamma', 'delta epsilon']);
    assert.ok(chunks.every(chunk => chunk.length <= 16));
});

test('chunkLines safely splits a single oversized line', () => {
    const chunks = chunkLines(['one two three four five'], 10);

    assert.ok(chunks.every(chunk => chunk.length <= 10));
    assert.equal(chunks.join(' ').replace(/\s+/g, ' '), 'one two three four five');
});

test('truncateText adds a suffix only when needed', () => {
    assert.equal(truncateText('short', 10), 'short');
    assert.equal(truncateText('a long sentence', 8), 'a long …');
});
