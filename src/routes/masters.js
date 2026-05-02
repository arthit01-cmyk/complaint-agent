const express = require('express');
const {
  getCategories,
  getUrgencyLevels,
  getUsers,
  addCategory,
  addUrgencyLevel,
  addUser,
  updateCategory,
  updateUser,
  deleteCategory,
  deleteUser,
  deleteUrgencyLevel
} = require('../services/master');

const router = express.Router();

router.get('/categories', (req, res) => {
  return res.json(getCategories());
});

router.post('/categories', (req, res) => {
  try {
    const category = addCategory(req.body);
    return res.status(201).json(category);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.patch('/categories/:key', (req, res) => {
  try {
    const category = updateCategory(req.params.key, req.body);
    return res.json(category);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.delete('/categories/:key', (req, res) => {
  try {
    const category = deleteCategory(req.params.key);
    return res.json({ deleted: category.key });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.get('/urgencies', (req, res) => {
  return res.json(getUrgencyLevels());
});

router.post('/urgencies', (req, res) => {
  try {
    const urgency = addUrgencyLevel(req.body.label);
    return res.status(201).json({ label: urgency });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.get('/users', (req, res) => {
  return res.json(getUsers());
});

router.post('/users', (req, res) => {
  try {
    const user = addUser(req.body);
    return res.status(201).json(user);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.patch('/users/:key', (req, res) => {
  try {
    const user = updateUser(req.params.key, req.body);
    return res.json(user);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.delete('/users/:key', (req, res) => {
  try {
    const user = deleteUser(req.params.key);
    return res.json({ deleted: user.key });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.delete('/urgencies/:label', (req, res) => {
  try {
    const label = deleteUrgencyLevel(req.params.label);
    return res.json({ deleted: label });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

module.exports = router;
