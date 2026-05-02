const express = require('express');
const { normalizeCategory, classifyUrgency, mapDepartment } = require('../services/classifier');
const { getAllComplaints, saveComplaint } = require('../services/storage');
const { getCategories, getCategoryByKey, getUserByKey } = require('../services/master');
const { notifyReporter, notifyDepartment } = require('../services/notifications');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

function validateComplaintPayload(payload) {
  const requiredFields = ['category', 'description', 'location', 'reporter'];
  const missing = requiredFields.filter(field => !payload[field]);
  if (missing.length) {
    return `Missing required fields: ${missing.join(', ')}`;
  }

  if (typeof payload.reporter !== 'object' || !payload.reporter.name) {
    return 'Reporter information must include a name.';
  }

  return null;
}

router.get('/', (req, res) => {
  const complaints = getAllComplaints();
  return res.json(complaints);
});

router.post('/', (req, res) => {
  const validationError = validateComplaintPayload(req.body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const categoryKey = normalizeCategory(req.body.category);
  if (!categoryKey) {
    const available = getCategories().map(item => item.name).join(', ');
    return res.status(400).json({ error: `Category must be one of: ${available}.` });
  }

  const categoryDefinition = getCategoryByKey(categoryKey);
  const urgency = classifyUrgency(categoryKey, req.body.description);
  const department = mapDepartment(categoryKey);
  const createdAt = new Date().toISOString();

  const complaint = {
    id: uuidv4(),
    category: categoryKey,
    categoryLabel: categoryDefinition?.name || categoryKey,
    department,
    urgency,
    status: 'Pending',
    description: req.body.description,
    location: req.body.location,
    reporter: req.body.reporter,
    assignedTo: null,
    assignedToLabel: null,
    createdAt,
    updatedAt: createdAt,
    history: [
      {
        status: 'Pending',
        updatedAt: createdAt,
        note: 'Complaint submitted and routed.'
      }
    ]
  };

  saveComplaint(complaint);
  notifyReporter(complaint, `Complaint submitted and routed to ${department} with urgency ${urgency}.`);
  notifyDepartment(complaint, `New complaint received: ${complaint.id}. Urgency: ${urgency}.`);

  return res.status(201).json({
    id: complaint.id,
    category: complaint.category,
    categoryLabel: complaint.categoryLabel,
    department,
    urgency,
    status: complaint.status,
    assignedTo: complaint.assignedTo,
    assignedToLabel: complaint.assignedToLabel
  });
});

module.exports = router;
