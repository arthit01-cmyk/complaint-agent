/**
 * Master data service — users, departments, urgency levels.
 * All reads/writes go through SQLite.
 */
const db = require('./db');
const bcrypt = require('bcryptjs');

// ── Key normalisation (same logic as before) ─────────────────────────────────
function normalizeKey(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/\s/g, '-');
}

// ── Users ─────────────────────────────────────────────────────────────────────

// Returns users WITHOUT password (safe for API responses)
function getUsers() {
  return db.prepare('SELECT key, name, designation, email, contact, role, department FROM users ORDER BY name ASC').all();
}

// Returns full user row INCLUDING password (for internal auth only)
function getUserByKey(key) {
  if (!key) return null;
  const k = normalizeKey(key);
  return db.prepare('SELECT * FROM users WHERE key = ? OR key = ?').get(k, key) || null;
}

function authenticateUser(username, password) {
  const user = db.prepare('SELECT * FROM users WHERE key = ? OR email = ?').get(username, username);
  if (!user) return null;
  if (!bcrypt.compareSync(password, user.password)) return null;
  return user;
}

function addUser(userData) {
  const { name, username, designation, email, contact, role, department, password } = userData;
  if (!name || !designation || !email || !contact || !role || !password) {
    throw new Error('User must include name, designation, email, contact, role, and password.');
  }
  // Use explicit username if provided and valid, otherwise derive from name
  let key;
  if (username && username.trim()) {
    const trimmed = username.trim().toLowerCase();
    if (!/^[a-z0-9\-]+$/.test(trimmed)) {
      throw new Error('Username may only contain lowercase letters, numbers, and hyphens.');
    }
    key = trimmed;
  } else {
    key = normalizeKey(name);
  }
  const existing = db.prepare('SELECT key FROM users WHERE key = ? OR email = ?').get(key, email);
  if (existing) throw new Error('A user with that name or email already exists.');

  const hashed = bcrypt.hashSync(password, 10);
  db.prepare(`
    INSERT INTO users (key, name, designation, email, contact, role, password, department)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(key, name.trim(), designation.trim(), email.trim(), contact.trim(), role, hashed, department || null);

  return { key, name: name.trim(), designation: designation.trim(), email: email.trim(), contact: contact.trim(), role, department: department || null };
}

function updateUser(oldKey, updates) {
  const existing = getUserByKey(oldKey);
  if (!existing) throw new Error('User not found.');

  const name        = updates.name        ? updates.name.trim()        : existing.name;
  const designation = updates.designation ? updates.designation.trim() : existing.designation;
  const email       = updates.email       ? updates.email.trim()       : existing.email;
  const contact     = updates.contact     ? updates.contact.trim()     : existing.contact;
  const role        = updates.role        || existing.role;
  const department  = updates.department !== undefined ? (updates.department || null) : existing.department;

  if (!name || !designation || !email || !contact) {
    throw new Error('User must include name, designation, email, and contact.');
  }

  const newKey = normalizeKey(name);
  if (newKey !== existing.key) {
    const dup = db.prepare('SELECT key FROM users WHERE key = ?').get(newKey);
    if (dup) throw new Error('A user with that name already exists.');
  }

  // Hash new password if provided, otherwise keep existing
  let password = existing.password;
  if (updates.password && updates.password.trim()) {
    password = bcrypt.hashSync(updates.password.trim(), 10);
  }

  db.prepare(`
    UPDATE users SET key = ?, name = ?, designation = ?, email = ?, contact = ?, role = ?, password = ?, department = ?
    WHERE key = ?
  `).run(newKey, name, designation, email, contact, role, password, department, existing.key);

  return { key: newKey, name, designation, email, contact, role, department };
}

function deleteUser(key) {
  const existing = getUserByKey(key);
  if (!existing) throw new Error('User not found.');
  db.prepare('DELETE FROM users WHERE key = ?').run(existing.key);
  return existing;
}

function updateUserPassword(key, hashedPassword) {
  db.prepare('UPDATE users SET password = ? WHERE key = ?').run(hashedPassword, key);
}

// ── Departments ───────────────────────────────────────────────────────────────

function getDepartments() {
  return db.prepare('SELECT name FROM departments ORDER BY name ASC').all().map(r => r.name);
}

function addDepartment(name) {
  if (!name || !name.trim()) throw new Error('Department name is required.');
  const normalized = name.trim();
  const existing = db.prepare('SELECT name FROM departments WHERE lower(name) = lower(?)').get(normalized);
  if (existing) throw new Error('Department already exists.');
  db.prepare('INSERT INTO departments (name) VALUES (?)').run(normalized);
  return normalized;
}

function updateDepartment(oldName, newName) {
  if (!oldName || !newName) throw new Error('Both old and new names are required.');
  const existing = db.prepare('SELECT name FROM departments WHERE lower(name) = lower(?)').get(oldName.trim());
  if (!existing) throw new Error('Department not found.');
  const normalized = newName.trim();
  const dup = db.prepare('SELECT name FROM departments WHERE lower(name) = lower(?) AND name != ?').get(normalized, existing.name);
  if (dup) throw new Error('A department with that name already exists.');
  db.prepare('UPDATE departments SET name = ? WHERE name = ?').run(normalized, existing.name);
  return normalized;
}

function deleteDepartment(name) {
  if (!name) throw new Error('Department name is required.');
  const existing = db.prepare('SELECT name FROM departments WHERE lower(name) = lower(?)').get(name.trim());
  if (!existing) throw new Error('Department not found.');
  db.prepare('DELETE FROM departments WHERE name = ?').run(existing.name);
  return existing.name;
}

// ── Urgency levels ────────────────────────────────────────────────────────────

function getUrgencyLevels() {
  return db.prepare('SELECT label FROM urgency_levels ORDER BY label ASC').all().map(r => r.label);
}

function addUrgencyLevel(label) {
  if (!label || !label.trim()) throw new Error('Urgency label is required.');
  const normalized = label.trim();
  const existing = db.prepare('SELECT label FROM urgency_levels WHERE lower(label) = lower(?)').get(normalized);
  if (existing) throw new Error('Urgency level already exists.');
  db.prepare('INSERT INTO urgency_levels (label) VALUES (?)').run(normalized);
  return normalized;
}

function updateUrgencyLevel(oldLabel, newLabel) {
  if (!oldLabel || !newLabel) throw new Error('Both old and new labels are required.');
  const existing = db.prepare('SELECT label FROM urgency_levels WHERE lower(label) = lower(?)').get(oldLabel.trim());
  if (!existing) throw new Error('Urgency level not found.');
  const normalized = newLabel.trim();
  const dup = db.prepare('SELECT label FROM urgency_levels WHERE lower(label) = lower(?) AND label != ?').get(normalized, existing.label);
  if (dup) throw new Error('An urgency level with that label already exists.');
  db.prepare('UPDATE urgency_levels SET label = ? WHERE label = ?').run(normalized, existing.label);
  return normalized;
}

function deleteUrgencyLevel(label) {
  if (!label) throw new Error('Urgency label is required.');
  const existing = db.prepare('SELECT label FROM urgency_levels WHERE lower(label) = lower(?)').get(label.trim());
  if (!existing) throw new Error('Urgency level not found.');
  db.prepare('DELETE FROM urgency_levels WHERE label = ?').run(existing.label);
  return existing.label;
}

// ── Misc (kept for compatibility) ────────────────────────────────────────────
function getDepartmentByKey(key) { return key || null; }
function getCategories() { return []; }
function getCategoryByKey() { return null; }

module.exports = {
  normalizeKey,
  getUsers,
  getUserByKey,
  authenticateUser,
  addUser,
  updateUser,
  deleteUser,
  updateUserPassword,
  getDepartments,
  getDepartmentByKey,
  addDepartment,
  updateDepartment,
  deleteDepartment,
  getUrgencyLevels,
  addUrgencyLevel,
  updateUrgencyLevel,
  deleteUrgencyLevel,
  getCategories,
  getCategoryByKey
};
