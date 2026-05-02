# Complaint Agent

A lightweight backend for complaint intake, classification, routing, and status tracking.

Supported categories:

- `water`
- `roads`
- `sanitation`
- `street lights`
- `tax`
- `death & birth`

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the server:

   ```bash
   npm start
   ```

3. API endpoints:

   - `POST /complaints` - Submit a new complaint
   - `GET /complaints/:id` - Query complaint status and history
   - `PATCH /complaints/:id/status` - Update complaint status
- `GET /complaints` - Fetch all complaints for dashboard display

## Dashboard

Open `http://localhost:4000` to access the complaint management dashboard.
The dashboard can create complaints, display current records, and update complaint status.

## Tracking and Notifications

- Notification stubs log reporter and department messages to `data/notifications.log`
- Auto-escalation runs on stale urgent complaints and moves them to `In progress`
- The threshold and interval can be configured with `ESCALATION_THRESHOLD_MINUTES` and `TRACKER_INTERVAL_MS`

## Data Model

Complaint fields:

- `id`
- `category`
- `description`
- `location`
- `reporter`
- `urgency`
- `department`
- `status`
- `createdAt`
- `updatedAt`
- `history`
