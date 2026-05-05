const express = require('express');
const { getAllTasks, saveTask } = require('../services/storage');
const { getUserByKey } = require('../services/master');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

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
  const statuses = assignments.map(a => a.status);
  if (statuses.every(s => s === 'Completed')) return 'Completed';
  if (statuses.some(s => s === 'In Progress' || s === 'Completed')) return 'In Progress';
  return 'Assigned';
}

router.get('/', requireAuth, (req, res) => {
  const tasks = getAllTasks();
  if (req.session.user.role === 'admin') {
    return res.json(tasks);
  }
  const userKey = req.session.user.key;
  const userTasks = tasks.filter(t =>
    (t.assignments && t.assignments.some(a => a.userId === userKey)) ||
    (t.assignedTo && t.assignedTo.includes(userKey))
  );
  return res.json(userTasks);
});

const upload = require('../middleware/upload');

router.post('/', requireAdmin, upload.single('document'), (req, res) => {
  const { title, description, urgency } = req.body;

  if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required.' });
  if (!description || !description.trim()) return res.status(400).json({ error: 'Description is required.' });
  if (!req.body.assignedTo) return res.status(400).json({ error: 'assignedTo is required.' });

  const rawAssigned = Array.isArray(req.body.assignedTo) ? req.body.assignedTo : [req.body.assignedTo];
  if (rawAssigned.length === 0) return res.status(400).json({ error: 'assignedTo must be non-empty.' });

  const now = new Date().toISOString();
  const assignments = [];
  const assignedToKeys = [];
  const assignedToLabels = [];

  for (const userKey of rawAssigned) {
    const user = getUserByKey(userKey);
    if (!user) return res.status(400).json({ error: `User "${userKey}" not found.` });
    assignedToKeys.push(user.key);
    assignedToLabels.push(user.name);
    assignments.push({
      userId: user.key,
      userName: user.name,
      status: 'Assigned',
      assignedAt: now,
      completedAt: null,
      remarks: ''
    });
  }

  const firstUser = getUserByKey(assignedToKeys[0]);
  const department = firstUser ? firstUser.department : null;

  const task = {
    id: uuidv4(),
    title: title.trim(),
    description: description.trim(),
    urgency: urgency || null,
    status: 'Assigned',
    department,
    departmentLabel: department || 'General',
    assignedTo: assignedToKeys,
    assignedToLabels,
    assignments,
    document: req.file ? `/uploads/${req.file.filename}` : null,
    createdBy: req.session.user.key,
    createdAt: now,
    updatedAt: now,
    history: [{
      action: 'Created',
      user: req.session.user.name,
      timestamp: now,
      remarks: `Task created and assigned to: ${assignedToLabels.join(', ')}.`,
      document: req.file ? `/uploads/${req.file.filename}` : null
    }]
  };

  saveTask(task);
  return res.status(201).json(task);
});

module.exports = { router, deriveTaskStatus };
