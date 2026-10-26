const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(dir, { recursive: true });

const db = new Database(path.join(dir, 'ledgerly.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

// Upgrade databases created before currency conversion existed.
const hasColumn = (table, column) => db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);

if (!hasColumn('transactions', 'currency')) {
  db.exec("ALTER TABLE transactions ADD COLUMN currency TEXT NOT NULL DEFAULT 'LKR'");
  // Older amounts were entered in whatever currency the user was viewing.
  db.exec("UPDATE transactions SET currency = COALESCE((SELECT s.currency FROM settings s WHERE s.user_id = transactions.user_id), 'LKR')");
}
if (!hasColumn('settings', 'budget_currency')) {
  db.exec("ALTER TABLE settings ADD COLUMN budget_currency TEXT NOT NULL DEFAULT 'LKR'");
  db.exec('UPDATE settings SET budget_currency = currency');
}

module.exports = db;
