// D1 data access layer for Cloudflare Worker
type D1 = D1Database;

function boolVal(v: unknown): number {
  return v ? 1 : 0;
}

function parseRow(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === null || v === undefined) {
      result[k] = v;
    } else if (typeof v === 'number' && (k.endsWith('_flag') || k === 'active' || k === 'visible')) {
      result[k] = v !== 0;
    } else if (typeof v === 'string' && (k.endsWith('_json') || k === 'closed_dates' || k === 'location_ids' || k === 'menu_ids' || k === 'available_times' || k === 'block_dates')) {
      try { result[k] = JSON.parse(v); } catch { result[k] = v; }
    } else {
      result[k] = v;
    }
  }
  return result;
}

// ========== App Users ==========
export async function getAppUser(db: D1, userId: string) {
  const row = await db.prepare('SELECT * FROM app_users WHERE user_id = ?').bind(userId).first<Record<string, unknown>>();
  return row ? parseRow(row) : null;
}

export async function getAppUserByLoginId(db: D1, loginId: string) {
  const row = await db.prepare('SELECT * FROM app_users WHERE login_id = ?').bind(loginId).first<Record<string, unknown>>();
  return row ? parseRow(row) : null;
}

export async function updatePasswordHash(db: D1, userId: string, hash: string) {
  await db.prepare('UPDATE app_users SET password_hash = ?, loginpass = NULL WHERE user_id = ?').bind(hash, userId).run();
}

export async function updateLastLogin(db: D1, userId: string) {
  await db.prepare('UPDATE app_users SET last_login_at = ? WHERE user_id = ?').bind(new Date().toISOString(), userId).run();
}

export async function getAllAppUsers(db: D1) {
  const { results } = await db.prepare('SELECT * FROM app_users ORDER BY created_at').all<Record<string, unknown>>();
  return results.map(parseRow);
}

export async function createAppUser(db: D1, user: Record<string, unknown>) {
  await db.prepare(`
    INSERT INTO app_users (user_id, login_id, name, role, active_flag, must_change_password, password_hash, loginpass, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    user.user_id, user.login_id, user.name, user.role ?? 'staff',
    boolVal(user.active_flag ?? true), boolVal(user.must_change_password ?? true),
    user.password_hash ?? null, user.loginpass ?? null,
    new Date().toISOString(),
  ).run();
}

export async function upsertAppUser(db: D1, user: Record<string, unknown>) {
  await db.prepare(`
    INSERT INTO app_users (user_id, login_id, name, role, active_flag, must_change_password, password_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      login_id = excluded.login_id,
      name = excluded.name,
      role = excluded.role,
      active_flag = excluded.active_flag,
      must_change_password = excluded.must_change_password,
      password_hash = COALESCE(excluded.password_hash, app_users.password_hash)
  `).bind(
    user.user_id, user.login_id, user.name, user.role,
    boolVal(user.active_flag), boolVal(user.must_change_password),
    user.password_hash ?? null,
  ).run();
}

// ========== Locations ==========
export async function getLocations(db: D1) {
  const { results } = await db.prepare('SELECT * FROM locations ORDER BY location_id').all<Record<string, unknown>>();
  return results.map(parseRow);
}

// ========== User Location Access ==========
export async function getAccessibleLocations(db: D1, userId: string) {
  const { results } = await db.prepare(`
    SELECT l.* FROM locations l
    JOIN user_location_access ula ON l.location_id = ula.location_id
    WHERE ula.user_id = ? AND ula.can_access = 1
    ORDER BY l.location_id
  `).bind(userId).all<Record<string, unknown>>();
  return results.map(parseRow);
}

export async function setUserLocationAccess(db: D1, userId: string, locationId: string, canAccess: boolean) {
  await db.prepare(`
    INSERT INTO user_location_access (user_id, location_id, can_access)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, location_id) DO UPDATE SET can_access = excluded.can_access
  `).bind(userId, locationId, boolVal(canAccess)).run();
}

export async function getUserLocationAccessAll(db: D1) {
  const { results } = await db.prepare('SELECT * FROM user_location_access').all<Record<string, unknown>>();
  return results.map(parseRow);
}

// ========== Customers ==========
export async function getCustomers(db: D1, locationId?: string) {
  if (locationId) {
    const { results } = await db.prepare('SELECT * FROM customers WHERE location_id = ? ORDER BY created_at DESC').bind(locationId).all<Record<string, unknown>>();
    return results.map(parseRow);
  }
  const { results } = await db.prepare('SELECT * FROM customers ORDER BY created_at DESC').all<Record<string, unknown>>();
  return results.map(parseRow);
}

export async function getCustomersByIds(db: D1, ids: string[]) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const { results } = await db.prepare(`SELECT * FROM customers WHERE customer_id IN (${placeholders})`).bind(...ids).all<Record<string, unknown>>();
  return results.map(parseRow);
}

export async function upsertCustomer(db: D1, c: Record<string, unknown>) {
  await db.prepare(`
    INSERT INTO customers (customer_id, name, name_kana, phone, email, memo, location_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(customer_id) DO UPDATE SET
      name = excluded.name, name_kana = excluded.name_kana,
      phone = excluded.phone, email = excluded.email,
      memo = excluded.memo, location_id = excluded.location_id,
      updated_at = excluded.updated_at
  `).bind(
    c.customer_id, c.name, c.name_kana ?? null, c.phone ?? null,
    c.email ?? null, c.memo ?? null, c.location_id ?? null,
    c.created_at ?? new Date().toISOString(), new Date().toISOString(),
  ).run();
}

// ========== Menu Items ==========
export async function getMenuItems(db: D1) {
  const { results } = await db.prepare('SELECT * FROM menu_items ORDER BY created_at').all<Record<string, unknown>>();
  return results.map(parseRow);
}

export async function upsertMenuItem(db: D1, item: Record<string, unknown>) {
  await db.prepare(`
    INSERT INTO menu_items (menu_item_id, name, description, price_yen, duration_min, active_flag, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(menu_item_id) DO UPDATE SET
      name = excluded.name, description = excluded.description,
      price_yen = excluded.price_yen, duration_min = excluded.duration_min,
      active_flag = excluded.active_flag
  `).bind(
    item.menu_item_id, item.name, item.description ?? null,
    item.price_yen ?? 0, item.duration_min ?? 60,
    boolVal(item.active_flag ?? true),
    item.created_at ?? new Date().toISOString(),
  ).run();
}

// ========== Location Menus ==========
export async function getLocationMenus(db: D1, locationId?: string) {
  if (locationId) {
    const { results } = await db.prepare('SELECT * FROM location_menus WHERE location_id = ?').bind(locationId).all<Record<string, unknown>>();
    return results.map(parseRow);
  }
  const { results } = await db.prepare('SELECT * FROM location_menus').all<Record<string, unknown>>();
  return results.map(parseRow);
}

// ========== Reservations ==========
export async function getReservations(db: D1, locationId?: string) {
  if (locationId) {
    const { results } = await db.prepare('SELECT * FROM reservations WHERE location_id = ? ORDER BY reservation_date DESC').bind(locationId).all<Record<string, unknown>>();
    return results.map(parseRow);
  }
  const { results } = await db.prepare('SELECT * FROM reservations ORDER BY reservation_date DESC').all<Record<string, unknown>>();
  return results.map(parseRow);
}

export async function getReservationsByDateRange(db: D1, startDate: string, endDate: string, locationId?: string) {
  if (locationId) {
    const { results } = await db.prepare(
      'SELECT * FROM reservations WHERE location_id = ? AND reservation_date >= ? AND reservation_date <= ? ORDER BY reservation_date, start_time'
    ).bind(locationId, startDate, endDate).all<Record<string, unknown>>();
    return results.map(parseRow);
  }
  const { results } = await db.prepare(
    'SELECT * FROM reservations WHERE reservation_date >= ? AND reservation_date <= ? ORDER BY reservation_date, start_time'
  ).bind(startDate, endDate).all<Record<string, unknown>>();
  return results.map(parseRow);
}

export async function upsertReservation(db: D1, r: Record<string, unknown>) {
  await db.prepare(`
    INSERT INTO reservations (reservation_id, customer_id, location_id, menu_item_id, reservation_date, start_time, end_time, num_people, status, memo, cast_user_id, price_yen, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(reservation_id) DO UPDATE SET
      customer_id = excluded.customer_id, location_id = excluded.location_id,
      menu_item_id = excluded.menu_item_id, reservation_date = excluded.reservation_date,
      start_time = excluded.start_time, end_time = excluded.end_time,
      num_people = excluded.num_people, status = excluded.status,
      memo = excluded.memo, cast_user_id = excluded.cast_user_id,
      price_yen = excluded.price_yen, updated_at = excluded.updated_at
  `).bind(
    r.reservation_id, r.customer_id ?? null, r.location_id ?? null,
    r.menu_item_id ?? null, r.reservation_date, r.start_time ?? null,
    r.end_time ?? null, r.num_people ?? 1, r.status ?? 'confirmed',
    r.memo ?? null, r.cast_user_id ?? null, r.price_yen ?? null,
    r.created_at ?? new Date().toISOString(), new Date().toISOString(),
  ).run();
}

// ========== Work Orders ==========
export async function getWorkOrders(db: D1, locationId?: string) {
  if (locationId) {
    const { results } = await db.prepare('SELECT * FROM work_orders WHERE location_id = ? ORDER BY work_date DESC').bind(locationId).all<Record<string, unknown>>();
    return results.map(parseRow);
  }
  const { results } = await db.prepare('SELECT * FROM work_orders ORDER BY work_date DESC').all<Record<string, unknown>>();
  return results.map(parseRow);
}

export async function upsertWorkOrder(db: D1, wo: Record<string, unknown>) {
  await db.prepare(`
    INSERT INTO work_orders (work_order_id, reservation_id, location_id, assigned_user_id, work_date, status, memo, completed_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(work_order_id) DO UPDATE SET
      reservation_id = excluded.reservation_id, location_id = excluded.location_id,
      assigned_user_id = excluded.assigned_user_id, work_date = excluded.work_date,
      status = excluded.status, memo = excluded.memo,
      completed_at = excluded.completed_at, updated_at = excluded.updated_at
  `).bind(
    wo.work_order_id, wo.reservation_id ?? null, wo.location_id ?? null,
    wo.assigned_user_id ?? null, wo.work_date, wo.status ?? 'pending',
    wo.memo ?? null, wo.completed_at ?? null,
    wo.created_at ?? new Date().toISOString(), new Date().toISOString(),
  ).run();
}

// ========== Reservation Settings ==========
export async function getReservationSettings(db: D1, locationId: string) {
  const row = await db.prepare('SELECT * FROM reservation_settings WHERE location_id = ?').bind(locationId).first<Record<string, unknown>>();
  return row ? parseRow(row) : null;
}

export async function upsertReservationSettings(db: D1, s: Record<string, unknown>) {
  await db.prepare(`
    INSERT INTO reservation_settings (location_id, available_times, block_dates, max_per_day, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(location_id) DO UPDATE SET
      available_times = excluded.available_times,
      block_dates = excluded.block_dates,
      max_per_day = excluded.max_per_day,
      updated_at = excluded.updated_at
  `).bind(
    s.location_id,
    typeof s.available_times === 'string' ? s.available_times : JSON.stringify(s.available_times ?? []),
    typeof s.block_dates === 'string' ? s.block_dates : JSON.stringify(s.block_dates ?? []),
    s.max_per_day ?? 10,
    new Date().toISOString(),
  ).run();
}

// ========== Location Availability ==========
export async function getLocationAvailability(db: D1, locationId: string) {
  const row = await db.prepare('SELECT * FROM location_availability WHERE location_id = ?').bind(locationId).first<Record<string, unknown>>();
  return row ? parseRow(row) : null;
}

export async function upsertLocationAvailability(db: D1, a: Record<string, unknown>) {
  await db.prepare(`
    INSERT INTO location_availability (location_id, closed_dates, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(location_id) DO UPDATE SET
      closed_dates = excluded.closed_dates, updated_at = excluded.updated_at
  `).bind(
    a.location_id,
    typeof a.closed_dates === 'string' ? a.closed_dates : JSON.stringify(a.closed_dates ?? []),
    new Date().toISOString(),
  ).run();
}

// ========== Incentive Monthly ==========
export async function getIncentiveMonthly(db: D1, yearMonth: string, locationId?: string) {
  if (locationId) {
    const { results } = await db.prepare(
      'SELECT * FROM incentive_monthly WHERE year_month = ? AND location_id = ?'
    ).bind(yearMonth, locationId).all<Record<string, unknown>>();
    return results.map(parseRow);
  }
  const { results } = await db.prepare(
    'SELECT * FROM incentive_monthly WHERE year_month = ?'
  ).bind(yearMonth).all<Record<string, unknown>>();
  return results.map(parseRow);
}

export async function upsertIncentiveMonthly(db: D1, row: Record<string, unknown>) {
  await db.prepare(`
    INSERT INTO incentive_monthly (incentive_monthly_id, location_id, user_id, year_month, manual_adjust_yen, locked_flag, locked_at, adjusted_by_user_id, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, year_month) DO UPDATE SET
      manual_adjust_yen = excluded.manual_adjust_yen,
      locked_flag = excluded.locked_flag,
      locked_at = excluded.locked_at,
      adjusted_by_user_id = excluded.adjusted_by_user_id,
      updated_at = excluded.updated_at
  `).bind(
    row.incentive_monthly_id ?? crypto.randomUUID(),
    row.location_id, row.user_id, row.year_month, row.manual_adjust_yen ?? 0,
    boolVal(row.locked_flag), row.locked_at ?? null,
    row.adjusted_by_user_id ?? null, new Date().toISOString(),
  ).run();
}

// ========== Audit Logs ==========
export async function insertAuditLog(db: D1, row: Record<string, unknown>): Promise<void> {
  await db.prepare(`
    INSERT INTO audit_logs (audit_id, ref_table, ref_id, action_type, before_json, after_json, acted_by_user_id, acted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    row.ref_table, row.ref_id, row.action_type,
    row.before_json ? JSON.stringify(row.before_json) : null,
    row.after_json ? JSON.stringify(row.after_json) : null,
    row.acted_by_user_id ?? null,
    row.acted_at ?? new Date().toISOString(),
  ).run();
}
