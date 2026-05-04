const { getAllTasks, updateTask } = require('./storage');
const { notifyDepartment, notifyReporter } = require('./notifications');

const staleThresholdMinutes = Number(process.env.ESCALATION_THRESHOLD_MINUTES) || 60;
const intervalMs = Number(process.env.TRACKER_INTERVAL_MS) || 60 * 1000;

function isStale(task) {
  const lastUpdate = new Date(task.updatedAt).getTime();
  const elapsedMinutes = (Date.now() - lastUpdate) / 60000;
  return elapsedMinutes >= staleThresholdMinutes;
}

function shouldAutoEscalate(task) {
  return ['Assigned', 'In Progress'].includes(task.status);
}

function escalateTask(task) {
  const now = new Date().toISOString();
  let update = {
    updatedAt: now,
    history: [
      ...task.history,
      {
        action: 'Auto-escalated',
        user: 'System',
        timestamp: now,
        remarks: `Task auto-escalated after ${staleThresholdMinutes} minutes without progress.`
      }
    ]
  };

  // For tasks, perhaps just log, or notify
  const updated = updateTask(task.id, update);
  if (updated) {
    // Notify assigned users or admin
    console.log(`[Tracker] Task ${task.id} auto-escalated.`);
  }
  return updated;
}

function scanAndEscalate() {
  const tasks = getAllTasks();
  const stale = tasks.filter(shouldAutoEscalate).filter(isStale);
  if (stale.length) {
    console.log(`[Tracker] Found ${stale.length} stale task(s).`);
  }
  return stale.map(escalateTask);
}

function startAutoEscalation() {
  console.log(`[Tracker] Starting auto-escalation every ${intervalMs}ms with stale threshold ${staleThresholdMinutes} minutes.`);
  setInterval(scanAndEscalate, intervalMs);
}

module.exports = {
  scanAndEscalate,
  startAutoEscalation
};
