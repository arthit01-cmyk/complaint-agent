const express = require('express');
const path = require('path');
const complaintRoutes = require('./routes/complaints');
const statusRoutes = require('./routes/status');
const masterRoutes = require('./routes/masters');
const reportRoutes = require('./routes/reports');
const chatRoutes = require('./routes/chat');
const { startAutoEscalation } = require('./services/tracker');

const app = express();
const port = process.env.PORT || 4000;

app.use(express.json());

app.use('/complaints', complaintRoutes);
app.use('/complaints', statusRoutes);
app.use('/masters', masterRoutes);
app.use('/reports', reportRoutes);
app.use('/chat', chatRoutes);
app.use(express.static(path.join(__dirname, '../public')));

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

startAutoEscalation();

app.listen(port, () => {
  console.log(`Complaint Agent backend running on http://localhost:${port}`);
});
