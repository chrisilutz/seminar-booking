import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import SQLiteStoreImport from './sessionStore';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

declare module 'express-session' {
  interface SessionData {
    authenticated: boolean;
  }
}

export interface Seminar {
  id: string;
  day: string;
  time: string;
  room: string;
  title: string;
}

export interface Config {
  event: { name: string; subtitle?: string };
  days: string[];
  participants: string[];
  seminars: Seminar[];
}

export interface AppOptions {
  dbPath?: string;
  configPath?: string;
  adminPassword?: string;
  sessionSecret?: string;
  serveStatic?: boolean;
}

const EMPTY_CONFIG: Config = {
  event: { name: 'Seminar Event' },
  days: [],
  participants: [],
  seminars: [],
};

export function createApp(opts: AppOptions = {}): {
  app: express.Application;
  db: Database.Database;
} {
  const dbPath = opts.dbPath ?? process.env.DB_PATH ?? '/app/data/bookings.db';
  const configPath =
    opts.configPath ?? process.env.CONFIG_PATH ?? '/app/config/config.json';
  const adminPassword =
    opts.adminPassword ?? process.env.ADMIN_PASSWORD ?? 'admin';
  const sessionSecret =
    opts.sessionSecret ?? process.env.SESSION_SECRET ?? 'change-me-in-production';
  const serveStatic = opts.serveStatic ?? true;

  if (dbPath !== ':memory:') {
    const dataDir = path.dirname(dbPath);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS bookings (
      email      TEXT NOT NULL,
      seminar_id TEXT NOT NULL,
      PRIMARY KEY (email, seminar_id)
    )
  `);

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  const SQLiteStore = SQLiteStoreImport(session);
  app.use(
    session({
      store: new SQLiteStore({
        db: path.basename(dbPath),
        dir: path.dirname(dbPath),
      }),
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, secure: false, maxAge: 24 * 60 * 60 * 1000 },
    })
  );

  if (serveStatic) {
    const staticPath = path.join(__dirname, '..', 'public');
    if (fs.existsSync(staticPath)) {
      app.use(express.static(staticPath));
    }
  }

  function loadConfig(): Config {
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Config;
    } catch {
      return EMPTY_CONFIG;
    }
  }

  function requireAdmin(req: Request, res: Response, next: NextFunction): void {
    if (req.session?.authenticated) { next(); return; }
    res.status(401).json({ error: 'Unauthorized' });
  }

  const csvEscape = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;

  // ── Health ──────────────────────────────────────────────────────────────────
  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  // ── Config ──────────────────────────────────────────────────────────────────
  app.get('/api/config', (_req, res) => res.json(loadConfig()));

  // ── Bookings ─────────────────────────────────────────────────────────────────
  app.get('/api/bookings/:email', (req, res) => {
    const rows = db
      .prepare('SELECT seminar_id FROM bookings WHERE email = ?')
      .all(req.params.email) as { seminar_id: string }[];
    res.json(rows.map((r) => r.seminar_id));
  });

  app.post('/api/bookings/:email', (req, res) => {
    const seminarIds = req.body as unknown;
    if (!Array.isArray(seminarIds)) {
      res.status(400).json({ error: 'Body must be an array of seminar IDs' });
      return;
    }
    const del = db.prepare('DELETE FROM bookings WHERE email = ?');
    const ins = db.prepare(
      'INSERT OR REPLACE INTO bookings (email, seminar_id) VALUES (?, ?)',
    );
    db.transaction(() => {
      del.run(req.params.email);
      for (const id of seminarIds as string[]) ins.run(req.params.email, String(id));
    })();
    res.json({ ok: true });
  });

  // ── Admin auth ────────────────────────────────────────────────────────────────
  app.get('/api/admin/me', (req, res) => {
    res.json({ authenticated: !!req.session?.authenticated });
  });

  app.post('/api/admin/login', (req, res) => {
    const { password } = req.body as { password?: string };
    if (password === adminPassword) {
      req.session.authenticated = true;
      req.session.save(() => res.json({ ok: true }));
    } else {
      res.status(401).json({ error: 'Invalid password' });
    }
  });

  app.post('/api/admin/logout', (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  // ── Admin data ────────────────────────────────────────────────────────────────
  app.get('/api/admin/bookings', requireAdmin, (_req, res) => {
    const rows = db
      .prepare('SELECT email, seminar_id FROM bookings ORDER BY email')
      .all() as { email: string; seminar_id: string }[];
    const result: Record<string, string[]> = {};
    for (const row of rows) {
      if (!result[row.email]) result[row.email] = [];
      result[row.email].push(row.seminar_id);
    }
    res.json(result);
  });

  app.get('/api/admin/export.csv', requireAdmin, (_req, res) => {
    const config = loadConfig();
    const rows = db
      .prepare('SELECT email, seminar_id FROM bookings ORDER BY email, seminar_id')
      .all() as { email: string; seminar_id: string }[];
    const seminarMap: Record<string, Seminar> = {};
    for (const s of config.seminars ?? []) seminarMap[s.id] = s;

    let csv = 'Email,Seminar ID,Title,Day,Time,Room\n';
    for (const row of rows) {
      const s = seminarMap[row.seminar_id] ?? ({} as Partial<Seminar>);
      csv +=
        [
          csvEscape(row.email),
          csvEscape(row.seminar_id),
          csvEscape(s.title ?? ''),
          csvEscape(s.day ?? ''),
          csvEscape(s.time ?? ''),
          csvEscape(s.room ?? ''),
        ].join(',') + '\n';
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="bookings.csv"');
    res.send(csv);
  });

  // Expliziter 404-Handler für /api-Routen
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // ── SPA fallback ──────────────────────────────────────────────────────────────
  if (serveStatic) {
    const staticPath = path.join(__dirname, '..', 'public');
    if (fs.existsSync(staticPath)) {
      // Nur Nicht-API-Pfade abfangen
      app.get(/^\/(?!api\/).*/, (_req, res) =>
        res.sendFile(path.join(staticPath, 'index.html')),
      );
    }
  }

  return { app, db };
}
