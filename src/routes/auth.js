const express = require('express');
const { authenticateUser } = require('../services/master');

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  next();
}

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const user = authenticateUser(username, password);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  req.session.user = user;
  return res.json({ message: 'Login successful.', user: { key: user.key, name: user.name, role: user.role } });
});

router.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed.' });
    }
    res.json({ message: 'Logout successful.' });
  });
});

router.get('/me', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not logged in.' });
  }
  res.json(req.session.user);
});

router.post('/change-password', requireAuth, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const { authenticateUser } = require('../services/master');
  const user = authenticateUser(req.session.user.key, oldPassword);
  if (!user) {
    return res.status(400).json({ error: 'Old password incorrect.' });
  }
  const bcrypt = require('bcryptjs');
  const hashed = bcrypt.hashSync(newPassword, 10);
  const { updateUserPassword } = require('../services/master');
  updateUserPassword(req.session.user.key, hashed);
  res.json({ message: 'Password changed successfully.' });
});

module.exports = router;