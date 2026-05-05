/**
 * Task storage service — all reads/writes go through SQLite.
 * The task objects returned match the shape the routes expect.
 */
const db = require('./db');
const vectorService = require('./vector');

// ── Internal helpers ─────────────────────────────────────────────────────────

const stmtTask        = db.prepare('SELECT * FROM tasks WHERE id = ?');
const stmtAllTasks    = db.prepare('SELECT * FROM tasks ORDER BY created_at DESC');
const stmtPending     = db.prepare("SELECT * FROM tasks WHERE status != 'Completed' ORDER BY created_at DESC");
const stmtAssignments = db.prepare('SELECT * FROM task_assignments WHERE task_id = ? ORDER BY id ASC');
const stmtHistory     = db.prepare('SELECT * FROM task_history WHERE task_id = ? ORDER BY timestamp ASC, id ASC');
const stmtHistCount   = db.prepare('SELECT COUNT(*) AS cnt FROM task_history WHERE task_id = ?');

function rowToTask(row) {
  if (!row) return null;
  const assignments = stmtAssignments.all(row.id);
  const history     = stmtHistory.all(row.id);
  return {
    id:             row.id,
    title:          row.title,
    description:    row.description,
    urgency:        row.urgency,
    status:         row.status,
    department:     row.department,
    departmentLabel: row.department_label,
    document:       row.document,
    createdBy:      row.created_by,
    createdAt:      row.created_at,
    updatedAt:      row.updated_at,
    assignedTo:     assignments.map(a => a.user_id),
    assignedToLabels: assignments.map(a => a.user_name),
    assignments:    assignments.map(a => ({
      userId:      a.user_id,
      userName:    a.user_name,
      status:      a.status,
      assignedAt:  a.assigned_at,
      completedAt: a.completed_at,
      remarks:     a.remarks || ''
    })),
    history: history.map(h => ({
      action:     h.action,
      user:       h.user_name,
      targetUser: h.target_user,
      status:     h.status,
      remarks:    h.remarks,
      document:   h.document,
      timestamp:  h.timestamp
    }))
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

function getAllTasks() {
  return stmtAllTasks.all().map(rowToTask);
}

function getTaskById(id) {
  return rowToTask(stmtTask.get(id));
}

function getPendingTasks() {
  return stmtPending.all().map(rowToTask);
}

const _insertTask = db.prepare(`
  INSERT INTO tasks (id, title, description, urgency, status, department, department_label, document, created_by, created_at, updated_at)
  VALUES (@id, @title, @description, @urgency, @status, @department, @departmentLabel, @document, @createdBy, @createdAt, @updatedAt)
`);
const _insertAssignment = db.prepare(`
  INSERT OR REPLACE INTO task_assignments (task_id, user_id, user_name, status, assigned_at, completed_at, remarks)
  VALUES (@taskId, @userId, @userName, @status, @assignedAt, @completedAt, @remarks)
`);
const _insertHistory = db.prepare(`
  INSERT INTO task_history (task_id, action, user_name, target_user, status, remarks, document, timestamp)
  VALUES (@taskId, @action, @userName, @targetUser, @status, @remarks, @document, @timestamp)
`);

function saveTask(task) {
  const doSave = db.transaction(() => {
    _insertTask.run({
      id: task.id, title: task.title, description: task.description,
      urgency: task.urgency || null, status: task.status || 'Assigned',
      department: task.department || null, departmentLabel: task.departmentLabel || null,
      document: task.document || null, createdBy: task.createdBy || null,
      createdAt: task.createdAt, updatedAt: task.updatedAt
    });
    (task.assignments || []).forEach(a => _insertAssignment.run({
      taskId: task.id, userId: a.userId, userName: a.userName,
      status: a.status || 'Assigned', assignedAt: a.assignedAt,
      completedAt: a.completedAt || null, remarks: a.remarks || ''
    }));
    (task.history || []).forEach(h => _insertHistory.run({
      taskId: task.id, action: h.action, userName: h.user || null,
      targetUser: h.targetUser || null, status: h.status || null,
      remarks: h.remarks || null, document: h.document || null, timestamp: h.timestamp
    }));
  });
  doSave();
  const saved = getTaskById(task.id);
  vectorService.upsertTask(saved);
  return saved;
}

const _updateTaskFields = db.prepare(`
  UPDATE tasks SET
    status           = COALESCE(@status, status),
    urgency          = COALESCE(@urgency, urgency),
    department       = COALESCE(@department, department),
    department_label = COALESCE(@departmentLabel, department_label),
    document         = COALESCE(@document, document),
    updated_at       = COALESCE(@updatedAt, updated_at)
  WHERE id = @id
`);
const _deleteAssignments = db.prepare('DELETE FROM task_assignments WHERE task_id = ?');

function updateTask(id, update) {
  if (!stmtTask.get(id)) return null;

  const doUpdate = db.transaction(() => {
    // 1. Update scalar task fields
    _updateTaskFields.run({
      id,
      status:          update.status        ?? null,
      urgency:         update.urgency       ?? null,
      department:      update.department    ?? null,
      departmentLabel: update.departmentLabel ?? null,
      document:        update.document      ?? null,
      updatedAt:       update.updatedAt     ?? null
    });

    // 2. Replace assignments if provided
    if (update.assignments !== undefined) {
      _deleteAssignments.run(id);
      (update.assignments || []).forEach(a => _insertAssignment.run({
        taskId: id, userId: a.userId, userName: a.userName,
        status: a.status, assignedAt: a.assignedAt,
        completedAt: a.completedAt || null, remarks: a.remarks || ''
      }));
    }

    // 3. Append only NEW history entries (routes pass full array; we compare by count)
    if (update.history !== undefined && update.history.length > 0) {
      const existingCount = stmtHistCount.get(id).cnt;
      const newEntries = update.history.slice(existingCount);
      newEntries.forEach(h => _insertHistory.run({
        taskId: id, action: h.action, userName: h.user || null,
        targetUser: h.targetUser || null, status: h.status || null,
        remarks: h.remarks || null, document: h.document || null,
        timestamp: h.timestamp
      }));
    }
  });

  doUpdate();
  const updated = getTaskById(id);
  vectorService.upsertTask(updated);
  return updated;
}

module.exports = { getAllTasks, getPendingTasks, getTaskById, saveTask, updateTask };
