const { getAllComplaints, updateComplaint } = require('./storage');
const { notifyDepartment, notifyReporter } = require('./notifications');

const staleThresholdMinutes = Number(process.env.ESCALATION_THRESHOLD_MINUTES) || 60;
const intervalMs = Number(process.env.TRACKER_INTERVAL_MS) || 60 * 1000;

function isStale(complaint) {
  const lastUpdate = new Date(complaint.updatedAt).getTime();
  const elapsedMinutes = (Date.now() - lastUpdate) / 60000;
  return elapsedMinutes >= staleThresholdMinutes;
}

function shouldAutoEscalate(complaint) {
  return complaint.urgency === 'urgent' && ['Received', 'In progress'].includes(complaint.status);
}

function escalateComplaint(complaint) {
  const now = new Date().toISOString();
  let update = {
    updatedAt: now,
    history: [
      ...complaint.history,
      {
        status: complaint.status === 'Received' ? 'In progress' : complaint.status,
        updatedAt: now,
        note: `Auto-escalated after ${staleThresholdMinutes} minutes without progress.`
      }
    ]
  };

  if (complaint.status === 'Received') {
    update.status = 'In progress';
  }

  const updated = updateComplaint(complaint.id, update);
  if (updated) {
    notifyDepartment(updated, 'Urgent complaint has been automatically escalated for immediate attention.');
    notifyReporter(updated, 'Your urgent complaint has been escalated to the department for faster handling.');
  }
  return updated;
}

function scanAndEscalate() {
  const complaints = getAllComplaints();
  const staleUrgent = complaints.filter(shouldAutoEscalate).filter(isStale);
  if (staleUrgent.length) {
    console.log(`[Tracker] Found ${staleUrgent.length} stale urgent complaint(s).`);
  }
  return staleUrgent.map(escalateComplaint);
}

function startAutoEscalation() {
  console.log(`[Tracker] Starting auto-escalation every ${intervalMs}ms with stale threshold ${staleThresholdMinutes} minutes.`);
  setInterval(scanAndEscalate, intervalMs);
}

module.exports = {
  scanAndEscalate,
  startAutoEscalation
};
