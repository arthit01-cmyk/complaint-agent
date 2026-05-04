const navButtons = document.querySelectorAll('.nav-button');
const dashboardPanel = document.getElementById('dashboard-panel');
const createTaskPanel = document.getElementById('create-task-panel');
const myTasksPanel = document.getElementById('my-tasks-panel');
const manageUsersPanel = document.getElementById('manage-users-panel');
const reportingPanel = document.getElementById('reporting-panel');
const loginPanel = document.getElementById('login-panel');

const taskForm = document.getElementById('task-form');
const globalMessage = document.getElementById('global-message');
const loginForm = document.getElementById('login-form');
const loginMessage = document.getElementById('login-message');
const taskList = document.getElementById('task-list');
const refreshButton = document.getElementById('refresh-button');
const logoutButton = document.getElementById('logout-button');
const dashboardStatus = document.getElementById('dashboard-status');
const queueSummary = document.getElementById('queue-summary');

const departmentSelect = document.getElementById('department');
const userSelect = document.getElementById('user');
const searchInput = document.getElementById('search-input');
const filterDepartment = document.getElementById('filter-department');
const filterStatus = document.getElementById('filter-status');
const clearFiltersButton = document.getElementById('clear-filters');

const reportDepartmentSelect = document.getElementById('report-department');
const reportUserSelect = document.getElementById('report-user');
const reportStatusSelect = document.getElementById('report-status');
const reportRefreshButton = document.getElementById('report-refresh');
const reportClearButton = document.getElementById('report-clear');

const userForm = document.getElementById('user-form');
const userNameInput = document.getElementById('user-name');
const userDesignationInput = document.getElementById('user-designation');
const userEmailInput = document.getElementById('user-email');
const userContactInput = document.getElementById('user-contact');
const userRoleSelect = document.getElementById('user-role');
const userDepartmentSelect = document.getElementById('user-department');
const userPasswordInput = document.getElementById('user-password');
const userList = document.getElementById('user-list');
const cancelUserEdit = document.getElementById('cancel-user-edit');

const allTasks = [];
let masterDepartments = [];
let masterUsers = [];
let currentUser = null;
let editingUserKey = null;
const statuses = ['Assigned', 'In Progress', 'Completed'];

document.addEventListener('DOMContentLoaded', () => {
  document.querySelector('.sidebar').classList.add('hidden');
  checkLogin();
});
  navButtons.forEach(button => {
    button.classList.toggle('active', button.dataset.tab === tab);
  });
  loginPanel.classList.toggle('hidden', tab !== 'login');
  dashboardPanel.classList.toggle('hidden', tab !== 'dashboard');
  createTaskPanel.classList.toggle('hidden', tab !== 'create-task');
  myTasksPanel.classList.toggle('hidden', tab !== 'my-tasks');
  manageUsersPanel.classList.toggle('hidden', tab !== 'manage-users');
  reportingPanel.classList.toggle('hidden', tab !== 'reporting');
}

function setMessage(text, success = true, el = globalMessage) {
  if (!el) return;
  el.textContent = text;
  el.style.color = success ? '#065f46' : '#b91c1c';
  if (text) el.classList.remove('hidden');
  else el.classList.add('hidden');
}

function setMasterMessage(text, success = true, el = masterCatMessage) {
  setMessage(text, success, el);
}

function setCategoryFormMode(category) {
  editingCategoryKey = category ? category.key : null;
  categoryNameInput.value = category?.name || '';
  categoryDepartmentInput.value = category?.department || '';
  categoryUrgencySelect.value = category?.defaultUrgency || (urgencyLevels[0] || '');
  categoryKeywordsInput.value = (category?.keywords || []).join(', ');
  categoryUrgentKeywordsInput.value = (category?.urgentKeywords || []).join(', ');
  const submitButton = categoryForm.querySelector('button[type="submit"]');
  if (submitButton) {
    submitButton.textContent = editingCategoryKey ? 'Save changes' : 'Add category';
  }
  if (cancelCategoryButton) {
    cancelCategoryButton.classList.toggle('hidden', !editingCategoryKey);
  }
}

function clearCategoryFormMode() {
  setCategoryFormMode(null);
  setMasterMessage('', true, masterUserMessage); // Clear user
}

function normalizeText(value) {
  return String(value || '').toLowerCase();
}

function getFilteredComplaints() {
  const search = normalizeText(searchInput.value);
  const category = filterCategory.value;
  const department = filterDepartment.value;
  const urgency = filterUrgency.value;
  const status = filterStatus.value;

  return allComplaints.filter(complaint => {
    if (category !== 'all' && complaint.category !== category) return false;
    if (department !== 'all' && complaint.department !== department) return false;
    if (urgency !== 'all' && complaint.urgency !== urgency) return false;
    if (status !== 'all' && complaint.status !== status) return false;

    if (!search) return true;
    return [complaint.description, complaint.location, complaint.reporter?.name, complaint.id]
      .some(value => normalizeText(value).includes(search));
  });
}

function renderCategoryOptions() {
  const options = masterCategories.map(category => `<option value="${category.key}">${category.name}</option>`).join('');
  categorySelect.innerHTML = options;
  filterCategory.innerHTML = `<option value="all">All categories</option>${options}`;
}

function renderDepartmentOptions() {
  const departments = [...new Set(masterCategories.map(category => category.department))].sort();
  const options = departments.map(department => `<option value="${department}">${department}</option>`).join('');
  filterDepartment.innerHTML = `<option value="all">All departments</option>${options}`;
}

function renderUrgencyOptions() {
  const options = urgencyLevels.map(urgency => `<option value="${urgency}">${urgency}</option>`).join('');
  categoryUrgencySelect.innerHTML = options;
  filterUrgency.innerHTML = `<option value="all">All urgencies</option>${options}`;
}

function renderAssignmentOptions(assignedKey) {
  const options = [
    '<option value="">Unassigned</option>',
    ...masterUsers.map(user => `<option value="${user.key}" ${user.key === assignedKey ? 'selected' : ''}>${user.name}</option>`)
  ];
  return options.join('');
}

function renderReportFilters() {
  const sections = [...new Set(masterCategories.map(category => category.department))].sort();
  const sectionOptions = sections.map(section => `<option value="${section}">${section}</option>`).join('');
  reportSectionSelect.innerHTML = `<option value="all">All sections</option>${sectionOptions}`;

  const categoryOptions = masterCategories.map(category => `<option value="${category.name}">${category.name}</option>`).join('');
  reportCategorySelect.innerHTML = `<option value="all">All categories</option>${categoryOptions}`;

  const userOptions = masterUsers.map(user => `<option value="${user.key}">${user.name}</option>`).join('');
  reportUserSelect.innerHTML = `<option value="all">All users</option>${userOptions}`;
}

function renderMasterCategories() {
  if (!masterCategories.length) {
    masterCategoriesList.innerHTML = '<p>No categories defined yet.</p>';
    return;
  }

  masterCategoriesList.innerHTML = `
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Department</th>
            <th>Default urgency</th>
            <th>Keywords</th>
            <th>Urgent keywords</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${masterCategories
            .map(category => `
            <tr>
              <td>${category.name}</td>
              <td>${category.department}</td>
              <td>${category.defaultUrgency}</td>
              <td>${(category.keywords || []).join(', ')}</td>
              <td>${(category.urgentKeywords || []).join(', ')}</td>
              <td>
                <button type="button" data-action="edit-category" data-key="${category.key}">Edit</button>
                <button type="button" data-action="delete-category" data-key="${category.key}" class="secondary">Delete</button>
              </td>
            </tr>
          `)
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderUrgencyList() {
  if (!urgencyLevels.length) {
    urgencyList.innerHTML = '<li>No urgencies defined.</li>';
    return;
  }

  urgencyList.innerHTML = urgencyLevels
    .map(level => `
      <li>
        <span>${level}</span>
        <button type="button" data-action="delete-urgency" data-label="${level}" class="secondary">Delete</button>
      </li>
    `)
    .join('');
}

function renderUserList() {
  if (!masterUsers.length) {
    userList.innerHTML = '<p>No users defined yet.</p>';
    return;
  }

  userList.innerHTML = `
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Designation</th>
            <th>Email</th>
            <th>Contact</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${masterUsers
            .map(user => `
            <tr>
              <td>${user.name}</td>
              <td>${user.designation}</td>
              <td>${user.email}</td>
              <td>${user.contact}</td>
              <td>
                <button type="button" data-action="edit-user" data-key="${user.key}">Edit</button>
                <button type="button" data-action="delete-user" data-key="${user.key}" class="secondary">Delete</button>
              </td>
            </tr>
          `)
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderQueueSummary(complaints) {
  const departments = [...new Set(complaints.map(c => c.department))].sort();

  if (!departments.length) {
    queueSummary.innerHTML = '<p>No department queue data available.</p>';
    return;
  }

  queueSummary.innerHTML = `
    <div class="summary-grid">
      ${departments
        .map(department => {
          const queue = complaints.filter(c => c.department === department && c.status !== 'Closed');
          const urgentCount = queue.filter(c => c.urgency === 'urgent').length;
          const receivedCount = queue.filter(c => c.status === 'Received').length;
          const inProgressCount = queue.filter(c => c.status === 'In progress').length;
          const topIssue = queue[0]?.description || 'No open complaints';

          return `
            <div class="summary-card">
              <h3>${department} queue</h3>
              <p><strong>Open cases:</strong> ${queue.length}</p>
              <p><strong>Urgent:</strong> ${urgentCount}</p>
              <p><strong>Received:</strong> ${receivedCount}</p>
              <p><strong>In progress:</strong> ${inProgressCount}</p>
              <p><strong>Top issue:</strong> ${topIssue}</p>
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}

function buildReportFromComplaints(complaints) {
  const total = complaints.length;
  const open = complaints.filter(c => c.status !== 'Closed').length;
  const urgent = complaints.filter(c => c.urgency === 'urgent').length;
  const byCategory = {};
  const byDepartment = {};
  const byStatus = {};

  complaints.forEach(complaint => {
    const categoryKey = complaint.categoryLabel || complaint.category;
    byCategory[categoryKey] = (byCategory[categoryKey] || 0) + 1;
    byDepartment[complaint.department] = (byDepartment[complaint.department] || 0) + 1;
    byStatus[complaint.status] = (byStatus[complaint.status] || 0) + 1;
  });

  return { total, open, urgent, byCategory, byDepartment, byStatus };
}

function renderReportTable(rows) {
  if (!Array.isArray(rows) || !rows.length) {
    reportingTable.innerHTML = '<p>No report rows match the selected filters.</p>';
    return;
  }

  reportingTable.innerHTML = `
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Category</th>
            <th>Department</th>
            <th>Urgency</th>
            <th>Status</th>
            <th>Assigned To</th>
            <th>Location</th>
            <th>Reporter</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(row => `
            <tr>
              <td>${row.id}</td>
              <td>${row.category}</td>
              <td>${row.department}</td>
              <td>${row.urgency}</td>
              <td>${row.status}</td>
              <td>${row.assignedTo}</td>
              <td>${row.location}</td>
              <td>${row.reporter}</td>
            </tr>
          `)
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

function exportReportPdf() {
  const rows = Array.from(reportingTable.querySelectorAll('tbody tr'))
    .map(tr => Array.from(tr.children).map(cell => cell.textContent));

  if (!rows.length) {
    alert('No report rows available to export.');
    return;
  }

  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert('PDF export is not available.');
    return;
  }

  const doc = new window.jspdf.jsPDF();
  doc.setFontSize(14);
  doc.text('Complaint report', 14, 18);
  doc.autoTable({
    startY: 24,
    head: [[ 'ID', 'Category', 'Department', 'Urgency', 'Status', 'Assigned To', 'Location', 'Reporter' ]],
    body: rows
  });
  doc.save('complaint-report.pdf');
}

function renderReporting(reportData) {
  const report = Array.isArray(reportData) ? buildReportFromComplaints(reportData) : reportData;
  const { total, open, urgent, byCategory, byDepartment, byStatus, rows } = report;

  reportingSummary.innerHTML = `
    <div class="summary-card">
      <h3>Total complaints</h3>
      <p>${total}</p>
    </div>
    <div class="summary-card">
      <h3>Open complaints</h3>
      <p>${open}</p>
    </div>
    <div class="summary-card">
      <h3>Urgent complaints</h3>
      <p>${urgent}</p>
    </div>
  `;

  const renderBreakdown = (title, data) => {
    return `
      <div class="summary-card">
        <h3>${title}</h3>
        <ul>
          ${Object.keys(data)
            .sort()
            .map(key => `<li>${key}: ${data[key]}</li>`)
            .join('')}
        </ul>
      </div>
    `;
  };

  reportingBreakdown.innerHTML = `
    <div class="summary-grid">
      ${renderBreakdown('By category', byCategory)}
      ${renderBreakdown('By department', byDepartment)}
      ${renderBreakdown('By status', byStatus)}
    </div>
  `;

  renderReportTable(rows || []);
}

function createHistoryMarkup(history) {
  return history
    .map(item => `<li><strong>${item.status}</strong> — ${new Date(item.updatedAt).toLocaleString()}<br><em>${item.note}</em></li>`)
    .join('');
}

function renderComplaints(complaints) {
  if (!complaints.length) {
    complaintList.innerHTML = '<p>No complaints match the current filters.</p>';
    return;
  }

  complaintList.innerHTML = `
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Category</th>
            <th>Department</th>
            <th>Urgency</th>
            <th>Status</th>
            <th>Assigned to</th>
            <th>Location</th>
            <th>Reporter</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${complaints
            .map(complaint => `
            <tr>
              <td>${complaint.id}</td>
              <td>${complaint.categoryLabel || complaint.category}</td>
              <td>${complaint.department}</td>
              <td>${complaint.urgency}</td>
              <td><span class="status-chip">${complaint.status}</span></td>
              <td>${complaint.assignedToLabel || 'Unassigned'}</td>
              <td>${complaint.location}</td>
              <td>${complaint.reporter?.name || 'Unknown'}</td>
              <td>
                ${complaint.status !== 'Closed' ? `
                <div style="display: flex; gap: 4px; margin-bottom: 4px;">
                  <select data-id="${complaint.id}" class="status-select">
                    ${statuses
                      .map(status => `<option value="${status}" ${status === complaint.status ? 'selected' : ''}>${status}</option>`)
                      .join('')}
                  </select>
                  <button type="button" data-action="update" data-id="${complaint.id}">Update</button>
                </div>
                ${complaint.assignedTo ? `
                  <div style="margin-top: 4px;"><em>Assigned to ${complaint.assignedToLabel || 'a user'}</em></div>
                ` : `
                  <div style="display: flex; gap: 4px;">
                    <select data-id="${complaint.id}" class="assign-select">
                      ${renderAssignmentOptions(complaint.assignedTo)}
                    </select>
                    <button type="button" data-action="assign" data-id="${complaint.id}">Assign</button>
                  </div>
                `}
                ` : '<span>Closed</span>'}
              </td>
            </tr>
            <tr>
              <td colspan="8" class="details-cell">
                <details>
                  <summary>View details & history</summary>
                  <p><strong>Description:</strong> ${complaint.description}</p>
                  <p><strong>Assigned to:</strong> ${complaint.assignedToLabel || 'Unassigned'}</p>
                  <p><strong>Created:</strong> ${new Date(complaint.createdAt).toLocaleString()}</p>
                  <p><strong>Last updated:</strong> ${new Date(complaint.updatedAt).toLocaleString()}</p>
                  <ul>${createHistoryMarkup(complaint.history)}</ul>
                </details>
              </td>
            </tr>
          `)
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderDashboard() {
  const filtered = getFilteredComplaints();
  filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  renderQueueSummary(allComplaints);
  renderComplaints(filtered);
  renderReporting(allComplaints);
  dashboardStatus.textContent = `Showing ${filtered.length} complaint(s) (filtered from ${allComplaints.length}).`;
}

async function fetchMasters() {
  try {
    const [categoriesResponse, urgenciesResponse, usersResponse] = await Promise.all([
      fetch('/masters/categories'),
      fetch('/masters/urgencies'),
      fetch('/masters/users')
    ]);

    if (!categoriesResponse.ok || !urgenciesResponse.ok || !usersResponse.ok) {
      throw new Error('Unable to load master data');
    }

    masterCategories = await categoriesResponse.json();
    urgencyLevels = await urgenciesResponse.json();
    masterUsers = await usersResponse.json();
    renderCategoryOptions();
    renderDepartmentOptions();
    renderUrgencyOptions();
    renderReportFilters();
    renderMasterCategories();
    renderUrgencyList();
    renderUserList();
  } catch (error) {
    setMessage(error.message, false, lodgeMessage);
  }
}

async function fetchComplaints() {
  dashboardStatus.textContent = 'Loading complaints...';
  try {
    const response = await fetch('/complaints');
    if (!response.ok) {
      throw new Error('Unable to load complaints');
    }
    const complaints = await response.json();
    allComplaints.length = 0;
    allComplaints.push(...complaints);
    renderDashboard();
  } catch (error) {
    dashboardStatus.textContent = error.message;
  }
}

async function fetchReportSummary() {
  const params = new URLSearchParams();
  if (reportSectionSelect.value !== 'all') params.set('section', reportSectionSelect.value);
  if (reportCategorySelect.value !== 'all') params.set('category', reportCategorySelect.value);
  if (reportUserSelect.value !== 'all') params.set('assignedTo', reportUserSelect.value);
  if (reportPendencySelect.value !== 'all') params.set('pendency', reportPendencySelect.value);

  try {
    const query = params.toString() ? `?${params.toString()}` : '';
    const response = await fetch(`/reports/summary${query}`);
    if (!response.ok) {
      throw new Error('Unable to load report summary');
    }
    const report = await response.json();
    renderReporting(report);
    reportingContent.classList.remove('hidden');
  } catch (error) {
    reportingSummary.innerHTML = `<p style="color:#b91c1c">${error.message}</p>`;
    reportingBreakdown.innerHTML = '';
    reportingTable.innerHTML = '';
  }
}

async function updateComplaintStatus(id, status) {
  try {
    const response = await fetch(`/complaints/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update status');
    }
    const updated = await response.json();
    message.textContent = `Updated complaint ${updated.id} to ${updated.status}.`;
    message.style.color = '#065f46';
    fetchComplaints();
  } catch (error) {
    console.error(error);
    setMessage(error.message, false);
  }
}

async function assignComplaint(id, assignedTo) {
  if (!assignedTo) {
    setMessage('Please select a user to assign the complaint to.', false);
    return;
  }
  try {
    const response = await fetch(`/complaints/${id}/assign`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignedTo })
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to assign complaint');
    }
    const updated = await response.json();
    setMessage(`Assigned complaint ${updated.id} to ${updated.assignedToLabel} and marked as Received.`, true);
    fetchComplaints();
  } catch (error) {
    console.error(error);
    setMessage(error.message, false);
  }
}

async function createCategory(event) {
  event.preventDefault();

  const name = categoryNameInput.value.trim();
  const department = categoryDepartmentInput.value.trim();
  const defaultUrgency = categoryUrgencySelect.value;

  if (!name || !department || !defaultUrgency) {
    setMasterMessage('Category name, department, and default urgency are required before adding a category.', false);
    return;
  }

  try {
    const method = editingCategoryKey ? 'PATCH' : 'POST';
    const url = editingCategoryKey ? `/masters/categories/${encodeURIComponent(editingCategoryKey)}` : '/masters/categories';
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        department,
        defaultUrgency,
        keywords: categoryKeywordsInput.value.split(',').map(k => k.trim()).filter(Boolean),
        urgentKeywords: categoryUrgentKeywordsInput.value.split(',').map(k => k.trim()).filter(Boolean)
      })
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Failed to save category. Please review the form values.');
    }
    const action = editingCategoryKey ? 'updated' : 'added';
    setMasterMessage(`Category ${result.name} ${action}.`, true);
    categoryForm.reset();
    clearCategoryFormMode();
    await fetchMasters();
    await fetchComplaints();
  } catch (error) {
    console.error(error);
    setMasterMessage(`Could not save category: ${error.message}`, false);
  }
}

async function createUrgency(event) {
  event.preventDefault();

  const label = urgencyLabelInput.value.trim();
  if (!label) {
    setMasterMessage('Urgency label cannot be empty. Enter a name like "urgent", "routine", or "critical".', false, masterUrgencyMessage);
    return;
  }

  try {
    const response = await fetch('/masters/urgencies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label })
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Failed to add urgency. Please choose a unique urgency label.');
    }
    if (!result.label) {
      throw new Error('Unexpected server response when adding urgency.');
    }
    setMasterMessage(`Urgency ${result.label} added.`, true, masterUrgencyMessage);
    urgencyForm.reset();
    await fetchMasters();
  } catch (error) {
    console.error(error);
    setMasterMessage(`Could not add urgency: ${error.message}`, false, masterUrgencyMessage);
  }
}

async function createUser(event) {
  event.preventDefault();

  const name = userNameInput.value.trim();
  const designation = userDesignationInput.value.trim();
  const email = userEmailInput.value.trim();
  const contact = userContactInput.value.trim();

  if (!name || !designation || !email || !contact) {
    setMasterMessage('User name, designation, email and contact are required.', false, masterUserMessage);
    return;
  }

  try {
    const method = editingUserKey ? 'PATCH' : 'POST';
    const url = editingUserKey ? `/masters/users/${encodeURIComponent(editingUserKey)}` : '/masters/users';
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, designation, email, contact })
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Failed to save user.');
    }
    const action = editingUserKey ? 'updated' : 'added';
    setMasterMessage(`User ${result.name} ${action}.`, true, masterUserMessage);
    userForm.reset();
    editingUserKey = null;
    cancelUserEdit.classList.add('hidden');
    await fetchMasters();
  } catch (error) {
    console.error(error);
    setMasterMessage(`Could not save user: ${error.message}`, false, masterUserMessage);
  }
}

async function deleteCategory(key) {
  if (!key) return;
  if (!confirm('Delete this category? This cannot be undone.')) return;
  try {
    const response = await fetch(`/masters/categories/${encodeURIComponent(key)}`, { method: 'DELETE' });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Failed to delete category.');
    }
    setMasterMessage(`Category ${result.deleted} deleted.`, true);
    if (editingCategoryKey === key) {
      clearCategoryFormMode();
      categoryForm.reset();
    }
    await fetchMasters();
    await fetchComplaints();
  } catch (error) {
    console.error(error);
    setMasterMessage(`Could not delete category: ${error.message}`, false);
  }
}

async function deleteUrgency(label) {
  if (!label) return;
  if (!confirm(`Delete urgency level "${label}"?`)) return;
  try {
    const response = await fetch(`/masters/urgencies/${encodeURIComponent(label)}`, { method: 'DELETE' });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Failed to delete urgency.');
    }
    setMasterMessage(`Urgency ${result.deleted} deleted.`, true, masterUrgencyMessage);
    await fetchMasters();
  } catch (error) {
    console.error(error);
    setMasterMessage(`Could not delete urgency: ${error.message}`, false, masterUrgencyMessage);
  }
}

async function deleteUser(key) {
  if (!key) return;
  if (!confirm('Delete this user? This cannot be undone.')) return;
  try {
    const response = await fetch(`/masters/users/${encodeURIComponent(key)}`, { method: 'DELETE' });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Failed to delete user.');
    }
    setMasterMessage(`User ${result.deleted} deleted.`, true, masterUserMessage);
    if (editingUserKey === key) {
      editingUserKey = null;
      userForm.reset();
      cancelUserEdit.classList.add('hidden');
    }
    await fetchMasters();
  } catch (error) {
    console.error(error);
    setMasterMessage(`Could not delete user: ${error.message}`, false, masterUserMessage);
  }
}

function resetFilters() {
  searchInput.value = '';
  filterCategory.value = 'all';
  filterDepartment.value = 'all';
  filterUrgency.value = 'all';
  filterStatus.value = 'all';
  renderDashboard();
}

navButtons.forEach(button => {
  button.addEventListener('click', () => setActiveTab(button.dataset.tab));
});

complaintList.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  const complaintId = button.dataset.id;

  if (action === 'update') {
    const select = document.querySelector(`select[data-id="${complaintId}"].status-select`);
    if (!select) return;
    updateComplaintStatus(complaintId, select.value);
  }

  if (action === 'assign') {
    const select = document.querySelector(`select[data-id="${complaintId}"].assign-select`);
    if (!select) return;
    assignComplaint(complaintId, select.value);
  }
});

masterCategoriesList.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  const key = button.dataset.key;
  if (action === 'edit-category') {
    const category = masterCategories.find(item => item.key === key);
    if (!category) return;
    setCategoryFormMode(category);
    setMasterMessage(`Editing category ${category.name}.`, true);
  }
  if (action === 'delete-category') {
    deleteCategory(key);
  }
});

userList.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  const key = button.dataset.key;
  const user = masterUsers.find(item => item.key === key);
  if (action === 'edit-user') {
    if (!user) return;
    editingUserKey = key;
    userNameInput.value = user.name;
    userDesignationInput.value = user.designation;
    userEmailInput.value = user.email;
    userContactInput.value = user.contact;
    cancelUserEdit.classList.remove('hidden');
    setMasterMessage(`Editing user ${user.name}.`, true, masterUserMessage);
  }
  if (action === 'delete-user') {
    deleteUser(key);
  }
});

urgencyList.addEventListener('click', event => {
  const button = event.target.closest('button[data-action="delete-urgency"]');
  if (!button) return;
  const label = button.dataset.label;
  deleteUrgency(label);
});

cancelCategoryButton?.addEventListener('click', () => {
  clearCategoryFormMode();
  categoryForm.reset();
});

complaintForm.addEventListener('submit', async event => {
  event.preventDefault();
  const newComplaint = {
    category: categorySelect.value,
    description: document.getElementById('description').value.trim(),
    location: document.getElementById('location').value.trim(),
    reporter: { name: document.getElementById('reporter').value.trim() }
  };

  try {
    const response = await fetch('/complaints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newComplaint)
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Failed to submit complaint');
    }
    setMessage(`Complaint submitted: ${result.id}`, true, lodgeMessage);
    complaintForm.reset();
    fetchComplaints();
  } catch (error) {
    setMessage(error.message, false, lodgeMessage);
  }
});

categoryForm.addEventListener('submit', createCategory);
urgencyForm.addEventListener('submit', createUrgency);
userForm.addEventListener('submit', createUser);
refreshButton.addEventListener('click', fetchComplaints);
searchInput.addEventListener('input', renderDashboard);
filterCategory.addEventListener('change', renderDashboard);
filterDepartment.addEventListener('change', renderDashboard);
filterUrgency.addEventListener('change', renderDashboard);
filterStatus.addEventListener('change', renderDashboard);
clearFiltersButton.addEventListener('click', resetFilters);
reportRefreshButton?.addEventListener('click', fetchReportSummary);
reportClearButton?.addEventListener('click', () => {
  reportingContent.classList.add('hidden');
  reportSectionSelect.value = 'all';
  reportCategorySelect.value = 'all';
  reportUserSelect.value = 'all';
  reportPendencySelect.value = 'all';
  fetchReportSummary();
});
exportReportButton?.addEventListener('click', exportReportPdf);
cancelUserEdit?.addEventListener('click', () => {
  editingUserKey = null;
  userForm.reset();
  cancelUserEdit.classList.add('hidden');
  setMasterMessage('', true, masterUserMessage); // Clear user
});

window.addEventListener('load', async () => {
  await fetchMasters();
  await fetchComplaints();
  
  // Calculate pending complaints (any complaint that is not Closed or Resolved)
  const pendingCount = allComplaints.filter(c => !['closed', 'resolved'].includes((c.status || '').toLowerCase())).length;
  
  pendingComplaintsMsg.textContent = `You have ${pendingCount} pending complaint${pendingCount !== 1 ? 's' : ''} to review.`;
  welcomeModal.classList.remove('hidden');
});

// Chatbot Logic
const chatbotToggle = document.getElementById('chatbot-toggle');
const chatbotWindow = document.getElementById('chatbot-window');
const chatbotClose = document.getElementById('chatbot-close');
const chatbotForm = document.getElementById('chatbot-form');
const chatbotInput = document.getElementById('chatbot-input');
const chatbotMessages = document.getElementById('chatbot-messages');

function addChatMessage(text, sender = 'user') {
  const div = document.createElement('div');
  div.className = `chat-message ${sender}-message`;
  const p = document.createElement('p');
  p.textContent = text;
  div.appendChild(p);
  chatbotMessages.appendChild(div);
  chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
}

chatbotToggle?.addEventListener('click', () => {
  chatbotWindow.classList.toggle('hidden');
  if (!chatbotWindow.classList.contains('hidden')) {
    chatbotInput.focus();
  }
});

chatbotClose?.addEventListener('click', () => {
  chatbotWindow.classList.add('hidden');
});

chatbotForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = chatbotInput.value.trim();
  if (!text) return;

  addChatMessage(text, 'user');
  chatbotInput.value = '';

  try {
    const response = await fetch('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: text })
    });
    const result = await response.json();
    addChatMessage(result.reply || "I'm sorry, I couldn't understand that.", 'bot');
  } catch (err) {
    addChatMessage("Error connecting to chat server.", 'bot');
  }
});

closeModalBtn?.addEventListener('click', () => {
  welcomeModal.classList.add('hidden');
});
