// ============================================================
// e-Desk Monitor — Frontend Application
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  document.querySelector('.sidebar').classList.add('hidden');
  checkLogin();
});

// ── DOM refs ─────────────────────────────────────────────────
const navButtons           = document.querySelectorAll('.nav-button');
const dashboardPanel       = document.getElementById('dashboard-panel');
const createTaskPanel      = document.getElementById('create-task-panel');
const myTasksPanel         = document.getElementById('my-tasks-panel');
const manageUsersPanel     = document.getElementById('manage-users-panel');
const manageDepartmentsPanel = document.getElementById('manage-departments-panel');
const manageUrgencyPanel   = document.getElementById('manage-urgency-panel');
const reportingPanel       = document.getElementById('reporting-panel');
const loginModal           = document.getElementById('login-modal');
const loginForm            = document.getElementById('login-form');
const loginMessage         = document.getElementById('login-message');
const logoutButton         = document.getElementById('logout-button');
const dashboardStatus      = document.getElementById('dashboard-status');
const globalMessage        = document.getElementById('global-message');
const taskForm             = document.getElementById('task-form');
const userSelect           = document.getElementById('user');
const userForm             = document.getElementById('user-form');
const userNameInput        = document.getElementById('user-name');
const userUsernameInput    = document.getElementById('user-username');
const userDesignationInput = document.getElementById('user-designation');
const userEmailInput       = document.getElementById('user-email');
const userContactInput     = document.getElementById('user-contact');
const userRoleSelect       = document.getElementById('user-role');
const userDepartmentSelect = document.getElementById('user-department');
const userPasswordInput    = document.getElementById('user-password');
const userPasswordLabel    = document.getElementById('user-password-label');
const userPasswordHint     = document.getElementById('user-password-hint');
const usernameHint         = document.getElementById('username-hint');
const userList             = document.getElementById('user-list');
const departmentForm       = document.getElementById('department-form');
const departmentNameInput  = document.getElementById('department-name');
const departmentList       = document.getElementById('department-list');
const urgencyForm          = document.getElementById('urgency-form');
const urgencyLabelInput    = document.getElementById('urgency-label');
const urgencyList          = document.getElementById('urgency-list');
const manageUserMessage    = document.getElementById('manage-user-message');
const manageDeptMessage    = document.getElementById('manage-dept-message');
const manageUrgencyMessage = document.getElementById('manage-urgency-message');

// ── App state ────────────────────────────────────────────────
let allTasks       = [];
let masterUsers    = [];
let currentUser    = null;
let editingUserKey      = null;
let editingDeptName     = null;
let editingUrgencyLabel = null;
let viewingTaskId       = null;
let lastReportData      = null;

// ── Status helpers ───────────────────────────────────────────
const STATUS_ICON = {
  'Assigned':    '📋',
  'In Progress': '⏳',
  'Completed':   '✅'
};
const STATUS_COLOR = {
  'Assigned':    '#64748b',
  'In Progress': '#d97706',
  'Completed':   '#059669'
};

// Get the current user's own assignment status for a task
function myAssignmentStatus(task) {
  if (!currentUser) return task.status;
  if (task.assignments && task.assignments.length > 0) {
    const mine = task.assignments.find(a => a.userId === currentUser.key);
    return mine ? mine.status : task.status;
  }
  return task.status;
}

// ── Utilities ────────────────────────────────────────────────
function setMessage(text, success = true, el = globalMessage) {
  if (!el) return;
  el.textContent = text;
  el.style.color = success ? '#065f46' : '#b91c1c';
  if (text) el.classList.remove('hidden');
  else el.classList.add('hidden');
}

function handleResponse(response, successMessage, errorElement) {
  if (response.status === 401) {
    currentUser = null;
    loginModal.classList.remove('hidden');
    document.querySelector('.sidebar').classList.add('hidden');
    logoutButton.classList.add('hidden');
    setMessage('Session expired. Please log in again.', false);
    return Promise.resolve(false);
  }
  if (response.ok) {
    if (successMessage) setMessage(successMessage, true, errorElement);
    return Promise.resolve(true);
  }
  return response.json().then(err => {
    setMessage(err.error || 'Operation failed', false, errorElement);
    return false;
  });
}

// ── Auth ─────────────────────────────────────────────────────
function checkLogin() {
  fetch('/auth/me')
    .then(r => r.json())
    .then(user => {
      if (user && user.key) {
        onLoginSuccess(user);
      } else {
        showLogin();
      }
    })
    .catch(() => showLogin());
}

function showLogin() {
  loginModal.classList.remove('hidden');
  document.querySelector('.sidebar').classList.add('hidden');
  logoutButton.classList.add('hidden');
}

function onLoginSuccess(user) {
  currentUser = user;
  document.getElementById('user-display-name').textContent = user.name;
  document.getElementById('user-display-role').textContent = user.role;
  document.getElementById('user-info').classList.remove('hidden');
  loginModal.classList.add('hidden');
  document.querySelector('.sidebar').classList.remove('hidden');
  logoutButton.classList.remove('hidden');
  setupNavForRole(user.role);
  loadData();
  setActiveTab('dashboard');
}

loginForm.addEventListener('submit', e => {
  e.preventDefault();
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  fetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
    .then(r => r.json())
    .then(data => {
      if (data.user) {
        onLoginSuccess(data.user);
      } else {
        setMessage(data.error || 'Login failed', false, loginMessage);
      }
    })
    .catch(() => setMessage('Login failed. Please try again.', false, loginMessage));
});

logoutButton.addEventListener('click', () => {
  fetch('/auth/logout', { method: 'POST' }).then(() => {
    currentUser = null;
    allTasks = [];
    masterUsers = [];
    logoutButton.classList.add('hidden');
    document.querySelector('.sidebar').classList.add('hidden');
    loginModal.classList.remove('hidden');
  });
});

// ── Nav ──────────────────────────────────────────────────────
function setActiveTab(tab) {
  navButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
  dashboardPanel.classList.toggle('hidden', tab !== 'dashboard');
  createTaskPanel.classList.toggle('hidden', tab !== 'create-task');
  myTasksPanel.classList.toggle('hidden', tab !== 'my-tasks');
  manageUsersPanel.classList.toggle('hidden', tab !== 'manage-users');
  manageDepartmentsPanel.classList.toggle('hidden', tab !== 'manage-departments');
  manageUrgencyPanel.classList.toggle('hidden', tab !== 'manage-urgency');
  reportingPanel.classList.toggle('hidden', tab !== 'reporting');
}

function setupNavForRole(role) {
  const adminHeading  = document.getElementById('admin-nav-heading');
  const adminButtons  = document.querySelectorAll('.nav-button.sub-menu');
  const createTaskBtn = document.getElementById('nav-create-task');

  if (role !== 'admin') {
    if (adminHeading) adminHeading.style.display = 'none';
    adminButtons.forEach(btn => btn.style.display = 'none');
    if (createTaskBtn) createTaskBtn.style.display = 'none';
  } else {
    if (adminHeading) adminHeading.style.display = 'block';
    adminButtons.forEach(btn => btn.style.display = 'flex');
    if (createTaskBtn) createTaskBtn.style.display = 'flex';
  }
}

navButtons.forEach(btn => {
  btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
});

// ── Data loading ─────────────────────────────────────────────
function loadData() {
  loadDepartments();
  loadUrgencies();
  if (currentUser && currentUser.role === 'admin') loadUsers();
  loadTasks();
}

function loadTasks() {
  fetch('/tasks')
    .then(r => r.json())
    .then(data => {
      allTasks = data;
      renderDashboard();
    });
}

// ── Masters ──────────────────────────────────────────────────
function loadDepartments() {
  fetch('/masters/departments')
    .then(r => r.json())
    .then(data => {
      userDepartmentSelect.innerHTML = '<option value="">Select Department</option>';
      departmentList.innerHTML = '';
      const reportSection = document.getElementById('report-section');
      if (reportSection) reportSection.innerHTML = '<option value="all">All departments</option>';

      data.forEach(dept => {
        const opt = document.createElement('option');
        opt.value = dept; opt.textContent = dept;
        userDepartmentSelect.appendChild(opt);
        if (reportSection) reportSection.appendChild(opt.cloneNode(true));

        const item = document.createElement('div');
        item.className = 'master-item';
        item.innerHTML = `
          <div class="item-info"><span class="item-name">${dept}</span></div>
          <div class="item-actions">
            <button class="action-btn edit-btn" onclick="editDepartment('${dept}')" title="Edit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            <button class="action-btn delete-btn" onclick="deleteDepartment('${dept}')" title="Delete">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>`;
        departmentList.appendChild(item);
      });
    });
}

function loadUrgencies() {
  fetch('/masters/urgencies')
    .then(r => r.json())
    .then(data => {
      urgencyList.innerHTML = '';
      const taskUrgencySelect = document.getElementById('task-urgency');
      if (taskUrgencySelect) taskUrgencySelect.innerHTML = '<option value="">Select urgency</option>';
      const reportUrgency = document.getElementById('report-urgency');
      if (reportUrgency) reportUrgency.innerHTML = '<option value="all">All urgencies</option>';

      data.forEach(urg => {
        if (taskUrgencySelect) {
          const o = document.createElement('option');
          o.value = urg; o.textContent = urg;
          taskUrgencySelect.appendChild(o);
        }
        if (reportUrgency) {
          const o2 = document.createElement('option');
          o2.value = urg; o2.textContent = urg;
          reportUrgency.appendChild(o2);
        }

        const item = document.createElement('div');
        item.className = 'master-item';
        item.innerHTML = `
          <div class="item-info"><span class="item-name">${urg}</span></div>
          <div class="item-actions">
            <button class="action-btn edit-btn" onclick="editUrgency('${urg}')" title="Edit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            <button class="action-btn delete-btn" onclick="deleteUrgency('${urg}')" title="Delete">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>`;
        urgencyList.appendChild(item);
      });
    });
}

function loadUsers() {
  fetch('/masters/users')
    .then(r => r.json())
    .then(data => {
      masterUsers = data;
      populateUserSelects();
      userList.innerHTML = '';
      masterUsers.forEach(user => {
        const item = document.createElement('div');
        item.className = 'master-item';
        item.innerHTML = `
          <div class="item-info">
            <span class="item-name">${user.name}</span>
            <span class="item-details">${user.designation} | ${user.role} | ${user.department || 'No Dept'} | ${user.email}</span>
          </div>
          <div class="item-actions">
            <button class="action-btn edit-btn" onclick="editUser('${user.key}')" title="Edit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            <button class="action-btn delete-btn" onclick="deleteUser('${user.key}')" title="Delete">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>`;
        userList.appendChild(item);
      });
    });
}

function populateUserSelects() {
  // Task create form
  if (userSelect) {
    userSelect.innerHTML = '';
    masterUsers.forEach(u => {
      const o = document.createElement('option');
      o.value = u.key; o.textContent = u.name;
      userSelect.appendChild(o);
    });
  }
  // Report user filter
  const reportUser = document.getElementById('report-user');
  if (reportUser) {
    reportUser.innerHTML = '<option value="all">All users</option>';
    masterUsers.forEach(u => {
      const o = document.createElement('option');
      o.value = u.key; o.textContent = u.name;
      reportUser.appendChild(o);
    });
  }
}

// ── Dashboard rendering ──────────────────────────────────────
function renderDashboard() {
  if (!currentUser) return;

  const isAdmin = currentUser.role === 'admin';

  if (isAdmin) {
    renderAdminDashboard();
  } else {
    renderUserDashboard();
  }
}

function renderAdminDashboard() {
  const tasks = allTasks;
  const total = tasks.length;

  const fullyDone   = tasks.filter(t => isFullyCompleted(t)).length;
  const partial     = tasks.filter(t => isPartiallyCompleted(t)).length;
  const inProg      = tasks.filter(t => t.status === 'In Progress').length;
  const pending     = tasks.filter(t => t.status === 'Assigned').length;

  dashboardStatus.innerHTML = `
    <div class="summary-grid">
      <div class="summary-card"><h3>Total Tasks</h3><p>${total}</p></div>
      <div class="summary-card" style="border-left:3px solid #64748b;"><h3>Pending (Not Started)</h3><p>${pending}</p></div>
      <div class="summary-card" style="border-left:3px solid #d97706;"><h3>In Progress</h3><p>${inProg}</p></div>
      <div class="summary-card" style="border-left:3px solid #7c3aed;"><h3>Partially Completed</h3><p>${partial}</p></div>
      <div class="summary-card" style="border-left:3px solid #059669;"><h3>Fully Completed</h3><p>${fullyDone}</p></div>
    </div>`;

  // For admin Kanban, use overall task status
  populateKanban(tasks, t => t.status);
}

function renderUserDashboard() {
  const userKey = currentUser.key;
  // Only tasks where this user has an assignment
  const tasks = allTasks.filter(t =>
    (t.assignments && t.assignments.some(a => a.userId === userKey)) ||
    (t.assignedTo && t.assignedTo.includes(userKey))
  );

  const myPending   = tasks.filter(t => myAssignmentStatus(t) !== 'Completed').length;
  const myCompleted = tasks.filter(t => myAssignmentStatus(t) === 'Completed').length;

  dashboardStatus.innerHTML = `
    <div class="summary-grid">
      <div class="summary-card"><h3>My Tasks</h3><p>${tasks.length}</p></div>
      <div class="summary-card" style="border-left:3px solid #d97706;"><h3>My Pending</h3><p>${myPending}</p></div>
      <div class="summary-card" style="border-left:3px solid #059669;"><h3>My Completed</h3><p>${myCompleted}</p></div>
    </div>`;

  // For user Kanban, column is based on THEIR OWN assignment status
  populateKanban(tasks, t => myAssignmentStatus(t));
}

function isFullyCompleted(task) {
  if (task.assignments && task.assignments.length > 0) {
    return task.assignments.every(a => a.status === 'Completed');
  }
  return task.status === 'Completed';
}

function isPartiallyCompleted(task) {
  if (task.assignments && task.assignments.length > 0) {
    const done = task.assignments.filter(a => a.status === 'Completed').length;
    return done > 0 && done < task.assignments.length;
  }
  return false;
}

function populateKanban(tasks, getColStatus) {
  const colAssigned  = document.querySelector('#col-assigned .column-cards');
  const colProgress  = document.querySelector('#col-in-progress .column-cards');
  const colCompleted = document.querySelector('#col-completed .column-cards');

  colAssigned.innerHTML = '';
  colProgress.innerHTML = '';
  colCompleted.innerHTML = '';

  tasks.forEach(task => {
    const card = renderCard(task);
    const colStatus = getColStatus(task);
    if (colStatus === 'Completed') {
      colCompleted.appendChild(card);
    } else if (colStatus === 'In Progress') {
      colProgress.appendChild(card);
    } else {
      colAssigned.appendChild(card);
    }
  });

  const toDoCount   = tasks.filter(t => getColStatus(t) === 'Assigned').length;
  const doingCount  = tasks.filter(t => getColStatus(t) === 'In Progress').length;
  const doneCount   = tasks.filter(t => getColStatus(t) === 'Completed').length;

  document.querySelector('#col-assigned .count').textContent  = toDoCount;
  document.querySelector('#col-in-progress .count').textContent = doingCount;
  document.querySelector('#col-completed .count').textContent = doneCount;
}

function renderCard(task) {
  const card = document.createElement('div');
  card.className = 'task-card';
  card.onclick = () => viewTask(task.id, 'view');

  const isAdmin = currentUser && currentUser.role === 'admin';
  const overallStatus = task.status || 'Assigned';

  // Build assignment progress badges
  const assignments = task.assignments || (task.assignedTo || []).map((uid, i) => ({
    userId: uid,
    userName: (task.assignedToLabels || [])[i] || uid,
    status: task.status || 'Assigned'
  }));

  const badgesHtml = assignments.map(a => {
    const icon  = STATUS_ICON[a.status] || '📋';
    const color = STATUS_COLOR[a.status] || '#64748b';
    return `<span title="${a.userName}: ${a.status}" style="
      display:inline-flex; align-items:center; gap:4px;
      font-size:0.72rem; padding:2px 7px; border-radius:12px;
      background:${color}18; color:${color}; border:1px solid ${color}44;
      font-weight:600; white-space:nowrap;">
      ${icon} ${a.userName.split(' ')[0]}
    </span>`;
  }).join('');

  // Partial completion indicator for admin
  let partialBadge = '';
  if (isAdmin && isPartiallyCompleted(task)) {
    const done  = task.assignments.filter(a => a.status === 'Completed').length;
    const total = task.assignments.length;
    partialBadge = `<span style="font-size:0.7rem; color:#7c3aed; font-weight:700; margin-left:4px;">${done}/${total} done</span>`;
  }

  const urgencyHtml = task.urgency
    ? `<span style="font-size:0.7rem; padding:2px 6px; border-radius:8px; background:#7c3aed22; color:#7c3aed; border:1px solid #7c3aed33; font-weight:600;">${task.urgency}</span>`
    : '';

  // Show update button:
  // Admin: always
  // User: only if their assignment is not Completed
  const myStatus = myAssignmentStatus(task);
  const canUpdate = isAdmin || myStatus !== 'Completed';

  card.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:8px;">
      <h4 style="margin:0; font-size:0.9rem; line-height:1.3;">${task.title}</h4>
      ${urgencyHtml}
    </div>
    <p style="font-size:0.8rem; color:#666; margin:0 0 10px; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${task.description}</p>
    <div style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:10px;">
      ${badgesHtml}${partialBadge}
    </div>
    <div style="display:flex; justify-content:flex-end; gap:6px;">
      <button class="card-icon-btn" onclick="event.stopPropagation(); viewTask('${task.id}', 'view')" title="View Details">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
      </button>
      ${canUpdate ? `
        <button class="card-icon-btn" onclick="event.stopPropagation(); viewTask('${task.id}', 'update')" title="Update Status">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>` : ''}
    </div>`;
  return card;
}

// ── Task modal ───────────────────────────────────────────────
function viewTask(id, mode = 'view') {
  const task = allTasks.find(t => t.id === id);
  if (!task) return;

  viewingTaskId = id;
  const isAdmin = currentUser && currentUser.role === 'admin';
  const myStatus = myAssignmentStatus(task);
  const canUpdate = isAdmin || myStatus !== 'Completed';

  // Tab visibility
  const tabView   = document.getElementById('tab-view');
  const tabUpdate = document.getElementById('tab-update');
  const sectionView   = document.getElementById('section-view');
  const sectionUpdate = document.getElementById('section-update');

  if (!canUpdate) {
    tabUpdate.classList.add('hidden');
    mode = 'view';
  } else {
    tabUpdate.classList.remove('hidden');
  }

  const switchTab = m => {
    const isView = m === 'view';
    tabView.style.borderBottom   = isView ? '2px solid var(--primary-color)' : 'none';
    tabView.style.opacity        = isView ? '1' : '0.6';
    tabUpdate.style.borderBottom = isView ? 'none' : '2px solid var(--primary-color)';
    tabUpdate.style.opacity      = isView ? '0.6' : '1';
    sectionView.classList.toggle('hidden', !isView);
    sectionUpdate.classList.toggle('hidden', isView);
  };

  tabView.onclick   = () => switchTab('view');
  tabUpdate.onclick = () => switchTab('update');
  switchTab(mode);

  // ── Populate VIEW tab ────────────────────────────────────
  const statusChip = document.getElementById('modal-task-status');
  statusChip.textContent = task.status || 'Assigned';
  statusChip.style.background = (STATUS_COLOR[task.status] || '#64748b') + '22';
  statusChip.style.color      = STATUS_COLOR[task.status] || '#64748b';
  statusChip.style.border     = `1px solid ${(STATUS_COLOR[task.status] || '#64748b')}44`;
  statusChip.style.padding    = '4px 10px';
  statusChip.style.borderRadius = '20px';
  statusChip.style.fontWeight = '700';

  const urgencyChip = document.getElementById('modal-task-urgency');
  if (task.urgency) {
    urgencyChip.textContent = task.urgency;
    urgencyChip.classList.remove('hidden');
  } else {
    urgencyChip.classList.add('hidden');
  }

  document.getElementById('modal-task-desc').textContent = task.description;

  // Assignment progress table
  const assignments = task.assignments || (task.assignedTo || []).map((uid, i) => ({
    userId: uid,
    userName: (task.assignedToLabels || [])[i] || uid,
    status: task.status || 'Assigned',
    completedAt: task.status === 'Completed' ? task.updatedAt : null
  }));

  const progressDiv = document.getElementById('modal-assignment-progress');
  if (assignments.length === 0) {
    progressDiv.innerHTML = '<p style="padding:12px; color:#999;">No assignments.</p>';
  } else {
    const doneCount = assignments.filter(a => a.status === 'Completed').length;
    const pct = Math.round((doneCount / assignments.length) * 100);

    let rows = assignments.map(a => {
      const icon  = STATUS_ICON[a.status] || '📋';
      const color = STATUS_COLOR[a.status] || '#64748b';
      const completedOn = a.completedAt ? new Date(a.completedAt).toLocaleString() : '—';
      const isMe = a.userId === (currentUser && currentUser.key);
      return `
        <div style="display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border-bottom:1px solid rgba(0,0,0,0.05); ${isMe ? 'background:#f0fdf4;' : ''}">
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="width:32px; height:32px; border-radius:50%; background:${color}22; color:${color}; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.85rem; border:2px solid ${color}55;">
              ${a.userName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div style="font-weight:600; font-size:0.9rem;">${a.userName}${isMe ? ' <span style="font-size:0.7rem; color:#059669;">(you)</span>' : ''}</div>
              ${a.status === 'Completed' ? `<div style="font-size:0.72rem; color:#888;">Completed: ${completedOn}</div>` : ''}
            </div>
          </div>
          <span style="display:inline-flex; align-items:center; gap:5px; font-weight:700; font-size:0.82rem; color:${color}; background:${color}14; padding:4px 10px; border-radius:20px; border:1px solid ${color}33;">
            ${icon} ${a.status}
          </span>
        </div>`;
    }).join('');

    progressDiv.innerHTML = `
      ${rows}
      <div style="padding:10px 16px; background:#f8fafc; font-size:0.8rem; color:#555; display:flex; align-items:center; justify-content:space-between;">
        <span>Overall completion: <strong>${doneCount}/${assignments.length} users done</strong></span>
        <span style="font-weight:700; color:${pct === 100 ? '#059669' : '#d97706'};">${pct}%</span>
      </div>`;
  }

  // Attachment
  const docContainer = document.getElementById('modal-task-doc-container');
  const docLink       = document.getElementById('modal-task-doc-link');
  if (task.document) {
    docContainer.classList.remove('hidden');
    docLink.href = task.document;
  } else {
    docContainer.classList.add('hidden');
  }

  // History
  const historyList = document.getElementById('task-history-list');
  historyList.innerHTML = '';
  const history = task.history || [];
  if (history.length === 0) {
    historyList.innerHTML = '<p style="color:#999; font-style:italic;">No history available.</p>';
  } else {
    [...history].reverse().forEach(item => {
      const div = document.createElement('div');
      div.style.cssText = 'margin-bottom:12px; padding:10px 12px; background:white; border-radius:8px; box-shadow:0 1px 3px rgba(0,0,0,0.06);';
      div.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
          <span style="font-weight:700; color:var(--primary-color); font-size:0.8rem;">${item.action}</span>
          <span style="font-size:0.7rem; color:#888;">${new Date(item.timestamp).toLocaleString()}</span>
        </div>
        <div style="font-size:0.84rem; color:#333; margin-bottom:4px;">${item.remarks || ''}</div>
        <div style="font-size:0.74rem; color:#999;">By: ${item.user}</div>
        ${item.document ? `<a href="${item.document}" target="_blank" style="display:inline-block; margin-top:6px; font-size:0.74rem; color:var(--accent-color); font-weight:600;">View Attachment</a>` : ''}`;
      historyList.appendChild(div);
    });
  }

  // ── Populate UPDATE tab ──────────────────────────────────
  const adminTargetRow = document.getElementById('admin-target-user-row');
  const targetUserSelect = document.getElementById('target-user-id');
  const newStatusSelect  = document.getElementById('new-status');
  const reopenSection    = document.getElementById('admin-reopen-section');
  const reopenButtons    = document.getElementById('reopen-buttons');

  if (isAdmin) {
    // Admin: show which user's assignment to update
    adminTargetRow.classList.remove('hidden');
    targetUserSelect.innerHTML = '';
    assignments.forEach(a => {
      const o = document.createElement('option');
      o.value = a.userId;
      o.textContent = `${a.userName} (currently: ${a.status})`;
      targetUserSelect.appendChild(o);
    });

    // Admin: reopen buttons for completed assignments
    const completedAssignments = assignments.filter(a => a.status === 'Completed');
    if (completedAssignments.length > 0) {
      reopenSection.classList.remove('hidden');
      reopenButtons.innerHTML = completedAssignments.map(a => `
        <button type="button" class="secondary" style="margin:4px; font-size:0.8rem;"
          onclick="reopenAssignment('${task.id}', '${a.userId}', '${a.userName}')">
          Reopen: ${a.userName}
        </button>`).join('');
    } else {
      reopenSection.classList.add('hidden');
    }

    // Update status dropdown to full set
    newStatusSelect.innerHTML = `
      <option value="Assigned">Assigned</option>
      <option value="In Progress">In Progress</option>
      <option value="Completed">Completed</option>`;
  } else {
    // Regular user: update only their own status
    adminTargetRow.classList.add('hidden');
    reopenSection.classList.add('hidden');

    // Only allow forward movement
    const statusOrder = ['Assigned', 'In Progress', 'Completed'];
    const curIdx = statusOrder.indexOf(myStatus);
    newStatusSelect.innerHTML = statusOrder
      .slice(curIdx)
      .map(s => `<option value="${s}">${s}</option>`)
      .join('');
  }

  // Reset form fields
  document.getElementById('update-remarks').value = '';
  const updateDocInput = document.getElementById('update-document');
  if (updateDocInput) updateDocInput.value = '';

  document.getElementById('task-modal').classList.remove('hidden');
}

document.getElementById('close-task-modal').addEventListener('click', () => {
  document.getElementById('task-modal').classList.add('hidden');
  viewingTaskId = null;
});

document.getElementById('update-status-form').addEventListener('submit', async e => {
  e.preventDefault();
  const isAdmin = currentUser && currentUser.role === 'admin';
  const status  = document.getElementById('new-status').value;
  const remarks = document.getElementById('update-remarks').value;
  const docFile = document.getElementById('update-document');

  const formData = new FormData();
  formData.append('status', status);
  formData.append('remarks', remarks);
  if (docFile && docFile.files[0]) formData.append('document', docFile.files[0]);

  // Admin: include targetUserId
  if (isAdmin) {
    const targetUserId = document.getElementById('target-user-id').value;
    if (targetUserId) formData.append('targetUserId', targetUserId);
  }

  try {
    const response = await fetch(`/tasks/${viewingTaskId}/status`, {
      method: 'PATCH',
      body: formData
    });
    if (await handleResponse(response, 'Status updated successfully')) {
      document.getElementById('task-modal').classList.add('hidden');
      document.getElementById('update-status-form').reset();
      viewingTaskId = null;
      loadTasks();
    }
  } catch {
    setMessage('Error updating status', false);
  }
});

async function reopenAssignment(taskId, userId, userName) {
  if (!confirm(`Reopen assignment for ${userName}? Their status will reset to "Assigned".`)) return;
  try {
    const response = await fetch(`/tasks/${taskId}/assignments/${userId}/reopen`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ remarks: `Assignment reopened by admin.` })
    });
    if (await handleResponse(response, `Assignment for ${userName} reopened`)) {
      document.getElementById('task-modal').classList.add('hidden');
      viewingTaskId = null;
      loadTasks();
    }
  } catch {
    setMessage('Error reopening assignment', false);
  }
}

window.viewTask = viewTask;
window.reopenAssignment = reopenAssignment;

// ── Auto-suggest username from name (add mode only) ──────────
function slugify(str) {
  return str.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
}

userNameInput.addEventListener('input', () => {
  if (editingUserKey) return; // don't overwrite in edit mode
  const suggested = slugify(userNameInput.value);
  if (suggested) {
    userUsernameInput.value = suggested;
    if (usernameHint) usernameHint.textContent = `Suggested login ID: ${suggested}`;
  } else {
    userUsernameInput.value = '';
    if (usernameHint) usernameHint.textContent = '';
  }
});

// ── Master CRUD ──────────────────────────────────────────────
userForm.addEventListener('submit', async e => {
  e.preventDefault();

  const isEdit = !!editingUserKey;

  // In add mode, password is required; in edit mode it's optional
  const password = userPasswordInput.value.trim();
  if (!isEdit && !password) {
    setMessage('Password is required when creating a new user.', false, manageUserMessage);
    userPasswordInput.focus();
    return;
  }

  const userData = {
    name:        userNameInput.value.trim(),
    username:    userUsernameInput.value.trim(),   // explicit login ID
    designation: userDesignationInput.value.trim(),
    email:       userEmailInput.value.trim(),
    contact:     userContactInput.value.trim(),
    role:        userRoleSelect.value,
    department:  userDepartmentSelect.value || null
  };
  // Only include password if provided (edit) or always (add)
  if (password) userData.password = password;

  const method = isEdit ? 'PUT' : 'POST';
  const url    = isEdit ? `/masters/users/${editingUserKey}` : '/masters/users';
  try {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(userData) });
    if (await handleResponse(r, isEdit ? 'User updated successfully' : 'User added successfully', manageUserMessage)) {
      cancelUserEditMode();
      loadUsers();
    }
  } catch { setMessage('Error saving user', false, manageUserMessage); }
});

departmentForm.addEventListener('submit', async e => {
  e.preventDefault();
  const method = editingDeptName ? 'PUT' : 'POST';
  const url    = editingDeptName ? `/masters/departments/${encodeURIComponent(editingDeptName)}` : '/masters/departments';
  try {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: departmentNameInput.value }) });
    if (await handleResponse(r, editingDeptName ? 'Department updated' : 'Department added', manageDeptMessage)) {
      cancelDeptEditMode();
      loadDepartments();
    }
  } catch { setMessage('Error saving department', false, manageDeptMessage); }
});

urgencyForm.addEventListener('submit', async e => {
  e.preventDefault();
  const method = editingUrgencyLabel ? 'PUT' : 'POST';
  const url    = editingUrgencyLabel ? `/masters/urgencies/${encodeURIComponent(editingUrgencyLabel)}` : '/masters/urgencies';
  try {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: urgencyLabelInput.value }) });
    if (await handleResponse(r, editingUrgencyLabel ? 'Urgency updated' : 'Urgency added', manageUrgencyMessage)) {
      cancelUrgencyEditMode();
      loadUrgencies();
    }
  } catch { setMessage('Error saving urgency', false, manageUrgencyMessage); }
});

// Task creation
taskForm.addEventListener('submit', async e => {
  e.preventDefault();
  const formData = new FormData(taskForm);
  try {
    const r = await fetch('/tasks', { method: 'POST', body: formData });
    if (await handleResponse(r, 'Task created successfully')) {
      taskForm.reset();
      loadTasks();
      setActiveTab('dashboard');
    }
  } catch { setMessage('Error creating task', false); }
});

// ── Edit/Delete helpers ──────────────────────────────────────
function editUser(key) {
  const user = masterUsers.find(u => u.key === key);
  if (!user) return;
  userNameInput.value        = user.name;
  userDesignationInput.value = user.designation;
  userEmailInput.value       = user.email;
  userContactInput.value     = user.contact;
  userRoleSelect.value       = user.role;
  userDepartmentSelect.value = user.department || '';
  // Username (Login ID) — show but lock in edit mode
  userUsernameInput.value            = user.key;
  userUsernameInput.readOnly         = true;
  userUsernameInput.style.background = '#f0f0f0';
  if (usernameHint) usernameHint.textContent = 'Login ID cannot be changed after creation.';
  // Password — optional in edit mode
  userPasswordInput.value = '';
  userPasswordInput.removeAttribute('required');
  if (userPasswordLabel) userPasswordLabel.textContent = 'New Password';
  if (userPasswordHint)  userPasswordHint.textContent  = 'Leave blank to keep the current password.';
  editingUserKey = user.key;
  document.getElementById('user-form-title').textContent  = 'Edit User';
  document.getElementById('user-submit-btn').textContent  = 'Update User';
  document.getElementById('cancel-user-edit').classList.remove('hidden');
}

function deleteUser(key) {
  if (!confirm('Delete this user?')) return;
  fetch(`/masters/users/${key}`, { method: 'DELETE' })
    .then(r => r.ok ? (loadUsers(), setMessage('User deleted', true, manageUserMessage)) : r.json().then(e => setMessage(e.error, false, manageUserMessage)))
    .catch(() => setMessage('Error deleting user', false, manageUserMessage));
}

function editDepartment(name) {
  departmentNameInput.value = name;
  editingDeptName = name;
  document.getElementById('dept-form-title').textContent = 'Edit Department';
  document.getElementById('dept-submit-btn').textContent = 'Update Department';
  document.getElementById('cancel-dept-edit').classList.remove('hidden');
}

function deleteDepartment(name) {
  if (!confirm(`Delete department "${name}"?`)) return;
  fetch(`/masters/departments/${encodeURIComponent(name)}`, { method: 'DELETE' })
    .then(r => r.ok ? (loadDepartments(), setMessage('Department deleted', true, manageDeptMessage)) : r.json().then(e => setMessage(e.error, false, manageDeptMessage)))
    .catch(() => setMessage('Error deleting department', false, manageDeptMessage));
}

function editUrgency(label) {
  urgencyLabelInput.value = label;
  editingUrgencyLabel = label;
  document.getElementById('urgency-form-title').textContent = 'Edit Urgency Level';
  document.getElementById('urgency-submit-btn').textContent = 'Update Urgency Level';
  document.getElementById('cancel-urgency-edit').classList.remove('hidden');
}

function deleteUrgency(label) {
  if (!confirm(`Delete urgency level "${label}"?`)) return;
  fetch(`/masters/urgencies/${encodeURIComponent(label)}`, { method: 'DELETE' })
    .then(r => r.ok ? (loadUrgencies(), setMessage('Urgency deleted', true, manageUrgencyMessage)) : r.json().then(e => setMessage(e.error, false, manageUrgencyMessage)))
    .catch(() => setMessage('Error deleting urgency', false, manageUrgencyMessage));
}

function cancelUserEditMode() {
  userForm.reset();
  editingUserKey = null;
  // Restore username field to editable add-mode state
  userUsernameInput.value            = '';
  userUsernameInput.readOnly         = false;
  userUsernameInput.style.background = '';
  if (usernameHint) usernameHint.textContent = '';
  // Restore password field to required add-mode state
  userPasswordInput.value = '';
  userPasswordInput.setAttribute('required', 'required');
  if (userPasswordLabel) userPasswordLabel.textContent = 'Password';
  if (userPasswordHint)  userPasswordHint.textContent  = '';
  document.getElementById('user-form-title').textContent = 'Add New User';
  document.getElementById('user-submit-btn').textContent = 'Add User';
  document.getElementById('cancel-user-edit').classList.add('hidden');
  setMessage('', true, manageUserMessage);
}

function cancelDeptEditMode() {
  departmentForm.reset();
  editingDeptName = null;
  document.getElementById('dept-form-title').textContent = 'Add New Department';
  document.getElementById('dept-submit-btn').textContent = 'Add Department';
  document.getElementById('cancel-dept-edit').classList.add('hidden');
  setMessage('', true, manageDeptMessage);
}

function cancelUrgencyEditMode() {
  urgencyForm.reset();
  editingUrgencyLabel = null;
  document.getElementById('urgency-form-title').textContent = 'Add New Urgency Level';
  document.getElementById('urgency-submit-btn').textContent = 'Add Urgency Level';
  document.getElementById('cancel-urgency-edit').classList.add('hidden');
  setMessage('', true, manageUrgencyMessage);
}

document.getElementById('cancel-user-edit').addEventListener('click', cancelUserEditMode);
document.getElementById('cancel-dept-edit').addEventListener('click', cancelDeptEditMode);
document.getElementById('cancel-urgency-edit').addEventListener('click', cancelUrgencyEditMode);

// Global onclick handlers
window.editUser         = editUser;
window.deleteUser       = deleteUser;
window.editDepartment   = editDepartment;
window.deleteDepartment = deleteDepartment;
window.editUrgency      = editUrgency;
window.deleteUrgency    = deleteUrgency;

// ── Reporting ────────────────────────────────────────────────
document.getElementById('report-refresh').addEventListener('click', () => {
  const section  = document.getElementById('report-section').value;
  const user     = document.getElementById('report-user').value;
  const pendency = document.getElementById('report-pendency').value;
  const urgency  = document.getElementById('report-urgency').value;
  const dateFrom = document.getElementById('report-date-from').value;
  const dateTo   = document.getElementById('report-date-to').value;

  let url = '/reports/summary?';
  if (section  !== 'all') url += `department=${encodeURIComponent(section)}&`;
  if (user     !== 'all') url += `assignedTo=${encodeURIComponent(user)}&`;
  if (pendency !== 'all') url += `status=${encodeURIComponent(pendency)}&`;
  if (urgency  !== 'all') url += `urgency=${encodeURIComponent(urgency)}&`;
  if (dateFrom)           url += `dateFrom=${encodeURIComponent(dateFrom)}&`;
  if (dateTo)             url += `dateTo=${encodeURIComponent(dateTo)}&`;

  fetch(url)
    .then(r => { if (r.status === 401) { handleResponse(r); return null; } return r.json(); })
    .then(data => {
      if (data) {
        renderReport(data);
        document.getElementById('export-report-pdf').classList.remove('hidden');
      }
    });
});

document.getElementById('report-clear').addEventListener('click', () => {
  document.getElementById('report-section').value   = 'all';
  document.getElementById('report-user').value      = 'all';
  document.getElementById('report-pendency').value  = 'all';
  document.getElementById('report-urgency').value   = 'all';
  document.getElementById('report-date-from').value = '';
  document.getElementById('report-date-to').value   = '';
  document.getElementById('reporting-content').classList.add('hidden');
  document.getElementById('export-report-pdf').classList.add('hidden');
  lastReportData = null;
});

function renderReport(data) {
  lastReportData = data;
  document.getElementById('reporting-content').classList.remove('hidden');

  document.getElementById('reporting-summary').innerHTML = `
    <div class="summary-card"><h3>Total Tasks</h3><p>${data.total}</p></div>
    <div class="summary-card" style="border-left:3px solid #64748b;"><h3>Pending (Not Started)</h3><p>${data.pending}</p></div>
    <div class="summary-card" style="border-left:3px solid #d97706;"><h3>In Progress</h3><p>${data.inProgress || 0}</p></div>
    <div class="summary-card" style="border-left:3px solid #7c3aed;"><h3>Partially Completed</h3><p>${data.partiallyCompleted || 0}</p></div>
    <div class="summary-card" style="border-left:3px solid #059669;"><h3>Fully Completed</h3><p>${data.fullyCompleted || 0}</p></div>`;

  const tableHtml = `
    <h3 class="form-section-title" style="margin-top:0;">Task Details</h3>
    <div class="table-container" style="overflow-x:auto;">
      <table style="min-width:900px;">
        <thead>
          <tr>
            <th>Task</th>
            <th>Urgency</th>
            <th>Assigned On</th>
            <th>Assignment Progress</th>
            <th>Completed On</th>
            <th>Time Taken</th>
            <th>Last Update</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${data.rows.map(row => {
            const progressBadges = (row.assignmentBreakdown || []).map(a => {
              const icon  = STATUS_ICON[a.status] || '📋';
              const color = STATUS_COLOR[a.status] || '#64748b';
              return `<span style="display:inline-block; font-size:0.7rem; padding:2px 6px; border-radius:10px; background:${color}18; color:${color}; border:1px solid ${color}33; margin:1px; white-space:nowrap;">${icon} ${a.userName.split(' ')[0]}</span>`;
            }).join('');

            const partialNote = row.isPartial
              ? `<div style="font-size:0.7rem; color:#7c3aed; margin-top:3px; font-weight:600;">Partial: ${row.completionPercent}% done</div>`
              : '';

            return `
              <tr>
                <td>
                  <div style="font-weight:600; font-size:0.85rem;">${row.title}</div>
                  <div style="font-size:0.72rem; color:#666; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${row.description}</div>
                </td>
                <td style="font-size:0.8rem;">${row.urgency || 'N/A'}</td>
                <td style="font-size:0.8rem;">${new Date(row.assignedOn).toLocaleDateString()}</td>
                <td>${progressBadges}${partialNote}</td>
                <td style="font-size:0.8rem;">${row.completedOn ? new Date(row.completedOn).toLocaleDateString() : '—'}</td>
                <td style="font-weight:600; color:var(--primary-color); font-size:0.8rem;">${row.timeTaken}</td>
                <td style="font-size:0.75rem; max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${row.lastBrief}</td>
                <td><button class="action-btn edit-btn" onclick="viewTask('${row.id}', 'view')" style="font-size:0.7rem; padding:4px 8px;">View</button></td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
  document.getElementById('reporting-table').innerHTML = tableHtml;
}

// ── PDF Export ───────────────────────────────────────────────
document.getElementById('export-report-pdf').addEventListener('click', () => {
  if (!lastReportData) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.text('e-Desk Monitor — Reporting & Analytics', 14, 22);
  doc.setFontSize(10); doc.setTextColor(100);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30);
  doc.setFontSize(11); doc.setTextColor(0);
  doc.text(`Total: ${lastReportData.total}  |  Pending: ${lastReportData.pending}  |  In Progress: ${lastReportData.inProgress || 0}  |  Partially Done: ${lastReportData.partiallyCompleted || 0}  |  Fully Done: ${lastReportData.fullyCompleted || 0}`, 14, 38);

  const rows = lastReportData.rows.map(r => [
    r.title,
    r.urgency || 'N/A',
    new Date(r.assignedOn).toLocaleDateString(),
    (r.assignmentBreakdown || []).map(a => `${a.userName}: ${a.status}`).join('\n') || r.assignedTo,
    r.completedOn ? new Date(r.completedOn).toLocaleDateString() : 'N/A',
    r.timeTaken,
    r.lastBrief
  ]);

  doc.autoTable({
    startY: 46,
    head: [['Task', 'Urgency', 'Assigned On', 'Assignment Progress', 'Completed On', 'Time Taken', 'Last Update']],
    body: rows,
    theme: 'striped',
    headStyles: { fillColor: [139, 69, 19] },
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: { 3: { cellWidth: 40 } }
  });
  doc.save(`edesk_report_${Date.now()}.pdf`);
});

// ── Password change ──────────────────────────────────────────
const passwordModal      = document.getElementById('password-modal');
const openPasswordBtn    = document.getElementById('open-change-password');
const closePasswordBtn   = document.getElementById('close-password-modal');
const changePasswordForm = document.getElementById('change-password-form');
const passwordMessage    = document.getElementById('password-message');

openPasswordBtn?.addEventListener('click', () => passwordModal.classList.remove('hidden'));
closePasswordBtn?.addEventListener('click', () => {
  passwordModal.classList.add('hidden');
  changePasswordForm.reset();
  setMessage('', true, passwordMessage);
});

changePasswordForm?.addEventListener('submit', async e => {
  e.preventDefault();
  const currentPassword = document.getElementById('current-password').value;
  const newPassword     = document.getElementById('new-password').value;
  const confirmPassword = document.getElementById('confirm-password').value;
  if (newPassword !== confirmPassword) { setMessage('Passwords do not match', false, passwordMessage); return; }
  try {
    const r = await fetch('/profile/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    if (await handleResponse(r, 'Password updated successfully', passwordMessage)) {
      setTimeout(() => { passwordModal.classList.add('hidden'); changePasswordForm.reset(); setMessage('', true, passwordMessage); }, 2000);
    }
  } catch { setMessage('Error updating password', false, passwordMessage); }
});

// ── Chatbot ──────────────────────────────────────────────────
const chatbotToggle   = document.getElementById('chatbot-toggle');
const chatbotWindow   = document.getElementById('chatbot-window');
const chatbotClose    = document.getElementById('chatbot-close');
const chatbotForm     = document.getElementById('chatbot-form');
const chatbotInput    = document.getElementById('chatbot-input');
const chatbotMessages = document.getElementById('chatbot-messages');
const chatTyping      = document.getElementById('chat-typing');
const chatSendBtn     = document.getElementById('chatbot-send-btn');

chatbotToggle?.addEventListener('click', () => chatbotWindow.classList.toggle('hidden'));
chatbotClose?.addEventListener('click',  () => chatbotWindow.classList.add('hidden'));

// Quick-action buttons
document.querySelectorAll('.quick-action-btn').forEach(btn => {
  btn.addEventListener('click', () => sendChatMessage(null, btn.dataset.action));
});

chatbotForm?.addEventListener('submit', async e => {
  e.preventDefault();
  const query = chatbotInput.value.trim();
  if (!query) return;
  chatbotInput.value = '';
  await sendChatMessage(query);
});

async function sendChatMessage(query, quickAction) {
  const displayText = query || (quickAction ? quickAction.replace(/_/g, ' ') : '');
  if (displayText) appendChat(displayText, 'user');

  if (chatTyping) chatTyping.classList.remove('hidden');
  if (chatSendBtn) chatSendBtn.disabled = true;
  chatbotMessages.scrollTop = chatbotMessages.scrollHeight;

  try {
    const body = query ? { query } : { quickAction };
    const r    = await fetch('/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await r.json();
    appendChat(data.reply || 'No response received.', 'bot');
  } catch {
    appendChat('Sorry, I encountered an error. Please try again.', 'bot');
  } finally {
    if (chatTyping) chatTyping.classList.add('hidden');
    if (chatSendBtn) chatSendBtn.disabled = false;
    chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
  }
}

function appendChat(text, sender) {
  const div = document.createElement('div');
  div.className = `chat-message ${sender}-message`;
  const html = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
  div.innerHTML = `<p>${html}</p>`;
  chatbotMessages.appendChild(div);
  chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
}
