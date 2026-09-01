const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../database/db.js');
const scheduler = require('../services/demotionScheduler.js');

function createClient(addRole) {
    const role = { id: 'role', name: 'Member' };
    const member = {
        user: { tag: 'User#0001' },
        roles: { add: addRole },
        send: async () => {}
    };
    const guild = {
        name: 'Guild',
        members: { fetch: async () => member },
        roles: { fetch: async () => role }
    };

    return { guilds: { fetch: async () => guild } };
}

function demotion(overrides = {}) {
    return {
        id: 1,
        user_id: 'user',
        guild_id: 'guild',
        role_id: 'role',
        attempt_count: 0,
        ...overrides
    };
}

test('restoration is recorded only after Discord adds the role', async t => {
    const originalPrepare = db.prepare;
    const events = [];

    db.prepare = sql => ({
        get: () => undefined,
        run: (...params) => {
            events.push({ type: 'database', sql, params });
            return { changes: 1 };
        }
    });
    t.after(() => {
        scheduler.stopDemotionScheduler();
        db.prepare = originalPrepare;
    });

    scheduler.startDemotionScheduler(createClient(async () => {
        events.push({ type: 'discord' });
    }));

    const result = await scheduler.restoreDemotion(demotion(), { notifyUser: false });

    assert.equal(result.restored, true);
    assert.deepEqual(events.map(event => event.type), ['discord', 'database']);
    assert.match(events[1].sql, /SET restored = 1/);
});

test('failed Discord restoration stays active and gets a retry time', async t => {
    const originalPrepare = db.prepare;
    const updates = [];

    db.prepare = sql => ({
        get: () => undefined,
        run: (...params) => {
            updates.push({ sql, params });
            return { changes: 1 };
        }
    });
    t.after(() => {
        scheduler.stopDemotionScheduler();
        db.prepare = originalPrepare;
    });

    scheduler.startDemotionScheduler(createClient(async () => {
        throw new Error('Discord unavailable');
    }));

    const result = await scheduler.restoreDemotion(
        demotion({ id: 2, role_id: 'role-2' }),
        { notifyUser: false }
    );

    assert.equal(result.restored, false);
    assert.match(result.error, /Discord unavailable/);
    assert.equal(updates.length, 1);
    assert.doesNotMatch(updates[0].sql, /SET restored = 1/);
    assert.match(updates[0].sql, /next_attempt_at/);
});
