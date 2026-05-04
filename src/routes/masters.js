const express = require('express');
const {
  getDepartments,
  getUsers,
  addUser,
  updateUser,
  deleteUser,
  addDepartment,
  deleteDepartment,
  updateDepartment,
  getUrgencyLevels,
  addUrgencyLevel,
  deleteUrgencyLevel,
  updateUrgencyLevel
} = require('../services/master');

const router = express.Router();

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

router.get('/departments', requireAuth, (req, res) => {
  return res.json(getDepartments());
});

router.post('/departments', requireAdmin, (req, res) => {
  try {
    const department = addDepartment(req.body.name);
    return res.status(201).json({ name: department });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.put('/departments/:name', requireAdmin, (req, res) => {
  try {
    const department = updateDepartment(req.params.name, req.body.name);
    return res.json({ name: department });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.delete('/departments/:name', requireAdmin, (req, res) => {
  try {
    const department = deleteDepartment(req.params.name);
    return res.json({ name: department });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.get('/urgencies', requireAuth, (req, res) => {
  return res.json(getUrgencyLevels());
});

router.post('/urgencies', requireAdmin, (req, res) => {
  try {
    const urgency = addUrgencyLevel(req.body.label);
    return res.status(201).json({ label: urgency });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.put('/urgencies/:label', requireAdmin, (req, res) => {
  try {
    const urgency = updateUrgencyLevel(req.params.label, req.body.label);
    return res.json({ label: urgency });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.delete('/urgencies/:label', requireAdmin, (req, res) => {
  try {
    const urgency = deleteUrgencyLevel(req.params.label);
    return res.json({ label: urgency });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.get('/users', requireAdmin, (req, res) => {
  return res.json(getUsers());
});

router.post('/users', requireAdmin, (req, res) => {
  try {
    const user = addUser(req.body);
    return res.status(201).json(user);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.put('/users/:key', requireAdmin, (req, res) => {
  try {
    const user = updateUser(req.params.key, req.body);
    return res.json(user);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.delete('/users/:key', requireAdmin, (req, res) => {
  try {
    const user = deleteUser(req.params.key);
    return res.json({ deleted: user.key });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

module.exports = router;
