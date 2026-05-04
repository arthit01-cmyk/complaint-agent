const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getUserByKey, updateUser } = require('../services/master');

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  next();
}

router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = getUserByKey(req.session.user.key);

  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  // Verify current password
  const isMatch = bcrypt.compareSync(currentPassword, user.password);
  if (!isMatch) {
    return res.status(400).json({ error: 'Incorrect current password.' });
  }

  // Hash new password
  const salt = bcrypt.genSaltSync(10);
  const hashedPassword = bcrypt.hashSync(newPassword, salt);

  // Update user
  user.password = hashedPassword;
  const success = updateUser(user.key, user);

  if (success) {
    return res.json({ message: 'Password changed successfully.' });
  } else {
    return res.status(500).json({ error: 'Failed to update password.' });
  }
});

module.exports = router;
