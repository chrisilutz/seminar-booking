# Seminar Booking App

A self-contained seminar sign-up web application.  
**Stack:** Node.js / Express (API) + Nuxt 4 SPA (frontend) + SQLite.  
**Architecture:** Single Docker container — Express compiles and serves the Nuxt build as static files and also handles all REST API routes.

---

## Quick start

### 1. Prepare your config file

```bash
cp config/config.example.json config/config.json
# Edit config/config.json with your event, days, participants, and seminars
```

### 2. Set environment variables

Create a `.env` file (or export variables directly):

```dotenv
ADMIN_PASSWORD=your-secure-admin-password
SESSION_SECRET=a-long-random-string-for-signing-cookies
PORT=3000
```

### 3. Build and run

```bash
docker compose up --build
```

The app is now available at <http://localhost:3000>.

---

## Accessing the admin panel

Navigate to <http://localhost:3000/admin/login> and enter the password you set in `ADMIN_PASSWORD`.

The admin dashboard shows:

- **Summary stats** — respondent count, total sign-ups, most popular seminar
- **By Seminar** — each seminar with its list of signed-up participants
- **By Person** — each participant with their chosen seminars
- **Export CSV** — downloads a full bookings CSV from `/api/admin/export.csv`

---

## Updating participant or seminar data (no rebuild needed)

The config file is read on **every API request**, so you can update it at any time without restarting or rebuilding the container:

```bash
# Edit config/config.json on the host (it is bind-mounted into the container)
nano config/config.json

# No restart needed — changes take effect on the next page load
```

> **Note:** Seminar `id` values are the stable key stored in the database.  
> If you rename an `id`, existing bookings for that id will become orphaned.  
> Renaming the `title`, `day`, `time`, or `room` is safe at any time.

---

## Environment variables reference

| Variable | Default | Description |
|---|---|---|
| `ADMIN_PASSWORD` | `change-me-before-use` | Password for the admin panel |
| `SESSION_SECRET` | `change-this-secret-too` | Secret used to sign session cookies |
| `PORT` | `3000` | HTTP port the server listens on |
| `DB_PATH` | `/app/data/bookings.db` | Path to the SQLite database file |
| `CONFIG_PATH` | `/app/config/config.json` | Path to the JSON config file |
| `NUXT_PUBLIC_API_BASE` | *(empty — same origin)* | Override API base URL for the frontend (only needed when running frontend and backend on separate hosts) |

---

## Config file schema

```json
{
  "event": {
    "name": "Seminar Weekend 2025",
    "subtitle": "Optional subtitle shown below the event name"
  },
  "days": [
    "Friday 14 Nov",
    "Saturday 15 Nov"
  ],
  "participants": [
    "alice@example.com",
    "bob@example.com"
  ],
  "seminars": [
    {
      "id": "s1",
      "day": "Friday 14 Nov",
      "time": "09:00–10:30",
      "room": "Room A",
      "title": "Opening Circle"
    }
  ]
}
```

- `days` — free-form strings, 1–7 entries. The tabs in the participant view match this order.
- `seminars[].day` — must exactly match one of the `days` strings.
- `seminars[].id` — stable identifier stored in the database. Do not change after bookings are recorded.

---

## REST API

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | — | Returns `{ ok: true }` |
| `GET` | `/api/config` | — | Returns event name, days, seminars, participants |
| `GET` | `/api/bookings/:email` | — | Returns array of seminar IDs booked by this email |
| `POST` | `/api/bookings/:email` | — | Saves (replaces) seminar IDs for this email. Body: `["s1","s2"]` |
| `GET` | `/api/admin/me` | — | Returns `{ authenticated: true/false }` |
| `POST` | `/api/admin/login` | — | Body: `{ "password": "…" }`. Sets session cookie on success. |
| `POST` | `/api/admin/logout` | session | Clears session |
| `GET` | `/api/admin/bookings` | session | Returns all bookings as `{ email: [seminarIds] }` |
| `GET` | `/api/admin/export.csv` | session | Downloads full bookings CSV |

---

## Data persistence

Volumes declared in `docker-compose.yml`:

| Host path | Container path | Purpose |
|---|---|---|
| `./data/` | `/app/data/` | SQLite database (`bookings.db`) |
| `./config/` | `/app/config/` | JSON config file (`config.json`) |

The `data/` directory is created automatically on the host when the container first starts.

---

## Development

To run the API and frontend separately during development:

```bash
# Terminal 1 — API
cd api
npm install
DB_PATH=./bookings.db CONFIG_PATH=../config/config.json ADMIN_PASSWORD=admin SESSION_SECRET=dev node dist/server.js

# Terminal 2 — Nuxt dev server
cd frontend
NUXT_PUBLIC_API_BASE=http://localhost:3000 npm run dev
```

The Nuxt dev server will proxy API calls to Express via the `apiBase` runtime config.
