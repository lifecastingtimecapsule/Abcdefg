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

// ─── Users ───────────────────────────────────────────────────────────────────

app.get('/users', requireAdmin(async (c) => {
  const users = await db.getAllAppUsers(c.env.DB);
  return c.json({ users });
}));

// POST /signup — create a new staff user (admin only)
app.post('/signup', requireAdmin(async (c) => {
  const body = await c.req.json() as Record<string, unknown>;
  if (!body.user_id) body.user_id = crypto.randomUUID();
  if (!body.login_id) return c.json({ error: 'login_id is required' }, 400);

  // Hash the password if provided, else use initial password
  const rawPassword = (body.password as string) || 'InitialPassword1!';
  const hash = await hashPassword(rawPassword);
  body.password_hash = hash;
  body.must_change_password = true;
  delete body.password; // don't store plain text

  await db.createAppUser(c.env.DB, body);
  return c.json({ user_id: body.user_id, ok: true });
}));

// POST /users — create user (legacy)
app.post('/users', requireAdmin(async (c) => {
  const body = await c.req.json() as Record<string, unknown>;
  body.user_id = crypto.randomUUID();
  body.loginpass = 'InitialPassword1!';
  await db.createAppUser(c.env.DB, body);
  return c.json({ user_id: body.user_id });
}));

// POST /users/update — update user info (admin only)
app.post('/users/update', requireAdmin(async (c) => {
  const body = await c.req.json() as Record<string, unknown>;
  if (!body.user_id) return c.json({ error: 'user_id is required' }, 400);

  const updates: string[] = [];
  const binds: unknown[] = [];

  if (body.name !== undefined) { updates.push('name = ?'); binds.push(body.name); }
  if (body.role !== undefined) { updates.push('role = ?'); binds.push(body.role); }
  if (body.active_flag !== undefined) { updates.push('active_flag = ?'); binds.push(body.active_flag ? 1 : 0); }
  if (body.update_login_id) { updates.push('login_id = ?'); binds.push(body.update_login_id); }
  if (body.update_password) {
    const hash = await hashPassword(body.update_password as string);
    updates.push('password_hash = ?');
    updates.push('loginpass = NULL');
    binds.push(hash);
  }

  if (updates.length > 0) {
    binds.push(body.user_id);
    await c.env.DB.prepare(`UPDATE app_users SET ${updates.join(', ')} WHERE user_id = ?`).bind(...binds).run();
  }
  return c.json({ ok: true });
}));

app.put('/users/:id', requireAdmin(async (c) => {
  const body = await c.req.json() as Record<string, unknown>;
  body.user_id = c.req.param('id');
  await db.upsertAppUser(c.env.DB, body);
  return c.json({ ok: true });
}));

// POST /admin/users/:id/reset-password
app.post('/admin/users/:id/reset-password', requireAdmin(async (c) => {
  const { new_password } = await c.req.json() as { new_password: string };
  if (!new_password) return c.json({ error: 'new_password is required' }, 400);
  const hash = await hashPassword(new_password);
  await c.env.DB.prepare(
    'UPDATE app_users SET password_hash = ?, loginpass = NULL, must_change_password = 1 WHERE user_id = ?'
  ).bind(hash, c.req.param('id')).run();
  return c.json({ ok: true });
}));

// POST /admin/issue-initial-passwords — reset all non-admin users to initial password
app.post('/admin/issue-initial-passwords', requireAdmin(async (c) => {
  const users = await db.getAllAppUsers(c.env.DB);
  const staffUsers = users.filter((u: any) => u.role !== 'admin' && u.active_flag);
  for (const u of staffUsers) {
    await c.env.DB.prepare(
      'UPDATE app_users SET loginpass = ?, password_hash = NULL, must_change_password = 1 WHERE user_id = ?'
    ).bind('InitialPassword1!', u.user_id).run();
  }
  return c.json({ ok: true, count: staffUsers.length, message: `${staffUsers.length}人の初期パスワードを発行しました` });
}));

// ─── Locations ───────────────────────────────────────────────────────────────

app.get('/locations', requireAuth(async (c) => {
  const locations = await db.getLocations(c.env.DB);
  return c.json({ locations });
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
  const page = parseInt(c.req.query('page') || '1', 10);
  const pageSize = parseInt(c.req.query('pageSize') || '30', 10);
  const search = c.req.query('search') || undefined;
  const result = await db.getCustomers(c.env.DB, { locationId, page, pageSize, search });
  return c.json(result);
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

app.delete('/customers/:id', requireAuth(async (c) => {
  const customerId = c.req.param('id');
  // Cascade: delete work orders → reservations → customer
  const { results: reservations } = await c.env.DB.prepare(
    'SELECT reservation_id FROM reservations WHERE customer_id = ?'
  ).bind(customerId).all<{ reservation_id: string }>();
  if (reservations.length > 0) {
    const placeholders = reservations.map(() => '?').join(',');
    const ids = reservations.map(r => r.reservation_id);
    await c.env.DB.prepare(`DELETE FROM work_orders WHERE reservation_id IN (${placeholders})`).bind(...ids).run();
    await c.env.DB.prepare(`DELETE FROM reservations WHERE reservation_id IN (${placeholders})`).bind(...ids).run();
  }
  await c.env.DB.prepare('DELETE FROM customers WHERE customer_id = ?').bind(customerId).run();
  return c.json({ ok: true, message: '顧客を削除しました' });
}));

app.post('/customers/batch-fix-age', requireAdmin(async (c) => {
  const result = await c.env.DB.prepare(
    'UPDATE customers SET child_age_years = 0 WHERE child_age_months IS NOT NULL AND child_age_years IS NULL'
  ).run();
  const updated = result.changes ?? 0;
  return c.json({ ok: true, updated_count: updated, message: `${updated}件のデータを補完しました` });
}));

// ─── Menu Items ───────────────────────────────────────────────────────────────

app.get('/menu-items', requireAuth(async (c) => {
  const items = await db.getMenuItems(c.env.DB);
  return c.json({ menu_items: items });
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

app.delete('/menu-items/:id', requireAdmin(async (c) => {
  await db.deleteMenuItem(c.env.DB, c.req.param('id'));
  return c.json({ ok: true });
}));

// GET /menu-items/:id/location-settings
app.get('/menu-items/:id/location-settings', requireAuth(async (c) => {
  const menuItemId = c.req.param('id');
  const settings = await db.getMenuItemLocationSettings(c.env.DB, menuItemId);
  return c.json({ location_settings: settings });
}));

// ─── Location Menu Toggle ─────────────────────────────────────────────────────

app.post('/locations/:locationId/menus/:menuItemId/toggle', requireAdmin(async (c) => {
  const locationId = c.req.param('locationId');
  const menuItemId = c.req.param('menuItemId');
  const { enabled } = await c.req.json() as { enabled: boolean };
  await db.toggleLocationMenu(c.env.DB, locationId, menuItemId, enabled);
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
  const customerIdsParam = c.req.query('customer_ids');

  if (customerIdsParam) {
    const customerIds = customerIdsParam.split(',').filter(Boolean);
    const rows = await db.getReservationsByCustomerIds(c.env.DB, customerIds);
    return c.json({ reservations: rows });
  }
  if (startDate && endDate) {
    const rows = await db.getReservationsByDateRange(c.env.DB, startDate, endDate, locationId);
    return c.json({ reservations: rows });
  }
  const rows = await db.getReservations(c.env.DB, locationId);
  return c.json({ reservations: rows });
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

app.post('/reservations/batch-create-work-orders', requireAdmin(async (c) => {
  const now = new Date().toISOString();
  const { results: reservations } = await c.env.DB.prepare(`
    SELECT r.* FROM reservations r
    LEFT JOIN work_orders wo ON r.reservation_id = wo.reservation_id
    WHERE r.status = 'confirmed'
      AND r.reservation_date_time < ?
      AND wo.work_order_id IS NULL
  `).bind(now).all<Record<string, unknown>>();

  let created = 0;
  for (const r of reservations) {
    const dueDate = new Date(r.reservation_date_time as string);
    dueDate.setDate(dueDate.getDate() + 28);
    await c.env.DB.prepare(`
      INSERT INTO work_orders (work_order_id, customer_id, reservation_id, product_type, status, due_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      r.customer_id ?? null,
      r.reservation_id,
      r.work_required ?? 'ライフキャスティング',
      '乾燥中',
      dueDate.toISOString().split('T')[0],
      now, now,
    ).run();
    created++;
  }
  return c.json({ ok: true, created_count: created, message: `${created}件の制作物を生成しました` });
}));

// ─── Work Orders ──────────────────────────────────────────────────────────────

app.get('/work-orders', requireAuth(async (c) => {
  const locationId = c.req.query('location_id');
  const reservationIdsParam = c.req.query('reservation_ids');

  if (reservationIdsParam) {
    const reservationIds = reservationIdsParam.split(',').filter(Boolean);
    const rows = await db.getWorkOrdersByReservationIds(c.env.DB, reservationIds);
    return c.json({ work_orders: rows });
  }
  const rows = await db.getWorkOrders(c.env.DB, locationId);
  return c.json({ work_orders: rows });
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

app.post('/work-orders/reorder', requireAuth(async (c) => {
  const { orders } = await c.req.json() as { orders: { work_order_id: string; priority_order: number }[] };
  for (const o of orders) {
    await c.env.DB.prepare('UPDATE work_orders SET priority_order = ? WHERE work_order_id = ?')
      .bind(o.priority_order, o.work_order_id).run();
  }
  return c.json({ ok: true });
}));

// ─── Shifts ───────────────────────────────────────────────────────────────────

app.get('/shifts', requireAuth(async (c) => {
  const yearMonth = c.req.query('year_month') || '';
  const shifts = await db.getShifts(c.env.DB, yearMonth);
  return c.json({ shifts });
}));

app.post('/shifts', requireAuth(async (c, tokenUser) => {
  const body = await c.req.json() as Record<string, unknown>;
  body.updated_by = tokenUser.sub;
  await db.upsertShift(c.env.DB, body);
  return c.json({ ok: true });
}));

app.delete('/shifts', requireAuth(async (c) => {
  const staffId = c.req.query('staff_id') || '';
  const date = c.req.query('date') || '';
  if (!staffId || !date) return c.json({ error: 'staff_id and date are required' }, 400);
  await db.deleteShift(c.env.DB, staffId, date);
  return c.json({ ok: true });
}));

// ─── Reservation Settings ─────────────────────────────────────────────────────

app.get('/reservation-settings', requireAuth(async (c) => {
  const locationId = c.req.query('location_id') || '';
  const row = await db.getReservationSettings(c.env.DB, locationId);
  return c.json({ settings: row ?? {} });
}));

app.put('/reservation-settings', requireAdmin(async (c) => {
  const body = await c.req.json() as Record<string, unknown>;
  await db.upsertReservationSettings(c.env.DB, body);
  return c.json({ ok: true });
}));

// ─── Location Availability ────────────────────────────────────────────────────

// Path param version: GET /location-availability/:id
app.get('/location-availability/:id', requireAuth(async (c) => {
  const locationId = c.req.param('id');
  const row = await db.getLocationAvailability(c.env.DB, locationId);
  return c.json({ availability: row ?? null });
}));

// Query param version: GET /location-availability?location_id=xxx
app.get('/location-availability', requireAuth(async (c) => {
  const locationId = c.req.query('location_id') || '';
  const row = await db.getLocationAvailability(c.env.DB, locationId);
  return c.json({ availability: row ?? null });
}));

// PUT for update
app.put('/location-availability', requireAdmin(async (c) => {
  const body = await c.req.json() as Record<string, unknown>;
  await db.upsertLocationAvailability(c.env.DB, body);
  return c.json({ ok: true });
}));

// POST alias (some components use POST)
app.post('/location-availability', requireAdmin(async (c) => {
  const body = await c.req.json() as Record<string, unknown>;
  await db.upsertLocationAvailability(c.env.DB, body);
  return c.json({ ok: true });
}));

// ─── Incentives ───────────────────────────────────────────────────────────────

app.get('/incentives/yearly', requireAuth(async (c, tokenUser) => {
  const year = c.req.query('year') || new Date().getFullYear().toString();
  const isAdmin = tokenUser.role === 'admin';
  const userId = isAdmin ? undefined : (tokenUser.sub as string);
  const data = await db.getIncentivesYearly(c.env.DB, year, userId);
  return c.json(data);
}));

app.get('/incentives/range', requireAuth(async (c, tokenUser) => {
  const start = c.req.query('start') || '';
  const end = c.req.query('end') || '';
  const isAdmin = tokenUser.role === 'admin';
  const userId = isAdmin ? undefined : (tokenUser.sub as string);
  const incentives = await db.getIncentivesRange(c.env.DB, start, end, userId);
  return c.json({ incentives });
}));

app.get('/incentives', requireAuth(async (c, tokenUser) => {
  const yearMonth = c.req.query('year_month') || new Date().toISOString().slice(0, 7);
  const isAdmin = tokenUser.role === 'admin';
  const userId = isAdmin ? undefined : (tokenUser.sub as string);
  const incentives = await db.getIncentives(c.env.DB, yearMonth, userId);
  return c.json({ incentives });
}));

app.post('/incentives/lock', requireAdmin(async (c, tokenUser) => {
  const body = await c.req.json() as Record<string, unknown>;
  body.adjusted_by_user_id = tokenUser.sub;
  if (body.locked_flag) {
    body.locked_at = new Date().toISOString();
  } else {
    body.locked_at = null;
  }
  await db.upsertIncentiveMonthly(c.env.DB, body);
  return c.json({ ok: true });
}));

// ─── Incentive Monthly (legacy internal endpoint) ─────────────────────────────

app.get('/incentive-monthly', requireAdmin(async (c) => {
  const yearMonth = c.req.query('year_month') || '';
  const rows = await db.getIncentiveMonthly(c.env.DB, yearMonth);
  return c.json(rows);
}));

app.post('/incentive-monthly', requireAdmin(async (c) => {
  const body = await c.req.json() as Record<string, unknown>;
  await db.upsertIncentiveMonthly(c.env.DB, body);
  return c.json({ ok: true });
}));

// ─── Sales Analytics ──────────────────────────────────────────────────────────

app.get('/sales-analytics', requireAuth(async (c) => {
  const startDate = c.req.query('startDate') || '';
  const endDate = c.req.query('endDate') || '';
  if (!startDate || !endDate) return c.json({ error: 'startDate and endDate are required' }, 400);
  const data = await db.getSalesAnalytics(c.env.DB, startDate, endDate);
  return c.json(data);
}));

// ─── Dashboard ────────────────────────────────────────────────────────────────

app.get('/dashboard', requireAuth(async (c) => {
  const month = c.req.query('month') || new Date().toISOString().slice(0, 7);
  const withLists = c.req.query('with_lists') === '1';

  const dashData = await db.getDashboardData(c.env.DB);

  if (withLists) {
    const [yearNum, monNum] = month.split('-').map(Number);
    const startDate = `${month}-01`;
    const lastDay = new Date(yearNum, monNum, 0).getDate();
    const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;

    const [locations, menuItems, users, reservations] = await Promise.all([
      db.getLocations(c.env.DB),
      db.getMenuItems(c.env.DB),
      db.getAllAppUsers(c.env.DB),
      db.getReservationsByDateRange(c.env.DB, startDate, endDate),
    ]);

    const customerIds = [...new Set(reservations.map((r: any) => r.customer_id).filter(Boolean))] as string[];
    const customers = await db.getCustomersByIds(c.env.DB, customerIds);

    return c.json({
      ...dashData,
      locations,
      menu_items: menuItems,
      users,
      reservations,
      customers,
    });
  }

  return c.json(dashData);
}));

// ─── Integrity Check ──────────────────────────────────────────────────────────

app.post('/integrity-check', requireAdmin(async (c) => {
  const [orphanedRes, orphanedWO] = await Promise.all([
    c.env.DB.prepare(
      'SELECT COUNT(*) as cnt FROM reservations WHERE customer_id IS NOT NULL AND customer_id NOT IN (SELECT customer_id FROM customers)'
    ).first<{ cnt: number }>(),
    c.env.DB.prepare(
      'SELECT COUNT(*) as cnt FROM work_orders WHERE reservation_id IS NOT NULL AND reservation_id NOT IN (SELECT reservation_id FROM reservations)'
    ).first<{ cnt: number }>(),
  ]);
  return c.json({
    ok: true,
    orphaned_reservations: orphanedRes?.cnt ?? 0,
    orphaned_work_orders: orphanedWO?.cnt ?? 0,
  });
}));

// ─── Calendar bulk fetch ──────────────────────────────────────────────────────

app.post('/calendar/bulk', requireAuth(async (c) => {
  const { month, location_id } = await c.req.json() as { month: string; location_id: string };
  const [year, mon] = month.split('-').map(Number);
  const startDate = `${month}-01`;
  const lastDay = new Date(year, mon, 0).getDate();
  const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;

  const [reservations, settings, availability, locations, menuItemsRaw, usersRaw] = await Promise.all([
    db.getReservationsByDateRange(c.env.DB, startDate, endDate, location_id),
    db.getReservationSettings(c.env.DB, location_id),
    db.getLocationAvailability(c.env.DB, location_id),
    db.getLocations(c.env.DB),
    db.getMenuItems(c.env.DB),
    db.getAllAppUsers(c.env.DB),
  ]);

  const customerIds = [...new Set(reservations.map((r: any) => r.customer_id).filter(Boolean))] as string[];
  const customers = await db.getCustomersByIds(c.env.DB, customerIds);

  const reservationIds = [...new Set(reservations.map((r: any) => r.reservation_id).filter(Boolean))] as string[];
  const work_orders = await db.getWorkOrdersByReservationIds(c.env.DB, reservationIds);

  return c.json({ reservations, settings, availability, customers, work_orders, locations, menu_items: menuItemsRaw, users: usersRaw });
}));

// ─── Calendar data (GET version for prefetch) ─────────────────────────────────

app.get('/calendar-data', requireAuth(async (c) => {
  const month = c.req.query('month') || '';
  const locationId = c.req.query('location_id') || '';
  const [year, mon] = month.split('-').map(Number);
  const startDate = `${month}-01`;
  const lastDay = new Date(year, mon, 0).getDate();
  const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;

  const [reservations, settings, availability, locations, menuItemsRaw, usersRaw] = await Promise.all([
    db.getReservationsByDateRange(c.env.DB, startDate, endDate, locationId),
    db.getReservationSettings(c.env.DB, locationId),
    db.getLocationAvailability(c.env.DB, locationId),
    db.getLocations(c.env.DB),
    db.getMenuItems(c.env.DB),
    db.getAllAppUsers(c.env.DB),
  ]);

  const customerIds = [...new Set(reservations.map((r: any) => r.customer_id).filter(Boolean))] as string[];
  const customers = await db.getCustomersByIds(c.env.DB, customerIds);

  const reservationIds = [...new Set(reservations.map((r: any) => r.reservation_id).filter(Boolean))] as string[];
  const work_orders = await db.getWorkOrdersByReservationIds(c.env.DB, reservationIds);

  return c.json({ reservations, settings, availability, customers, work_orders, locations, menu_items: menuItemsRaw, users: usersRaw });
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
    'SELECT * FROM reservations WHERE location_id = ? AND date(reservation_date_time) = ? ORDER BY reservation_date_time'
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
