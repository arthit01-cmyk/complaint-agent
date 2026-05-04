const fs = require('fs');
const path = require('path');
const vectorService = require('./vector');

const dataFile = process.env.DATA_FILE
  ? path.resolve(process.env.DATA_FILE)
  : path.resolve(__dirname, '../data/tasks.json');

function ensureDataFile() {
  if (!fs.existsSync(dataFile)) {
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    fs.writeFileSync(dataFile, JSON.stringify([], null, 2), 'utf8');
  }
}

function readData() {
  ensureDataFile();
  const raw = fs.readFileSync(dataFile, 'utf8');
  return JSON.parse(raw || '[]');
}

function writeData(records) {
  fs.writeFileSync(dataFile, JSON.stringify(records, null, 2), 'utf8');
}

function getAllTasks() {
  return readData();
}

function getTaskById(id) {
  const tasks = readData();
  return tasks.find(item => item.id === id) || null;
}

function getPendingTasks() {
  return readData().filter(item => !['completed', 'closed'].includes((item.status || '').toLowerCase()));
}

function saveTask(task) {
  const tasks = readData();
  tasks.push(task);
  writeData(tasks);
  vectorService.upsertTask(task);
  return task;
}

function updateTask(id, update) {
  const tasks = readData();
  const index = tasks.findIndex(item => item.id === id);
  if (index === -1) return null;
  tasks[index] = { ...tasks[index], ...update };
  writeData(tasks);
  vectorService.upsertTask(tasks[index]);
  return tasks[index];
}

module.exports = {
  getAllTasks,
  getPendingTasks,
  getTaskById,
  saveTask,
  updateTask
};
