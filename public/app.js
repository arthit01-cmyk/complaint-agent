document.addEventListener('DOMContentLoaded', () => {
  document.querySelector('.sidebar').classList.add('hidden');
  checkLogin();
});

const navButtons = document.querySelectorAll('.nav-button');
const dashboardPanel = document.getElementById('dashboard-panel');
const createTaskPanel = document.getElementById('create-task-panel');
const myTasksPanel = document.getElementById('my-tasks-panel');
const manageUsersPanel = document.getElementById('manage-users-panel');
const manageDepartmentsPanel = document.getElementById('manage-departments-panel');
const manageUrgencyPanel = document.getElementById('manage-urgency-panel');
const reportingPanel = document.getElementById('reporting-panel');
const loginModal = document.getElementById('login-modal');

const taskForm = document.getElementById('task-form');
const globalMessage = document.getElementById('global-message');
const loginForm = document.getElementById('login-form');
const loginMessage = document.getElementById('login-message');
const taskList = document.getElementById('task-list');
const refreshButton = document.getElementById('refresh-button');
const logoutButton = document.getElementById('logout-button');
const dashboardStatus = document.getElementById('dashboard-status');

const userSelect = document.getElementById('user');
const searchInput = document.getElementById('search-input');
const filterStatus = document.getElementById('filter-status');
const clearFiltersButton = document.getElementById('clear-filters');

const reportUserSelect = document.getElementById('report-user');
const reportStatusSelect = document.getElementById('report-status');
const reportRefreshButton = document.getElementById('report-refresh');

const userForm = document.getElementById('user-form');
const userNameInput = document.getElementById('user-name');
const userDesignationInput = document.getElementById('user-designation');
const userEmailInput = document.getElementById('user-email');
const userContactInput = document.getElementById('user-contact');
const userRoleSelect = document.getElementById('user-role');
const userDepartmentSelect = document.getElementById('user-department');
const userPasswordInput = document.getElementById('user-password');
const userList = document.getElementById('user-list');

const departmentForm = document.getElementById('department-form');
const departmentNameInput = document.getElementById('department-name');
const departmentList = document.getElementById('department-list');

const urgencyForm = document.getElementById('urgency-form');
const urgencyLabelInput = document.getElementById('urgency-label');
const urgencyList = document.getElementById('urgency-list');
const manageUserMessage = document.getElementById('manage-user-message');
const manageDeptMessage = document.getElementById('manage-dept-message');
const manageUrgencyMessage = document.getElementById('manage-urgency-message');

let allTasks = [];
let masterUsers = [];
let currentUser = null;
let editingUserKey = null;
let editingDeptName = null;
let editingUrgencyLabel = null;
const statuses = ['Assigned', 'In Progress', 'Completed'];

function setActiveTab(tab) {
  navButtons.forEach(button => {
    button.classList.toggle('active', button.dataset.tab === tab);
  });
  dashboardPanel.classList.toggle('hidden', tab !== 'dashboard');
  createTaskPanel.classList.toggle('hidden', tab !== 'create-task');
  myTasksPanel.classList.toggle('hidden', tab !== 'my-tasks');
  manageUsersPanel.classList.toggle('hidden', tab !== 'manage-users');
  manageDepartmentsPanel.classList.toggle('hidden', tab !== 'manage-departments');
  manageUrgencyPanel.classList.toggle('hidden', tab !== 'manage-urgency');
  reportingPanel.classList.toggle('hidden', tab !== 'reporting');
}

function setMessage(text, success = true, el = globalMessage) {
  if (!el) return;
  el.textContent = text;
  el.style.color = success ? '#065f46' : '#b91c1c';
  if (text) el.classList.remove('hidden');
  else el.classList.add('hidden');
}

function checkLogin() {
  fetch('/auth/me')
    .then(res => res.json())
    .then(user => {
      if (user.key) {
        currentUser = user;
        const nameEl = document.getElementById('user-display-name');
        const roleEl = document.getElementById('user-display-role');
        const infoEl = document.getElementById('user-info');
        if (nameEl) nameEl.textContent = user.name;
        if (roleEl) roleEl.textContent = user.role;
        if (infoEl) infoEl.classList.remove('hidden');

        loginModal.classList.add('hidden');
        document.querySelector('.sidebar').classList.remove('hidden');
        logoutButton.classList.remove('hidden');
        setupNavForRole(user.role);
        loadData();
        setActiveTab('dashboard');
      } else {
        loginModal.classList.remove('hidden');
        document.querySelector('.sidebar').classList.add('hidden');
        logoutButton.classList.add('hidden');
      }
    })
    .catch(() => {
      loginModal.classList.remove('hidden');
      document.querySelector('.sidebar').classList.add('hidden');
      logoutButton.classList.add('hidden');
    });
}

function setupNavForRole(role) {
  const adminHeading = document.querySelectorAll('.nav-heading')[1];
  const adminButtons = document.querySelectorAll('.nav-button.sub-menu');
  const createTaskBtn = document.querySelector('[data-tab="create-task"]');
  
  if (role !== 'admin') {
    if (adminHeading) adminHeading.style.display = 'none';
    adminButtons.forEach(btn => btn.style.display = 'none');
    if (createTaskBtn) createTaskBtn.style.display = 'none';
    setActiveTab('dashboard');
  } else {
    if (adminHeading) adminHeading.style.display = 'block';
    adminButtons.forEach(btn => btn.style.display = 'flex');
    if (createTaskBtn) createTaskBtn.style.display = 'flex';
  }
}

loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  fetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
    .then(res => res.json())
    .then(data => {
      if (data.user) {
        currentUser = data.user;
        loginModal.classList.add('hidden');
        document.querySelector('.sidebar').classList.remove('hidden');
        logoutButton.classList.remove('hidden');
        setupNavForRole(data.user.role);
        loadData();
        setActiveTab('dashboard');
      } else {
        setMessage(data.error, false, loginMessage);
      }
    })
    .catch(err => {
      setMessage('Login failed. Please try again.', false, loginMessage);
    });
});

logoutButton.addEventListener('click', () => {
  fetch('/auth/logout', { method: 'POST' })
    .then(() => {
      currentUser = null;
      logoutButton.classList.add('hidden');
      document.querySelector('.sidebar').classList.add('hidden');
      loginModal.classList.remove('hidden');
    });
});
function handleResponse(response, successMessage, errorElement) {
  if (response.status === 401) {
    currentUser = null;
    loginModal.classList.remove("hidden");
    document.querySelector(".sidebar").classList.add("hidden");
    logoutButton.classList.add("hidden");
    setMessage("Session expired. Please log in again.", false);
    return false;
  }
  
  if (response.ok) {
    if (successMessage) setMessage(successMessage, true, errorElement);
    return true;
  } else {
    return response.json().then(error => {
      setMessage(error.error || "Operation failed", false, errorElement);
      return false;
    });
  }
}


userForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const userData = {
    name: userNameInput.value,
    designation: userDesignationInput.value,
    email: userEmailInput.value,
    contact: userContactInput.value,
    role: userRoleSelect.value,
    department: userDepartmentSelect.value,
    password: userPasswordInput.value
  };
  const method = editingUserKey ? 'PUT' : 'POST';
  const url = editingUserKey ? `/masters/users/${editingUserKey}` : '/masters/users';
  try {
    const response = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData)
    });
    if (await handleResponse(response, editingUserKey ? 'User updated successfully' : 'User added successfully', manageUserMessage)) {
      cancelUserEditMode();
      loadUsers();
    }
  } catch (err) {
    setMessage('Error saving user', false, manageUserMessage);
  }
});

departmentForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const departmentData = {
    name: departmentNameInput.value
  };
  const method = editingDeptName ? 'PUT' : 'POST';
  const url = editingDeptName ? `/masters/departments/${encodeURIComponent(editingDeptName)}` : '/masters/departments';
  try {
    const response = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(departmentData)
    });
    if (await handleResponse(response, editingDeptName ? 'Department updated successfully' : 'Department added successfully', manageDeptMessage)) {
      cancelDeptEditMode();
      loadDepartments();
    }
  } catch (err) {
    setMessage('Error saving department', false, manageDeptMessage);
  }
});

urgencyForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const urgencyData = {
    label: urgencyLabelInput.value
  };
  const method = editingUrgencyLabel ? 'PUT' : 'POST';
  const url = editingUrgencyLabel ? `/masters/urgencies/${encodeURIComponent(editingUrgencyLabel)}` : '/masters/urgencies';
  try {
    const response = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(urgencyData)
    });
    if (await handleResponse(response, editingUrgencyLabel ? 'Urgency level updated successfully' : 'Urgency level added successfully', manageUrgencyMessage)) {
      cancelUrgencyEditMode();
      loadUrgencies();
    }
  } catch (err) {
    setMessage('Error saving urgency level', false, manageUrgencyMessage);
  }
});

function loadData() {
  loadDepartments();
  loadUrgencies();
  if (currentUser.role === 'admin') {
    loadUsers();
  }
  loadTasks();
}

function loadDepartments() {
  fetch('/masters/departments')
    .then(res => res.json())
    .then(data => {
      userDepartmentSelect.innerHTML = '<option value="">Select Department</option>';
      departmentList.innerHTML = '';
      data.forEach(dept => {
        const option = document.createElement('option');
        option.value = dept;
        option.textContent = dept;
        userDepartmentSelect.appendChild(option);

        // Also populate report filter
        const reportSection = document.getElementById('report-section');
        if (reportSection) {
          const opt2 = option.cloneNode(true);
          reportSection.appendChild(opt2);
        }

        const item = document.createElement('div');
        item.className = 'master-item';
        item.innerHTML = `
          <div class="item-info">
            <span class="item-name">${dept}</span>
          </div>
          <div class="item-actions">
            <button class="action-btn edit-btn" onclick="editDepartment('${dept}')" title="Edit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            <button class="action-btn delete-btn" onclick="deleteDepartment('${dept}')" title="Delete">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            </button>
          </div>
        `;
        departmentList.appendChild(item);
      });
    });
}

function loadUrgencies() {
  fetch('/masters/urgencies')
    .then(res => res.json())
    .then(data => {
      urgencyList.innerHTML = '';
      data.forEach(urg => {
        const item = document.createElement('div');
        item.className = 'master-item';
        item.innerHTML = `
          <div class="item-info">
            <span class="item-name">${urg}</span>
          </div>
          <div class="item-actions">
            <button class="action-btn edit-btn" onclick="editUrgency('${urg}')" title="Edit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            <button class="action-btn delete-btn" onclick="deleteUrgency('${urg}')" title="Delete">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            </button>
          </div>
        `;
        urgencyList.appendChild(item);

        // Populate report filter
        const reportUrgency = document.getElementById('report-urgency');
        if (reportUrgency) {
          const opt = document.createElement('option');
          opt.value = urg;
          opt.textContent = urg;
          reportUrgency.appendChild(opt);
        }
      });
    });
}

function deleteDepartment(name) {
  if (confirm(`Delete department "${name}"?`)) {
    fetch(`/masters/departments/${encodeURIComponent(name)}`, {
      method: 'DELETE'
    })
    .then(res => {
      if (res.ok) {
        loadDepartments();
        setMessage('Department deleted', true, manageDeptMessage);
      } else {
        return res.json().then(err => setMessage(err.error, false, manageDeptMessage));
      }
    })
    .catch(err => setMessage('Error deleting department', false, manageDeptMessage));
  }
}

function deleteUrgency(label) {
  if (confirm(`Delete urgency level "${label}"?`)) {
    fetch(`/masters/urgencies/${encodeURIComponent(label)}`, {
      method: 'DELETE'
    })
    .then(res => {
      if (res.ok) {
        loadUrgencies();
        setMessage('Urgency level deleted', true, manageUrgencyMessage);
      } else {
        return res.json().then(err => setMessage(err.error, false, manageUrgencyMessage));
      }
    })
    .catch(err => setMessage('Error deleting urgency level', false, manageUrgencyMessage));
  }
}

function loadUsers() {
  fetch('/masters/users')
    .then(res => res.json())
    .then(data => {
      masterUsers = data;
      populateUserSelect();
      userList.innerHTML = '';
      masterUsers.forEach(user => {
        const item = document.createElement('div');
        item.className = 'master-item';
        item.innerHTML = `
          <div class="item-info">
            <span class="item-name">${user.name}</span>
            <span class="item-details">${user.designation} | ${user.role} | ${user.email}</span>
          </div>
          <div class="item-actions">
            <button class="action-btn edit-btn" onclick="editUser('${user.key}')" title="Edit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            <button class="action-btn delete-btn" onclick="deleteUser('${user.key}')" title="Delete">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            </button>
          </div>
        `;
        userList.appendChild(item);
      });
    });
}

function loadTasks() {
  fetch('/tasks')
    .then(res => res.json())
    .then(data => {
      allTasks = data;
      renderDashboard();
    });
}

function populateUserSelect() {
  userSelect.innerHTML = '';
  const reassignSelect = document.getElementById('reassign-to');
  if (reassignSelect) reassignSelect.innerHTML = '';
  
  masterUsers.forEach(user => {
    const option = document.createElement('option');
    option.value = user.key;
    option.textContent = user.name;
    userSelect.appendChild(option);
    
    if (reassignSelect) {
      const opt2 = option.cloneNode(true);
      reassignSelect.appendChild(opt2);
    }

    // Also populate report user filter
    const reportUser = document.getElementById('report-user');
    if (reportUser) {
      const opt3 = option.cloneNode(true);
      reportUser.appendChild(opt3);
    }
  });
}

function renderDashboard() {
  if (!currentUser) return;
  
  const tasksToShow = currentUser.role === 'admin' ? allTasks : allTasks.filter(t => t.assignedTo && t.assignedTo.includes(currentUser.key));
  
  // Summary Stats
  const total = tasksToShow.length;
  const pending = tasksToShow.filter(t => t.status !== 'Completed').length;
  const completed = tasksToShow.filter(t => t.status === 'Completed').length;
  
  dashboardStatus.innerHTML = `
    <div class="summary-grid">
      <div class="summary-card"><h3>${currentUser.role === 'admin' ? 'Total' : 'My'} Tasks</h3><p>${total}</p></div>
      <div class="summary-card"><h3>Pending</h3><p>${pending}</p></div>
      <div class="summary-card"><h3>Completed</h3><p>${completed}</p></div>
    </div>
  `;

  // Kanban Columns
  const colAssigned = document.querySelector('#col-assigned .column-cards');
  const colProgress = document.querySelector('#col-in-progress .column-cards');
  const colCompleted = document.querySelector('#col-completed .column-cards');

  colAssigned.innerHTML = '';
  colProgress.innerHTML = '';
  colCompleted.innerHTML = '';

  const renderCard = (task) => {
    const card = document.createElement('div');
    card.className = 'task-card';
    card.onclick = () => viewTask(task.id, 'view');
    
    card.innerHTML = `
      <h4>${task.title}</h4>
      <p>${task.description}</p>
      <div class="card-meta">
        <div class="assigned-users">
          ${(task.assignedToLabels || []).map(label => `<div class="user-avatar" title="${label}">${label.charAt(0).toUpperCase()}</div>`).join('')}
        </div>
        <div class="card-actions">
          <button class="card-icon-btn" onclick="event.stopPropagation(); viewTask('${task.id}', 'view')" title="View Details">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
          </button>
          ${(task.status !== 'Completed' || currentUser.role === 'admin') ? `
            <button class="card-icon-btn" onclick="event.stopPropagation(); viewTask('${task.id}', 'update')" title="Update Status">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
          ` : ''}
        </div>
      </div>
    `;
    return card;
  };

  tasksToShow.forEach(task => {
    const card = renderCard(task);
    if (task.status === 'Completed') {
      colCompleted.appendChild(card);
    } else if (task.status === 'In Progress' || task.status === 'In progress') {
      colProgress.appendChild(card);
    } else {
      colAssigned.appendChild(card);
    }
  });

  // Update counts
  document.querySelector('#col-assigned .count').textContent = tasksToShow.filter(t => t.status !== 'Completed' && t.status !== 'In Progress' && t.status !== 'In progress').length;
  document.querySelector('#col-in-progress .count').textContent = tasksToShow.filter(t => t.status === 'In Progress' || t.status === 'In progress').length;
  document.querySelector('#col-completed .count').textContent = tasksToShow.filter(t => t.status === 'Completed').length;
}

// Navigation
navButtons.forEach(button => {
  button.addEventListener('click', () => {
    setActiveTab(button.dataset.tab);
  });
});

function editUser(key) {
  const user = masterUsers.find(u => u.key === key);
  if (!user) return;
  
  userNameInput.value = user.name;
  userDesignationInput.value = user.designation;
  userEmailInput.value = user.email;
  userContactInput.value = user.contact;
  userRoleSelect.value = user.role;
  userDepartmentSelect.value = user.department || '';
  
  // Hide password for edit
  document.getElementById('password-field-row').classList.add('hidden');
  userPasswordInput.removeAttribute('required');
  
  editingUserKey = user.key;
  document.getElementById('user-form-title').textContent = 'Edit User';
  document.getElementById('user-submit-btn').textContent = 'Update User';
  document.getElementById('cancel-user-edit').classList.remove('hidden');
}

function deleteUser(key) {
  if (confirm('Delete this user?')) {
    fetch(`/masters/users/${key}`, {
      method: 'DELETE'
    })
    .then(res => {
      if (res.ok) {
        loadUsers();
        setMessage('User deleted', true, manageUserMessage);
      } else {
        return res.json().then(err => setMessage(err.error, false, manageUserMessage));
      }
    })
    .catch(err => setMessage('Error deleting user', false, manageUserMessage));
  }
}

// Task Creation
taskForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(taskForm);
  
  // Note: multiple select values might need manual appending if FormData doesn't handle them automatically in some browsers
  // But usually FormData(form) handles everything with name attributes.
  
  try {
    const response = await fetch('/tasks', {
      method: 'POST',
      body: formData
    });
    if (await handleResponse(response, 'Task created successfully')) {
      taskForm.reset();
      loadTasks();
      setActiveTab('dashboard');
    }
  } catch (err) {
    setMessage('Error creating task', false);
  }
});

// Edit/Delete Department
function editDepartment(name) {
  departmentNameInput.value = name;
  editingDeptName = name;
  document.getElementById('dept-form-title').textContent = 'Edit Department';
  document.getElementById('dept-submit-btn').textContent = 'Update Department';
  document.getElementById('cancel-dept-edit').classList.remove('hidden');
}

function cancelDeptEditMode() {
  departmentForm.reset();
  editingDeptName = null;
  document.getElementById('dept-form-title').textContent = 'Add New Department';
  document.getElementById('dept-submit-btn').textContent = 'Add Department';
  document.getElementById('cancel-dept-edit').classList.add('hidden');
  setMessage('', true, manageDeptMessage);
}

document.getElementById('cancel-dept-edit').addEventListener('click', cancelDeptEditMode);

// Edit/Delete Urgency
function editUrgency(label) {
  urgencyLabelInput.value = label;
  editingUrgencyLabel = label;
  document.getElementById('urgency-form-title').textContent = 'Edit Urgency Level';
  document.getElementById('urgency-submit-btn').textContent = 'Update Urgency Level';
  document.getElementById('cancel-urgency-edit').classList.remove('hidden');
}

function cancelUrgencyEditMode() {
  urgencyForm.reset();
  editingUrgencyLabel = null;
  document.getElementById('urgency-form-title').textContent = 'Add New Urgency Level';
  document.getElementById('urgency-submit-btn').textContent = 'Add Urgency Level';
  document.getElementById('cancel-urgency-edit').classList.add('hidden');
  setMessage('', true, manageUrgencyMessage);
}

document.getElementById('cancel-urgency-edit').addEventListener('click', cancelUrgencyEditMode);

// Edit User Helpers
function cancelUserEditMode() {
  userForm.reset();
  editingUserKey = null;
  document.getElementById('user-form-title').textContent = 'Add New User';
  document.getElementById('user-submit-btn').textContent = 'Add User';
  document.getElementById('cancel-user-edit').classList.add('hidden');
  document.getElementById('password-field-row').classList.remove('hidden');
  userPasswordInput.setAttribute('required', 'required');
  setMessage('', true, manageUserMessage);
}

document.getElementById('cancel-user-edit').addEventListener('click', cancelUserEditMode);

// Reporting logic
reportRefreshButton.addEventListener('click', () => {
  const section = document.getElementById('report-section').value;
  const user = document.getElementById('report-user').value;
  const pendency = document.getElementById('report-pendency').value;
  const urgency = document.getElementById('report-urgency')?.value || 'all';

  let url = '/reports/summary?';
  if (section !== 'all') url += `department=${encodeURIComponent(section)}&`;
  if (user !== 'all') url += `assignedTo=${encodeURIComponent(user)}&`;
  if (pendency !== 'all') url += `status=${encodeURIComponent(pendency)}&`;
  if (urgency !== 'all') url += `urgency=${encodeURIComponent(urgency)}&`;

  fetch(url)
    .then(res => {
      if (res.status === 401) {
        handleResponse(res);
        return;
      }
      return res.json();
    })
    .then(data => {
      if (data) {
        renderReport(data);
        document.getElementById('export-report-pdf').classList.remove('hidden');
      }
    });
});

let lastReportData = null;

function renderReport(data) {
  lastReportData = data;
  const content = document.getElementById('reporting-content');
  const summary = document.getElementById('reporting-summary');
  const table = document.getElementById('reporting-table');

  content.classList.remove('hidden');
  summary.innerHTML = `
    <div class="summary-card"><h3>Total Tasks</h3><p>${data.total}</p></div>
    <div class="summary-card"><h3>Pending</h3><p>${data.pending}</p></div>
    <div class="summary-card"><h3>Completed</h3><p>${data.completed}</p></div>
  `;

  let tableHtml = `
    <h3 class="form-section-title" style="margin-top:0;">Task Details</h3>
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Task Details</th>
            <th>Assigned On</th>
            <th>Assigned To</th>
            <th>Completed On</th>
            <th>Time Taken</th>
            <th>Last Action Brief</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${data.rows.map(row => `
            <tr>
              <td>
                <div style="font-weight:600;">${row.title}</div>
                <div style="font-size:0.75rem; color:#666; max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${row.description}</div>
              </td>
              <td>${new Date(row.assignedOn).toLocaleDateString()}</td>
              <td>${row.assignedTo}</td>
              <td>${row.completedOn ? new Date(row.completedOn).toLocaleDateString() : 'N/A'}</td>
              <td style="font-weight:600; color:var(--primary-color);">${row.timeTaken}</td>
              <td style="font-size:0.8rem; max-width:150px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${row.lastBrief}</td>
              <td><button class="action-btn edit-btn" onclick="viewTask('${row.id}', 'view', true)" style="font-size:0.7rem; padding:4px 8px;">View</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  table.innerHTML = tableHtml;
}

document.getElementById('export-report-pdf').addEventListener('click', () => {
  if (!lastReportData) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  
  doc.setFontSize(18);
  doc.text('e-Desk Monitor - Reporting & Analytics', 14, 22);
  
  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);
  
  doc.setFontSize(12);
  doc.setTextColor(0);
  doc.text(`Summary: Total: ${lastReportData.total} | Pending: ${lastReportData.pending} | Completed: ${lastReportData.completed}`, 14, 40);
  
  const tableData = lastReportData.rows.map(row => [
    `${row.title}\n${row.description}`,
    new Date(row.assignedOn).toLocaleDateString(),
    row.assignedTo,
    row.completedOn ? new Date(row.completedOn).toLocaleDateString() : 'N/A',
    row.timeTaken,
    row.lastBrief
  ]);
  
  doc.autoTable({
    startY: 50,
    head: [['Task Details', 'Assigned On', 'Assigned To', 'Completed On', 'Time Taken', 'Last Action Brief']],
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: [139, 69, 19] } // Brown color matching theme
  });
  
  doc.save(`report_${Date.now()}.pdf`);
});

// Global Exports for onclick handlers
window.editUser = editUser;
window.deleteUser = deleteUser;
window.editDepartment = editDepartment;
window.deleteDepartment = deleteDepartment;
window.editUrgency = editUrgency;
window.deleteUrgency = deleteUrgency;
let viewingTaskId = null;

function viewTask(id, mode = 'view', fromReporting = false) {
  const task = allTasks.find(t => t.id === id);
  if (!task) return;
  
  viewingTaskId = id;
  
  // Set Modal Tabs
  const tabView = document.getElementById('tab-view');
  const tabUpdate = document.getElementById('tab-update');
  const sectionView = document.getElementById('section-view');
  const sectionUpdate = document.getElementById('section-update');

  // Logic: Hide Update tab if from reporting OR if task is completed and user is not admin
  const canUpdate = !fromReporting && (task.status !== 'Completed' || currentUser.role === 'admin');
  
  if (!canUpdate) {
    tabUpdate.classList.add('hidden');
    tabView.style.width = '100%';
    mode = 'view';
  } else {
    tabUpdate.classList.remove('hidden');
    tabView.style.width = 'auto';
  }

  const switchTab = (m) => {
    if (m === 'view') {
      tabView.style.borderBottom = '2px solid var(--primary-color)';
      tabView.style.opacity = '1';
      tabUpdate.style.borderBottom = 'none';
      tabUpdate.style.opacity = '0.6';
      sectionView.classList.remove('hidden');
      sectionUpdate.classList.add('hidden');
    } else {
      tabUpdate.style.borderBottom = '2px solid var(--primary-color)';
      tabUpdate.style.opacity = '1';
      tabView.style.borderBottom = 'none';
      tabView.style.opacity = '0.6';
      sectionUpdate.classList.remove('hidden');
      sectionView.classList.add('hidden');
    }
  };

  tabView.onclick = () => switchTab('view');
  tabUpdate.onclick = () => switchTab('update');
  
  switchTab(mode);

  // Populate View Data
  document.getElementById('modal-task-status').textContent = task.status;
  document.getElementById('modal-task-desc').textContent = task.description;
  document.getElementById('modal-task-assigned').textContent = task.assignedToLabels ? task.assignedToLabels.join(', ') : 'Unassigned';
  
  const docContainer = document.getElementById('modal-task-doc-container');
  const docLink = document.getElementById('modal-task-doc-link');
  if (task.document) {
    docContainer.classList.remove('hidden');
    docLink.href = task.document;
  } else {
    docContainer.classList.add('hidden');
  }

  const historyList = document.getElementById('task-history-list');
  historyList.innerHTML = '';
  if (task.history && task.history.length > 0) {
    [...task.history].reverse().forEach(item => {
      const div = document.createElement('div');
      div.style.marginBottom = '15px';
      div.style.padding = '10px';
      div.style.background = 'white';
      div.style.borderRadius = '6px';
      div.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
      div.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
          <span style="font-weight:700; color:var(--primary-color); font-size:0.8rem;">${item.action}</span>
          <span style="font-size:0.7rem; color:#666;">${new Date(item.timestamp).toLocaleString()}</span>
        </div>
        <div style="font-size:0.85rem; color:#333; margin-bottom:5px;">${item.remarks || ''}</div>
        <div style="font-size:0.75rem; color:#888;">Updated by: ${item.user}</div>
        ${item.document ? `<a href="${item.document}" target="_blank" style="display:inline-block; margin-top:8px; font-size:0.75rem; color:var(--accent-color); font-weight:600;">View Attachment</a>` : ''}
      `;
      historyList.appendChild(div);
    });
  } else {
    historyList.innerHTML = '<p style="color:#999; font-style:italic;">No history available.</p>';
  }

  // Pre-populate Update Form
  document.getElementById('new-status').value = task.status;
  document.getElementById('update-remarks').value = '';
  document.getElementById('update-document').value = '';

  document.getElementById('task-modal').classList.remove('hidden');
}

document.getElementById('close-task-modal').addEventListener('click', () => {
  document.getElementById('task-modal').classList.add('hidden');
  viewingTaskId = null;
});

document.getElementById('update-status-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(document.getElementById('update-status-form'));

  try {
    const response = await fetch(`/tasks/${viewingTaskId}/status`, {
      method: 'PATCH',
      body: formData
    });
    if (await handleResponse(response, 'Status updated successfully')) {
      document.getElementById('task-modal').classList.add('hidden');
      document.getElementById('update-status-form').reset();
      loadTasks();
    }
  } catch (err) {
    alert('Error updating status');
  }
});

window.viewTask = viewTask;
// Password Change Handling
const passwordModal = document.getElementById('password-modal');
const openPasswordBtn = document.getElementById('open-change-password');
const closePasswordBtn = document.getElementById('close-password-modal');
const changePasswordForm = document.getElementById('change-password-form');
const passwordMessage = document.getElementById('password-message');

openPasswordBtn?.addEventListener('click', () => {
  passwordModal.classList.remove('hidden');
});

closePasswordBtn?.addEventListener('click', () => {
  passwordModal.classList.add('hidden');
  changePasswordForm.reset();
  setMessage('', true, passwordMessage);
});

changePasswordForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const currentPassword = document.getElementById('current-password').value;
  const newPassword = document.getElementById('new-password').value;
  const confirmPassword = document.getElementById('confirm-password').value;

  if (newPassword !== confirmPassword) {
    setMessage('Passwords do not match', false, passwordMessage);
    return;
  }

  try {
    const response = await fetch('/profile/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    
    if (await handleResponse(response, 'Password updated successfully', passwordMessage)) {
      setTimeout(() => {
        passwordModal.classList.add('hidden');
        changePasswordForm.reset();
        setMessage('', true, passwordMessage);
      }, 2000);
    }
  } catch (err) {
    setMessage('Error updating password', false, passwordMessage);
  }
});

// Chatbot Handling
const chatbotWidget = document.getElementById('chatbot-widget');
const chatbotToggle = document.getElementById('chatbot-toggle');
const chatbotWindow = document.getElementById('chatbot-window');
const chatbotClose = document.getElementById('chatbot-close');
const chatbotForm = document.getElementById('chatbot-form');
const chatbotInput = document.getElementById('chatbot-input');
const chatbotMessages = document.getElementById('chatbot-messages');

chatbotToggle?.addEventListener('click', () => {
  chatbotWindow.classList.toggle('hidden');
});

chatbotClose?.addEventListener('click', () => {
  chatbotWindow.classList.add('hidden');
});

chatbotForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const query = chatbotInput.value.trim();
  if (!query) return;

  // Add user message
  appendChatMessage(query, 'user');
  chatbotInput.value = '';

  try {
    const response = await fetch('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    const data = await response.json();
    appendChatMessage(data.reply, 'bot');
  } catch (err) {
    appendChatMessage('Sorry, I encountered an error. Please try again.', 'bot');
  }
});

function appendChatMessage(text, sender) {
  const div = document.createElement('div');
  div.className = `chat-message ${sender}-message`;
  div.innerHTML = `<p>${text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</p>`;
  chatbotMessages.appendChild(div);
  chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
}
