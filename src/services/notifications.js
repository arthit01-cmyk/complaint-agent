const fs = require('fs');
const path = require('path');

const logFile = path.resolve(__dirname, '../data/notifications.log');

function ensureLogDirectory() {
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
}

function logNotification(entry) {
  ensureLogDirectory();
  const timestamp = new Date().toISOString();
  const line = `${timestamp} | ${entry}\n`;
  fs.appendFileSync(logFile, line, 'utf8');
}

function notifyReporter(complaint, message) {
  const notification = {
    to: complaint.reporter.name,
    type: 'reporter',
    complaintId: complaint.id,
    message
  };
  console.log('[Notification] reporter:', notification);
  logNotification(JSON.stringify(notification));
  return notification;
}

function notifyDepartment(complaint, message) {
  const notification = {
    to: complaint.department,
    type: 'department',
    complaintId: complaint.id,
    message
  };
  console.log('[Notification] department:', notification);
  logNotification(JSON.stringify(notification));
  return notification;
}

module.exports = {
  notifyReporter,
  notifyDepartment
};
