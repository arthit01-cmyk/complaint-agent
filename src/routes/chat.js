/**
 * Chat route — powered by local Ollama (llama3.2:1b on localhost:11434).
 *
 * Pipeline:
 *   1. Pull a live data snapshot from SQLite (scoped by user role)
 *   2. Format the snapshot into a compact system prompt
 *   3. POST to Ollama /api/chat with the snapshot + user query
 *   4. Return Ollama's response text
 *
 * No external APIs, no new npm packages — uses Node's built-in `http`.
 */

const express = require('express');
const http    = require('http');
const db      = require('../services/db');

const router = express.Router();

const OLLAMA_HOST  = 'localhost';
const OLLAMA_PORT  = 11434;
const OLLAMA_MODEL = 'llama3.2:1b';

// ─────────────────────────────────────────────────────────────────────────────
// OLLAMA CALL
// ─────────────────────────────────────────────────────────────────────────────
function ollamaChat(systemPrompt, userMessage) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model:    OLLAMA_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage  }
      ],
      stream:  false,
      options: {
        temperature: 0.1,   // low = factual, not creative
        num_ctx:     4096   // enough headroom; keeps response fast on 1b
      }
    });

    const opts = {
      hostname: OLLAMA_HOST,
      port:     OLLAMA_PORT,
      path:     '/api/chat',
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 120_000   // 2 min — small model is fast but give headroom
    };

    const req = http.request(opts, res => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          resolve(json.message?.content?.trim() || '(no response from model)');
        } catch {
          reject(new Error('Could not parse Ollama response'));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Ollama request timed out'));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// LIVE DATA SNAPSHOT FROM SQLITE
// ─────────────────────────────────────────────────────────────────────────────
function fetchSnapshot(user) {
  const isAdmin = user.role === 'admin';

  // ── Overall counts ──────────────────────────────────────────────────────
  // 'Pending Review' is a sub-state of in-progress — count it there
  const counts = isAdmin
    ? db.prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'Assigned'                          THEN 1 ELSE 0 END) AS assigned,
          SUM(CASE WHEN status IN ('In Progress','Pending Review')   THEN 1 ELSE 0 END) AS in_progress,
          SUM(CASE WHEN status = 'Completed'                         THEN 1 ELSE 0 END) AS completed
        FROM tasks`).get()
    : db.prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'Assigned'                          THEN 1 ELSE 0 END) AS assigned,
          SUM(CASE WHEN status IN ('In Progress','Pending Review')   THEN 1 ELSE 0 END) AS in_progress,
          SUM(CASE WHEN status = 'Completed'                         THEN 1 ELSE 0 END) AS completed
        FROM task_assignments
        WHERE user_id = ?`).get(user.key);

  // ── Tasks completed today ───────────────────────────────────────────────
  const doneToday = isAdmin
    ? db.prepare(`
        SELECT t.title, t.department_label, t.urgency,
               GROUP_CONCAT(ta.user_name, ', ') AS completed_by,
               MAX(ta.completed_at)             AS completed_at
        FROM tasks t
        LEFT JOIN task_assignments ta ON ta.task_id = t.id AND ta.status = 'Completed'
        WHERE t.status = 'Completed'
          AND date(t.updated_at) = date('now')
        GROUP BY t.id, t.title, t.department_label, t.urgency
        ORDER BY completed_at DESC LIMIT 15`).all()
    : db.prepare(`
        SELECT t.title, t.department_label, t.urgency,
               ta.user_name AS completed_by, ta.completed_at
        FROM task_assignments ta
        JOIN tasks t ON t.id = ta.task_id
        WHERE ta.user_id = ?
          AND ta.status = 'Completed'
          AND date(ta.completed_at) = date('now')
        ORDER BY ta.completed_at DESC LIMIT 15`).all(user.key);

  // ── Pending tasks (assigned + in-progress + pending review) ────────────
  const pending = isAdmin
    ? db.prepare(`
        SELECT title, urgency, status, department_label
        FROM tasks
        WHERE status IN ('Assigned', 'In Progress', 'Pending Review')
        ORDER BY
          CASE WHEN lower(urgency) IN ('urgent','high','critical','emergency') THEN 0 ELSE 1 END,
          created_at ASC
        LIMIT 25`).all()
    : db.prepare(`
        SELECT t.title, t.urgency, ta.status, t.department_label
        FROM task_assignments ta
        JOIN tasks t ON t.id = ta.task_id
        WHERE ta.user_id = ?
          AND ta.status IN ('Assigned', 'In Progress', 'Pending Review')
        ORDER BY
          CASE WHEN lower(t.urgency) IN ('urgent','high','critical','emergency') THEN 0 ELSE 1 END,
          ta.assigned_at ASC
        LIMIT 25`).all(user.key);

  // ── Completed tasks (recent 20, full detail) ────────────────────────────
  const completed = isAdmin
    ? db.prepare(`
        SELECT t.title, t.department_label, t.urgency,
               GROUP_CONCAT(ta.user_name, ', ') AS completed_by,
               MAX(ta.completed_at)             AS completed_at
        FROM tasks t
        LEFT JOIN task_assignments ta ON ta.task_id = t.id AND ta.status = 'Completed'
        WHERE t.status = 'Completed'
        GROUP BY t.id, t.title, t.department_label, t.urgency
        ORDER BY completed_at DESC LIMIT 20`).all()
    : db.prepare(`
        SELECT t.title, t.department_label, t.urgency,
               ta.user_name AS completed_by, ta.completed_at
        FROM task_assignments ta
        JOIN tasks t ON t.id = ta.task_id
        WHERE ta.user_id = ? AND ta.status = 'Completed'
        ORDER BY ta.completed_at DESC LIMIT 20`).all(user.key);

  // ── Department breakdown (admin only) ───────────────────────────────────
  const depts = isAdmin
    ? db.prepare(`
        SELECT
          department_label                                                              AS name,
          COUNT(*)                                                                      AS total,
          SUM(CASE WHEN status = 'Assigned'                          THEN 1 ELSE 0 END) AS assigned,
          SUM(CASE WHEN status IN ('In Progress','Pending Review')   THEN 1 ELSE 0 END) AS in_progress,
          SUM(CASE WHEN status = 'Completed'                         THEN 1 ELSE 0 END) AS completed
        FROM tasks
        GROUP BY department_label
        ORDER BY total DESC`).all()
    : [];

  // ── User-wise breakdown (admin only) ────────────────────────────────────
  const users = isAdmin
    ? db.prepare(`
        SELECT
          ta.user_name                                                                  AS name,
          COUNT(*)                                                                      AS total,
          SUM(CASE WHEN ta.status = 'Assigned'                          THEN 1 ELSE 0 END) AS assigned,
          SUM(CASE WHEN ta.status IN ('In Progress','Pending Review')   THEN 1 ELSE 0 END) AS in_progress,
          SUM(CASE WHEN ta.status = 'Completed'                         THEN 1 ELSE 0 END) AS completed
        FROM task_assignments ta
        GROUP BY ta.user_id, ta.user_name
        ORDER BY total DESC`).all()
    : [];

  // ── Per-assignee detail for pending tasks (admin: all; staff: own) ──────
  const assigneeDetails = isAdmin
    ? db.prepare(`
        SELECT t.title, ta.user_name, ta.status AS assignee_status
        FROM task_assignments ta
        JOIN tasks t ON t.id = ta.task_id
        WHERE t.status IN ('Assigned', 'In Progress', 'Pending Review')
        ORDER BY t.title, ta.user_name`).all()
    : db.prepare(`
        SELECT t.title, ta.user_name, ta.status AS assignee_status
        FROM task_assignments ta
        JOIN tasks t ON t.id = ta.task_id
        WHERE t.status IN ('Assigned', 'In Progress', 'Pending Review')
          AND t.id IN (
            SELECT task_id FROM task_assignments WHERE user_id = ?
          )
        ORDER BY t.title, ta.user_name`).all(user.key);

  // Group assignee details by task title
  const assigneeMap = {};
  for (const row of assigneeDetails) {
    if (!assigneeMap[row.title]) assigneeMap[row.title] = [];
    assigneeMap[row.title].push(`${row.user_name} (${row.assignee_status})`);
  }

  // ── Full per-user task list (admin only) ────────────────────────────────
  // Gives the LLM a direct per-person view so it can answer "what's pending with X"
  const allUserTasks = isAdmin
    ? db.prepare(`
        SELECT ta.user_name, t.title, ta.status AS assignee_status
        FROM task_assignments ta
        JOIN tasks t ON t.id = ta.task_id
        ORDER BY ta.user_name, ta.status, t.title`).all()
    : [];

  // Build a map: userName → { pending: [...], completed: [...] }
  const userTaskMap = {};
  for (const row of allUserTasks) {
    if (!userTaskMap[row.user_name]) userTaskMap[row.user_name] = { pending: [], completed: [] };
    const isPending = ['Assigned', 'In Progress', 'Pending Review'].includes(row.assignee_status);
    if (isPending) {
      userTaskMap[row.user_name].pending.push(`"${row.title}" (${row.assignee_status})`);
    } else {
      userTaskMap[row.user_name].completed.push(`"${row.title}"`);
    }
  }

  return { counts, doneToday, pending, completed, depts, users, isAdmin, assigneeMap, userTaskMap };
}

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPT
// ─────────────────────────────────────────────────────────────────────────────
function buildSystemPrompt(user, snap) {
  const { counts, doneToday, pending, completed, depts, users, isAdmin, assigneeMap, userTaskMap } = snap;
  const todayStr     = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const totalPending = (counts.assigned || 0) + (counts.in_progress || 0);

  const or = (v, fb = 'Not specified') => v || fb;
  const none = arr => arr.length ? arr : null;

  // ── Plain-English data sections ──────────────────────────────────────────

  const summaryText =
    `There are ${counts.total || 0} tasks in total. ` +
    `${counts.assigned || 0} are assigned (not started), ` +
    `${counts.in_progress || 0} are in progress, and ` +
    `${counts.completed || 0} have been completed. ` +
    `Overall ${totalPending} tasks are still pending.`;

  const pendingText = none(pending)
    ? pending.map((t, i) => {
        const assignees = assigneeMap[t.title];
        const assigneeStr = assignees && assignees.length
          ? `Assignees: ${assignees.join(', ')}`
          : '';
        return `${i + 1}. "${t.title}" — Overall Status: ${t.status}, Urgency: ${or(t.urgency, 'None')}, Department: ${or(t.department_label, 'Not assigned')}${assigneeStr ? '; ' + assigneeStr : ''}`;
      }).join('\n')
    : 'No pending tasks at the moment.';

  const fmtDate = iso => {
    if (!iso) return 'Unknown date';
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const completedText = none(completed)
    ? completed.map((t, i) =>
        `${i + 1}. "${t.title}" — Completed by: ${or(t.completed_by, 'Unknown')}, Department: ${or(t.department_label, 'Not assigned')}, Urgency: ${or(t.urgency, 'None')}, Date: ${fmtDate(t.completed_at)}`
      ).join('\n')
    : 'No completed tasks on record.';

  const doneTodayText = none(doneToday)
    ? doneToday.map((t, i) =>
        `${i + 1}. "${t.title}" — Completed by: ${or(t.completed_by, 'Unknown')}, Department: ${or(t.department_label, 'Not assigned')}, Urgency: ${or(t.urgency, 'None')}`
      ).join('\n')
    : 'No tasks were completed today.';

  const deptText = none(depts)
    ? depts.map((d, i) => {
        const p = (d.assigned || 0) + (d.in_progress || 0);
        return `${i + 1}. ${or(d.name, 'Unassigned')} — ${d.total} total, ${p} pending, ${d.completed} completed`;
      }).join('\n')
    : 'No department data available.';

  const userText = none(users)
    ? users.map((u, i) => {
        const p = (u.assigned || 0) + (u.in_progress || 0);
        return `${i + 1}. ${u.name} — ${u.total} tasks total, ${p} pending, ${u.completed} completed`;
      }).join('\n')
    : 'No user assignment data available.';

  // Per-user detailed task list (admin only) — critical for "pending with X" queries
  const perUserTaskText = Object.keys(userTaskMap).length
    ? Object.entries(userTaskMap).map(([name, data]) => {
        const pendingList  = data.pending.length  ? data.pending.join(', ')  : 'None';
        const completedList = data.completed.length ? data.completed.join(', ') : 'None';
        return `${name}: Pending — ${pendingList} | Completed — ${completedList}`;
      }).join('\n')
    : 'No data available.';

  // ── Prompt ───────────────────────────────────────────────────────────────
  return `You are a friendly and helpful task management assistant for the e-Desk Monitor system.
Today's date is ${todayStr}. You are talking to ${user.name}, who is ${isAdmin ? 'an administrator' : 'a staff member'}.

Your job is to answer questions about the task data provided below in a clear, conversational way — exactly like a helpful colleague would explain it. Never output SQL, code, JSON, or any technical syntax. Always reply in plain English sentences or simple bullet points.

--- CURRENT TASK DATA ---

OVERALL SUMMARY:
${summaryText}

TASKS COMPLETED TODAY:
${doneTodayText}

PENDING TASKS (most urgent first):
${pendingText}

RECENTLY COMPLETED TASKS:
${completedText}
${isAdmin ? `\nDEPARTMENT-WISE BREAKDOWN:\n${deptText}\n\nUSER-WISE BREAKDOWN (counts):\n${userText}\n\nPER-USER TASK DETAILS (use this to answer "what is pending with X" or "X's tasks"):\n${perUserTaskText}` : ''}
--- END OF DATA ---

HOW TO RESPOND:
- Use the data above to answer questions accurately. Do not make up any figures or task names.
- Write in plain, friendly English. No SQL, no code, no JSON — just natural sentences.
- Use numbered or bullet lists when listing multiple items.
- A task can have multiple assignees. The "Overall Status" reflects the combined state. If a task shows "In Progress" it means at least one assignee hasn't finished yet — use the "Assignees" detail to explain individual progress (e.g. "Deepak has completed his part, but Test User's portion is still Assigned").
- "Pending Review" is a stage between In Progress and Completed. Treat it as still-pending when asked about open work.
- If a question is unclear or incomplete, politely ask the user to clarify. For example: "Could you clarify what you mean by that? Are you asking about pending tasks, completed tasks, or something else?"
- If someone asks something unrelated to tasks (weather, general knowledge, coding help, etc.), gently say: "I'm here to help with task management queries only. You can ask me things like how many tasks are pending, which tasks are urgent, or a department summary."
- If you don't have enough data to answer, say so honestly and suggest what the user could ask instead.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// RESPONSE SANITISER
// Strips code fences / SQL blocks that small models occasionally emit.
// If the response is entirely technical gibberish, return a helpful fallback.
// ─────────────────────────────────────────────────────────────────────────────
const SQL_KEYWORDS = /\b(SELECT|FROM|WHERE|JOIN|INSERT|UPDATE|DELETE|GROUP BY|ORDER BY|HAVING|LIMIT|COUNT|SUM|CASE|WHEN|THEN|END)\b/gi;

function sanitizeReply(text, originalQuery) {
  if (!text || !text.trim()) {
    return fallbackReply(originalQuery);
  }

  // Remove markdown code fences (```sql ... ``` or ``` ... ```)
  let cleaned = text.replace(/```[\s\S]*?```/g, '').trim();

  // If the remaining text is heavily SQL (more than 3 SQL keywords) treat it as a bad response
  const sqlMatches = (cleaned.match(SQL_KEYWORDS) || []).length;
  if (sqlMatches >= 3) {
    return fallbackReply(originalQuery);
  }

  // Strip any residual inline SQL-looking fragments (lines starting with SELECT/FROM etc.)
  cleaned = cleaned
    .split('\n')
    .filter(line => !SQL_KEYWORDS.test(line.trim()) || line.trim().length < 10)
    .join('\n')
    .trim();

  return cleaned || fallbackReply(originalQuery);
}

function fallbackReply(query) {
  const q = (query || '').toLowerCase();
  if (q.length < 4 || /^(hi|hey|hello|yo|test|ok|okay)$/.test(q.trim())) {
    return "Hi there! I'm your e-Desk Monitor assistant. You can ask me things like:\n• How many tasks are pending?\n• Show urgent tasks\n• Department-wise summary\n• Tasks completed today";
  }
  return "I'm sorry, I couldn't generate a clear answer for that. Could you rephrase your question? For example, try asking:\n• \"How many tasks are pending?\"\n• \"List urgent tasks\"\n• \"Show department summary\"\n• \"Which tasks were completed today?\"";
}

// ─────────────────────────────────────────────────────────────────────────────
// QUICK ACTIONS
// ─────────────────────────────────────────────────────────────────────────────
const QUICK_ACTIONS = {
  my_pending:      'List all my pending and in-progress tasks with their urgency and department.',
  my_completed:    'List all my recently completed tasks.',
  today_completed: 'Which tasks were completed today?',
  dept_summary:    'Show the department-wise breakdown of all tasks.',
  high_urgency:    'List all urgent or high-priority pending tasks.',
  summary:         'Give me a full summary: total, pending, in-progress, and completed task counts.',
};

// ─────────────────────────────────────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ reply: 'Please log in to use the assistant.' });
  }

  const user = req.session.user;
  let { query, quickAction } = req.body;

  if (quickAction && QUICK_ACTIONS[quickAction]) query = QUICK_ACTIONS[quickAction];
  if (!query || !query.trim()) return res.status(400).json({ reply: 'Please type a question.' });

  try {
    const snap         = fetchSnapshot(user);
    const systemPrompt = buildSystemPrompt(user, snap);
    const raw          = await ollamaChat(systemPrompt, query.trim());
    const reply        = sanitizeReply(raw, query.trim());

    console.log(`[Chat] user=${user.key} role=${user.role} q="${query.trim().slice(0, 80)}"`);
    return res.json({ reply });

  } catch (err) {
    console.error('[Chat] Ollama error:', err.message);

    if (err.code === 'ECONNREFUSED') {
      return res.status(503).json({
        reply: 'Cannot connect to Ollama. Make sure it is running: `ollama serve`'
      });
    }
    if (err.message.includes('timed out')) {
      return res.status(503).json({
        reply: 'The model took too long to respond. Please try again.'
      });
    }
    return res.status(500).json({ reply: 'Sorry, an error occurred. Please try again.' });
  }
});

router.get('/quick-actions', (_req, res) => {
  res.json([
    { id: 'my_pending',      label: '📋 My Pending Tasks'    },
    { id: 'my_completed',    label: '✅ My Completed Tasks'   },
    { id: 'today_completed', label: '📅 Completed Today'      },
    { id: 'dept_summary',    label: '🏢 Department Summary'   },
    { id: 'high_urgency',    label: '🔴 High Urgency Pending' },
    { id: 'summary',         label: '📊 Overall Summary'      },
  ]);
});

module.exports = router;
