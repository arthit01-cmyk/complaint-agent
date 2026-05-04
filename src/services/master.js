const fs = require('fs');
const path = require('path');

const masterFile = process.env.MASTER_FILE
  ? path.resolve(process.env.MASTER_FILE)
  : path.resolve(__dirname, '../data/master.json');

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s/g, '-');
}

function ensureMasterFile() {
  if (!fs.existsSync(masterFile)) {
    fs.mkdirSync(path.dirname(masterFile), { recursive: true });
    const bcrypt = require('bcryptjs');
    const defaultMaster = {
      urgencies: ['urgent', 'routine', 'FYI'],
      categories: [
        {
          key: 'water',
          name: 'Water',
          department: 'Water',
          defaultUrgency: 'routine',
          urgentKeywords: ['leak', 'outage', 'contaminated', 'burst', 'flood'],
          keywords: ['water leak', 'water outage', 'contaminated water', 'broken pipe']
        },
        {
          key: 'roads',
          name: 'Roads',
          department: 'Roads',
          defaultUrgency: 'routine',
          urgentKeywords: ['collapse', 'blocked', 'hazard', 'sinkhole'],
          keywords: ['pothole', 'road collapse', 'damaged signage', 'blocked road']
        },
        {
          key: 'sanitation',
          name: 'Sanitation',
          department: 'Sanitation',
          defaultUrgency: 'routine',
          urgentKeywords: ['sewage', 'hazard', 'odor', 'overflow'],
          keywords: ['garbage', 'sewage leak', 'drain blockage', 'odor']
        },
        {
          key: 'street-lights',
          name: 'Street Lights',
          department: 'Street Lights',
          defaultUrgency: 'routine',
          urgentKeywords: ['outage', 'broken', 'flicker'],
          keywords: ['light outage', 'broken pole', 'flickering light', 'damaged fixture']
        },
        {
          key: 'tax',
          name: 'Tax',
          department: 'Tax Office',
          defaultUrgency: 'routine',
          urgentKeywords: ['audit', 'penalty', 'late', 'due', 'notice', 'immediate', 'urgent'],
          keywords: ['tax liability', 'tax audit', 'property tax', 'income tax', 'tax notice', 'tax payment']
        },
        {
          key: 'death-&-birth',
          name: 'Death & Birth',
          department: 'Civil Registry',
          defaultUrgency: 'routine',
          urgentKeywords: ['certificate', 'registration', 'stillborn', 'newborn', 'urgent'],
          keywords: ['death certificate', 'birth certificate', 'birth registration', 'death registration', 'newborn', 'stillborn']
        }
      ],
      departments: ['Water', 'Roads', 'Sanitation', 'Street Lights', 'Tax Office', 'Civil Registry'],
      users: [
        {
          key: 'admin',
          name: 'Administrator',
          designation: 'System Admin',
          email: 'admin@workdesk.com',
          contact: '1234567890',
          role: 'admin',
          password: bcrypt.hashSync('admin123', 10),
          department: null
        },
        {
          key: 'test-user',
          name: 'Test User',
          designation: 'Employee',
          email: 'user@workdesk.com',
          contact: '0987654321',
          role: 'user',
          password: bcrypt.hashSync('user123', 10),
          department: 'Water'
        },
        {
          key: 'deepak-rajak',
          name: 'Deepak Rajak',
          designation: 'Manager',
          email: 'deepak@workdesk.com',
          contact: '1122334455',
          role: 'user',
          password: bcrypt.hashSync('user123', 10),
          department: 'Roads'
        }
      ]
    };
    fs.writeFileSync(masterFile, JSON.stringify(defaultMaster, null, 2), 'utf8');
  }
}

function readMaster() {
  ensureMasterFile();
  const raw = fs.readFileSync(masterFile, 'utf8');
  return JSON.parse(raw || '{}');
}

function writeMaster(data) {
  fs.writeFileSync(masterFile, JSON.stringify(data, null, 2), 'utf8');
}

function getCategories() {
  const data = readMaster();
  return Array.isArray(data.categories) ? data.categories : [];
}

function getUrgencyLevels() {
  const data = readMaster();
  return Array.isArray(data.urgencies) ? data.urgencies : [];
}

function getDepartments() {
  const data = readMaster();
  return Array.isArray(data.departments) ? data.departments : [];
}

function getDepartmentByKey(key) {
  if (!key) return null;
  const normalizedKey = normalizeKey(key);
  return getDepartments().find(item => normalizeKey(item) === normalizedKey) || null;
}

function authenticateUser(username, password) {
  const user = getUsers().find(u => u.key === username || u.email === username);
  if (!user) return null;
  const bcrypt = require('bcryptjs');
  if (bcrypt.compareSync(password, user.password)) {
    return user;
  }
  return null;
}

function getUsers() {
  const data = readMaster();
  return Array.isArray(data.users) ? data.users : [];
}

function getUserByKey(key) {
  if (!key) return null;
  const normalizedKey = normalizeKey(key);
  return getUsers().find(item => item.key === normalizedKey || normalizeKey(item.name) === normalizedKey) || null;
}

function addUser(user) {
  if (!user || !user.name || !user.designation || !user.email || !user.contact || !user.role || !user.password) {
    throw new Error('User must include name, designation, email, contact, role, and password.');
  }

  const users = getUsers();
  const key = normalizeKey(user.name);
  if (users.some(item => item.key === key || normalizeKey(item.email) === normalizeKey(user.email))) {
    throw new Error('User already exists with that name or email.');
  }

  const bcrypt = require('bcryptjs');
  const hashedPassword = bcrypt.hashSync(user.password, 10);

  const newUser = {
    key,
    name: user.name.trim(),
    designation: user.designation.trim(),
    email: user.email.trim(),
    contact: user.contact.trim(),
    role: user.role,
    password: hashedPassword,
    department: user.department || null
  };

  users.push(newUser);
  const data = readMaster();
  data.users = users;
  writeMaster(data);
  return newUser;
}

function updateUser(oldKey, updates) {
  if (!oldKey) {
    throw new Error('User key is required to update the user.');
  }

  const users = getUsers();
  const existing = getUserByKey(oldKey);
  if (!existing) {
    throw new Error('User not found.');
  }

  const name = updates.name ? updates.name.trim() : existing.name;
  const designation = updates.designation ? updates.designation.trim() : existing.designation;
  const email = updates.email ? updates.email.trim() : existing.email;
  const contact = updates.contact ? updates.contact.trim() : existing.contact;
  const role = updates.role || existing.role;
  const password = updates.password || existing.password;
  const department = updates.department || existing.department;

  if (!name || !designation || !email || !contact) {
    throw new Error('User must include name, designation, email, and contact details.');
  }

  const newKey = normalizeKey(name);
  // Only check for duplicate name if the name is actually changing
  if (newKey !== existing.key) {
    const duplicate = users.find(item => item.key === newKey);
    if (duplicate) {
      throw new Error('A user with that name already exists.');
    }
  }

  const updatedUser = {
    ...existing,
    key: newKey,
    name,
    designation,
    email,
    contact,
    role,
    password,
    department
  };

  const updatedUsers = users.map(item => (item.key === existing.key ? updatedUser : item));
  const data = readMaster();
  data.users = updatedUsers;
  writeMaster(data);
  return updatedUser;
}

function deleteUser(key) {
  if (!key) {
    throw new Error('User key is required to delete the user.');
  }

  const users = getUsers();
  const existing = getUserByKey(key);
  if (!existing) {
    throw new Error('User not found.');
  }

  const remaining = users.filter(item => item.key !== existing.key);
  const data = readMaster();
  data.users = remaining;
  writeMaster(data);
  return existing;
}

function addCategory(category) {
  if (!category || !category.name || !category.department || !category.defaultUrgency) {
    throw new Error('Category must include name, department, and default urgency.');
  }

  const categories = getCategories();
  const key = normalizeKey(category.name);
  if (categories.some(item => item.key === key || normalizeKey(item.name) === key)) {
    throw new Error('Category already exists.');
  }

  const newCategory = {
    key,
    name: category.name.trim(),
    department: category.department.trim(),
    defaultUrgency: category.defaultUrgency,
    urgentKeywords: Array.isArray(category.urgentKeywords) ? category.urgentKeywords.map(String).map(k => k.trim().toLowerCase()).filter(Boolean) : [],
    keywords: Array.isArray(category.keywords) ? category.keywords.map(String).map(k => k.trim().toLowerCase()).filter(Boolean) : []
  };

  categories.push(newCategory);
  const data = readMaster();
  data.categories = categories;
  writeMaster(data);
  return newCategory;
}

function addUrgencyLevel(label) {
  if (!label || !label.trim()) {
    throw new Error('Urgency label is required.');
  }

  const urgencies = getUrgencyLevels();
  const normalized = String(label).trim();
  const alreadyExists = urgencies.some(existing => existing.toLowerCase() === normalized.toLowerCase());
  if (alreadyExists) {
    throw new Error('Urgency level already exists. Use a new label.');
  }

  urgencies.push(normalized);
  const data = readMaster();
  data.urgencies = urgencies;
  writeMaster(data);
  return normalized;
}

function updateCategory(oldKey, updates) {
  if (!oldKey) {
    throw new Error('Category key is required to update the category.');
  }

  const categories = getCategories();
  const existing = getCategoryByKey(oldKey);
  if (!existing) {
    throw new Error('Category not found.');
  }

  const name = updates.name ? updates.name.trim() : existing.name;
  const department = updates.department ? updates.department.trim() : existing.department;
  const defaultUrgency = updates.defaultUrgency || existing.defaultUrgency;

  if (!name || !department || !defaultUrgency) {
    throw new Error('Category must include name, department, and default urgency.');
  }

  const newKey = normalizeKey(name);
  const duplicate = categories.find(item => item.key === newKey && item.key !== existing.key);
  if (duplicate) {
    throw new Error('A category with that name already exists.');
  }

  const updatedCategory = {
    ...existing,
    key: newKey,
    name,
    department,
    defaultUrgency,
    keywords: Array.isArray(updates.keywords)
      ? updates.keywords.map(String).map(k => k.trim().toLowerCase()).filter(Boolean)
      : existing.keywords,
    urgentKeywords: Array.isArray(updates.urgentKeywords)
      ? updates.urgentKeywords.map(String).map(k => k.trim().toLowerCase()).filter(Boolean)
      : existing.urgentKeywords
  };

  const updatedCategories = categories.map(item => (item.key === existing.key ? updatedCategory : item));
  const data = readMaster();
  data.categories = updatedCategories;
  writeMaster(data);
  return updatedCategory;
}

function deleteCategory(key) {
  if (!key) {
    throw new Error('Category key is required to delete the category.');
  }

  const categories = getCategories();
  const existing = getCategoryByKey(key);
  if (!existing) {
    throw new Error('Category not found.');
  }

  const remaining = categories.filter(item => item.key !== existing.key);
  const data = readMaster();
  data.categories = remaining;
  writeMaster(data);
  return existing;
}

function deleteUrgencyLevel(label) {
  if (!label || !label.trim()) {
    throw new Error('Urgency label is required to delete.');
  }

  const urgencies = getUrgencyLevels();
  const normalized = String(label).trim();
  if (!urgencies.some(item => item.toLowerCase() === normalized.toLowerCase())) {
    throw new Error('Urgency level not found.');
  }

  const categories = getCategories();
  const inUse = categories.some(category => category.defaultUrgency.toLowerCase() === normalized.toLowerCase());
  if (inUse) {
    throw new Error('Cannot delete urgency while it is used as a default urgency by a category.');
  }

  const updated = urgencies.filter(item => item.toLowerCase() !== normalized.toLowerCase());
  const data = readMaster();
  data.urgencies = updated;
  writeMaster(data);
  return normalized;
}

function getCategoryByKey(key) {
  return null; // Categories removed for task system
}

function addDepartment(name) {
  if (!name || !name.trim()) {
    throw new Error('Department name is required.');
  }
  const departments = getDepartments();
  const normalized = String(name).trim();
  if (departments.some(dept => dept.toLowerCase() === normalized.toLowerCase())) {
    throw new Error('Department already exists.');
  }
  departments.push(normalized);
  const data = readMaster();
  data.departments = departments;
  writeMaster(data);
  return normalized;
}

function deleteDepartment(name) {
  if (!name || !name.trim()) {
    throw new Error('Department name is required.');
  }
  const departments = getDepartments();
  const normalized = String(name).trim();
  if (!departments.some(dept => dept.toLowerCase() === normalized.toLowerCase())) {
    throw new Error('Department not found.');
  }
  const updated = departments.filter(dept => dept.toLowerCase() !== normalized.toLowerCase());
  const data = readMaster();
  data.departments = updated;
  writeMaster(data);
  return normalized;
}

function updateDepartment(oldName, newName) {
  if (!oldName || !oldName.trim()) {
    throw new Error('Current department name is required.');
  }
  if (!newName || !newName.trim()) {
    throw new Error('New department name is required.');
  }
  const departments = getDepartments();
  const normalizedOld = String(oldName).trim();
  const normalizedNew = String(newName).trim();
  const index = departments.findIndex(dept => dept.toLowerCase() === normalizedOld.toLowerCase());
  if (index === -1) {
    throw new Error('Department not found.');
  }
  if (departments.some((dept, i) => i !== index && dept.toLowerCase() === normalizedNew.toLowerCase())) {
    throw new Error('A department with that name already exists.');
  }
  departments[index] = normalizedNew;
  const data = readMaster();
  data.departments = departments;
  writeMaster(data);
  return normalizedNew;
}

function updateUrgencyLevel(oldLabel, newLabel) {
  if (!oldLabel || !oldLabel.trim()) {
    throw new Error('Current urgency label is required.');
  }
  if (!newLabel || !newLabel.trim()) {
    throw new Error('New urgency label is required.');
  }
  const urgencies = getUrgencyLevels();
  const normalizedOld = String(oldLabel).trim();
  const normalizedNew = String(newLabel).trim();
  const index = urgencies.findIndex(urg => urg.toLowerCase() === normalizedOld.toLowerCase());
  if (index === -1) {
    throw new Error('Urgency level not found.');
  }
  if (urgencies.some((urg, i) => i !== index && urg.toLowerCase() === normalizedNew.toLowerCase())) {
    throw new Error('An urgency level with that label already exists.');
  }
  urgencies[index] = normalizedNew;
  const data = readMaster();
  data.urgencies = urgencies;
  writeMaster(data);
  return normalizedNew;
}

function updateUserPassword(key, hashedPassword) {
  const users = getUsers();
  const user = users.find(u => u.key === key);
  if (user) {
    user.password = hashedPassword;
    const data = readMaster();
    data.users = users;
    writeMaster(data);
  }
}

module.exports = {
  getCategories,
  getCategoryByKey,
  getUsers,
  getUserByKey,
  getUrgencyLevels,
  addCategory,
  addUrgencyLevel,
  addUser,
  updateUser,
  updateUserPassword,
  updateCategory,
  deleteUser,
  deleteCategory,
  deleteUrgencyLevel,
  normalizeKey,
  authenticateUser,
  getDepartments,
  getDepartmentByKey,
  addDepartment,
  deleteDepartment,
  updateDepartment,
  updateUrgencyLevel
};

