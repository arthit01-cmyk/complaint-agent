const express = require('express');
const { getComplaintById, updateComplaint } = require('../services/storage');
const { notifyReporter } = require('../services/notifications');

const router = express.Router();

const validStatuses = ['Pending', 'Received', 'In progress', 'Resolved', 'Closed'];

router.get('/:id', (req, res) => {
  const complaint = getComplaintById(req.params.id);
  if (!complaint) {
    return res.status(404).json({ error: 'Complaint not found' });
  }
  return res.json(complaint);
});

router.patch('/:id/status', (req, res) => {
  const complaint = getComplaintById(req.params.id);
  if (!complaint) {
    return res.status(404).json({ error: 'Complaint not found' });
  }

  const { status, note } = req.body;
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
  }

  const now = new Date().toISOString();
  const updatedComplaint = updateComplaint(req.params.id, {
    status,
    updatedAt: now,
    history: [...complaint.history, { status, updatedAt: now, note: note || 'Status updated.' }]
  });

  notifyReporter(updatedComplaint, `Your complaint status is now ${status}.`);
  return res.json(updatedComplaint);
});

router.patch('/:id/assign', (req, res) => {
  const complaint = getComplaintById(req.params.id);
  if (!complaint) {
    return res.status(404).json({ error: 'Complaint not found' });
  }

  const { assignedTo, note } = req.body;
  if (!assignedTo) {
    return res.status(400).json({ error: 'assignedTo is required.' });
  }

  const user = require('../services/master').getUserByKey(assignedTo);
  if (!user) {
    return res.status(400).json({ error: 'Assigned user not found.' });
  }

  const now = new Date().toISOString();
  const updatedComplaint = updateComplaint(req.params.id, {
    status: 'Received',
    assignedTo: user.key,
    assignedToLabel: user.name,
    updatedAt: now,
    history: [...complaint.history, { status: 'Received', updatedAt: now, note: note || `Complaint received and assigned to ${user.name}.` }]
  });

  notifyReporter(updatedComplaint, `Your complaint has been received and assigned.`);
  return res.json(updatedComplaint);
});

module.exports = router;
