const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'cultbot.db');

let db;
let SQL;
let initialized = false;

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
            restored INTEGER DEFAULT 0
        )
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
    fs.writeFileSync(dbPath, buffer);
}

// Wrapper to mimic better-sqlite3 API
const dbWrapper = {
    prepare: (sql) => {
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
