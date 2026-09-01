const test = require('node:test');
const assert = require('node:assert/strict');

const {
    MAX_TIMER_DELAY_MS,
    calculateRetryDelay,
    calculateTimerDelay
} = require('../services/demotionScheduler.js');

test('normal demotion timers include a one-second completion buffer', () => {
    assert.equal(calculateTimerDelay(11_000, 1000), 11_000);
});

test('expired demotions run on the next buffered check', () => {
    assert.equal(calculateTimerDelay(500, 1000), 1000);
});

test('long demotion timers stay below the Node timer overflow limit', () => {
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    assert.equal(calculateTimerDelay(thirtyDays, 0), MAX_TIMER_DELAY_MS);
    assert.ok(MAX_TIMER_DELAY_MS < 2_147_483_647);
});

test('restore retry delays back off and cap at one hour', () => {
    assert.equal(calculateRetryDelay(1), 60_000);
    assert.equal(calculateRetryDelay(2), 120_000);
    assert.equal(calculateRetryDelay(20), 60 * 60 * 1000);
});
