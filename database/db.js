const Database = require('better-sqlite3');
const path = require('path');

// Create database file in the database folder
const db = new Database(path.join(__dirname, 'cultbot.db'));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
    CREATE TABLE IF NOT EXISTS demotions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        role_id TEXT NOT NULL,
        role_name TEXT NOT NULL,
        demoted_by TEXT NOT NULL,
        reason TEXT,
        demoted_at INTEGER NOT NULL,
        restore_at INTEGER NOT NULL,
        restored INTEGER DEFAULT 0
    )
`);

console.log('[Database] SQLite initialized successfully.');

module.exports = db;
