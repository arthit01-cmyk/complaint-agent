const express = require('express');
const { getAllComplaints } = require('../services/storage');

const router = express.Router();

router.get('/summary', (req, res) => {
  let complaints = getAllComplaints();
  const { section, category, pendency, assignedTo } = req.query;

  if (section) {
    complaints = complaints.filter(c => c.department.toLowerCase() === section.toLowerCase());
  }

  if (category) {
    complaints = complaints.filter(c => {
      const categoryKey = String(c.category || '').toLowerCase();
      const categoryLabel = String(c.categoryLabel || '').toLowerCase();
      return categoryKey === category.toLowerCase() || categoryLabel === category.toLowerCase();
    });
  }

  if (pendency) {
    const pendencyLower = pendency.toLowerCase();
    if (pendencyLower === 'open') {
      complaints = complaints.filter(c => c.status !== 'Closed');
    } else if (pendencyLower === 'closed') {
      complaints = complaints.filter(c => c.status === 'Closed');
    } else {
      complaints = complaints.filter(c => c.status.toLowerCase() === pendencyLower);
    }
  }

  if (assignedTo) {
    complaints = complaints.filter(c => {
      const assignedKey = String(c.assignedTo || '').toLowerCase();
      const assignedLabel = String(c.assignedToLabel || '').toLowerCase();
      return assignedKey === assignedTo.toLowerCase() || assignedLabel === assignedTo.toLowerCase();
    });
  }

  const summary = {
    total: complaints.length,
    open: complaints.filter(c => c.status !== 'Closed').length,
    urgent: complaints.filter(c => c.urgency === 'urgent').length,
    byCategory: {},
    byDepartment: {},
    byStatus: {},
    rows: complaints.map(complaint => ({
      id: complaint.id,
      category: complaint.categoryLabel || complaint.category,
      department: complaint.department,
      urgency: complaint.urgency,
      status: complaint.status,
      assignedTo: complaint.assignedToLabel || 'Unassigned',
      location: complaint.location,
      reporter: complaint.reporter?.name || 'Unknown',
      createdAt: complaint.createdAt,
      updatedAt: complaint.updatedAt
    }))
  };

  complaints.forEach(complaint => {
    const categoryKey = complaint.categoryLabel || complaint.category;
    summary.byCategory[categoryKey] = (summary.byCategory[categoryKey] || 0) + 1;
    summary.byDepartment[complaint.department] = (summary.byDepartment[complaint.department] || 0) + 1;
    summary.byStatus[complaint.status] = (summary.byStatus[complaint.status] || 0) + 1;
  });

  return res.json(summary);
});

module.exports = router;
