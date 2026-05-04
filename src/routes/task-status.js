const express = require('express');
const { getTaskById, updateTask } = require('../services/storage');

const router = express.Router();

const validStatuses = ['Assigned', 'In Progress', 'Completed'];

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Authentication required. Please log in again.' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Authentication required. Please log in again.' });
  }
  if (req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
}

router.get('/:id', requireAuth, (req, res) => {
  const task = getTaskById(req.params.id);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }
  // Users can only see their tasks
  if (req.session.user.role !== 'admin' && task.assignedTo !== req.session.user.key) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  return res.json(task);
});

const upload = require('../middleware/upload');

router.patch('/:id/status', requireAuth, upload.single('document'), (req, res) => {
  const task = getTaskById(req.params.id);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  // Prevent regular users from updating 'Completed' tasks
  if (task.status === 'Completed' && req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Completed tasks can only be updated by an administrator.' });
  }

  // Check access
  if (req.session.user.role !== 'admin' && !task.assignedTo.includes(req.session.user.key)) {
    return res.status(403).json({ error: 'Access denied.' });
  }

  // If completed, only admin can change
  if (task.status === 'Completed' && req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Task is completed and cannot be edited.' });
  }

  const { status, remarks } = req.body;
  let { reassignTo } = req.body;
  
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
  }

  if (!remarks || !remarks.trim()) {
    return res.status(400).json({ error: 'Remarks are required for status update.' });
  }

  let updatedAssignedTo = task.assignedTo;
  let updatedAssignedToLabels = task.assignedToLabels;
  let action = `Status changed to ${status}`;

  // Reassignment handling
  if (reassignTo) {
    if (!Array.isArray(reassignTo)) reassignTo = [reassignTo];
    if (reassignTo.length > 0) {
      const newAssigned = [];
      const newLabels = [];
      for (const userKey of reassignTo) {
        const user = require('../services/master').getUserByKey(userKey);
        if (!user) {
          return res.status(400).json({ error: `User ${userKey} not found.` });
        }
        newAssigned.push(user.key);
        newLabels.push(user.name);
      }
      updatedAssignedTo = newAssigned;
      updatedAssignedToLabels = newLabels;
      action = `Reassigned to ${newLabels.join(', ')}`;
    }
  }

  const now = new Date().toISOString();
  const docPath = req.file ? `/uploads/${req.file.filename}` : null;
  
  const updatedTask = updateTask(req.params.id, {
    status,
    assignedTo: updatedAssignedTo,
    assignedToLabels: updatedAssignedToLabels,
    updatedAt: now,
    history: [...task.history, { 
      action, 
      user: req.session.user.name, 
      timestamp: now, 
      remarks,
      document: docPath
    }]
  });

  return res.json(updatedTask);
});

router.patch('/:id/assign', requireAdmin, (req, res) => {
  const task = getTaskById(req.params.id);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const { assignedTo, remarks } = req.body;
  if (!assignedTo || !Array.isArray(assignedTo) || assignedTo.length === 0) {
    return res.status(400).json({ error: 'assignedTo must be a non-empty array.' });
  }

  const { getUserByKey } = require('../services/master');
  const newAssigned = [];
  const newLabels = [];
  for (const userKey of assignedTo) {
    const user = getUserByKey(userKey);
    if (!user) {
      return res.status(400).json({ error: `User ${userKey} not found.` });
    }
    newAssigned.push(user.key);
    newLabels.push(user.name);
  }

  const now = new Date().toISOString();
  const action = `Assigned to ${newLabels.join(', ')}`;
  const updatedTask = updateTask(req.params.id, {
    assignedTo: newAssigned,
    assignedToLabels: newLabels,
    updatedAt: now,
    history: [...task.history, { action, user: req.session.user.name, timestamp: now, remarks: remarks || 'Task reassigned.' }]
  });

  return res.json(updatedTask);
});

module.exports = router;
