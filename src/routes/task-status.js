const express = require('express');
const { getTaskById, updateTask } = require('../services/storage');
const { getUserByKey } = require('../services/master');

const db = require('../services/db');
const router = express.Router();

// 'Pending Review' sits between In Progress and Completed.
// Users submit for review; only admin can approve (→ Completed) or reject (→ In Progress).
const validStatuses = ['Assigned', 'In Progress', 'Pending Review', 'Completed'];
const statusOrder   = ['Assigned', 'In Progress', 'Pending Review', 'Completed'];

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Authentication required. Please log in again.' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Authentication required. Please log in again.' });
  if (req.session.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
  next();
}

// Derive overall task status from per-user assignments
function deriveTaskStatus(assignments) {
  if (!assignments || assignments.length === 0) return 'Assigned';
  const s = assignments.map(a => a.status);
  if (s.every(x => x === 'Completed'))                          return 'Completed';
  if (s.every(x => x === 'Completed' || x === 'Pending Review')) return 'Pending Review';
  if (s.some(x => x === 'In Progress' || x === 'Pending Review' || x === 'Completed')) return 'In Progress';
  return 'Assigned';
}

// Migrate old-style tasks (no assignments array) on the fly
function ensureAssignments(task) {
  if (task.assignments && task.assignments.length > 0) return [...task.assignments];
  if (task.assignedTo && task.assignedTo.length > 0) {
    return task.assignedTo.map((userId, i) => ({
      userId,
      userName: (task.assignedToLabels || [])[i] || userId,
      status: task.status || 'Assigned',
      assignedAt: task.createdAt,
      completedAt: task.status === 'Completed' ? task.updatedAt : null,
      remarks: ''
    }));
  }
  return [];
}

// GET /review — must be registered BEFORE /:id to avoid route conflict
router.get('/review', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT
      t.id          AS taskId,
      t.title,
      t.description,
      t.urgency,
      t.department_label AS department,
      ta.user_id    AS userId,
      ta.user_name  AS userName,
      ta.remarks    AS userRemarks,
      ta.completed_at AS submittedAt
    FROM task_assignments ta
    JOIN tasks t ON t.id = ta.task_id
    WHERE ta.status = 'Pending Review'
    ORDER BY ta.completed_at ASC
  `).all();
  return res.json(rows);
});

// GET single task
router.get('/:id', requireAuth, (req, res) => {
  const task = getTaskById(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  if (req.session.user.role !== 'admin') {
    const userKey = req.session.user.key;
    const hasAccess =
      (task.assignments && task.assignments.some(a => a.userId === userKey)) ||
      (task.assignedTo && task.assignedTo.includes(userKey));
    if (!hasAccess) return res.status(403).json({ error: 'Access denied.' });
  }
  return res.json(task);
});

const upload = require('../middleware/upload');

// PATCH /:id/status — update a user's assignment status
// Regular user: updates their own assignment
// Admin: can target any user via req.body.targetUserId
router.patch('/:id/status', requireAuth, upload.single('document'), (req, res) => {
  const task = getTaskById(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const currentUser = req.session.user;
  const isAdmin = currentUser.role === 'admin';

  // Determine whose assignment to update
  const targetUserId = isAdmin && req.body.targetUserId
    ? req.body.targetUserId
    : currentUser.key;

  // Access check for regular users
  if (!isAdmin) {
    const hasAccess =
      (task.assignments && task.assignments.some(a => a.userId === currentUser.key)) ||
      (task.assignedTo && task.assignedTo.includes(currentUser.key));
    if (!hasAccess) return res.status(403).json({ error: 'Access denied.' });
  }

  let { status, remarks } = req.body;

  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
  }
  if (!remarks || !remarks.trim()) {
    return res.status(400).json({ error: 'Remarks are required for status update.' });
  }

  const assignments = ensureAssignments(task);
  const idx = assignments.findIndex(a => a.userId === targetUserId);

  if (idx === -1) {
    return res.status(404).json({ error: 'No assignment found for this user on this task.' });
  }

  const current = assignments[idx];

  if (!isAdmin) {
    // Users cannot edit a completed or pending-review assignment
    if (current.status === 'Completed' || current.status === 'Pending Review') {
      return res.status(403).json({ error: 'Your assignment is awaiting review or already completed.' });
    }
    // Users cannot go backwards in status
    const curIdx = statusOrder.indexOf(current.status);
    const newIdx = statusOrder.indexOf(status);
    if (newIdx < curIdx) {
      return res.status(400).json({ error: 'You cannot move your status backwards.' });
    }
    // Users cannot directly set Completed — must go through Pending Review
    if (status === 'Completed') {
      status = 'Pending Review';
    }
  }

  const now = new Date().toISOString();
  const docPath = req.file ? `/uploads/${req.file.filename}` : null;
  const targetUser = getUserByKey(targetUserId);
  const targetName = targetUser ? targetUser.name : (current.userName || targetUserId);

  const actionLabel = status === 'Pending Review' ? 'Submitted for Review' : `Status changed to ${status}`;

  assignments[idx] = {
    ...current,
    status,
    completedAt: (status === 'Completed' || status === 'Pending Review') ? now : null,
    remarks: remarks.trim()
  };

  const overallStatus = deriveTaskStatus(assignments);

  const historyEntry = {
    action: `${targetName}: ${actionLabel}`,
    user: currentUser.name,
    targetUser: targetName,
    status,
    timestamp: now,
    remarks: remarks.trim(),
    document: docPath
  };

  const updatedTask = updateTask(req.params.id, {
    assignments,
    status: overallStatus,
    assignedTo: assignments.map(a => a.userId),
    assignedToLabels: assignments.map(a => a.userName),
    updatedAt: now,
    history: [...(task.history || []), historyEntry]
  });

  return res.json(updatedTask);
});

// PATCH /:id/assignments/:userId/reopen — admin reopens a specific user's assignment
router.patch('/:id/assignments/:userId/reopen', requireAdmin, (req, res) => {
  const task = getTaskById(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const { userId } = req.params;
  const { remarks } = req.body;

  const assignments = ensureAssignments(task);
  const idx = assignments.findIndex(a => a.userId === userId);

  if (idx === -1) {
    return res.status(404).json({ error: 'Assignment not found for this user.' });
  }

  const targetUser = getUserByKey(userId);
  const targetName = targetUser ? targetUser.name : (assignments[idx].userName || userId);
  const now = new Date().toISOString();

  assignments[idx] = {
    ...assignments[idx],
    status: 'Assigned',
    completedAt: null,
    remarks: ''
  };

  const overallStatus = deriveTaskStatus(assignments);

  const updatedTask = updateTask(req.params.id, {
    assignments,
    status: overallStatus,
    updatedAt: now,
    history: [...(task.history || []), {
      action: `${targetName}: Assignment reopened by admin`,
      user: req.session.user.name,
      targetUser: targetName,
      status: 'Assigned',
      timestamp: now,
      remarks: remarks || 'Assignment reopened by administrator.'
    }]
  });

  return res.json(updatedTask);
});

// PATCH /:id/assign — admin reassigns the whole task to a new set of users
router.patch('/:id/assign', requireAdmin, (req, res) => {
  const task = getTaskById(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const { assignedTo, remarks } = req.body;
  if (!assignedTo || !Array.isArray(assignedTo) || assignedTo.length === 0) {
    return res.status(400).json({ error: 'assignedTo must be a non-empty array.' });
  }

  const now = new Date().toISOString();
  const newAssignedKeys = [];
  const newAssignedLabels = [];

  for (const userKey of assignedTo) {
    const user = getUserByKey(userKey);
    if (!user) return res.status(400).json({ error: `User "${userKey}" not found.` });
    newAssignedKeys.push(user.key);
    newAssignedLabels.push(user.name);
  }

  const assignments = newAssignedKeys.map((userId, i) => ({
    userId,
    userName: newAssignedLabels[i],
    status: 'Assigned',
    assignedAt: now,
    completedAt: null,
    remarks: ''
  }));

  const updatedTask = updateTask(req.params.id, {
    assignedTo: newAssignedKeys,
    assignedToLabels: newAssignedLabels,
    assignments,
    status: 'Assigned',
    updatedAt: now,
    history: [...(task.history || []), {
      action: `Reassigned to: ${newAssignedLabels.join(', ')}`,
      user: req.session.user.name,
      timestamp: now,
      remarks: remarks || 'Task reassigned.'
    }]
  });

  return res.json(updatedTask);
});

// PATCH /:id/assignments/:userId/approve — admin approves user's submitted work
router.patch('/:id/assignments/:userId/approve', requireAdmin, (req, res) => {
  const task = getTaskById(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const { userId } = req.params;
  const { remarks } = req.body;

  const assignments = ensureAssignments(task);
  const idx = assignments.findIndex(a => a.userId === userId);
  if (idx === -1) return res.status(404).json({ error: 'Assignment not found.' });
  if (assignments[idx].status !== 'Pending Review') {
    return res.status(400).json({ error: 'This assignment is not awaiting review.' });
  }

  const targetName = assignments[idx].userName || userId;
  const now = new Date().toISOString();

  assignments[idx] = { ...assignments[idx], status: 'Completed', completedAt: now, remarks: assignments[idx].remarks };

  const overallStatus = deriveTaskStatus(assignments);
  const updatedTask = updateTask(req.params.id, {
    assignments,
    status: overallStatus,
    updatedAt: now,
    history: [...(task.history || []), {
      action: `${targetName}: Work Approved by Admin`,
      user: req.session.user.name,
      targetUser: targetName,
      status: 'Completed',
      timestamp: now,
      remarks: (remarks || 'Work approved and marked as completed.').trim()
    }]
  });
  return res.json(updatedTask);
});

// PATCH /:id/assignments/:userId/reject — admin rejects, sends back for rectification
router.patch('/:id/assignments/:userId/reject', requireAdmin, (req, res) => {
  const task = getTaskById(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const { userId } = req.params;
  const { remarks } = req.body;

  if (!remarks || !remarks.trim()) {
    return res.status(400).json({ error: 'Remarks are required when rejecting work.' });
  }

  const assignments = ensureAssignments(task);
  const idx = assignments.findIndex(a => a.userId === userId);
  if (idx === -1) return res.status(404).json({ error: 'Assignment not found.' });
  if (assignments[idx].status !== 'Pending Review') {
    return res.status(400).json({ error: 'This assignment is not awaiting review.' });
  }

  const targetName = assignments[idx].userName || userId;
  const now = new Date().toISOString();

  assignments[idx] = { ...assignments[idx], status: 'In Progress', completedAt: null, remarks: '' };

  const overallStatus = deriveTaskStatus(assignments);
  const updatedTask = updateTask(req.params.id, {
    assignments,
    status: overallStatus,
    updatedAt: now,
    history: [...(task.history || []), {
      action: `${targetName}: Work Returned — Not Satisfactory`,
      user: req.session.user.name,
      targetUser: targetName,
      status: 'In Progress',
      timestamp: now,
      remarks: remarks.trim()
    }]
  });
  return res.json(updatedTask);
});

module.exports = router;
