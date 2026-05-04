const express = require('express');
const { getAllTasks } = require('../services/storage');

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

router.get('/summary', requireAuth, (req, res) => {
  let tasks = getAllTasks();
  const { department, status, assignedTo, urgency, dateFrom, dateTo } = req.query;

  if (req.session.user.role !== 'admin') {
    const userDept = req.session.user.department;
    tasks = tasks.filter(t => 
      (t.departmentLabel && t.departmentLabel === userDept) || 
      (t.assignedTo && t.assignedTo.includes(req.session.user.key))
    );
  }

  if (department && department !== 'all') {
    tasks = tasks.filter(t => t.departmentLabel && t.departmentLabel.toLowerCase() === department.toLowerCase());
  }

  if (status && status !== 'all') {
    // Handle 'open' vs 'closed' vs specific statuses
    if (status.toLowerCase() === 'open') {
      tasks = tasks.filter(t => t.status !== 'Completed');
    } else if (status.toLowerCase() === 'closed') {
      tasks = tasks.filter(t => t.status === 'Completed');
    } else {
      tasks = tasks.filter(t => t.status.toLowerCase() === status.toLowerCase());
    }
  }

  if (assignedTo && assignedTo !== 'all') {
    tasks = tasks.filter(t => t.assignedTo && t.assignedTo.includes(assignedTo));
  }

  if (urgency && urgency !== 'all') {
    tasks = tasks.filter(t => t.urgency && t.urgency.toLowerCase() === urgency.toLowerCase());
  }

  if (dateFrom) {
    tasks = tasks.filter(t => new Date(t.createdAt) >= new Date(dateFrom));
  }

  if (dateTo) {
    tasks = tasks.filter(t => new Date(t.createdAt) <= new Date(dateTo));
  }

  const summary = {
    total: tasks.length,
    pending: tasks.filter(t => t.status !== 'Completed').length,
    completed: tasks.filter(t => t.status === 'Completed').length,
    byDepartment: {},
    byStatus: {},
    byUser: {},
    rows: tasks.map(task => {
      // Find the first assignment (could be creation or reassignment)
      const assignedEntry = task.history ? task.history.find(h => h.action === 'Created' || h.status === 'Assigned' || (h.action === 'Status Updated' && h.status === 'Assigned')) : null;
      const assignedOn = assignedEntry ? new Date(assignedEntry.timestamp) : new Date(task.createdAt);

      // Find the first completion status
      const completedEntry = task.history ? task.history.find(h => h.status === 'Completed' || (h.action === 'Status Updated' && h.status === 'Completed')) : null;
      const completionDate = completedEntry ? new Date(completedEntry.timestamp) : null;
      
      let timeTaken = 'N/A';
      if (completionDate) {
        const diffMs = completionDate - assignedOn;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        timeTaken = `${diffDays}d ${diffHours}h`;
      }

      const lastAction = task.history && task.history.length > 0 ? task.history[task.history.length - 1] : null;
      const lastBrief = lastAction ? lastAction.remarks || lastAction.action : 'No action yet';

      return {
        id: task.id,
        title: task.title,
        description: task.description,
        assignedOn: assignedOn.toISOString(),
        assignedTo: task.assignedToLabels ? task.assignedToLabels.join(', ') : 'Unassigned',
        completedOn: completionDate ? completionDate.toISOString() : null,
        timeTaken: timeTaken,
        lastBrief: lastBrief
      };
    })
  };

  tasks.forEach(task => {
    const dept = task.departmentLabel || 'General';
    summary.byDepartment[dept] = (summary.byDepartment[dept] || 0) + 1;
    summary.byStatus[task.status] = (summary.byStatus[task.status] || 0) + 1;
    if (task.assignedToLabels) {
      task.assignedToLabels.forEach(user => {
        summary.byUser[user] = (summary.byUser[user] || 0) + 1;
      });
    } else {
      summary.byUser['Unassigned'] = (summary.byUser['Unassigned'] || 0) + 1;
    }
  });

  return res.json(summary);
});

module.exports = router;
