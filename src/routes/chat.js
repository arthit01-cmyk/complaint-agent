/**
 * Rule-based NLP Chat Engine
 * No external API needed — keyword matching + SQLite queries + formatted responses.
 * Role-aware: admin sees all data; regular users see only their own assignments.
 */
const express = require('express');
const db = require('../services/db');

const router = express.Router();

// ── Quick action map ──────────────────────────────────────────────────────────
const QUICK_ACTIONS = {
  my_pending:      'Show my pending tasks',
  my_completed:    'Show my completed tasks',
  today_completed: 'How many tasks were completed today',
  dept_summary:    'Which department has the most pending work',
  high_urgency:    'Show high urgency pending tasks',
  summary:         'Give me an overall summary of all tasks'
};

// ── Intent detection ──────────────────────────────────────────────────────────
function detectIntent(q) {
  q = q.toLowerCase();

  if (/complet\w*\s+today|today.*complet\w*|finish\w*\s+today|done\s+today/.test(q))
    return 'completed_today';
  if (/today/.test(q) && /creat\w*|add\w*|new|open/.test(q))
    return 'created_today';
  if (/today/.test(q))
    return 'completed_today';

  if (/(high.?urgency|urgent|critical|emergency|top.?priority)/.test(q))
    return 'urgent_tasks';

  if (/(department|dept).*(summary|breakdown|most|which|count|how many|pending|work)/.test(q) ||
      /(summary|breakdown|most|which).*(department|dept)/.test(q))
    return 'dept_summary';

  if (/(my|mine|assigned.*\bme\b|\bme\b.*assigned).*(complet\w*|done|finish\w*)/.test(q) ||
      /(complet\w*|done|finish\w*).*(my|mine)/.test(q))
    return 'my_completed';

  if (/(my|mine|assigned.*\bme\b|\bme\b.*assigned).*(pending|open|not.*done|in.?progress|work)/.test(q) ||
      /(pending|open).*(my|mine)/.test(q))
    return 'my_pending';

  if (/\bmy\b.*task|\bmy\b.*work|\bmy\b.*assign|assigned.*\bme\b|\bmine\b/.test(q))
    return 'my_tasks';

  if (/in.?progress|currently\s+work|ongoing|active\s+task/.test(q))
    return 'in_progress';

  if (/\bpending\b|not\s+complet\w*|not\s+done|open\s+task|unfinish\w*|incomplet\w*/.test(q))
    return 'all_pending';

  if (/complet\w*|done\b|finish\w*|closed/.test(q))
    return 'all_completed';

  if (/department|dept/.test(q))
    return 'dept_summary';

  if (/histor\w*|log\b|activit\w*|recent\b|latest\b|last\b/.test(q))
    return 'recent_history';

  if (/summary|overview|overall|statistic|how many|total|count|report/.test(q))
    return 'summary';

  return 'summary';
}

// ── Formatting helpers ────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return iso; }
}

function taskLine(t) {
  const dept = t.department_label || t.dept || '';
  const parts = [`• ${t.title}`];
  if (t.urgency)  parts.push(`[${t.urgency}]`);
  if (dept)       parts.push(`| ${dept}`);
  if (t.status)   parts.push(`| ${t.status}`);
  if (t.created_at) parts.push(`| Created: ${fmtDate(t.created_at)}`);
  return parts.join(' ');
}

function noResults(context) {
  return `No ${context} found. Try a different query or check the Reports section for full analytics.`;
}

// ── Intent handlers ───────────────────────────────────────────────────────────

function handleSummary(user) {
  const isAdmin = user.role === 'admin';

  if (isAdmin) {
    const t = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'Assigned'    THEN 1 ELSE 0 END) as assigned,
        SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status = 'Completed'   THEN 1 ELSE 0 END) as completed
      FROM tasks
    `).get();

    const byDept = db.prepare(`
      SELECT department_label as dept,
             COUNT(*) as total,
             SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completed
      FROM tasks
      GROUP BY department_label
      ORDER BY total DESC
    `).all();

    let reply = `Overall Task Summary (as of ${new Date().toLocaleDateString('en-IN')})\n\n`;
    reply += `Total tasks : ${t.total}\n`;
    reply += `Assigned    : ${t.assigned}\n`;
    reply += `In Progress : ${t.in_progress}\n`;
    reply += `Completed   : ${t.completed}\n`;

    if (byDept.length) {
      reply += `\nBy Department:\n`;
      byDept.forEach(d => {
        reply += `• ${d.dept || 'Unassigned'}: ${d.total} tasks (${d.completed} completed)\n`;
      });
    }
    return reply;
  } else {
    const t = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN ta.status = 'Assigned'    THEN 1 ELSE 0 END) as assigned,
        SUM(CASE WHEN ta.status = 'In Progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN ta.status = 'Completed'   THEN 1 ELSE 0 END) as completed
      FROM task_assignments ta
      WHERE ta.user_id = ?
    `).get(user.key);

    let reply = `Your Task Summary\n\n`;
    reply += `Total assigned to you : ${t.total}\n`;
    reply += `Assigned (not started): ${t.assigned}\n`;
    reply += `In Progress           : ${t.in_progress}\n`;
    reply += `Completed             : ${t.completed}\n`;
    return reply;
  }
}

function handleMyPending(user) {
  const isAdmin = user.role === 'admin';

  if (isAdmin) {
    const rows = db.prepare(`
      SELECT t.title, t.urgency, t.status, t.department_label, t.created_at
      FROM tasks t
      WHERE t.status IN ('Assigned', 'In Progress')
      ORDER BY t.created_at DESC
      LIMIT 30
    `).all();
    if (!rows.length) return noResults('pending tasks');
    return `Pending Tasks (${rows.length} found):\n\n` + rows.map(taskLine).join('\n');
  } else {
    const rows = db.prepare(`
      SELECT t.title, t.urgency, t.department_label, ta.status, ta.assigned_at as created_at
      FROM task_assignments ta
      JOIN tasks t ON t.id = ta.task_id
      WHERE ta.user_id = ? AND ta.status IN ('Assigned', 'In Progress')
      ORDER BY ta.assigned_at DESC
      LIMIT 30
    `).all(user.key);
    if (!rows.length) return 'You have no pending tasks right now. Great work!';
    return `Your Pending Tasks (${rows.length} found):\n\n` + rows.map(taskLine).join('\n');
  }
}

function handleMyCompleted(user) {
  const isAdmin = user.role === 'admin';

  if (isAdmin) {
    const rows = db.prepare(`
      SELECT t.title, t.urgency, t.department_label, t.updated_at as created_at
      FROM tasks t
      WHERE t.status = 'Completed'
      ORDER BY t.updated_at DESC
      LIMIT 30
    `).all();
    if (!rows.length) return noResults('completed tasks');
    return `Completed Tasks (${rows.length} found):\n\n` + rows.map(r => `• ${r.title} | ${r.department_label || ''} | Done: ${fmtDate(r.created_at)}`).join('\n');
  } else {
    const rows = db.prepare(`
      SELECT t.title, t.urgency, t.department_label, ta.completed_at as created_at
      FROM task_assignments ta
      JOIN tasks t ON t.id = ta.task_id
      WHERE ta.user_id = ? AND ta.status = 'Completed'
      ORDER BY ta.completed_at DESC
      LIMIT 30
    `).all(user.key);
    if (!rows.length) return 'You have no completed tasks yet.';
    return `Your Completed Tasks (${rows.length} found):\n\n` + rows.map(r => `• ${r.title} | ${r.department_label || ''} | Done: ${fmtDate(r.created_at)}`).join('\n');
  }
}

function handleMyTasks(user) {
  const isAdmin = user.role === 'admin';

  if (isAdmin) {
    return handleSummary(user);
  } else {
    const rows = db.prepare(`
      SELECT t.title, t.urgency, t.department_label, ta.status, ta.assigned_at as created_at
      FROM task_assignments ta
      JOIN tasks t ON t.id = ta.task_id
      WHERE ta.user_id = ?
      ORDER BY ta.assigned_at DESC
      LIMIT 30
    `).all(user.key);
    if (!rows.length) return 'You have no tasks assigned to you currently.';
    return `All Your Tasks (${rows.length}):\n\n` + rows.map(taskLine).join('\n');
  }
}

function handleInProgress(user) {
  const isAdmin = user.role === 'admin';

  if (isAdmin) {
    const rows = db.prepare(`
      SELECT t.title, t.urgency, t.department_label, t.created_at
      FROM tasks t WHERE t.status = 'In Progress'
      ORDER BY t.created_at DESC LIMIT 30
    `).all();
    if (!rows.length) return 'No tasks are currently in progress.';
    return `In Progress Tasks (${rows.length}):\n\n` + rows.map(taskLine).join('\n');
  } else {
    const rows = db.prepare(`
      SELECT t.title, t.urgency, t.department_label, ta.status, ta.assigned_at as created_at
      FROM task_assignments ta
      JOIN tasks t ON t.id = ta.task_id
      WHERE ta.user_id = ? AND ta.status = 'In Progress'
      ORDER BY ta.assigned_at DESC LIMIT 30
    `).all(user.key);
    if (!rows.length) return 'You have no tasks currently in progress.';
    return `Your In Progress Tasks (${rows.length}):\n\n` + rows.map(taskLine).join('\n');
  }
}

function handleAllPending(user) {
  const isAdmin = user.role === 'admin';

  if (isAdmin) {
    const rows = db.prepare(`
      SELECT t.title, t.urgency, t.status, t.department_label, t.created_at
      FROM tasks t WHERE t.status IN ('Assigned', 'In Progress')
      ORDER BY t.created_at DESC LIMIT 30
    `).all();
    if (!rows.length) return 'No pending tasks found.';
    return `All Pending Tasks (${rows.length}):\n\n` + rows.map(taskLine).join('\n');
  } else {
    return handleMyPending(user);
  }
}

function handleAllCompleted(user) {
  const isAdmin = user.role === 'admin';

  if (isAdmin) {
    const rows = db.prepare(`
      SELECT t.title, t.urgency, t.department_label, t.updated_at
      FROM tasks t WHERE t.status = 'Completed'
      ORDER BY t.updated_at DESC LIMIT 30
    `).all();
    if (!rows.length) return 'No completed tasks found.';
    return `Completed Tasks (${rows.length}):\n\n` + rows.map(r => `• ${r.title} | ${r.department_label || ''} | Done: ${fmtDate(r.updated_at)}`).join('\n');
  } else {
    return handleMyCompleted(user);
  }
}

function handleCompletedToday(user) {
  const isAdmin = user.role === 'admin';

  if (isAdmin) {
    const count = db.prepare(`
      SELECT COUNT(*) as cnt FROM tasks
      WHERE status = 'Completed' AND date(updated_at) = date('now')
    `).get();
    const rows = db.prepare(`
      SELECT t.title, t.department_label
      FROM tasks t
      WHERE t.status = 'Completed' AND date(t.updated_at) = date('now')
      ORDER BY t.updated_at DESC LIMIT 20
    `).all();
    if (!count.cnt) return 'No tasks were completed today.';
    let reply = `${count.cnt} task(s) completed today:\n\n`;
    reply += rows.map(r => `• ${r.title} | ${r.department_label || ''}`).join('\n');
    return reply;
  } else {
    const rows = db.prepare(`
      SELECT t.title, t.department_label, ta.completed_at
      FROM task_assignments ta
      JOIN tasks t ON t.id = ta.task_id
      WHERE ta.user_id = ? AND ta.status = 'Completed' AND date(ta.completed_at) = date('now')
      ORDER BY ta.completed_at DESC LIMIT 20
    `).all(user.key);
    if (!rows.length) return 'You have not completed any tasks today.';
    return `You completed ${rows.length} task(s) today:\n\n` + rows.map(r => `• ${r.title} | ${r.department_label || ''}`).join('\n');
  }
}

function handleCreatedToday(user) {
  const isAdmin = user.role === 'admin';

  if (isAdmin) {
    const rows = db.prepare(`
      SELECT title, urgency, status, department_label, created_at
      FROM tasks WHERE date(created_at) = date('now')
      ORDER BY created_at DESC LIMIT 20
    `).all();
    if (!rows.length) return 'No new tasks were created today.';
    return `Tasks created today (${rows.length}):\n\n` + rows.map(taskLine).join('\n');
  } else {
    const rows = db.prepare(`
      SELECT t.title, t.urgency, t.department_label, ta.status, ta.assigned_at as created_at
      FROM task_assignments ta
      JOIN tasks t ON t.id = ta.task_id
      WHERE ta.user_id = ? AND date(ta.assigned_at) = date('now')
      ORDER BY ta.assigned_at DESC LIMIT 20
    `).all(user.key);
    if (!rows.length) return 'No tasks were assigned to you today.';
    return `Tasks assigned to you today (${rows.length}):\n\n` + rows.map(taskLine).join('\n');
  }
}

function handleDeptSummary(user) {
  if (user.role !== 'admin') {
    return 'Department summary is only available to administrators.';
  }
  const rows = db.prepare(`
    SELECT
      department_label as dept,
      COUNT(*) as total,
      SUM(CASE WHEN status = 'Assigned'    THEN 1 ELSE 0 END) as assigned,
      SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN status = 'Completed'   THEN 1 ELSE 0 END) as completed
    FROM tasks
    GROUP BY department_label
    ORDER BY (assigned + in_progress) DESC
  `).all();
  if (!rows.length) return 'No department data found.';
  let reply = `Department-wise Task Breakdown:\n\n`;
  rows.forEach(d => {
    const pending = d.assigned + d.in_progress;
    reply += `• ${d.dept || 'Unassigned'}: ${d.total} total | ${pending} pending | ${d.completed} completed\n`;
  });
  return reply;
}

function handleUrgentTasks(user) {
  const isAdmin = user.role === 'admin';

  if (isAdmin) {
    const rows = db.prepare(`
      SELECT title, urgency, status, department_label, created_at
      FROM tasks
      WHERE status IN ('Assigned', 'In Progress')
      ORDER BY
        CASE WHEN lower(urgency) IN ('high','critical','urgent','emergency') THEN 0 ELSE 1 END,
        created_at ASC
      LIMIT 20
    `).all();
    if (!rows.length) return 'No urgent pending tasks found.';
    return `High Urgency Pending Tasks (${rows.length}):\n\n` + rows.map(taskLine).join('\n');
  } else {
    const rows = db.prepare(`
      SELECT t.title, t.urgency, t.department_label, ta.status, ta.assigned_at as created_at
      FROM task_assignments ta
      JOIN tasks t ON t.id = ta.task_id
      WHERE ta.user_id = ? AND ta.status IN ('Assigned', 'In Progress')
      ORDER BY
        CASE WHEN lower(t.urgency) IN ('high','critical','urgent','emergency') THEN 0 ELSE 1 END,
        ta.assigned_at ASC
      LIMIT 20
    `).all(user.key);
    if (!rows.length) return 'You have no urgent pending tasks.';
    return `Your Urgent Pending Tasks (${rows.length}):\n\n` + rows.map(taskLine).join('\n');
  }
}

function handleRecentHistory(user) {
  const isAdmin = user.role === 'admin';

  if (isAdmin) {
    const rows = db.prepare(`
      SELECT th.action, th.user_name, th.target_user, th.status, th.timestamp, t.title
      FROM task_history th
      JOIN tasks t ON t.id = th.task_id
      ORDER BY th.timestamp DESC LIMIT 15
    `).all();
    if (!rows.length) return 'No recent activity found.';
    let reply = `Recent Activity (last ${rows.length} actions):\n\n`;
    rows.forEach(r => {
      reply += `• [${fmtDate(r.timestamp)}] ${r.action} on "${r.title}"`;
      if (r.user_name) reply += ` by ${r.user_name}`;
      if (r.status)    reply += ` → ${r.status}`;
      reply += '\n';
    });
    return reply;
  } else {
    const rows = db.prepare(`
      SELECT th.action, th.user_name, th.status, th.timestamp, t.title
      FROM task_history th
      JOIN tasks t ON t.id = th.task_id
      JOIN task_assignments ta ON ta.task_id = th.task_id AND ta.user_id = ?
      ORDER BY th.timestamp DESC LIMIT 15
    `).all(user.key);
    if (!rows.length) return 'No recent activity found for your tasks.';
    let reply = `Recent Activity on Your Tasks:\n\n`;
    rows.forEach(r => {
      reply += `• [${fmtDate(r.timestamp)}] ${r.action} on "${r.title}" → ${r.status || ''}\n`;
    });
    return reply;
  }
}

// ── Intent router ─────────────────────────────────────────────────────────────
function processQuery(query, user) {
  const intent = detectIntent(query);
  switch (intent) {
    case 'summary':         return handleSummary(user);
    case 'my_pending':      return handleMyPending(user);
    case 'my_completed':    return handleMyCompleted(user);
    case 'my_tasks':        return handleMyTasks(user);
    case 'in_progress':     return handleInProgress(user);
    case 'all_pending':     return handleAllPending(user);
    case 'all_completed':   return handleAllCompleted(user);
    case 'completed_today': return handleCompletedToday(user);
    case 'created_today':   return handleCreatedToday(user);
    case 'dept_summary':    return handleDeptSummary(user);
    case 'urgent_tasks':    return handleUrgentTasks(user);
    case 'recent_history':  return handleRecentHistory(user);
    default:                return handleSummary(user);
  }
}

// ── Main chat handler ─────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ reply: 'Please log in to use the assistant.' });
  }

  const user = req.session.user;
  let { query, quickAction } = req.body;

  if (quickAction && QUICK_ACTIONS[quickAction]) {
    query = QUICK_ACTIONS[quickAction];
  }

  if (!query || !query.trim()) {
    return res.status(400).json({ reply: 'Please type a question.' });
  }

  try {
    const reply = processQuery(query.trim(), user);
    return res.json({ reply });
  } catch (err) {
    console.error('[Chat] Query error:', err.message);
    return res.status(500).json({ reply: 'Sorry, an error occurred while processing your query. Please try again.' });
  }
});

// ── Quick actions metadata (used by frontend) ─────────────────────────────────
router.get('/quick-actions', (req, res) => {
  res.json([
    { id: 'my_pending',      label: '📋 My Pending Tasks' },
    { id: 'my_completed',    label: '✅ My Completed Tasks' },
    { id: 'today_completed', label: '📅 Completed Today' },
    { id: 'dept_summary',    label: '🏢 Department Summary' },
    { id: 'high_urgency',    label: '🔴 High Urgency Pending' },
    { id: 'summary',         label: '📊 Overall Summary' }
  ]);
});

module.exports = router;
