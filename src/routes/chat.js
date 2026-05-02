const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../../data/complaints.json');

function getComplaints() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (error) {
    return [];
  }
}

router.post('/', (req, res) => {
  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ reply: "Please ask a question." });
  }

  const text = query.toLowerCase();
  const complaints = getComplaints();
  let filtered = [...complaints];

  // 1. Date Filtering
  const now = new Date();
  let dateFilterApplied = false;
  let dateFilterStr = "overall";

  if (text.includes("last month")) {
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    filtered = filtered.filter(c => {
      const d = new Date(c.createdAt);
      return d >= lastMonth && d < thisMonth;
    });
    dateFilterApplied = true;
    dateFilterStr = "last month";
  } else if (text.includes("this month")) {
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    filtered = filtered.filter(c => new Date(c.createdAt) >= thisMonth);
    dateFilterApplied = true;
    dateFilterStr = "this month";
  } else if (text.includes("today")) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    filtered = filtered.filter(c => new Date(c.createdAt) >= today);
    dateFilterApplied = true;
    dateFilterStr = "today";
  }

  // 2. Category Filtering (Heuristic check for common words)
  let categoryFilterApplied = false;
  let categoryFilterStr = "";
  
  // Extract all categories currently in the dataset to dynamically match
  const uniqueCategories = [...new Set(complaints.map(c => c.category.toLowerCase()))];
  for (const cat of uniqueCategories) {
    if (text.includes(cat)) {
      filtered = filtered.filter(c => c.category.toLowerCase() === cat);
      categoryFilterApplied = true;
      categoryFilterStr = cat;
      break; // match first found category
    }
  }

  // 3. Status Filtering
  let statusFilterApplied = false;
  let statusFilterStr = "";
  
  if (text.includes("pending") || text.includes("open") || text.includes("unresolved")) {
    filtered = filtered.filter(c => c.status !== 'closed' && c.status !== 'resolved');
    statusFilterApplied = true;
    statusFilterStr = "pending";
  } else if (text.includes("resolved") || text.includes("completed") || text.includes("closed")) {
    filtered = filtered.filter(c => c.status === 'closed' || c.status === 'resolved');
    statusFilterApplied = true;
    statusFilterStr = "resolved";
  }

  // Construct Reply
  let reply = `I found ${filtered.length} complaint(s)`;
  
  if (statusFilterApplied) {
    reply += ` that are currently ${statusFilterStr}`;
  }
  
  if (categoryFilterApplied) {
    reply += ` in the '${categoryFilterStr}' section`;
  }
  
  if (dateFilterApplied) {
    reply += ` from ${dateFilterStr}`;
  } else {
    reply += ` in total`;
  }
  
  reply += ".";

  // Handle specific question phrasing overrides
  if (text.includes("how many") && text.includes("received")) {
    // A slightly more conversational reply
    reply = `You received a total of ${filtered.length} complaint(s)`;
    if (categoryFilterApplied) reply += ` for ${categoryFilterStr}`;
    if (statusFilterApplied) reply += ` that are ${statusFilterStr}`;
    if (dateFilterApplied) reply += ` ${dateFilterStr}`;
    reply += ".";
  }

  return res.json({ reply });
});

module.exports = router;
