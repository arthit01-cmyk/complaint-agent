const express = require('express');
const { getAllTasks } = require('../services/storage');

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Authentication required. Please log in again.' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Authentication required. Please log in again.' });
  if (req.session.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
  next();
}

// Check if all assignments are completed
function isFullyCompleted(task) {
  if (task.assignments && task.assignments.length > 0) {
    return task.assignments.every(a => a.status === 'Completed');
  }
  return task.status === 'Completed';
}

// Check if some but not all assignments are completed
function isPartiallyCompleted(task) {
  if (task.assignments && task.assignments.length > 0) {
    const doneCount = task.assignments.filter(a => a.status === 'Completed').length;
    return doneCount > 0 && doneCount < task.assignments.length;
  }
  return false;
}

// Check if no assignments started
function isPending(task) {
  if (task.assignments && task.assignments.length > 0) {
    return task.assignments.every(a => a.status === 'Assigned');
  }
  return task.status === 'Assigned';
}

// Completion percentage for a task
function completionPercent(task) {
  if (!task.assignments || task.assignments.length === 0) {
    return task.status === 'Completed' ? 100 : 0;
  }
  const done = task.assignments.filter(a => a.status === 'Completed').length;
  return Math.round((done / task.assignments.length) * 100);
}

router.get('/summary', requireAuth, (req, res) => {
  let tasks = getAllTasks();
  const isAdmin = req.session.user.role === 'admin';

  // Non-admins only see their tasks
  if (!isAdmin) {
    const userKey = req.session.user.key;
    tasks = tasks.filter(t =>
      (t.assignments && t.assignments.some(a => a.userId === userKey)) ||
      (t.assignedTo && t.assignedTo.includes(userKey))
    );
  }

  const { department, status, assignedTo, urgency, dateFrom, dateTo } = req.query;

  if (department && department !== 'all') {
    tasks = tasks.filter(t => t.departmentLabel && t.departmentLabel.toLowerCase() === department.toLowerCase());
  }

  if (status && status !== 'all') {
    if (status.toLowerCase() === 'open') {
      tasks = tasks.filter(t => !isFullyCompleted(t));
    } else if (status.toLowerCase() === 'closed') {
      tasks = tasks.filter(t => isFullyCompleted(t));
    } else if (status.toLowerCase() === 'partial') {
      tasks = tasks.filter(t => isPartiallyCompleted(t));
    } else {
      tasks = tasks.filter(t => t.status.toLowerCase() === status.toLowerCase());
    }
  }

  if (assignedTo && assignedTo !== 'all') {
    tasks = tasks.filter(t =>
      (t.assignments && t.assignments.some(a => a.userId === assignedTo)) ||
      (t.assignedTo && t.assignedTo.includes(assignedTo))
    );
  }

  if (urgency && urgency !== 'all') {
    tasks = tasks.filter(t => t.urgency && t.urgency.toLowerCase() === urgency.toLowerCase());
  }

  if (dateFrom) tasks = tasks.filter(t => new Date(t.createdAt) >= new Date(dateFrom));
  if (dateTo) tasks = tasks.filter(t => new Date(t.createdAt) <= new Date(dateTo + 'T23:59:59'));

  const fullyCompleted = tasks.filter(isFullyCompleted).length;
  const partiallyCompleted = tasks.filter(isPartiallyCompleted).length;
  const pending = tasks.filter(isPending).length;

  const summary = {
    total: tasks.length,
    pending,
    inProgress: tasks.length - fullyCompleted - pending,
    partiallyCompleted,
    fullyCompleted,
    byDepartment: {},
    byStatus: {},
    byUser: {},
    rows: tasks.map(task => {
      const assignedOn = new Date(task.createdAt);

      // Find earliest completion date when all done
      let completionDate = null;
      if (isFullyCompleted(task)) {
        if (task.assignments && task.assignments.length > 0) {
          const dates = task.assignments.map(a => a.completedAt).filter(Boolean);
          if (dates.length > 0) completionDate = new Date(Math.max(...dates.map(d => new Date(d))));
        } else {
          const completedEntry = (task.history || []).find(h => h.status === 'Completed');
          if (completedEntry) completionDate = new Date(completedEntry.timestamp);
        }
      }

      let timeTaken = 'N/A';
      if (completionDate) {
        const diffMs = completionDate - assignedOn;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        timeTaken = `${diffDays}d ${diffHours}h`;
      }

      const lastAction = (task.history || []).slice(-1)[0];
      const lastBrief = lastAction ? (lastAction.remarks || lastAction.action) : 'No action yet';

      // Per-assignment breakdown for report rows
      const assignmentBreakdown = (task.assignments || []).map(a => ({
        userName: a.userName,
        status: a.status,
        completedAt: a.completedAt
      }));

      const pct = completionPercent(task);

      return {
        id: task.id,
        title: task.title,
        description: task.description,
        urgency: task.urgency || 'N/A',
        departmentLabel: task.departmentLabel || 'General',
        status: task.status,
        assignedOn: assignedOn.toISOString(),
        assignedTo: task.assignedToLabels ? task.assignedToLabels.join(', ') : 'Unassigned',
        completedOn: completionDate ? completionDate.toISOString() : null,
        timeTaken,
        lastBrief,
        completionPercent: pct,
        assignmentBreakdown,
        isPartial: isPartiallyCompleted(task),
        isFullyCompleted: isFullyCompleted(task)
      };
    })
  };

  tasks.forEach(task => {
    const dept = task.departmentLabel || 'General';
    summary.byDepartment[dept] = (summary.byDepartment[dept] || 0) + 1;
    summary.byStatus[task.status] = (summary.byStatus[task.status] || 0) + 1;
    (task.assignedToLabels || []).forEach(uname => {
      summary.byUser[uname] = (summary.byUser[uname] || 0) + 1;
    });
  });

  return res.json(summary);
});

module.exports = router;
