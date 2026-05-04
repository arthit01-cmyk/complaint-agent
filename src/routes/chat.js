const express = require('express');
const router = express.Router();
const { getAllTasks } = require('../services/storage');
const { getUsers, getDepartments, getUrgencyLevels } = require('../services/master');

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalize(str) {
  return String(str || '').toLowerCase().trim();
}

function fuzzyMatch(text, target) {
  const t = normalize(target);
  const q = normalize(text);
  if (q.includes(t) || t.includes(q)) return true;
  // Check each word of target in query
  const words = t.split(/\s+/);
  return words.length > 1 && words.every(w => q.includes(w));
}

function daysBetween(d1, d2) {
  return Math.floor(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24));
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function timeSince(dateStr) {
  const now = new Date();
  const d = new Date(dateStr);
  const days = daysBetween(d, now);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week(s) ago`;
  if (days < 365) return `${Math.floor(days / 30)} month(s) ago`;
  return `${Math.floor(days / 365)} year(s) ago`;
}

// ─── Intent Detection ───────────────────────────────────────────────────────

function detectIntent(text) {
  const q = normalize(text);
  
  // Greeting
  if (/^(hi|hello|hey|good\s*(morning|afternoon|evening)|namaste|greetings)\b/.test(q)) {
    return 'greeting';
  }
  
  // Help
  if (/\b(help|what can you do|commands|how to use|guide)\b/.test(q)) {
    return 'help';
  }

  // Count / How many
  if (/\b(how many|total|count|number of|kitne|kitni)\b/.test(q)) {
    return 'count';
  }

  // Summary / Overview
  if (/\b(summary|overview|report|dashboard|give me a summary|summarize|break\s*down)\b/.test(q)) {
    return 'summary';
  }

  // Status inquiry about a specific task
  if (/\b(status of|what happened|update on|progress of|what.?s the status)\b/.test(q)) {
    return 'status';
  }

  // List / Show
  if (/\b(show|list|display|what are|which|give me|get|fetch|tell me about)\b/.test(q)) {
    return 'list';
  }

  // Search / Find
  if (/\b(find|search|look for|where is|locate)\b/.test(q)) {
    return 'search';
  }

  // Who is assigned
  if (/\b(who is|who are|assigned to|responsible)\b/.test(q)) {
    return 'who';
  }

  // Default to smart search
  return 'search';
}

// ─── Entity Extraction ──────────────────────────────────────────────────────

function extractEntities(text) {
  const q = normalize(text);
  const entities = {
    departments: [],
    users: [],
    statuses: [],
    dateRange: null,
    urgency: null,
    keywords: []
  };

  // Extract departments from actual system data
  const departments = getDepartments();
  for (const dept of departments) {
    if (q.includes(normalize(dept))) {
      entities.departments.push(dept);
    }
  }

  // Extract users from actual system data
  const users = getUsers();
  for (const user of users) {
    if (q.includes(normalize(user.name)) || q.includes(normalize(user.key))) {
      entities.users.push(user);
    }
  }

  // Extract statuses
  const statusMap = {
    'received': ['received', 'new', 'incoming'],
    'Pending': ['pending', 'not started', 'waiting', 'unattended'],
    'In Progress': ['in progress', 'ongoing', 'working', 'started', 'doing'],
    'Completed': ['completed', 'done', 'finished', 'closed', 'resolved']
  };

  for (const [status, synonyms] of Object.entries(statusMap)) {
    for (const syn of synonyms) {
      if (q.includes(syn)) {
        entities.statuses.push(status);
        break;
      }
    }
  }

  // "still pending" / "are they still pending"
  if (/still\s*(pending|open|unresolved|not\s*done)/.test(q)) {
    if (!entities.statuses.includes('Pending')) entities.statuses.push('Pending');
    if (!entities.statuses.includes('In Progress')) entities.statuses.push('In Progress');
    if (!entities.statuses.includes('received')) entities.statuses.push('received');
  }

  // Extract date ranges
  const now = new Date();
  
  if (/\btoday\b/.test(q)) {
    entities.dateRange = { 
      label: 'today',
      from: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
      to: now
    };
  } else if (/\byesterday\b/.test(q)) {
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    entities.dateRange = { 
      label: 'yesterday',
      from: yesterday,
      to: new Date(now.getFullYear(), now.getMonth(), now.getDate())
    };
  } else if (/\bthis\s*week\b/.test(q)) {
    const day = now.getDay();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - day);
    startOfWeek.setHours(0, 0, 0, 0);
    entities.dateRange = { label: 'this week', from: startOfWeek, to: now };
  } else if (/\blast\s*week\b/.test(q)) {
    const day = now.getDay();
    const endOfLastWeek = new Date(now);
    endOfLastWeek.setDate(now.getDate() - day);
    endOfLastWeek.setHours(0, 0, 0, 0);
    const startOfLastWeek = new Date(endOfLastWeek);
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);
    entities.dateRange = { label: 'last week', from: startOfLastWeek, to: endOfLastWeek };
  } else if (/\bthis\s*month\b/.test(q)) {
    entities.dateRange = { 
      label: 'this month',
      from: new Date(now.getFullYear(), now.getMonth(), 1),
      to: now
    };
  } else if (/\blast\s*month\b/.test(q)) {
    entities.dateRange = { 
      label: 'last month',
      from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      to: new Date(now.getFullYear(), now.getMonth(), 1)
    };
  } else if (/\blast\s*(\d+)\s*days?\b/.test(q)) {
    const match = q.match(/\blast\s*(\d+)\s*days?\b/);
    const days = parseInt(match[1]);
    entities.dateRange = { 
      label: `last ${days} days`,
      from: new Date(now.getTime() - days * 24 * 60 * 60 * 1000),
      to: now
    };
  } else if (/\bmore\s*than\s*(?:a\s*)?(\d+)?\s*(month|week|day|year)s?\b/.test(q) || /\bolder\s*than\s*(?:a\s*)?(\d+)?\s*(month|week|day|year)s?\b/.test(q) || /\bover\s*(?:a\s*)?(\d+)?\s*(month|week|day|year)s?\b/.test(q)) {
    const match = q.match(/(?:more|older|over)\s*than\s*(?:a\s*)?(\d+)?\s*(month|week|day|year)s?\b/);
    if (match) {
      const num = parseInt(match[1]) || 1;
      const unit = match[2];
      let ms = 0;
      if (unit === 'day') ms = num * 24 * 60 * 60 * 1000;
      else if (unit === 'week') ms = num * 7 * 24 * 60 * 60 * 1000;
      else if (unit === 'month') ms = num * 30 * 24 * 60 * 60 * 1000;
      else if (unit === 'year') ms = num * 365 * 24 * 60 * 60 * 1000;
      entities.dateRange = { 
        label: `more than ${num} ${unit}(s) old`,
        from: null, // no lower bound
        to: new Date(now.getTime() - ms) // created BEFORE this date
      };
    }
  } else if (/\bpending\s*(?:for\s*)?more\s*than\s*(?:a\s*)?(\d+)?\s*(month|week|day|year)s?\b/.test(q)) {
    const match = q.match(/pending\s*(?:for\s*)?more\s*than\s*(?:a\s*)?(\d+)?\s*(month|week|day|year)s?\b/);
    if (match) {
      const num = parseInt(match[1]) || 1;
      const unit = match[2];
      let ms = 0;
      if (unit === 'day') ms = num * 24 * 60 * 60 * 1000;
      else if (unit === 'week') ms = num * 7 * 24 * 60 * 60 * 1000;
      else if (unit === 'month') ms = num * 30 * 24 * 60 * 60 * 1000;
      else if (unit === 'year') ms = num * 365 * 24 * 60 * 60 * 1000;
      entities.dateRange = { 
        label: `pending more than ${num} ${unit}(s)`,
        from: null,
        to: new Date(now.getTime() - ms)
      };
      if (!entities.statuses.length) {
        entities.statuses = ['Pending', 'In Progress', 'received'];
      }
    }
  }

  // Extract urgency
  const urgencies = getUrgencyLevels();
  for (const urg of urgencies) {
    if (q.includes(normalize(urg))) {
      entities.urgency = urg;
      break;
    }
  }

  return entities;
}

// ─── Filtering ──────────────────────────────────────────────────────────────

function filterTasks(tasks, entities) {
  let filtered = [...tasks];
  const appliedFilters = [];

  // Filter by department
  if (entities.departments.length > 0) {
    filtered = filtered.filter(t =>
      entities.departments.some(d => normalize(t.departmentLabel) === normalize(d) || normalize(t.department) === normalize(d))
    );
    appliedFilters.push(`department: **${entities.departments.join(', ')}**`);
  }

  // Filter by user
  if (entities.users.length > 0) {
    filtered = filtered.filter(t =>
      entities.users.some(u =>
        (t.assignedTo || []).includes(u.key) ||
        (t.assignedToLabels || []).some(l => normalize(l) === normalize(u.name))
      )
    );
    appliedFilters.push(`assigned to: **${entities.users.map(u => u.name).join(', ')}**`);
  }

  // Filter by status
  if (entities.statuses.length > 0) {
    filtered = filtered.filter(t =>
      entities.statuses.some(s => normalize(t.status) === normalize(s))
    );
    appliedFilters.push(`status: **${entities.statuses.join(' / ')}**`);
  }

  // Filter by date range
  if (entities.dateRange) {
    const { from, to, label } = entities.dateRange;
    if (label.includes('more than') || label.includes('older than') || label.includes('pending more than')) {
      // "more than X old" means created BEFORE the cutoff date
      filtered = filtered.filter(t => new Date(t.createdAt) < to);
    } else {
      // Normal range: from <= createdAt <= to
      filtered = filtered.filter(t => {
        const d = new Date(t.createdAt);
        return (!from || d >= from) && (!to || d <= to);
      });
    }
    appliedFilters.push(`time period: **${label}**`);
  }

  return { filtered, appliedFilters };
}

// ─── Response Generators ────────────────────────────────────────────────────

function generateCountResponse(filtered, appliedFilters, allTasks) {
  if (appliedFilters.length === 0) {
    // General count - give a breakdown
    const statusGroups = {};
    allTasks.forEach(t => {
      const s = t.status || 'Unknown';
      statusGroups[s] = (statusGroups[s] || 0) + 1;
    });
    
    let reply = `📊 You have a total of **${allTasks.length}** task(s) in the system.\n\n**Status Breakdown:**\n`;
    for (const [status, count] of Object.entries(statusGroups)) {
      const icon = status === 'Completed' ? '✅' : status === 'In Progress' ? '🔄' : status === 'Pending' ? '⏳' : '📋';
      reply += `${icon} ${status}: **${count}**\n`;
    }
    return reply;
  }

  let reply = `📊 I found **${filtered.length}** task(s)`;
  if (appliedFilters.length > 0) {
    reply += ` matching your filters:\n`;
    appliedFilters.forEach(f => { reply += `  • ${f}\n`; });
  } else {
    reply += '.\n';
  }

  if (filtered.length > 0 && filtered.length <= 5) {
    reply += `\n**Tasks found:**\n`;
    filtered.forEach(t => {
      const icon = t.status === 'Completed' ? '✅' : t.status === 'In Progress' ? '🔄' : '📋';
      reply += `${icon} **${t.title}** — ${t.status} (created ${timeSince(t.createdAt)})\n`;
    });
  }

  return reply;
}

function generateListResponse(filtered, appliedFilters) {
  if (filtered.length === 0) {
    return `😕 I couldn't find any tasks matching your criteria${appliedFilters.length ? ':\n' + appliedFilters.map(f => `  • ${f}`).join('\n') : '.'}`;
  }

  let reply = `📋 Here are **${filtered.length}** task(s)`;
  if (appliedFilters.length > 0) {
    reply += ` matching:\n`;
    appliedFilters.forEach(f => { reply += `  • ${f}\n`; });
  }
  reply += '\n';

  const tasksToShow = filtered.slice(0, 8);
  tasksToShow.forEach(t => {
    const icon = t.status === 'Completed' ? '✅' : t.status === 'In Progress' ? '🔄' : '📋';
    const assigned = t.assignedToLabels && t.assignedToLabels.length > 0 ? t.assignedToLabels.join(', ') : 'Unassigned';
    reply += `${icon} **${t.title}**\n   Status: ${t.status} | Assigned to: ${assigned} | Created: ${timeSince(t.createdAt)}\n`;
  });

  if (filtered.length > 8) {
    reply += `\n...and **${filtered.length - 8}** more. You can narrow down with a department or status filter.`;
  }

  return reply;
}

function generateSummaryResponse(allTasks) {
  const total = allTasks.length;
  if (total === 0) return '📊 No tasks in the system yet.';

  const statusGroups = {};
  const deptGroups = {};
  allTasks.forEach(t => {
    const s = t.status || 'Unknown';
    statusGroups[s] = (statusGroups[s] || 0) + 1;
    const d = t.departmentLabel || t.department || 'Unassigned';
    deptGroups[d] = (deptGroups[d] || 0) + 1;
  });

  const openTasks = allTasks.filter(t => normalize(t.status) !== 'completed');
  const completedTasks = allTasks.filter(t => normalize(t.status) === 'completed');

  let reply = `📊 **System Summary**\n\n`;
  reply += `Total Tasks: **${total}**\n`;
  reply += `Open: **${openTasks.length}** | Completed: **${completedTasks.length}**\n\n`;

  reply += `**By Status:**\n`;
  for (const [status, count] of Object.entries(statusGroups)) {
    const pct = ((count / total) * 100).toFixed(0);
    const icon = status === 'Completed' ? '✅' : status === 'In Progress' ? '🔄' : status === 'Pending' ? '⏳' : '📋';
    reply += `${icon} ${status}: **${count}** (${pct}%)\n`;
  }

  reply += `\n**By Department:**\n`;
  for (const [dept, count] of Object.entries(deptGroups)) {
    reply += `🏢 ${dept}: **${count}**\n`;
  }

  return reply;
}

function generateStatusResponse(filtered, appliedFilters) {
  if (filtered.length === 0) {
    return `😕 I couldn't find any task matching that description. Could you try rephrasing or providing more details?`;
  }

  const task = filtered[0]; // Show the best match
  const assigned = task.assignedToLabels && task.assignedToLabels.length > 0 ? task.assignedToLabels.join(', ') : 'Unassigned';
  const icon = task.status === 'Completed' ? '✅' : task.status === 'In Progress' ? '🔄' : '📋';

  let reply = `${icon} **${task.title}**\n\n`;
  reply += `**Status:** ${task.status}\n`;
  reply += `**Department:** ${task.departmentLabel || task.department || 'N/A'}\n`;
  reply += `**Assigned to:** ${assigned}\n`;
  reply += `**Created:** ${formatDate(task.createdAt)} (${timeSince(task.createdAt)})\n`;
  reply += `**Description:** ${task.description}\n`;

  if (task.history && task.history.length > 0) {
    const latest = task.history[task.history.length - 1];
    reply += `\n**Latest Update:**\n`;
    reply += `  • ${latest.action} by ${latest.user} on ${formatDate(latest.timestamp)}\n`;
    if (latest.remarks) reply += `  • Remarks: "${latest.remarks}"\n`;
  }

  return reply;
}

function generateSearchResponse(query, tasks) {
  const q = normalize(query);
  // Remove common stop words for better matching
  const stopWords = ['the', 'a', 'an', 'is', 'are', 'was', 'were', 'of', 'in', 'to', 'for', 'on', 'with', 'and', 'or', 'find', 'search', 'show', 'get', 'me', 'about', 'what', 'tell', 'please', 'can', 'you'];
  const queryWords = q.split(/\s+/).filter(w => !stopWords.includes(w) && w.length > 2);

  if (queryWords.length === 0) {
    return null; // Can't search with no meaningful words
  }

  // Score each task
  const scored = tasks.map(task => {
    let score = 0;
    const searchText = normalize(`${task.title} ${task.description} ${task.departmentLabel} ${task.status} ${(task.assignedToLabels || []).join(' ')}`);
    
    for (const word of queryWords) {
      if (searchText.includes(word)) score += 2;
      // Partial match
      const tokens = searchText.split(/\s+/);
      for (const token of tokens) {
        if (token.startsWith(word) || word.startsWith(token)) score += 1;
      }
    }

    // Bonus for title match
    const titleNorm = normalize(task.title);
    for (const word of queryWords) {
      if (titleNorm.includes(word)) score += 3;
    }

    return { task, score };
  });

  const matches = scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score);

  if (matches.length === 0) return null;

  const top = matches.slice(0, 5);
  let reply = `🔍 I found **${matches.length}** relevant task(s). Here are the top matches:\n\n`;

  top.forEach(({ task: t }) => {
    const icon = t.status === 'Completed' ? '✅' : t.status === 'In Progress' ? '🔄' : '📋';
    const assigned = t.assignedToLabels && t.assignedToLabels.length > 0 ? t.assignedToLabels.join(', ') : 'Unassigned';
    reply += `${icon} **${t.title}**\n`;
    reply += `   ${t.description.substring(0, 80)}${t.description.length > 80 ? '...' : ''}\n`;
    reply += `   Status: ${t.status} | Assigned: ${assigned} | Created: ${timeSince(t.createdAt)}\n\n`;
  });

  if (matches.length > 5) {
    reply += `...and **${matches.length - 5}** more results.`;
  }

  return reply;
}

function generateWhoResponse(filtered, entities) {
  if (filtered.length === 0) {
    return `😕 I couldn't find any matching tasks to determine assignment.`;
  }

  const assignees = {};
  filtered.forEach(t => {
    const labels = t.assignedToLabels || ['Unassigned'];
    labels.forEach(l => {
      if (!assignees[l]) assignees[l] = [];
      assignees[l].push(t.title);
    });
  });

  let reply = `👤 **Assignment Details:**\n\n`;
  for (const [name, taskList] of Object.entries(assignees)) {
    reply += `**${name}** — ${taskList.length} task(s):\n`;
    taskList.slice(0, 3).forEach(title => {
      reply += `  • ${title}\n`;
    });
    if (taskList.length > 3) reply += `  • ...and ${taskList.length - 3} more\n`;
    reply += '\n';
  }

  return reply;
}

// ─── Main Router ────────────────────────────────────────────────────────────

router.post('/', (req, res) => {
  const { query } = req.body;
  if (!query || !query.trim()) {
    return res.status(400).json({ reply: "Please ask a question." });
  }

  const text = query.trim();
  const intent = detectIntent(text);
  const allTasks = getAllTasks();

  // Handle greeting
  if (intent === 'greeting') {
    const taskCount = allTasks.length;
    const openCount = allTasks.filter(t => normalize(t.status) !== 'completed').length;
    return res.json({
      reply: `👋 Hello! I'm your e-Desk Assistant. You currently have **${taskCount}** task(s) in the system, of which **${openCount}** are open.\n\nYou can ask me things like:\n• "How many tasks are pending?"\n• "Show me tasks assigned to Deepak"\n• "Give me a summary"\n• "Status of compassionate appointment"\n• "List all completed tasks from last month"`
    });
  }

  // Handle help
  if (intent === 'help') {
    return res.json({
      reply: `🤖 **Here's what I can do:**\n\n📊 **Count tasks** — "How many tasks are pending?"\n📋 **List tasks** — "Show all tasks in Admin department"\n🔍 **Search** — "Find tasks about compassionate appointment"\n📄 **Task status** — "What's the status of compassionate appointment?"\n📈 **Summary** — "Give me a summary" or "Dashboard overview"\n👤 **Assignments** — "Who is assigned to water tasks?"\n\n**You can combine filters:**\n• "How many pending tasks in Roads department?"\n• "List completed tasks from last month"\n• "Show tasks assigned to Deepak that are still pending"`
    });
  }

  // Extract entities and filter
  const entities = extractEntities(text);
  const { filtered, appliedFilters } = filterTasks(allTasks, entities);

  let reply;

  switch (intent) {
    case 'count':
      reply = generateCountResponse(filtered, appliedFilters, allTasks);
      break;

    case 'summary':
      reply = generateSummaryResponse(allTasks);
      break;

    case 'list':
      reply = generateListResponse(filtered, appliedFilters);
      break;

    case 'status':
      // For status queries, try keyword-based search first
      const searchResult = generateSearchResponse(text, allTasks);
      if (searchResult && filtered.length === allTasks.length) {
        // No filters matched, use search result instead
        const scored = allTasks.map(task => {
          const searchText = normalize(`${task.title} ${task.description}`);
          const queryWords = normalize(text).split(/\s+/).filter(w => w.length > 2);
          let score = 0;
          queryWords.forEach(w => { if (searchText.includes(w)) score++; });
          return { task, score };
        }).filter(s => s.score > 0).sort((a, b) => b.score - a.score);
        
        if (scored.length > 0) {
          reply = generateStatusResponse([scored[0].task], appliedFilters);
        } else {
          reply = generateStatusResponse(filtered, appliedFilters);
        }
      } else {
        reply = generateStatusResponse(filtered, appliedFilters);
      }
      break;

    case 'who':
      reply = generateWhoResponse(filtered, entities);
      break;

    case 'search':
    default:
      // Try smart search first
      const smartSearch = generateSearchResponse(text, allTasks);
      if (smartSearch) {
        reply = smartSearch;
      } else if (appliedFilters.length > 0) {
        reply = generateListResponse(filtered, appliedFilters);
      } else {
        reply = `🤔 I'm not sure I understand your question. Could you try rephrasing it?\n\n**Try asking:**\n• "How many tasks are pending?"\n• "Show me all tasks in Admin"\n• "Give me a summary"\n• "Status of [task name]"`;
      }
      break;
  }

  return res.json({ reply });
});

module.exports = router;
