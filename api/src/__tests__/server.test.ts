import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import type Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createApp } from '../app';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TEST_CONFIG = {
  event: { name: 'Test Event', subtitle: 'Test subtitle' },
  days: ['Day 1', 'Day 2'],
  participants: ['alice@test.com', 'bob@test.com', 'carol@test.com'],
  seminars: [
    { id: 's1', day: 'Day 1', time: '09:00–10:30', room: 'Room A', title: 'Seminar One' },
    { id: 's2', day: 'Day 1', time: '11:00–12:30', room: 'Room B', title: 'Seminar Two' },
    { id: 's3', day: 'Day 2', time: '09:00–10:30', room: 'Room A', title: 'Seminar Three' },
  ],
};

const ADMIN_PASSWORD = 'super-secret-123';

// ── Setup / teardown ──────────────────────────────────────────────────────────

let app: Application;
let db: Database.Database;
let configPath: string;

beforeEach(() => {
  configPath = path.join(os.tmpdir(), `sb-test-${Date.now()}-${Math.random()}.json`);
  fs.writeFileSync(configPath, JSON.stringify(TEST_CONFIG));

  ({ app, db } = createApp({
    dbPath: ':memory:',
    configPath,
    adminPassword: ADMIN_PASSWORD,
    sessionSecret: 'test-session-secret',
    serveStatic: false,
  }));
});

afterEach(() => {
  db.close();
  if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Login and return the Set-Cookie header array for subsequent requests. */
async function loginAsAdmin(): Promise<string[]> {
  const res = await request(app)
    .post('/api/admin/login')
    .send({ password: ADMIN_PASSWORD });
  expect(res.status).toBe(200);
  return res.headers['set-cookie'] as string[];
}

// ── GET /api/health ───────────────────────────────────────────────────────────

describe('GET /api/health', () => {
  it('returns { ok: true }', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

// ── GET /api/config ───────────────────────────────────────────────────────────

describe('GET /api/config', () => {
  it('returns event name, days, participants, and seminars', async () => {
    const res = await request(app).get('/api/config');
    expect(res.status).toBe(200);
    expect(res.body.event.name).toBe('Test Event');
    expect(res.body.event.subtitle).toBe('Test subtitle');
    expect(res.body.days).toEqual(['Day 1', 'Day 2']);
    expect(res.body.participants).toContain('alice@test.com');
    expect(res.body.seminars).toHaveLength(3);
    expect(res.body.seminars[0]).toMatchObject({ id: 's1', title: 'Seminar One' });
  });

  it('reflects config file changes without restarting the server', async () => {
    const updated = { ...TEST_CONFIG, event: { name: 'Updated Name' } };
    fs.writeFileSync(configPath, JSON.stringify(updated));

    const res = await request(app).get('/api/config');
    expect(res.status).toBe(200);
    expect(res.body.event.name).toBe('Updated Name');
  });

  it('returns an empty-ish config when the config file is missing', async () => {
    fs.unlinkSync(configPath);
    const res = await request(app).get('/api/config');
    expect(res.status).toBe(200);
    expect(res.body.seminars).toEqual([]);
    expect(res.body.participants).toEqual([]);
  });
});

// ── GET /api/bookings/:email ──────────────────────────────────────────────────

describe('GET /api/bookings/:email', () => {
  it('returns an empty array for an email with no bookings', async () => {
    const res = await request(app).get('/api/bookings/nobody@test.com');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns the saved seminar IDs for a known email', async () => {
    await request(app).post('/api/bookings/alice@test.com').send(['s1', 's3']);
    const res = await request(app).get('/api/bookings/alice@test.com');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body).toEqual(expect.arrayContaining(['s1', 's3']));
  });

  it('is scoped per email — does not leak another user\'s bookings', async () => {
    await request(app).post('/api/bookings/alice@test.com').send(['s1']);
    await request(app).post('/api/bookings/bob@test.com').send(['s2']);

    const res = await request(app).get('/api/bookings/alice@test.com');
    expect(res.body).toEqual(['s1']);
  });

  it('URL-decodes email addresses with special characters', async () => {
    const email = 'alice+tag@test.com';
    await request(app)
      .post(`/api/bookings/${encodeURIComponent(email)}`)
      .send(['s1']);
    const res = await request(app).get(
      `/api/bookings/${encodeURIComponent(email)}`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual(['s1']);
  });
});

// ── POST /api/bookings/:email ─────────────────────────────────────────────────

describe('POST /api/bookings/:email', () => {
  it('saves a new set of seminar selections and returns { ok: true }', async () => {
    const res = await request(app)
      .post('/api/bookings/alice@test.com')
      .send(['s1', 's2']);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const get = await request(app).get('/api/bookings/alice@test.com');
    expect(get.body).toHaveLength(2);
    expect(get.body).toEqual(expect.arrayContaining(['s1', 's2']));
  });

  it('replaces (not appends) existing selections', async () => {
    await request(app).post('/api/bookings/bob@test.com').send(['s1', 's2']);
    await request(app).post('/api/bookings/bob@test.com').send(['s3']);

    const res = await request(app).get('/api/bookings/bob@test.com');
    expect(res.body).toEqual(['s3']);
  });

  it('allows clearing all selections with an empty array', async () => {
    await request(app).post('/api/bookings/alice@test.com').send(['s1', 's2']);
    await request(app).post('/api/bookings/alice@test.com').send([]);

    const res = await request(app).get('/api/bookings/alice@test.com');
    expect(res.body).toEqual([]);
  });

  it('returns 400 when body is not an array', async () => {
    const res = await request(app)
      .post('/api/bookings/alice@test.com')
      .send({ ids: ['s1'] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns 400 when body is a string', async () => {
    const res = await request(app)
      .post('/api/bookings/alice@test.com')
      .set('Content-Type', 'application/json')
      .send('"s1"');
    expect(res.status).toBe(400);
  });

  it('does not affect other users\' bookings when one user re-saves', async () => {
    await request(app).post('/api/bookings/alice@test.com').send(['s1', 's2']);
    await request(app).post('/api/bookings/bob@test.com').send(['s3']);
    await request(app).post('/api/bookings/alice@test.com').send(['s2']);

    const bobRes = await request(app).get('/api/bookings/bob@test.com');
    expect(bobRes.body).toEqual(['s3']);
  });
});

// ── POST /api/admin/login ─────────────────────────────────────────────────────

describe('POST /api/admin/login', () => {
  it('returns { ok: true } and sets a session cookie with the correct password', async () => {
    const res = await request(app)
      .post('/api/admin/login')
      .send({ password: ADMIN_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('returns 401 with a wrong password', async () => {
    const res = await request(app)
      .post('/api/admin/login')
      .send({ password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  it('returns 401 with a missing password field', async () => {
    const res = await request(app).post('/api/admin/login').send({});
    expect(res.status).toBe(401);
  });

  it('does not set a session cookie on failure', async () => {
    const res = await request(app)
      .post('/api/admin/login')
      .send({ password: 'bad' });
    // Either no set-cookie or a connect.sid cookie that is NOT authenticated
    // We verify by immediately checking /api/admin/me with those cookies (if any)
    const cookies = res.headers['set-cookie'] as string[] | undefined;
    if (cookies) {
      const meRes = await request(app)
        .get('/api/admin/me')
        .set('Cookie', cookies);
      expect(meRes.body.authenticated).toBe(false);
    }
  });
});

// ── GET /api/admin/me ─────────────────────────────────────────────────────────

describe('GET /api/admin/me', () => {
  it('returns { authenticated: false } when not logged in', async () => {
    const res = await request(app).get('/api/admin/me');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ authenticated: false });
  });

  it('returns { authenticated: true } with a valid session cookie', async () => {
    const cookies = await loginAsAdmin();
    const res = await request(app).get('/api/admin/me').set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ authenticated: true });
  });
});

// ── POST /api/admin/logout ────────────────────────────────────────────────────

describe('POST /api/admin/logout', () => {
  it('clears the session so subsequent admin calls return unauthenticated', async () => {
    const cookies = await loginAsAdmin();

    const logoutRes = await request(app)
      .post('/api/admin/logout')
      .set('Cookie', cookies);
    expect(logoutRes.status).toBe(200);

    const meRes = await request(app).get('/api/admin/me').set('Cookie', cookies);
    expect(meRes.body.authenticated).toBe(false);
  });

  it('returns { ok: true } even when called without a session', async () => {
    const res = await request(app).post('/api/admin/logout');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

// ── GET /api/admin/bookings ───────────────────────────────────────────────────

describe('GET /api/admin/bookings', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await request(app).get('/api/admin/bookings');
    expect(res.status).toBe(401);
  });

  it('returns an empty object when there are no bookings', async () => {
    const cookies = await loginAsAdmin();
    const res = await request(app)
      .get('/api/admin/bookings')
      .set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });

  it('returns all bookings keyed by email', async () => {
    await request(app).post('/api/bookings/alice@test.com').send(['s1', 's2']);
    await request(app).post('/api/bookings/bob@test.com').send(['s3']);

    const cookies = await loginAsAdmin();
    const res = await request(app)
      .get('/api/admin/bookings')
      .set('Cookie', cookies);

    expect(res.status).toBe(200);
    expect(res.body['alice@test.com']).toEqual(
      expect.arrayContaining(['s1', 's2']),
    );
    expect(res.body['bob@test.com']).toEqual(['s3']);
    expect(Object.keys(res.body)).toHaveLength(2);
  });

  it('reflects the latest state after a user updates their bookings', async () => {
    await request(app).post('/api/bookings/alice@test.com').send(['s1', 's2']);
    await request(app).post('/api/bookings/alice@test.com').send(['s3']);

    const cookies = await loginAsAdmin();
    const res = await request(app)
      .get('/api/admin/bookings')
      .set('Cookie', cookies);

    expect(res.body['alice@test.com']).toEqual(['s3']);
  });
});

// ── GET /api/admin/export.csv ─────────────────────────────────────────────────

describe('GET /api/admin/export.csv', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await request(app).get('/api/admin/export.csv');
    expect(res.status).toBe(401);
  });

  it('returns only the header row when there are no bookings', async () => {
    const cookies = await loginAsAdmin();
    const res = await request(app)
      .get('/api/admin/export.csv')
      .set('Cookie', cookies);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/bookings\.csv/);

    const lines = res.text.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('Email,Seminar ID,Title,Day,Time,Room');
  });

  it('returns one data row per booking with seminar details from config', async () => {
    await request(app).post('/api/bookings/alice@test.com').send(['s1']);
    await request(app).post('/api/bookings/bob@test.com').send(['s2', 's3']);

    const cookies = await loginAsAdmin();
    const res = await request(app)
      .get('/api/admin/export.csv')
      .set('Cookie', cookies);

    expect(res.status).toBe(200);
    const lines = res.text.trim().split('\n');
    // header + 3 booking rows
    expect(lines).toHaveLength(4);
    expect(res.text).toContain('"alice@test.com"');
    expect(res.text).toContain('"Seminar One"');
    expect(res.text).toContain('"bob@test.com"');
    expect(res.text).toContain('"Seminar Two"');
    expect(res.text).toContain('"Seminar Three"');
  });

  it('properly CSV-escapes values that contain double quotes', async () => {
    // Write a config with a seminar title containing a double quote
    const trickConfig = {
      ...TEST_CONFIG,
      seminars: [
        {
          id: 's1',
          day: 'Day 1',
          time: '09:00',
          room: 'Room "A"',
          title: 'She said "hello"',
        },
      ],
    };
    fs.writeFileSync(configPath, JSON.stringify(trickConfig));
    await request(app).post('/api/bookings/alice@test.com').send(['s1']);

    const cookies = await loginAsAdmin();
    const res = await request(app)
      .get('/api/admin/export.csv')
      .set('Cookie', cookies);

    // Double quotes inside a CSV field must be escaped as ""
    expect(res.text).toContain('"She said ""hello"""');
    expect(res.text).toContain('"Room ""A"""');
  });

  it('rows are sorted by email then seminar_id', async () => {
    await request(app).post('/api/bookings/bob@test.com').send(['s2', 's1']);
    await request(app).post('/api/bookings/alice@test.com').send(['s3']);

    const cookies = await loginAsAdmin();
    const res = await request(app)
      .get('/api/admin/export.csv')
      .set('Cookie', cookies);

    const [_header, row1, row2, row3] = res.text.trim().split('\n');
    expect(row1).toMatch(/^"alice@test\.com"/);
    expect(row2).toMatch(/^"bob@test\.com"/);
    // bob has s1 before s2 because ORDER BY seminar_id
    expect(row2).toContain('"s1"');
    expect(row3).toContain('"s2"');
  });
});
