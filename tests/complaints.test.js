const fs = require('fs');
const path = require('path');
const request = require('supertest');
const express = require('express');

process.env.DATA_FILE = path.resolve(__dirname, 'test-complaints.json');
process.env.MASTER_FILE = path.resolve(__dirname, 'test-master.json');
process.env.ESCALATION_THRESHOLD_MINUTES = '0';

const complaintRoutes = require('../src/routes/complaints');
const statusRoutes = require('../src/routes/status');
const masterRoutes = require('../src/routes/masters');
const reportRoutes = require('../src/routes/reports');
const tracker = require('../src/services/tracker');
const storage = require('../src/services/storage');

const app = express();
app.use(express.json());
app.use('/complaints', complaintRoutes);
app.use('/complaints', statusRoutes);
app.use('/masters', masterRoutes);
app.use('/reports', reportRoutes);

describe('Complaint Agent API', () => {
  beforeEach(() => {
    if (fs.existsSync(process.env.DATA_FILE)) {
      fs.unlinkSync(process.env.DATA_FILE);
    }
    if (fs.existsSync(process.env.MASTER_FILE)) {
      fs.unlinkSync(process.env.MASTER_FILE);
    }
  });

  afterAll(() => {
    if (fs.existsSync(process.env.DATA_FILE)) {
      fs.unlinkSync(process.env.DATA_FILE);
    }
    if (fs.existsSync(process.env.MASTER_FILE)) {
      fs.unlinkSync(process.env.MASTER_FILE);
    }
  });

  it('accepts a valid complaint request', async () => {
    const response = await request(app)
      .post('/complaints')
      .send({
        category: 'water',
        description: 'There is a major water leak on Main Street.',
        location: 'Main Street',
        reporter: { name: 'Alice' }
      });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('id');
    expect(response.body.department).toBe('Water');
    expect(response.body.urgency).toBe('urgent');
  });

  it('returns complaint status by ID', async () => {
    const createResponse = await request(app)
      .post('/complaints')
      .send({
        category: 'roads',
        description: 'A pothole is causing a hazard.',
        location: '2nd Avenue',
        reporter: { name: 'Bob' }
      });

    const complaintId = createResponse.body.id;
    const getResponse = await request(app).get(`/complaints/${complaintId}`);

    expect(getResponse.status).toBe(200);
    expect(getResponse.body.id).toBe(complaintId);
    expect(getResponse.body.status).toBe('Pending');
  });

  it('lists all complaints for the dashboard', async () => {
    await request(app)
      .post('/complaints')
      .send({
        category: 'sanitation',
        description: 'Garbage collection missed the block.',
        location: 'Elm Street',
        reporter: { name: 'Dana' }
      });

    const listResponse = await request(app).get('/complaints');
    expect(listResponse.status).toBe(200);
    expect(Array.isArray(listResponse.body)).toBe(true);
    expect(listResponse.body.length).toBeGreaterThanOrEqual(1);
  });

  it('returns filtered report summaries by section, category and pendency', async () => {
    await request(app)
      .post('/complaints')
      .send({
        category: 'water',
        description: 'Water main breaking near park.',
        location: 'Park Lane',
        reporter: { name: 'George' }
      });

    await request(app)
      .post('/complaints')
      .send({
        category: 'roads',
        description: 'Pothole causing flat tires.',
        location: 'Hill Road',
        reporter: { name: 'Harriet' }
      });

    const reportResponse = await request(app).get('/reports/summary').query({ section: 'Water', category: 'Water', pendency: 'open' });

    expect(reportResponse.status).toBe(200);
    expect(reportResponse.body.total).toBe(1);
    expect(reportResponse.body.byDepartment).toHaveProperty('Water');
    expect(reportResponse.body.byCategory).toHaveProperty('Water');
    expect(reportResponse.body.byStatus).toHaveProperty('Pending');
  });

  it('supports tax category and maps to Tax Office', async () => {
    const response = await request(app)
      .post('/complaints')
      .send({
        category: 'tax',
        description: 'Tax notice requires immediate response.',
        location: 'Financial District',
        reporter: { name: 'Eli' }
      });

    expect(response.status).toBe(201);
    expect(response.body.department).toBe('Tax Office');
    expect(response.body.urgency).toBe('urgent');
    expect(response.body.categoryLabel).toBe('Tax');
  });

  it('supports Death & Birth category and maps to Civil Registry', async () => {
    const response = await request(app)
      .post('/complaints')
      .send({
        category: 'death & birth',
        description: 'Need birth certificate issuance urgently.',
        location: 'Rego Park',
        reporter: { name: 'Fiona' }
      });

    expect(response.status).toBe(201);
    expect(response.body.department).toBe('Civil Registry');
    expect(response.body.urgency).toBe('urgent');
    expect(response.body.categoryLabel).toBe('Death & Birth');
  });

  it('returns available master categories and adds a category', async () => {
    const listResponse = await request(app).get('/masters/categories');

    expect(listResponse.status).toBe(200);
    expect(Array.isArray(listResponse.body)).toBe(true);

    const createResponse = await request(app)
      .post('/masters/categories')
      .send({
        name: 'Animal Control',
        department: 'Animal Services',
        defaultUrgency: 'routine',
        keywords: ['animal', 'stray'],
        urgentKeywords: ['attack', 'danger']
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.name).toBe('Animal Control');

    const afterResponse = await request(app).get('/masters/categories');
    expect(afterResponse.body.some(cat => cat.name === 'Animal Control')).toBe(true);
  });

  it('returns urgency list and allows adding a new urgency', async () => {
    const listResponse = await request(app).get('/masters/urgencies');

    expect(listResponse.status).toBe(200);
    expect(Array.isArray(listResponse.body)).toBe(true);

    const createResponse = await request(app)
      .post('/masters/urgencies')
      .send({ label: 'critical' });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.label).toBe('critical');

    const afterResponse = await request(app).get('/masters/urgencies');
    expect(afterResponse.body).toContain('critical');
  });

  it('adds a user master and allows assigned user filtering in reports', async () => {
    const createUserResponse = await request(app)
      .post('/masters/users')
      .send({
        name: 'Hannah Clark',
        designation: 'Field Officer',
        email: 'hannah.clark@example.com',
        contact: '555-0199'
      });

    expect(createUserResponse.status).toBe(201);
    expect(createUserResponse.body.name).toBe('Hannah Clark');

    const createComplaint = await request(app)
      .post('/complaints')
      .send({
        category: 'roads',
        description: 'Traffic signal not working.',
        location: '3rd Street',
        reporter: { name: 'Ian' }
      });

    expect(createComplaint.status).toBe(201);
    expect(createComplaint.body.assignedTo).toBeNull();

    const assignComplaint = await request(app)
      .patch(`/complaints/${createComplaint.body.id}/assign`)
      .send({
        assignedTo: createUserResponse.body.key
      });

    expect(assignComplaint.status).toBe(200);
    expect(assignComplaint.body.assignedTo).toBe(createUserResponse.body.key);

    const reportResponse = await request(app)
      .get('/reports/summary')
      .query({ assignedTo: createUserResponse.body.key });

    expect(reportResponse.status).toBe(200);
    expect(reportResponse.body.total).toBe(1);
    expect(reportResponse.body.rows[0].assignedTo).toBe('Hannah Clark');
  });

  it('updates and deletes a master category', async () => {
    const createResponse = await request(app)
      .post('/masters/categories')
      .send({
        name: 'Animal Control',
        department: 'Animal Services',
        defaultUrgency: 'routine',
        keywords: ['animal', 'stray'],
        urgentKeywords: ['attack', 'danger']
      });

    expect(createResponse.status).toBe(201);

    const updateResponse = await request(app)
      .patch('/masters/categories/animal-control')
      .send({
        name: 'Animal Control Services',
        department: 'Animal Services',
        defaultUrgency: 'routine',
        keywords: ['animal', 'stray'],
        urgentKeywords: ['attack', 'danger']
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.name).toBe('Animal Control Services');

    const deleteResponse = await request(app).delete('/masters/categories/animal-control-services');
    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body.deleted).toBe('animal-control-services');

    const afterCats = await request(app).get('/masters/categories');
    expect(afterCats.body.some(cat => cat.name === 'Animal Control Services')).toBe(false);
  });

  it('deletes an urgency level', async () => {
    const createResponse = await request(app)
      .post('/masters/urgencies')
      .send({ label: 'critical' });

    expect(createResponse.status).toBe(201);

    const deleteResponse = await request(app).delete('/masters/urgencies/critical');
    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body.deleted).toBe('critical');

    const afterResponse = await request(app).get('/masters/urgencies');
    expect(afterResponse.body).not.toContain('critical');
  });

  it('auto-escalates stale urgent complaints', () => {
    const oldDate = new Date(Date.now() - 1000 * 60 * 120).toISOString();
    storage.saveComplaint({
      id: 'stale-urgent-001',
      category: 'water',
      department: 'Water',
      urgency: 'urgent',
      status: 'Received',
      description: 'Major leak in basement.',
      location: 'Test Blvd',
      reporter: { name: 'Carol' },
      createdAt: oldDate,
      updatedAt: oldDate,
      history: [{ status: 'Received', updatedAt: oldDate, note: 'Complaint received.' }]
    });

    const escalated = tracker.scanAndEscalate();
    expect(escalated.length).toBe(1);

    const complaint = storage.getComplaintById('stale-urgent-001');
    expect(complaint.status).toBe('In progress');
    expect(complaint.history[complaint.history.length - 1].note).toMatch(/Auto-escalated/);
  });
});
