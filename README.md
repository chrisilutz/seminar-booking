# Seminar Booking App

A self-contained seminar sign-up web application.  
**Stack:** Netlify Functions (API) + Nuxt 4 SPA (frontend) + Netlify Blobs (Database).
**Architecture:** Deployed natively on Netlify using Serverless Functions and Netlify Blobs for persistent data storage.

---

## Deploying to Netlify

This project is configured to run fully on Netlify using Netlify Functions for the backend and Netlify Blobs for the database.

### Prerequisites
1. A Netlify account.
2. The Netlify CLI installed (`npm install -g netlify-cli`).

### Steps to Deploy

1. **Clone the repository and prepare your config file:**
   ```bash
   cp config/config.example.json config/config.json
   # Edit config/config.json with your event, days, participants, and seminars
   ```
   *Note: Because this is a static file bundled into the Netlify Function at build time, any updates to the configuration will require a new deployment.*

2. **Login to Netlify and Link Project:**
   ```bash
   netlify login
   netlify init
   ```

3. **Set environment variables via Netlify CLI (or Netlify UI):**
   ```bash
   netlify env:set ADMIN_PASSWORD "your-secure-admin-password"
   netlify env:set SESSION_SECRET "a-long-random-string-for-signing-cookies"
   ```

4. **Deploy:**
   ```bash
   netlify deploy --prod
   ```

The app is now fully deployed. Netlify Blobs handles all data persistence for bookings automatically behind the scenes!

---

## Accessing the admin panel

Navigate to `https://<your-netlify-site-url>/admin/login` and enter the password you set in `ADMIN_PASSWORD`.

The admin dashboard shows:

- **Summary stats** — respondent count, total sign-ups, most popular seminar
- **By Seminar** — each seminar with its list of signed-up participants
- **By Person** — each participant with their chosen seminars
- **Export CSV** — downloads a full bookings CSV from `/api/admin/export.csv`

---

## Environment variables reference

| Variable | Default | Description |
|---|---|---|
| `ADMIN_PASSWORD` | `admin` | Password for the admin panel |
| `SESSION_SECRET` | `change-me-in-production` | Secret used to sign session cookies |

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
| `POST` | `/api/admin/login` | — | Body: `{ "password": "…" }`. Sets signed HTTP-only cookie on success. |
| `POST` | `/api/admin/logout` | cookie | Clears cookie |
| `GET` | `/api/admin/bookings` | cookie | Returns all bookings as `{ email: [seminarIds] }` |
| `GET` | `/api/admin/export.csv` | cookie | Downloads full bookings CSV |

---

## Development

You can run the full environment locally using the Netlify CLI:

```bash
netlify dev
```

This will automatically build and proxy the Nuxt frontend while simultaneously serving the local Netlify Functions mapped to `/api/*`. Netlify Blobs will be emulated locally as well.
