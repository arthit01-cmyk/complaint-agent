const express = require('express');
const session = require('express-session');
const path = require('path');
const taskRoutes = require('./routes/tasks');
const statusRoutes = require('./routes/task-status');
const masterRoutes = require('./routes/masters');
const reportRoutes = require('./routes/reports');
const chatRoutes = require('./routes/chat');
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const { startAutoEscalation } = require('./services/tracker');
const { getAllTasks } = require('./services/storage');
const vectorService = require('./services/vector');

const app = express();
const port = process.env.PORT || 4000;

app.use(session({
  secret: 'work-desk-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // Set to true in production with HTTPS
}));

app.use(express.json());

app.use('/auth', authRoutes);
app.use('/profile', profileRoutes);
app.use('/tasks', taskRoutes);
app.use('/tasks', require('./routes/task-status'));
app.use('/masters', masterRoutes);
app.use('/reports', reportRoutes);
app.use('/chat', chatRoutes);
app.use(express.static(path.join(__dirname, '../public')));

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Initialize Vector DB and reindex existing tasks
const existingTasks = getAllTasks();
vectorService.reindexAll(existingTasks);
console.log(`[VectorDB] Reindexed ${existingTasks.length} existing tasks.`);

startAutoEscalation();

app.listen(port, () => {
  console.log(`Work Desk Monitoring System backend running on http://localhost:${port}`);
});
