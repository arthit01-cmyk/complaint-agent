/**
 * SQLite database service.
 * Single source of truth for all persistent data.
 * Migrates from legacy JSON files on first run.
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_FILE
  ? path.resolve(process.env.DB_FILE)
  : path.resolve(__dirname, '../../data/edesk.db');

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);

// WAL mode for concurrent reads; enforce FK constraints
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ───────────────────────────────────────────────────────────────────
// Referenced (parent) tables must be created before referencing (child) tables.
db.exec(`
  CREATE TABLE IF NOT EXISTS departments (
    name TEXT PRIMARY KEY
  );

  CREATE TABLE IF NOT EXISTS urgency_levels (
    label TEXT PRIMARY KEY
  );

  CREATE TABLE IF NOT EXISTS users (
    key         TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    designation TEXT NOT NULL DEFAULT '',
    email       TEXT UNIQUE NOT NULL,
    contact     TEXT NOT NULL DEFAULT '',
    role        TEXT NOT NULL DEFAULT 'user',
    is_primary  INTEGER NOT NULL DEFAULT 0,
    password    TEXT NOT NULL,
    department  TEXT REFERENCES departments(name) ON DELETE SET NULL ON UPDATE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id               TEXT PRIMARY KEY,
    title            TEXT NOT NULL,
    description      TEXT,
    urgency          TEXT REFERENCES urgency_levels(label) ON DELETE SET NULL ON UPDATE CASCADE,
    status           TEXT NOT NULL DEFAULT 'Assigned',
    department       TEXT,
    department_label TEXT,
    document         TEXT,
    created_by       TEXT REFERENCES users(key) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS task_assignments (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id      TEXT NOT NULL,
    user_id      TEXT NOT NULL,
    user_name    TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'Assigned',
    assigned_at  TEXT NOT NULL,
    completed_at TEXT,
    remarks      TEXT DEFAULT '',
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(key) ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE(task_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS task_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id     TEXT NOT NULL,
    action      TEXT NOT NULL,
    user_name   TEXT,
    target_user TEXT,
    status      TEXT,
    remarks     TEXT,
    document    TEXT,
    timestamp   TEXT NOT NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
  );
`);

// ── Column migration for existing databases ───────────────────────────────────
// Add is_primary if the DB was created before this column existed
try {
  db.exec(`ALTER TABLE users ADD COLUMN is_primary INTEGER NOT NULL DEFAULT 0`);
} catch (_) { /* column already exists */ }
// Ensure exactly one primary admin is marked (key='admin' is the seed default)
const hasPrimary = db.prepare(`SELECT COUNT(*) AS cnt FROM users WHERE is_primary = 1`).get().cnt;
if (hasPrimary === 0) {
  // Mark admin key if present, otherwise mark the first admin by rowid
  const adminRow = db.prepare(`SELECT key FROM users WHERE key = 'admin'`).get()
    || db.prepare(`SELECT key FROM users WHERE role = 'admin' ORDER BY rowid ASC LIMIT 1`).get();
  if (adminRow) {
    db.prepare(`UPDATE users SET is_primary = 1 WHERE key = ?`).run(adminRow.key);
  }
}

// ── FK migration for existing databases ──────────────────────────────────────
// SQLite cannot ADD CONSTRAINT to existing tables, so we recreate the three
// affected tables inside a transaction with foreign_keys temporarily OFF.
// Detection: task_assignments gains a FK on user_id — absent in old schema.
(function addMissingForeignKeys() {
  const existingFKs = db.prepare("PRAGMA foreign_key_list('task_assignments')").all();
  if (existingFKs.some(fk => fk.from === 'user_id')) return; // already migrated

  console.log('[DB] Adding missing foreign key constraints...');
  db.pragma('foreign_keys = OFF');

  try {
    db.transaction(() => {
      // 1. users — add FK: department → departments(name)
      db.exec(`
        CREATE TABLE users_fk (
          key         TEXT PRIMARY KEY,
          name        TEXT NOT NULL,
          designation TEXT NOT NULL DEFAULT '',
          email       TEXT UNIQUE NOT NULL,
          contact     TEXT NOT NULL DEFAULT '',
          role        TEXT NOT NULL DEFAULT 'user',
          is_primary  INTEGER NOT NULL DEFAULT 0,
          password    TEXT NOT NULL,
          department  TEXT REFERENCES departments(name) ON DELETE SET NULL ON UPDATE CASCADE
        );
        INSERT INTO users_fk (key, name, designation, email, contact, role, is_primary, password, department)
          SELECT key, name, designation, email, contact, role, is_primary, password, department FROM users;
        DROP TABLE users;
        ALTER TABLE users_fk RENAME TO users;
      `);

      // 2. tasks — add FK: urgency → urgency_levels(label), created_by → users(key)
      db.exec(`
        CREATE TABLE tasks_fk (
          id               TEXT PRIMARY KEY,
          title            TEXT NOT NULL,
          description      TEXT,
          urgency          TEXT REFERENCES urgency_levels(label) ON DELETE SET NULL ON UPDATE CASCADE,
          status           TEXT NOT NULL DEFAULT 'Assigned',
          department       TEXT,
          department_label TEXT,
          document         TEXT,
          created_by       TEXT REFERENCES users(key) ON DELETE SET NULL ON UPDATE CASCADE,
          created_at       TEXT NOT NULL,
          updated_at       TEXT NOT NULL
        );
        INSERT INTO tasks_fk (id, title, description, urgency, status, department, department_label, document, created_by, created_at, updated_at)
          SELECT id, title, description, urgency, status, department, department_label, document, created_by, created_at, updated_at FROM tasks;
        DROP TABLE tasks;
        ALTER TABLE tasks_fk RENAME TO tasks;
      `);

      // 3. task_assignments — add FK: user_id → users(key) (keep existing task_id FK)
      db.exec(`
        CREATE TABLE task_assignments_fk (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id      TEXT NOT NULL,
          user_id      TEXT NOT NULL,
          user_name    TEXT NOT NULL,
          status       TEXT NOT NULL DEFAULT 'Assigned',
          assigned_at  TEXT NOT NULL,
          completed_at TEXT,
          remarks      TEXT DEFAULT '',
          FOREIGN KEY (task_id) REFERENCES tasks(id)    ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(key)   ON DELETE CASCADE ON UPDATE CASCADE,
          UNIQUE(task_id, user_id)
        );
        INSERT INTO task_assignments_fk (id, task_id, user_id, user_name, status, assigned_at, completed_at, remarks)
          SELECT id, task_id, user_id, user_name, status, assigned_at, completed_at, remarks FROM task_assignments;
        DROP TABLE task_assignments;
        ALTER TABLE task_assignments_fk RENAME TO task_assignments;
      `);
    })();

    console.log('[DB] Foreign key constraints applied.');
  } catch (err) {
    console.error('[DB] FK migration failed:', err.message);
  }

  db.pragma('foreign_keys = ON');
})();

// ── JSON Migration (runs once when DB is empty) ──────────────────────────────
function migrate() {
  const userCount = db.prepare('SELECT COUNT(*) AS cnt FROM users').get().cnt;
  if (userCount > 0) {
    console.log('[DB] Database already populated — skipping migration.');
    return;
  }

  console.log('[DB] Empty database detected — migrating from JSON files...');

  const masterPaths = [
    path.resolve(__dirname, '../../data/master.json'),
    path.resolve(__dirname, '../data/master.json')
  ];
  const tasksPaths = [
    path.resolve(__dirname, '../../data/tasks.json'),
    path.resolve(__dirname, '../data/tasks.json')
  ];

  const masterFile = masterPaths.find(p => fs.existsSync(p));
  const tasksFile  = tasksPaths.find(p => fs.existsSync(p));

  const doMigrate = db.transaction(() => {
    if (masterFile) {
      const master = JSON.parse(fs.readFileSync(masterFile, 'utf8'));

      // Departments
      const insertDept = db.prepare('INSERT OR IGNORE INTO departments (name) VALUES (?)');
      (master.departments || []).forEach(d => insertDept.run(d));

      // Urgency levels
      const insertUrg = db.prepare('INSERT OR IGNORE INTO urgency_levels (label) VALUES (?)');
      (master.urgencies || []).forEach(u => insertUrg.run(u));

      // Default urgencies if none
      if (!(master.urgencies || []).length) {
        ['Urgent', 'Routine', 'FYI'].forEach(u => insertUrg.run(u));
      }

      // Users
      const insertUser = db.prepare(`
        INSERT OR IGNORE INTO users (key, name, designation, email, contact, role, is_primary, password, department)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      (master.users || []).forEach(u => {
        insertUser.run(u.key, u.name, u.designation || '', u.email, u.contact || '', u.role || 'user', u.is_primary ? 1 : 0, u.password, u.department || null);
      });
    } else {
      // Seed default admin if no master file at all
      const bcrypt = require('bcryptjs');
      db.prepare(`INSERT OR IGNORE INTO users (key, name, designation, email, contact, role, is_primary, password, department)
        VALUES ('admin', 'Administrator', 'System Admin', 'admin@workdesk.com', '0000000000', 'admin', 1, ?, NULL)
      `).run(bcrypt.hashSync('admin123', 10));
      ['Urgent', 'Routine', 'FYI'].forEach(u =>
        db.prepare('INSERT OR IGNORE INTO urgency_levels (label) VALUES (?)').run(u)
      );
    }

    if (tasksFile) {
      const tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf8'));
      const insertTask = db.prepare(`
        INSERT OR IGNORE INTO tasks (id, title, description, urgency, status, department, department_label, document, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertAssign = db.prepare(`
        INSERT OR IGNORE INTO task_assignments (task_id, user_id, user_name, status, assigned_at, completed_at, remarks)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const insertHist = db.prepare(`
        INSERT INTO task_history (task_id, action, user_name, target_user, status, remarks, document, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      (tasks || []).forEach(task => {
        insertTask.run(
          task.id, task.title, task.description, task.urgency || null,
          task.status || 'Assigned', task.department || null, task.departmentLabel || null,
          task.document || null, task.createdBy || null,
          task.createdAt || new Date().toISOString(), task.updatedAt || new Date().toISOString()
        );

        // Assignments
        const assignments = task.assignments || [];
        if (assignments.length > 0) {
          assignments.forEach(a => {
            insertAssign.run(task.id, a.userId, a.userName, a.status || 'Assigned', a.assignedAt || task.createdAt, a.completedAt || null, a.remarks || '');
          });
        } else if (task.assignedTo && task.assignedTo.length > 0) {
          task.assignedTo.forEach((uid, i) => {
            insertAssign.run(task.id, uid, (task.assignedToLabels || [])[i] || uid, task.status || 'Assigned', task.createdAt, task.status === 'Completed' ? task.updatedAt : null, '');
          });
        }

        // History
        (task.history || []).forEach(h => {
          insertHist.run(task.id, h.action, h.user || null, h.targetUser || null, h.status || null, h.remarks || null, h.document || null, h.timestamp || new Date().toISOString());
        });
      });
    }
  });

  try {
    doMigrate();
    console.log('[DB] Migration complete.');
  } catch (err) {
    console.error('[DB] Migration error:', err.message);
  }
}

migrate();

module.exports = db;
