import { Config, Context } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import fs from 'fs';
import path from 'path';
import cookie from 'cookie';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin';
const SESSION_SECRET = process.env.SESSION_SECRET ?? 'change-me-in-production';
// Fallback for local development or explicit config
const CONFIG_PATH = process.env.CONFIG_PATH ?? path.resolve(process.cwd(), 'config', 'config.json');

interface Seminar {
  id: string;
  day: string;
  time: string;
  room: string;
  title: string;
}

interface AppConfig {
  event: { name: string; subtitle?: string };
  days: string[];
  participants: string[];
  seminars: Seminar[];
}

function loadConfig(): AppConfig {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(raw) as AppConfig;
  } catch (err) {
    console.error('Failed to load config:', err);
    return { event: { name: 'Seminar Event' }, days: [], participants: [], seminars: [] };
  }
}

const csvEscape = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const method = req.method;
  const route = url.pathname;

  // Session check
  const cookies = cookie.parse(req.headers.get('cookie') || '');
  const isAuthenticated = cookies.auth_session === SESSION_SECRET;

  if (method === 'GET' && route === '/api/health') {
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  }

  if (method === 'GET' && route === '/api/config') {
    return new Response(JSON.stringify(loadConfig()), { headers: { 'Content-Type': 'application/json' } });
  }

  // Bookings logic (public - read/write for email)
  if (route.startsWith('/api/bookings/')) {
    const email = decodeURIComponent(route.replace('/api/bookings/', ''));
    if (!email) {
       return new Response(JSON.stringify({ error: 'Email missing' }), { status: 400 });
    }
    const store = getStore('bookings');

    if (method === 'GET') {
      const entry = await store.get(email, { type: 'json' });
      return new Response(JSON.stringify(entry ?? []), { headers: { 'Content-Type': 'application/json' } });
    }

    if (method === 'POST') {
      try {
        const seminarIds = await req.json();
        if (!Array.isArray(seminarIds)) {
          return new Response(JSON.stringify({ error: 'Body must be an array of seminar IDs' }), { status: 400 });
        }
        await store.setJSON(email, seminarIds);
        return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
      } catch (err) {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
      }
    }
  }

  // Admin Auth
  if (method === 'GET' && route === '/api/admin/me') {
    return new Response(JSON.stringify({ authenticated: isAuthenticated }), { headers: { 'Content-Type': 'application/json' } });
  }

  if (method === 'POST' && route === '/api/admin/login') {
    try {
      const body = await req.json();
      if (body.password === ADMIN_PASSWORD) {
        const setCookieHeader = cookie.serialize('auth_session', SESSION_SECRET, {
          httpOnly: true,
          secure: url.protocol === 'https:',
          maxAge: 24 * 60 * 60,
          path: '/',
        });
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'Content-Type': 'application/json', 'Set-Cookie': setCookieHeader }
        });
      }
      return new Response(JSON.stringify({ error: 'Invalid password' }), { status: 401 });
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
    }
  }

  if (method === 'POST' && route === '/api/admin/logout') {
    const setCookieHeader = cookie.serialize('auth_session', '', {
      httpOnly: true,
      secure: url.protocol === 'https:',
      maxAge: 0,
      path: '/',
    });
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json', 'Set-Cookie': setCookieHeader }
    });
  }

  // Admin Data endpoints
  if (route.startsWith('/api/admin/')) {
    if (!isAuthenticated) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const store = getStore('bookings');

    if (method === 'GET' && route === '/api/admin/bookings') {
      const result: Record<string, string[]> = {};

      const { blobs } = await store.list();
      for (const blob of blobs) {
        const email = blob.key;
        const seminars = await store.get(email, { type: 'json' }) as string[];
        if (seminars && seminars.length > 0) {
           result[email] = seminars;
        }
      }
      return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
    }

    if (method === 'GET' && route === '/api/admin/export.csv') {
      const config = loadConfig();
      const seminarMap: Record<string, Seminar> = {};
      for (const s of config.seminars ?? []) seminarMap[s.id] = s;

      let csv = 'Email,Seminar ID,Title,Day,Time,Room\n';

      const { blobs } = await store.list();
      for (const blob of blobs) {
        const email = blob.key;
        const seminars = await store.get(email, { type: 'json' }) as string[];
        if (seminars && Array.isArray(seminars)) {
          for (const sId of seminars) {
            const s = seminarMap[sId] ?? ({} as Partial<Seminar>);
            csv +=
              [
                csvEscape(email),
                csvEscape(sId),
                csvEscape(s.title ?? ''),
                csvEscape(s.day ?? ''),
                csvEscape(s.time ?? ''),
                csvEscape(s.room ?? ''),
              ].join(',') + '\n';
          }
        }
      }

      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="bookings.csv"'
        }
      });
    }
  }

  return new Response('Not Found', { status: 404 });
};

export const config: Config = {
  path: '/api/*'
};
