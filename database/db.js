const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dbPath = process.env.CULTBOT_DB_PATH
    ? path.resolve(process.env.CULTBOT_DB_PATH)
    : path.join(__dirname, 'cultbot.db');

let db;
let SQL;
let initialized = false;

function ensureColumn(columnName, definition) {
    const columns = [];
    const statement = db.prepare('PRAGMA table_info(demotions)');

    while (statement.step()) {
        columns.push(statement.getAsObject().name);
    }
    statement.free();

    if (!columns.includes(columnName)) {
        db.run(`ALTER TABLE demotions ADD COLUMN ${columnName} ${definition}`);
    }
}

// Initialize the database
async function initDatabase() {
    if (initialized) return;
    
    SQL = await initSqlJs();
    
    // Load existing database or create new one
    if (fs.existsSync(dbPath)) {
        const fileBuffer = fs.readFileSync(dbPath);
        db = new SQL.Database(fileBuffer);
    } else {
        db = new SQL.Database();
    }

    // Create tables
    db.run(`
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
            restored INTEGER DEFAULT 0,
            restored_at INTEGER,
            next_attempt_at INTEGER,
            attempt_count INTEGER NOT NULL DEFAULT 0,
            last_error TEXT
        )
    `);

    // Migrate databases created by older versions of the bot.
    ensureColumn('restored_at', 'INTEGER');
    ensureColumn('next_attempt_at', 'INTEGER');
    ensureColumn('attempt_count', 'INTEGER NOT NULL DEFAULT 0');
    ensureColumn('last_error', 'TEXT');

    db.run(`
        CREATE INDEX IF NOT EXISTS idx_demotions_next_restore
        ON demotions (restored, restore_at, next_attempt_at)
    `);
    db.run(`
        CREATE INDEX IF NOT EXISTS idx_demotions_guild_active
        ON demotions (guild_id, restored)
    `);

    // Save the database
    saveDatabase();
    initialized = true;

    console.log('[Database] SQLite (sql.js) initialized successfully.');
    return db;
}

// Save database to file
function saveDatabase() {
    if (!db) return;
    const data = db.export();
    const buffer = Buffer.from(data);
    const temporaryPath = `${dbPath}.tmp`;

    // Write beside the database and rename it into place so an interrupted
    // write cannot leave the main file only partially written.
    fs.writeFileSync(temporaryPath, buffer);
    fs.renameSync(temporaryPath, dbPath);
}

// Wrapper to mimic better-sqlite3 API
const dbWrapper = {
    prepare: (sql) => {
        if (!db) {
            throw new Error('Database has not been initialized.');
        }
        return {
            run: (...params) => {
                db.run(sql, params);
                saveDatabase();
                return { changes: db.getRowsModified() };
            },
            get: (...params) => {
                const stmt = db.prepare(sql);
                stmt.bind(params);
                if (stmt.step()) {
                    const row = stmt.getAsObject();
                    stmt.free();
                    return row;
                }
                stmt.free();
                return undefined;
            },
            all: (...params) => {
                const results = [];
                const stmt = db.prepare(sql);
                stmt.bind(params);
                while (stmt.step()) {
                    results.push(stmt.getAsObject());
                }
                stmt.free();
                return results;
            }
        };
    },
    exec: (sql) => {
        db.run(sql);
        saveDatabase();
    },
    initDatabase
};

module.exports = dbWrapper;
