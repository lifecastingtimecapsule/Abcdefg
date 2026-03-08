// D1 data access layer for Cloudflare Worker
type D1 = D1Database;

function boolVal(v: unknown): number {
  return v ? 1 : 0;
}

const JSON_FIELDS = new Set([
  'closed_dates', 'location_ids', 'menu_ids', 'available_times', 'block_dates',
  'regular_closed_days', 'custom_hours', 'special_dates', 'allowed_days',
  'children', 'status_comments',
]);

function parseRow(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === null || v === undefined) {
      result[k] = v;
    } else if (typeof v === 'number' && (k.endsWith('_flag') || k === 'active' || k === 'visible' || k === 'is_active')) {
      result[k] = v !== 0;
    } else if (typeof v === 'string' && (k.endsWith('_json') || JSON_FIELDS.has(k))) {
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
export async function getAccessibleLocations(db: D1, userId: string, role?: string) {
  // Admin can access all locations
  if (role === 'admin') {
    const { results } = await db.prepare('SELECT * FROM locations ORDER BY location_id').all<Record<string, unknown>>();
    return results.map(parseRow);
  }
  // Staff: return locations where a row exists in user_location_access
  const { results } = await db.prepare(`
    SELECT l.* FROM locations l
    JOIN user_location_access ula ON l.location_id = ula.location_id
    WHERE ula.user_id = ?
    ORDER BY l.location_id
  `).bind(userId).all<Record<string, unknown>>();
  return results.map(parseRow);
}

export async function setUserLocationAccess(db: D1, userId: string, locationId: string, canAccess: boolean) {
  if (canAccess) {
    await db.prepare(`
      INSERT INTO user_location_access (user_id, location_id)
      VALUES (?, ?)
      ON CONFLICT(user_id, location_id) DO NOTHING
    `).bind(userId, locationId).run();
  } else {
    await db.prepare(
      'DELETE FROM user_location_access WHERE user_id = ? AND location_id = ?'
    ).bind(userId, locationId).run();
  }
}

export async function getUserLocationAccessAll(db: D1) {
  const { results } = await db.prepare('SELECT * FROM user_location_access').all<Record<string, unknown>>();
  return results.map(parseRow);
}

// ========== Customers ==========
// Actual schema: customer_id, customer_code, parent_name, parent_name_kana,
// child_name, child_name_kana, children(JSON), phone, email, notes_internal, active_flag, etc.
// No location_id column.
export async function getCustomers(db: D1, locationId?: string) {
  // customers table has no location_id; locationId param is ignored
  const { results } = await db.prepare('SELECT * FROM customers WHERE active_flag = 1 ORDER BY created_at DESC').all<Record<string, unknown>>();
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
    INSERT INTO customers (customer_id, customer_code, parent_name, parent_name_kana, child_name, child_name_kana, children, phone, email, line_url, postal_code, address_text, notes_internal, active_flag, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(customer_id) DO UPDATE SET
      parent_name = excluded.parent_name,
      parent_name_kana = excluded.parent_name_kana,
      child_name = excluded.child_name,
      child_name_kana = excluded.child_name_kana,
      children = excluded.children,
      phone = excluded.phone,
      email = excluded.email,
      line_url = excluded.line_url,
      postal_code = excluded.postal_code,
      address_text = excluded.address_text,
      notes_internal = excluded.notes_internal,
      active_flag = excluded.active_flag,
      updated_at = excluded.updated_at
  `).bind(
    c.customer_id, c.customer_code ?? null,
    c.parent_name ?? c.name ?? null,
    c.parent_name_kana ?? c.name_kana ?? null,
    c.child_name ?? null, c.child_name_kana ?? null,
    typeof c.children === 'string' ? c.children : JSON.stringify(c.children ?? []),
    c.phone ?? null, c.email ?? null, c.line_url ?? null,
    c.postal_code ?? null, c.address_text ?? null,
    c.notes_internal ?? c.memo ?? null,
    boolVal(c.active_flag ?? true),
    c.created_at ?? new Date().toISOString(),
    new Date().toISOString(),
  ).run();
}

// ========== Menu Items ==========
// Actual schema: menu_item_id, name, base_price, additional_unit_price,
// description, duration_minutes, is_active, discount_*, created_at, updated_at
export async function getMenuItems(db: D1) {
  const { results } = await db.prepare('SELECT * FROM menu_items ORDER BY created_at').all<Record<string, unknown>>();
  return results.map(parseRow);
}

export async function upsertMenuItem(db: D1, item: Record<string, unknown>) {
  await db.prepare(`
    INSERT INTO menu_items (menu_item_id, name, description, base_price, duration_minutes, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(menu_item_id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      base_price = excluded.base_price,
      duration_minutes = excluded.duration_minutes,
      is_active = excluded.is_active,
      updated_at = excluded.updated_at
  `).bind(
    item.menu_item_id, item.name, item.description ?? null,
    item.base_price ?? item.price_yen ?? 0,
    item.duration_minutes ?? item.duration_min ?? 60,
    boolVal(item.is_active ?? item.active_flag ?? true),
    item.created_at ?? new Date().toISOString(),
    new Date().toISOString(),
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
// Actual schema: reservation_id, reservation_number, reservation_date_time,
// duration_minutes, location_id, customer_id, staff_id_main, status,
// payment_status, payment_method, work_required, notes_staff, menu_item_id,
// additional_units, photo_required, updated_by_user_id, created_at, updated_at
export async function getReservations(db: D1, locationId?: string) {
  if (locationId) {
    const { results } = await db.prepare(
      'SELECT * FROM reservations WHERE location_id = ? ORDER BY reservation_date_time DESC'
    ).bind(locationId).all<Record<string, unknown>>();
    return results.map(parseRow);
  }
  const { results } = await db.prepare(
    'SELECT * FROM reservations ORDER BY reservation_date_time DESC'
  ).all<Record<string, unknown>>();
  return results.map(parseRow);
}

export async function getReservationsByDateRange(db: D1, startDate: string, endDate: string, locationId?: string) {
  // reservation_date_time is stored as ISO datetime; use date() to extract date part
  if (locationId) {
    const { results } = await db.prepare(
      'SELECT * FROM reservations WHERE location_id = ? AND date(reservation_date_time) >= ? AND date(reservation_date_time) <= ? ORDER BY reservation_date_time'
    ).bind(locationId, startDate, endDate).all<Record<string, unknown>>();
    return results.map(parseRow);
  }
  const { results } = await db.prepare(
    'SELECT * FROM reservations WHERE date(reservation_date_time) >= ? AND date(reservation_date_time) <= ? ORDER BY reservation_date_time'
  ).bind(startDate, endDate).all<Record<string, unknown>>();
  return results.map(parseRow);
}

export async function upsertReservation(db: D1, r: Record<string, unknown>) {
  // Accept both old field names (reservation_date + start_time) and new (reservation_date_time)
  const dateTime = r.reservation_date_time as string
    ?? (r.reservation_date && r.start_time ? `${r.reservation_date}T${r.start_time}:00` : null)
    ?? r.reservation_date as string
    ?? new Date().toISOString();

  await db.prepare(`
    INSERT INTO reservations (reservation_id, reservation_number, customer_id, location_id, menu_item_id, reservation_date_time, duration_minutes, status, notes_staff, staff_id_main, payment_status, work_required, additional_units, photo_required, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(reservation_id) DO UPDATE SET
      customer_id = excluded.customer_id,
      location_id = excluded.location_id,
      menu_item_id = excluded.menu_item_id,
      reservation_date_time = excluded.reservation_date_time,
      duration_minutes = excluded.duration_minutes,
      status = excluded.status,
      notes_staff = excluded.notes_staff,
      staff_id_main = excluded.staff_id_main,
      payment_status = excluded.payment_status,
      work_required = excluded.work_required,
      additional_units = excluded.additional_units,
      photo_required = excluded.photo_required,
      updated_at = excluded.updated_at
  `).bind(
    r.reservation_id, r.reservation_number ?? null,
    r.customer_id ?? null, r.location_id ?? null,
    r.menu_item_id ?? null, dateTime,
    r.duration_minutes ?? 60, r.status ?? 'tentative',
    r.notes_staff ?? r.memo ?? null,
    r.staff_id_main ?? r.cast_user_id ?? null,
    r.payment_status ?? 'unpaid',
    r.work_required ?? null,
    r.additional_units ?? r.num_people ?? 1,
    r.photo_required ?? 'not_set',
    r.created_at ?? new Date().toISOString(),
    new Date().toISOString(),
  ).run();
}

// ========== Work Orders ==========
// Actual schema: work_order_id, customer_id, reservation_id, product_type,
// status, due_date, delivered_date, pickup_date, priority_order,
// notes_internal, photo_data_status, nameplate_name, coloring_type,
// frame_color, mount_color, status_comments(JSON), updated_by_user_id,
// created_at, updated_at
export async function getWorkOrders(db: D1, locationId?: string) {
  // work_orders has no location_id; join through reservations if needed
  if (locationId) {
    const { results } = await db.prepare(`
      SELECT wo.* FROM work_orders wo
      LEFT JOIN reservations r ON wo.reservation_id = r.reservation_id
      WHERE r.location_id = ?
      ORDER BY wo.created_at DESC
    `).bind(locationId).all<Record<string, unknown>>();
    return results.map(parseRow);
  }
  const { results } = await db.prepare('SELECT * FROM work_orders ORDER BY created_at DESC').all<Record<string, unknown>>();
  return results.map(parseRow);
}

export async function upsertWorkOrder(db: D1, wo: Record<string, unknown>) {
  await db.prepare(`
    INSERT INTO work_orders (work_order_id, customer_id, reservation_id, product_type, status, due_date, notes_internal, status_comments, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(work_order_id) DO UPDATE SET
      customer_id = excluded.customer_id,
      reservation_id = excluded.reservation_id,
      product_type = excluded.product_type,
      status = excluded.status,
      due_date = excluded.due_date,
      notes_internal = excluded.notes_internal,
      status_comments = excluded.status_comments,
      updated_at = excluded.updated_at
  `).bind(
    wo.work_order_id, wo.customer_id ?? null,
    wo.reservation_id ?? null,
    wo.product_type ?? wo.work_required ?? null,
    wo.status ?? '乾燥中',
    wo.due_date ?? wo.work_date ?? null,
    wo.notes_internal ?? wo.memo ?? null,
    typeof wo.status_comments === 'string' ? wo.status_comments : JSON.stringify(wo.status_comments ?? {}),
    wo.created_at ?? new Date().toISOString(),
    new Date().toISOString(),
  ).run();
}

// ========== Reservation Settings ==========
// Actual schema: reservation_settings_id (e.g. 'default'), allowed_days,
// business_hours_start, business_hours_end, max_reservations_per_day, closed_dates, etc.
export async function getReservationSettings(db: D1, locationId: string) {
  let row = locationId
    ? await db.prepare('SELECT * FROM reservation_settings WHERE reservation_settings_id = ?').bind(locationId).first<Record<string, unknown>>()
    : null;
  if (!row) {
    row = await db.prepare("SELECT * FROM reservation_settings WHERE reservation_settings_id = 'default'").first<Record<string, unknown>>();
  }
  return row ? parseRow(row) : null;
}

export async function upsertReservationSettings(db: D1, s: Record<string, unknown>) {
  const id = (s.reservation_settings_id as string) || (s.location_id as string) || 'default';
  await db.prepare(`
    INSERT INTO reservation_settings (reservation_settings_id, allowed_days, business_hours_start, business_hours_end, max_reservations_per_day, closed_dates, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(reservation_settings_id) DO UPDATE SET
      allowed_days = excluded.allowed_days,
      business_hours_start = excluded.business_hours_start,
      business_hours_end = excluded.business_hours_end,
      max_reservations_per_day = excluded.max_reservations_per_day,
      closed_dates = excluded.closed_dates,
      updated_at = excluded.updated_at
  `).bind(
    id,
    typeof s.allowed_days === 'string' ? s.allowed_days : JSON.stringify(s.allowed_days ?? [1,2,3,4,5,6]),
    s.business_hours_start ?? '09:00',
    s.business_hours_end ?? '18:00',
    s.max_reservations_per_day ?? s.max_per_day ?? 10,
    typeof s.closed_dates === 'string' ? s.closed_dates : JSON.stringify(s.closed_dates ?? []),
    new Date().toISOString(),
  ).run();
}

// ========== Location Availability ==========
// Actual schema: location_id, regular_closed_days, business_hours_start,
// business_hours_end, custom_hours, closed_dates, special_dates, max_reservations_per_day
export async function getLocationAvailability(db: D1, locationId: string) {
  if (!locationId) return null;
  const row = await db.prepare('SELECT * FROM location_availability WHERE location_id = ?').bind(locationId).first<Record<string, unknown>>();
  return row ? parseRow(row) : null;
}

export async function upsertLocationAvailability(db: D1, a: Record<string, unknown>) {
  await db.prepare(`
    INSERT INTO location_availability (location_id, regular_closed_days, closed_dates, business_hours_start, business_hours_end, custom_hours, special_dates, max_reservations_per_day, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(location_id) DO UPDATE SET
      regular_closed_days = excluded.regular_closed_days,
      closed_dates = excluded.closed_dates,
      business_hours_start = excluded.business_hours_start,
      business_hours_end = excluded.business_hours_end,
      custom_hours = excluded.custom_hours,
      special_dates = excluded.special_dates,
      max_reservations_per_day = excluded.max_reservations_per_day,
      updated_at = excluded.updated_at
  `).bind(
    a.location_id,
    typeof a.regular_closed_days === 'string' ? a.regular_closed_days : JSON.stringify(a.regular_closed_days ?? []),
    typeof a.closed_dates === 'string' ? a.closed_dates : JSON.stringify(a.closed_dates ?? []),
    a.business_hours_start ?? '09:00',
    a.business_hours_end ?? '18:00',
    typeof a.custom_hours === 'string' ? a.custom_hours : JSON.stringify(a.custom_hours ?? {}),
    typeof a.special_dates === 'string' ? a.special_dates : JSON.stringify(a.special_dates ?? {}),
    a.max_reservations_per_day ?? 7,
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
