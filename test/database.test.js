const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('database initializes, persists writes, and exposes retry columns', async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cultbot-db-test-'));
    const databasePath = path.join(directory, 'test.db');
    process.env.CULTBOT_DB_PATH = databasePath;

    t.after(() => {
        delete process.env.CULTBOT_DB_PATH;
        fs.rmSync(directory, { recursive: true, force: true });
    });

    const db = require('../database/db.js');
    await db.initDatabase();

    db.prepare(`
        INSERT INTO demotions
            (user_id, guild_id, role_id, role_name, demoted_by, demoted_at, restore_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('user', 'guild', 'role', 'Role', 'admin', 1000, 2000);

    const record = db.prepare('SELECT * FROM demotions WHERE user_id = ?').get('user');
    assert.equal(record.role_name, 'Role');
    assert.equal(record.attempt_count, 0);
    assert.equal(record.last_error, null);
    assert.equal(fs.existsSync(databasePath), true);
    assert.equal(fs.existsSync(`${databasePath}.tmp`), false);
});
