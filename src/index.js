// Load environment variables from .env file (if present)
require('dotenv').config();

// Initialise the database first (creates schema + migrates JSON data)
require('./services/db');

const express = require('express');
const session = require('express-session');
const path    = require('path');

const { router: taskRoutes } = require('./routes/tasks');
const statusRoutes    = require('./routes/task-status');
const masterRoutes    = require('./routes/masters');
const reportRoutes    = require('./routes/reports');
const chatRoutes      = require('./routes/chat');
const authRoutes      = require('./routes/auth');
const profileRoutes   = require('./routes/profile');
const { startAutoEscalation } = require('./services/tracker');
const { getAllTasks }          = require('./services/storage');
const vectorService            = require('./services/vector');

const app  = express();
const port = process.env.PORT || 4000;

app.use(session({
  secret: process.env.SESSION_SECRET || 'edesk-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

app.use(express.json());

app.use('/auth',    authRoutes);
app.use('/profile', profileRoutes);
app.use('/tasks',   taskRoutes);
app.use('/tasks',   statusRoutes);
app.use('/masters', masterRoutes);
app.use('/reports', reportRoutes);
app.use('/chat',    chatRoutes);

app.use(express.static(path.join(__dirname, '../public')));

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Seed vector index from database
try {
  const existingTasks = getAllTasks();
  vectorService.reindexAll(existingTasks);
  console.log(`[VectorDB] Reindexed ${existingTasks.length} existing tasks.`);
} catch (e) {
  console.error('[VectorDB] Reindex error:', e.message);
}

startAutoEscalation();

app.listen(port, () => {
  console.log(`e-Desk Monitor running at http://localhost:${port}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[Chat] ANTHROPIC_API_KEY not set — AI chat agent will show a setup message.');
  }
});
