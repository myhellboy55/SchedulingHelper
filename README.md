# ShiftDesk — Employee Scheduling System

A self-hosted employee scheduling application built with Vanilla JS, Node.js, Express, and MongoDB.

## Features

- **JWT Authentication** with roles: `admin`, `manager`, `employee`
- **Weekly Schedule Builder** — click-to-assign shifts on a grid
- **Shift Popup** — quick shifts (8–4, 9–5, etc.) or custom entry
- **Conflict Detection** — blocks overlapping shifts for the same employee
- **Availability Validation** — warns when shift is outside declared availability
- **Overtime Detection** — warns when weekly hours exceed `maxHours`
- **Optimistic Concurrency** — `version` field on schedules prevents lost edits
- **Employee Portal** — employees view their schedule and set availability
- **Manager Dashboard** — full schedule editing and employee management

---

## Project Structure

```
scheduler-app/
├── client/
│   ├── index.html
│   ├── css/styles.css
│   └── js/
│       ├── app.js        # Main controller / view logic
│       ├── api.js        # All API calls
│       ├── auth.js       # Client-side auth state
│       ├── renderer.js   # DOM rendering functions
│       └── popup.js      # Shift selector popup
├── server/
│   ├── server.js         # Express app entry point
│   ├── db.js             # MongoDB connection
│   ├── middleware/
│   │   └── auth.js       # JWT verification middleware
│   ├── routes/
│   │   ├── auth.js       # POST /login, /register
│   │   ├── employees.js  # CRUD employees
│   │   ├── schedules.js  # Weekly schedule management
│   │   ├── shifts.js     # Shift CRUD + validation
│   │   └── availability.js
│   └── models/
│       ├── User.js
│       ├── Employee.js
│       ├── Schedule.js
│       ├── Shift.js
│       └── Availability.js
├── package.json
└── .env.example
```

---

## Prerequisites

- **Node.js** v18 or higher
- **MongoDB** v6+ running locally (or a MongoDB Atlas URI)

---

## Setup & Installation

### 1. Install Dependencies

```bash
cd scheduler-app
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
PORT=3000
MONGODB_URI=mongodb://localhost:27017/scheduler
JWT_SECRET=your_long_random_secret_here
JWT_EXPIRES_IN=7d
```

### 3. Start MongoDB

**macOS (Homebrew):**
```bash
brew services start mongodb-community
```

**Linux (systemd):**
```bash
sudo systemctl start mongod
```

**Docker:**
```bash
docker run -d -p 27017:27017 --name mongo mongo:latest
```

### 4. Start the Server

```bash
npm start
# or for development with auto-reload:
npm run dev
```

### 5. Open the App

Visit **http://localhost:3000** in your browser.

---

## First-Time Setup

1. Open **http://localhost:3000**
2. Click **"Create an account"**
3. Register with role **Admin** or **Manager**
4. Go to **Add Employee** tab to create employee accounts
5. Navigate to **Schedule** tab, select the current week
6. Click **"Create Schedule"** for the week
7. Click any grid cell to assign a shift

---

## API Reference

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login, returns JWT |

### Employees
| Method | Path | Auth |
|--------|------|------|
| GET | `/api/employees` | Any authenticated |
| POST | `/api/employees` | Manager/Admin |
| PUT | `/api/employees/:id` | Manager/Admin |
| DELETE | `/api/employees/:id` | Manager/Admin |

### Schedules
| Method | Path | Auth |
|--------|------|------|
| GET | `/api/schedules` | Any authenticated |
| GET | `/api/schedules/:weekStart` | Any authenticated |
| POST | `/api/schedules` | Manager/Admin |
| DELETE | `/api/schedules/:weekStart` | Admin only |

### Shifts
| Method | Path | Auth |
|--------|------|------|
| GET | `/api/shifts?scheduleId=...` | Any authenticated |
| POST | `/api/shifts` | Manager/Admin |
| DELETE | `/api/shifts/:id` | Manager/Admin |

### Availability
| Method | Path | Auth |
|--------|------|------|
| GET | `/api/availability/:employeeId` | Own or Manager |
| POST | `/api/availability/:employeeId` | Own or Manager |

---

## Shift Time Format

Shifts use 24-hour integer notation:
- `start: 8, end: 16` = 8am–4pm
- Using the `time` shorthand in the API: `"8-16"` or `"9-17"`

---

## Conflict Detection Logic

Before inserting a shift, the server:
1. **Overlap check** — queries existing shifts for the same employee, day, and schedule. Blocks if `newStart < existingEnd && newEnd > existingStart`.
2. **Availability check** — fetches the employee's availability document. Warns (but does not block) if the shift falls outside declared hours.
3. **Overtime check** — sums all shift hours for the week. Warns if the total would exceed `employee.maxHours`.

---

## Multi-Manager Safety

The `Schedule` document has a `version` field (integer). Every time a shift is added or deleted, the server increments `version`. This allows clients to detect concurrent edits — if a client's cached version doesn't match the server's, it knows a concurrent edit occurred.
