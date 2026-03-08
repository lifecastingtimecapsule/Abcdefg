import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { SignJWT, jwtVerify } from 'jose';
import * as db from './db';

// ─── Web Crypto password hashing (PBKDF2) ────────────────────────────────────
// bcryptjs is not reliable in Cloudflare Workers; use native Web Crypto instead.

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' }, keyMaterial, 256);
  const toHex = (buf: Uint8Array) => Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
  return `pbkdf2:sha256:100000:${toHex(salt)}:${toHex(new Uint8Array(bits))}`;
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!hash.startsWith('pbkdf2:')) return false;
  const parts = hash.split(':');
  if (parts.length !== 5) return false;
  const [, , iterStr, saltHex, expectedHex] = parts;
  const iterations = parseInt(iterStr, 10);
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map(b => parseInt(b, 16)));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, keyMaterial, 256);
  const actualHex = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
  return actualHex === expectedHex;
}

type Bindings = {
  DB: D1Database;
  JWT_SECRET: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// ─── Auth helpers ────────────────────────────────────────────────────────────

async function getSecret(env: Bindings) {
  return new TextEncoder().encode(env.JWT_SECRET || 'dev-secret-change-me');
}

async function signToken(env: Bindings, payload: Record<string, unknown>) {
  const secret = await getSecret(env);
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secret);
}

async function verifyToken(env: Bindings, token: string): Promise<Record<string, unknown> | null> {
  try {
    const secret = await getSecret(env);
    const { payload } = await jwtVerify(token, secret);
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function getAuthUser(c: { req: { header: (k: string) => string | undefined }; env: Bindings }) {
  const authHeader = c.req.header('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return null;
  return verifyToken(c.env, token);
}

// ─── Public health check ─────────────────────────────────────────────────────

app.get('/public/health', (c) => c.json({ ok: true }));

// ─── Login ───────────────────────────────────────────────────────────────────

app.post('/login', async (c) => {
  const { login_id, password } = await c.req.json() as { login_id: string; password: string };
  if (!login_id || !password) return c.json({ error: 'Missing credentials' }, 400);

  const user = await db.getAppUserByLoginId(c.env.DB, login_id);
  if (!user || !user.active_flag) return c.json({ error: 'Invalid credentials' }, 401);

  let valid = false;
  const passwordHash = user.password_hash as string | null;
  const loginpass = user.loginpass as string | null;

  if (passwordHash) {
    valid = await verifyPassword(password, passwordHash);
  } else if (loginpass) {
    valid = password === loginpass;
    if (valid) {
      // Upgrade to PBKDF2 hash on first login
      const hash = await hashPassword(password);
      await db.updatePasswordHash(c.env.DB, user.user_id as string, hash);
    }
  }

  if (!valid) return c.json({ error: 'Invalid credentials' }, 401);

  const token = await signToken(c.env, {
    sub: user.user_id as string,
    role: user.role as string,
    login_id: user.login_id as string,
  });

  return c.json({ token });
});

// ─── Auth middleware helper ──────────────────────────────────────────────────

function requireAuth(handler: (c: any, user: Record<string, unknown>) => Response | Promise<Response>) {
  return async (c: any) => {
    const user = await getAuthUser(c);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    return handler(c, user);
  };
}

function requireAdmin(handler: (c: any, user: Record<string, unknown>) => Response | Promise<Response>) {
  return async (c: any) => {
    const user = await getAuthUser(c);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    if (user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403);
    return handler(c, user);
  };
}

// ─── /me ─────────────────────────────────────────────────────────────────────

app.get('/me', requireAuth(async (c, tokenUser) => {
  const userId = tokenUser.sub as string;
  const role = tokenUser.role as string;
  const user = await db.getAppUser(c.env.DB, userId);
  if (!user) return c.json({ error: 'User not found' }, 404);

  const locations = await db.getAccessibleLocations(c.env.DB, userId, role);
  return c.json({ user, locations });
}));

// ─── login-notify ────────────────────────────────────────────────────────────

app.post('/login-notify', requireAuth(async (c, tokenUser) => {
  await db.updateLastLogin(c.env.DB, tokenUser.sub as string);
  return c.json({ ok: true });
}));

// ─── Password change ──────────────────────────────────────────────────────────

app.post('/change-password', requireAuth(async (c, tokenUser) => {
  const { current_password, new_password } = await c.req.json() as { current_password: string; new_password: string };
  const userId = tokenUser.sub as string;
  const user = await db.getAppUser(c.env.DB, userId);
  if (!user) return c.json({ error: 'User not found' }, 404);

  const passwordHash = user.password_hash as string | null;
  const loginpass = user.loginpass as string | null;
  let valid = false;

  if (passwordHash) {
    valid = await verifyPassword(current_password, passwordHash);
  } else if (loginpass) {
    valid = current_password === loginpass;
  }

  if (!valid) return c.json({ error: 'Current password incorrect' }, 400);

  const newHash = await hashPassword(new_password);
  await db.updatePasswordHash(c.env.DB, userId, newHash);
  await c.env.DB.prepare('UPDATE app_users SET must_change_password = 0 WHERE user_id = ?').bind(userId).run();

  return c.json({ ok: true });
}));

// ─── Users (admin) ───────────────────────────────────────────────────────────

app.get('/users', requireAdmin(async (c) => {
  const users = await db.getAllAppUsers(c.env.DB);
  return c.json(users);
}));

app.post('/users', requireAdmin(async (c) => {
  const body = await c.req.json() as Record<string, unknown>;
  body.user_id = crypto.randomUUID();
  body.loginpass = 'InitialPassword1!';
  await db.createAppUser(c.env.DB, body);
  return c.json({ user_id: body.user_id });
}));

app.put('/users/:id', requireAdmin(async (c) => {
  const body = await c.req.json() as Record<string, unknown>;
  body.user_id = c.req.param('id');
  await db.upsertAppUser(c.env.DB, body);
  return c.json({ ok: true });
}));

// ─── Locations ───────────────────────────────────────────────────────────────

app.get('/locations', requireAuth(async (c) => {
  const locations = await db.getLocations(c.env.DB);
  return c.json(locations);
}));

app.post('/locations', requireAdmin(async (c) => {
  const body = await c.req.json() as Record<string, unknown>;
  const row: Record<string, unknown> = { ...body, location_id: body.location_id || crypto.randomUUID() };
  await c.env.DB.prepare(
    'INSERT INTO locations (location_id, name, address, phone, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(row.location_id, row.name, row.address ?? null, row.phone ?? null, new Date().toISOString()).run();
  return c.json({ location_id: row.location_id });
}));

// ─── User Location Access ─────────────────────────────────────────────────────

app.get('/user-location-access', requireAdmin(async (c) => {
  const rows = await db.getUserLocationAccessAll(c.env.DB);
  return c.json(rows);
}));

app.post('/user-location-access', requireAdmin(async (c) => {
  const { user_id, location_id, can_access } = await c.req.json() as { user_id: string; location_id: string; can_access: boolean };
  await db.setUserLocationAccess(c.env.DB, user_id, location_id, can_access);
  return c.json({ ok: true });
}));

// ─── Customers ───────────────────────────────────────────────────────────────

app.get('/customers', requireAuth(async (c) => {
  const locationId = c.req.query('location_id');
  const customers = await db.getCustomers(c.env.DB, locationId);
  return c.json(customers);
}));

app.post('/customers', requireAuth(async (c) => {
  const body = await c.req.json() as Record<string, unknown>;
  if (!body.customer_id) body.customer_id = crypto.randomUUID();
  await db.upsertCustomer(c.env.DB, body);
  return c.json({ customer_id: body.customer_id });
}));

app.put('/customers/:id', requireAuth(async (c) => {
  const body = await c.req.json() as Record<string, unknown>;
  body.customer_id = c.req.param('id');
  await db.upsertCustomer(c.env.DB, body);
  return c.json({ ok: true });
}));

// ─── Menu Items ───────────────────────────────────────────────────────────────

app.get('/menu-items', requireAuth(async (c) => {
  const items = await db.getMenuItems(c.env.DB);
  return c.json(items);
}));

app.post('/menu-items', requireAdmin(async (c) => {
  const body = await c.req.json() as Record<string, unknown>;
  if (!body.menu_item_id) body.menu_item_id = crypto.randomUUID();
  await db.upsertMenuItem(c.env.DB, body);
  return c.json({ menu_item_id: body.menu_item_id });
}));

app.put('/menu-items/:id', requireAdmin(async (c) => {
  const body = await c.req.json() as Record<string, unknown>;
  body.menu_item_id = c.req.param('id');
  await db.upsertMenuItem(c.env.DB, body);
  return c.json({ ok: true });
}));

// ─── Location Menus ──────────────────────────────────────────────────────────

app.get('/location-menus', requireAuth(async (c) => {
  const locationId = c.req.query('location_id');
  const menus = await db.getLocationMenus(c.env.DB, locationId);
  return c.json(menus);
}));

// ─── Reservations ─────────────────────────────────────────────────────────────

app.get('/reservations', requireAuth(async (c) => {
  const locationId = c.req.query('location_id');
  const startDate = c.req.query('start_date');
  const endDate = c.req.query('end_date');

  if (startDate && endDate) {
    const rows = await db.getReservationsByDateRange(c.env.DB, startDate, endDate, locationId);
    return c.json(rows);
  }
  const rows = await db.getReservations(c.env.DB, locationId);
  return c.json(rows);
}));

app.post('/reservations', requireAuth(async (c) => {
  const body = await c.req.json() as Record<string, unknown>;
  if (!body.reservation_id) body.reservation_id = crypto.randomUUID();
  await db.upsertReservation(c.env.DB, body);
  return c.json({ reservation_id: body.reservation_id });
}));

app.put('/reservations/:id', requireAuth(async (c) => {
  const body = await c.req.json() as Record<string, unknown>;
  body.reservation_id = c.req.param('id');
  await db.upsertReservation(c.env.DB, body);
  return c.json({ ok: true });
}));

app.delete('/reservations/:id', requireAuth(async (c) => {
  await c.env.DB.prepare('DELETE FROM reservations WHERE reservation_id = ?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
}));

// ─── Work Orders ──────────────────────────────────────────────────────────────

app.get('/work-orders', requireAuth(async (c) => {
  const locationId = c.req.query('location_id');
  const rows = await db.getWorkOrders(c.env.DB, locationId);
  return c.json(rows);
}));

app.post('/work-orders', requireAuth(async (c) => {
  const body = await c.req.json() as Record<string, unknown>;
  if (!body.work_order_id) body.work_order_id = crypto.randomUUID();
  await db.upsertWorkOrder(c.env.DB, body);
  return c.json({ work_order_id: body.work_order_id });
}));

app.put('/work-orders/:id', requireAuth(async (c) => {
  const body = await c.req.json() as Record<string, unknown>;
  body.work_order_id = c.req.param('id');
  await db.upsertWorkOrder(c.env.DB, body);
  return c.json({ ok: true });
}));

// ─── Reservation Settings ─────────────────────────────────────────────────────

app.get('/reservation-settings', requireAuth(async (c) => {
  const locationId = c.req.query('location_id') || '';
  const row = await db.getReservationSettings(c.env.DB, locationId);
  return c.json(row ?? {});
}));

app.put('/reservation-settings', requireAdmin(async (c) => {
  const body = await c.req.json() as Record<string, unknown>;
  await db.upsertReservationSettings(c.env.DB, body);
  return c.json({ ok: true });
}));

// ─── Location Availability ────────────────────────────────────────────────────

app.get('/location-availability', requireAuth(async (c) => {
  const locationId = c.req.query('location_id') || '';
  const row = await db.getLocationAvailability(c.env.DB, locationId);
  return c.json(row ?? {});
}));

app.put('/location-availability', requireAdmin(async (c) => {
  const body = await c.req.json() as Record<string, unknown>;
  await db.upsertLocationAvailability(c.env.DB, body);
  return c.json({ ok: true });
}));

// ─── Incentive Monthly ────────────────────────────────────────────────────────

app.get('/incentive-monthly', requireAdmin(async (c) => {
  const yearMonth = c.req.query('year_month') || '';
  const locationId = c.req.query('location_id');
  const rows = await db.getIncentiveMonthly(c.env.DB, yearMonth, locationId);
  return c.json(rows);
}));

app.post('/incentive-monthly', requireAdmin(async (c) => {
  const body = await c.req.json() as Record<string, unknown>;
  await db.upsertIncentiveMonthly(c.env.DB, body);
  return c.json({ ok: true });
}));

// ─── Calendar bulk fetch ──────────────────────────────────────────────────────

app.post('/calendar/bulk', requireAuth(async (c) => {
  const { month, location_id } = await c.req.json() as { month: string; location_id: string };
  const [year, mon] = month.split('-').map(Number);
  const startDate = `${month}-01`;
  const lastDay = new Date(year, mon, 0).getDate();
  const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;

  const [reservations, settings, availability] = await Promise.all([
    db.getReservationsByDateRange(c.env.DB, startDate, endDate, location_id),
    db.getReservationSettings(c.env.DB, location_id),
    db.getLocationAvailability(c.env.DB, location_id),
  ]);

  // Fetch unique customer IDs
  const customerIds = [...new Set(reservations.map((r: any) => r.customer_id).filter(Boolean))];
  const customers = await db.getCustomersByIds(c.env.DB, customerIds as string[]);

  return c.json({ reservations, settings, availability, customers });
}));

// ─── Calendar data (GET version for prefetch) ─────────────────────────────────

app.get('/calendar-data', requireAuth(async (c) => {
  const month = c.req.query('month') || '';
  const locationId = c.req.query('location_id') || '';
  const [year, mon] = month.split('-').map(Number);
  const startDate = `${month}-01`;
  const lastDay = new Date(year, mon, 0).getDate();
  const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;

  const [reservations, settings, availability] = await Promise.all([
    db.getReservationsByDateRange(c.env.DB, startDate, endDate, locationId),
    db.getReservationSettings(c.env.DB, locationId),
    db.getLocationAvailability(c.env.DB, locationId),
  ]);

  const customerIds = [...new Set(reservations.map((r: any) => r.customer_id).filter(Boolean))];
  const customers = await db.getCustomersByIds(c.env.DB, customerIds as string[]);

  return c.json({ reservations, settings, availability, customers });
}));

// ─── Public endpoints ─────────────────────────────────────────────────────────

app.get('/public/available-dates', async (c) => {
  const locationId = c.req.query('location_id') || '';
  const month = c.req.query('month') || '';
  const [year, mon] = month.split('-').map(Number);
  const startDate = `${month}-01`;
  const lastDay = new Date(year, mon, 0).getDate();
  const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;

  const [settings, availability, reservations] = await Promise.all([
    db.getReservationSettings(c.env.DB, locationId),
    db.getLocationAvailability(c.env.DB, locationId),
    db.getReservationsByDateRange(c.env.DB, startDate, endDate, locationId),
  ]);

  return c.json({ settings, availability, reservations });
});

app.get('/public/reservations/by-date', async (c) => {
  const locationId = c.req.query('location_id') || '';
  const date = c.req.query('date') || '';
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM reservations WHERE location_id = ? AND reservation_date = ? ORDER BY start_time'
  ).bind(locationId, date).all<Record<string, unknown>>();
  return c.json(results);
});

app.post('/public/reservations', async (c) => {
  const body = await c.req.json() as Record<string, unknown>;
  body.reservation_id = crypto.randomUUID();
  body.status = 'confirmed';
  await db.upsertReservation(c.env.DB, body);
  return c.json({ reservation_id: body.reservation_id });
});

export default app;
