const fs = require('fs');
const path = require('path');

const dataFile = process.env.DATA_FILE
  ? path.resolve(process.env.DATA_FILE)
  : path.resolve(__dirname, '../data/complaints.json');

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

function getAllComplaints() {
  return readData();
}

function getComplaintById(id) {
  const complaints = readData();
  return complaints.find(item => item.id === id) || null;
}

function getPendingComplaints() {
  return readData().filter(item => ['Received', 'In progress'].includes(item.status));
}

function saveComplaint(complaint) {
  const complaints = readData();
  complaints.push(complaint);
  writeData(complaints);
  return complaint;
}

function updateComplaint(id, update) {
  const complaints = readData();
  const index = complaints.findIndex(item => item.id === id);
  if (index === -1) return null;
  complaints[index] = { ...complaints[index], ...update };
  writeData(complaints);
  return complaints[index];
}

module.exports = {
  getAllComplaints,
  getPendingComplaints,
  getComplaintById,
  saveComplaint,
  updateComplaint
};
