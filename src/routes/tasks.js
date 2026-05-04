const express = require('express');
const { getAllTasks, saveTask } = require('../services/storage');
const { getDepartmentByKey, getUserByKey } = require('../services/master');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Middleware to check if logged in
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Authentication required. Please log in again.' });
  }
  next();
}

// Middleware to check if admin
function requireAdmin(req, res, next) {
  console.log('Session User:', req.session.user);
  if (!req.session.user) {
    return res.status(401).json({ error: 'Authentication required. Please log in again.' });
  }
  if (req.session.user.role !== 'admin') {
    console.log('Role mismatch. Required: admin, Found:', req.session.user.role);
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
}

function validateTaskPayload(payload) {
  const requiredFields = ['title', 'description'];
  const missing = requiredFields.filter(field => !payload[field]);
  if (missing.length) {
    return `Missing required fields: ${missing.join(', ')}`;
  }
  
  if (!payload.assignedTo) {
    return 'assignedTo is required.';
  }
  
  // If it's a string, we'll convert it to array later, so it's valid for now
  if (typeof payload.assignedTo === 'string' && payload.assignedTo.trim()) {
    return null;
  }
  
  if (!Array.isArray(payload.assignedTo) || payload.assignedTo.length === 0) {
    return 'assignedTo must be a non-empty array or a valid string.';
  }
  
  return null;
}

router.get('/', requireAuth, (req, res) => {
  const tasks = getAllTasks();
  if (req.session.user.role === 'admin') {
    return res.json(tasks);
  } else {
    // Users see only tasks assigned to them
    const userTasks = tasks.filter(t => t.assignedTo && t.assignedTo.includes(req.session.user.key));
    return res.json(userTasks);
  }
});

const upload = require('../middleware/upload');

router.post('/', requireAdmin, upload.single('document'), (req, res) => {
  const validationError = validateTaskPayload(req.body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  // Validate assignedTo users exist
  const assignedTo = Array.isArray(req.body.assignedTo) ? req.body.assignedTo : [req.body.assignedTo];
  const validatedAssignedTo = [];
  const assignedToLabels = [];
  for (const userKey of assignedTo) {
    const user = getUserByKey(userKey);
    if (!user) {
      return res.status(400).json({ error: `Assigned user ${userKey} not found.` });
    }
    validatedAssignedTo.push(user.key);
    assignedToLabels.push(user.name);
  }

  const firstUser = getUserByKey(validatedAssignedTo[0]);
  const department = firstUser ? firstUser.department : null;
  const departmentLabel = department || 'General';

  const createdAt = new Date().toISOString();
  const task = {
    id: uuidv4(),
    title: req.body.title,
    description: req.body.description,
    status: 'Assigned',
    department,
    departmentLabel,
    assignedTo: validatedAssignedTo,
    assignedToLabels,
    document: req.file ? `/uploads/${req.file.filename}` : null,
    createdBy: req.session.user.key,
    createdAt,
    updatedAt: createdAt,
    history: [
      {
        action: 'Created',
        user: req.session.user.name,
        timestamp: createdAt,
        remarks: 'Task created and assigned.',
        document: req.file ? `/uploads/${req.file.filename}` : null
      }
    ]
  };

  saveTask(task);
  return res.status(201).json(task);
});

module.exports = router;
