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
  if (role === 'admin') {
    const { results } = await db.prepare('SELECT * FROM locations ORDER BY location_id').all<Record<string, unknown>>();
    return results.map(parseRow);
  }
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
// Actual schema: customer_id, customer_code, external_customer_number,
// parent_name, parent_name_kana, child_name, child_name_kana,
// child_age_years, child_age_months, children(JSON),
// phone, email, line_url, postal_code, address_text, notes_internal, active_flag
// No location_id column.
export async function getCustomers(
  db: D1,
  options?: { locationId?: string; page?: number; pageSize?: number; search?: string },
) {
  const { page = 1, pageSize = 30, search } = options ?? {};
  const offset = (page - 1) * pageSize;

  let where = 'WHERE active_flag = 1';
  const binds: unknown[] = [];
  if (search) {
    const like = `%${search}%`;
    where += ` AND (parent_name LIKE ? OR parent_name_kana LIKE ? OR child_name LIKE ? OR child_name_kana LIKE ? OR customer_code LIKE ? OR external_customer_number LIKE ? OR phone LIKE ?)`;
    binds.push(like, like, like, like, like, like, like);
  }

  const countRow = await db
    .prepare(`SELECT COUNT(*) as cnt FROM customers ${where}`)
    .bind(...binds)
    .first<{ cnt: number }>();
  const total = countRow?.cnt ?? 0;

  const { results } = await db
    .prepare(`SELECT * FROM customers ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .bind(...binds, pageSize, offset)
    .all<Record<string, unknown>>();

  return {
    customers: results.map(parseRow),
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getCustomersByIds(db: D1, ids: string[]) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const { results } = await db.prepare(`SELECT * FROM customers WHERE customer_id IN (${placeholders})`).bind(...ids).all<Record<string, unknown>>();
  return results.map(parseRow);
}

export async function upsertCustomer(db: D1, c: Record<string, unknown>) {
  await db.prepare(`
    INSERT INTO customers (customer_id, customer_code, external_customer_number, parent_name, parent_name_kana, child_name, child_name_kana, child_age_years, child_age_months, children, phone, email, line_url, postal_code, address_text, notes_internal, active_flag, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(customer_id) DO UPDATE SET
      customer_code = excluded.customer_code,
      external_customer_number = excluded.external_customer_number,
      parent_name = excluded.parent_name,
      parent_name_kana = excluded.parent_name_kana,
      child_name = excluded.child_name,
      child_name_kana = excluded.child_name_kana,
      child_age_years = excluded.child_age_years,
      child_age_months = excluded.child_age_months,
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
    c.external_customer_number ?? null,
    c.parent_name ?? c.name ?? null,
    c.parent_name_kana ?? c.name_kana ?? null,
    c.child_name ?? null, c.child_name_kana ?? null,
    c.child_age_years ?? null, c.child_age_months ?? null,
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
    INSERT INTO menu_items (menu_item_id, name, description, base_price, additional_unit_price, duration_minutes, is_active, discount_type, discount_value, discount_end_date, apply_discount_to_additional, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(menu_item_id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      base_price = excluded.base_price,
      additional_unit_price = excluded.additional_unit_price,
      duration_minutes = excluded.duration_minutes,
      is_active = excluded.is_active,
      discount_type = excluded.discount_type,
      discount_value = excluded.discount_value,
      discount_end_date = excluded.discount_end_date,
      apply_discount_to_additional = excluded.apply_discount_to_additional,
      updated_at = excluded.updated_at
  `).bind(
    item.menu_item_id, item.name, item.description ?? null,
    item.base_price ?? item.price_yen ?? 0,
    item.additional_unit_price ?? 0,
    item.duration_minutes ?? item.duration_min ?? 60,
    boolVal(item.is_active ?? item.active_flag ?? true),
    item.discount_type ?? 'none',
    item.discount_value ?? null,
    item.discount_end_date ?? null,
    boolVal(item.apply_discount_to_additional ?? false),
    item.created_at ?? new Date().toISOString(),
    new Date().toISOString(),
  ).run();
}

export async function deleteMenuItem(db: D1, menuItemId: string) {
  await db.prepare('DELETE FROM location_menus WHERE menu_item_id = ?').bind(menuItemId).run();
  await db.prepare('DELETE FROM menu_items WHERE menu_item_id = ?').bind(menuItemId).run();
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

export async function getMenuItemLocationSettings(db: D1, menuItemId: string) {
  const { results: locations } = await db.prepare('SELECT location_id FROM locations').all<{ location_id: string }>();
  const { results: lm } = await db.prepare(
    'SELECT location_id, enabled FROM location_menus WHERE menu_item_id = ?'
  ).bind(menuItemId).all<{ location_id: string; enabled: number }>();

  const enabledMap = new Map(lm.map(r => [r.location_id, r.enabled !== 0]));
  const settings: Record<string, boolean> = {};
  for (const loc of locations) {
    // Default: enabled (true) unless explicitly disabled
    settings[loc.location_id] = enabledMap.has(loc.location_id) ? enabledMap.get(loc.location_id)! : true;
  }
  return settings;
}

export async function toggleLocationMenu(db: D1, locationId: string, menuItemId: string, enabled: boolean) {
  const now = new Date().toISOString();
  await db.prepare(`
    INSERT INTO location_menus (location_id, menu_item_id, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(location_id, menu_item_id) DO UPDATE SET
      enabled = excluded.enabled,
      updated_at = excluded.updated_at
  `).bind(locationId, menuItemId, boolVal(enabled), now, now).run();
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

export async function getReservationsByCustomerIds(db: D1, customerIds: string[]) {
  if (!customerIds.length) return [];
  const placeholders = customerIds.map(() => '?').join(',');
  const { results } = await db.prepare(
    `SELECT * FROM reservations WHERE customer_id IN (${placeholders}) ORDER BY reservation_date_time DESC`
  ).bind(...customerIds).all<Record<string, unknown>>();
  return results.map(parseRow);
}

export async function getReservationsByDateRange(db: D1, startDate: string, endDate: string, locationId?: string) {
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

export async function getWorkOrdersByReservationIds(db: D1, reservationIds: string[]) {
  if (!reservationIds.length) return [];
  const placeholders = reservationIds.map(() => '?').join(',');
  const { results } = await db.prepare(
    `SELECT * FROM work_orders WHERE reservation_id IN (${placeholders}) ORDER BY created_at DESC`
  ).bind(...reservationIds).all<Record<string, unknown>>();
  return results.map(parseRow);
}

export async function upsertWorkOrder(db: D1, wo: Record<string, unknown>) {
  await db.prepare(`
    INSERT INTO work_orders (work_order_id, customer_id, reservation_id, product_type, status, due_date, delivered_date, pickup_date, priority_order, notes_internal, photo_data_status, nameplate_name, coloring_type, frame_color, mount_color, status_comments, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(work_order_id) DO UPDATE SET
      customer_id = excluded.customer_id,
      reservation_id = excluded.reservation_id,
      product_type = excluded.product_type,
      status = excluded.status,
      due_date = excluded.due_date,
      delivered_date = excluded.delivered_date,
      pickup_date = excluded.pickup_date,
      priority_order = excluded.priority_order,
      notes_internal = excluded.notes_internal,
      photo_data_status = excluded.photo_data_status,
      nameplate_name = excluded.nameplate_name,
      coloring_type = excluded.coloring_type,
      frame_color = excluded.frame_color,
      mount_color = excluded.mount_color,
      status_comments = excluded.status_comments,
      updated_at = excluded.updated_at
  `).bind(
    wo.work_order_id, wo.customer_id ?? null,
    wo.reservation_id ?? null,
    wo.product_type ?? wo.work_required ?? null,
    wo.status ?? '乾燥中',
    wo.due_date ?? wo.work_date ?? null,
    wo.delivered_date ?? null,
    wo.pickup_date ?? null,
    wo.priority_order ?? null,
    wo.notes_internal ?? wo.memo ?? null,
    wo.photo_data_status ?? 'not_set',
    wo.nameplate_name ?? null,
    wo.coloring_type ?? null,
    wo.frame_color ?? null,
    wo.mount_color ?? null,
    typeof wo.status_comments === 'string' ? wo.status_comments : JSON.stringify(wo.status_comments ?? {}),
    wo.created_at ?? new Date().toISOString(),
    new Date().toISOString(),
  ).run();
}

// ========== Reservation Settings ==========
// Actual schema: reservation_settings_id, allowed_days, business_hours_start,
// business_hours_end, advance_reservation_days, max_reservation_days,
// max_reservations_per_day, concurrent_reservations, closed_dates, custom_hours, updated_at
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
    INSERT INTO reservation_settings (reservation_settings_id, allowed_days, business_hours_start, business_hours_end, advance_reservation_days, max_reservation_days, max_reservations_per_day, concurrent_reservations, closed_dates, custom_hours, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(reservation_settings_id) DO UPDATE SET
      allowed_days = excluded.allowed_days,
      business_hours_start = excluded.business_hours_start,
      business_hours_end = excluded.business_hours_end,
      advance_reservation_days = excluded.advance_reservation_days,
      max_reservation_days = excluded.max_reservation_days,
      max_reservations_per_day = excluded.max_reservations_per_day,
      concurrent_reservations = excluded.concurrent_reservations,
      closed_dates = excluded.closed_dates,
      custom_hours = excluded.custom_hours,
      updated_at = excluded.updated_at
  `).bind(
    id,
    typeof s.allowed_days === 'string' ? s.allowed_days : JSON.stringify(s.allowed_days ?? [1,2,3,4,5,6]),
    s.business_hours_start ?? '09:00',
    s.business_hours_end ?? '18:00',
    s.advance_reservation_days ?? 3,
    s.max_reservation_days ?? 90,
    s.max_reservations_per_day ?? s.max_per_day ?? 10,
    s.concurrent_reservations ?? 1,
    typeof s.closed_dates === 'string' ? s.closed_dates : JSON.stringify(s.closed_dates ?? []),
    typeof s.custom_hours === 'string' ? s.custom_hours : JSON.stringify(s.custom_hours ?? {}),
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

// ========== Shifts ==========
// Schema: staff_id (PK), date (PK), shift_type, start_time, end_time, notes, updated_at, updated_by
export async function getShifts(db: D1, yearMonth: string) {
  const { results } = await db.prepare(
    "SELECT * FROM shifts WHERE strftime('%Y-%m', date) = ? ORDER BY date, staff_id"
  ).bind(yearMonth).all<Record<string, unknown>>();
  return results.map(parseRow);
}

export async function upsertShift(db: D1, s: Record<string, unknown>) {
  await db.prepare(`
    INSERT INTO shifts (staff_id, date, shift_type, start_time, end_time, notes, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(staff_id, date) DO UPDATE SET
      shift_type = excluded.shift_type,
      start_time = excluded.start_time,
      end_time = excluded.end_time,
      notes = excluded.notes,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by
  `).bind(
    s.staff_id, s.date, s.shift_type ?? 'work',
    s.start_time ?? null, s.end_time ?? null,
    s.notes ?? null,
    new Date().toISOString(),
    s.updated_by ?? null,
  ).run();
}

export async function deleteShift(db: D1, staffId: string, date: string) {
  await db.prepare('DELETE FROM shifts WHERE staff_id = ? AND date = ?').bind(staffId, date).run();
}

// ========== Incentive Monthly ==========
// Actual schema: user_id (PK), year_month (PK), manual_adjust_yen, locked_flag, locked_at, adjusted_by_user_id, updated_at
export async function getIncentiveMonthly(db: D1, yearMonth: string) {
  const { results } = await db.prepare(
    'SELECT * FROM incentive_monthly WHERE year_month = ?'
  ).bind(yearMonth).all<Record<string, unknown>>();
  return results.map(parseRow);
}

export async function upsertIncentiveMonthly(db: D1, row: Record<string, unknown>) {
  await db.prepare(`
    INSERT INTO incentive_monthly (user_id, year_month, manual_adjust_yen, locked_flag, locked_at, adjusted_by_user_id, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, year_month) DO UPDATE SET
      manual_adjust_yen = excluded.manual_adjust_yen,
      locked_flag = excluded.locked_flag,
      locked_at = excluded.locked_at,
      adjusted_by_user_id = excluded.adjusted_by_user_id,
      updated_at = excluded.updated_at
  `).bind(
    row.user_id, row.year_month,
    row.manual_adjust_yen ?? 0,
    boolVal(row.locked_flag),
    row.locked_at ?? null,
    row.adjusted_by_user_id ?? null,
    new Date().toISOString(),
  ).run();
}

// ========== Incentives (calculated from reservations) ==========
export async function getIncentives(db: D1, yearMonth: string, userId?: string) {
  let sql = `
    SELECT
      r.staff_id_main as user_id,
      COUNT(CASE WHEN r.status = 'tentative' THEN 1 END) as count_pending,
      COALESCE(SUM(CASE WHEN r.status = 'tentative' THEN COALESCE(m.base_price, 0) ELSE 0 END), 0) as amount_pending,
      COUNT(CASE WHEN r.status = 'confirmed' THEN 1 END) as count_confirmed,
      COALESCE(SUM(CASE WHEN r.status = 'confirmed' THEN COALESCE(m.base_price, 0) ELSE 0 END), 0) as amount_confirmed
    FROM reservations r
    LEFT JOIN menu_items m ON r.menu_item_id = m.menu_item_id
    WHERE strftime('%Y-%m', r.reservation_date_time) = ?
      AND r.staff_id_main IS NOT NULL
  `;
  const binds: unknown[] = [yearMonth];
  if (userId) {
    sql += ' AND r.staff_id_main = ?';
    binds.push(userId);
  }
  sql += ' GROUP BY r.staff_id_main';

  const { results } = await db.prepare(sql).bind(...binds).all<Record<string, unknown>>();

  // Get manual adjustments and lock status from incentive_monthly
  const monthly = await getIncentiveMonthly(db, yearMonth);
  const monthlyMap = new Map(monthly.map((m: any) => [m.user_id as string, m]));

  return results.map(row => {
    const monthlyData = monthlyMap.get(row.user_id as string) || {} as any;
    return {
      user_id: row.user_id,
      count_pending: row.count_pending,
      amount_pending: row.amount_pending,
      count_confirmed: row.count_confirmed,
      amount_confirmed: row.amount_confirmed,
      manual_adjust_yen: (monthlyData as any).manual_adjust_yen ?? 0,
      locked_flag: Boolean((monthlyData as any).locked_flag),
    };
  });
}

export async function getIncentivesYearly(db: D1, year: string, userId?: string) {
  let sql = `
    SELECT
      strftime('%Y-%m', r.reservation_date_time) as month,
      r.staff_id_main as user_id,
      COUNT(CASE WHEN r.status = 'confirmed' THEN 1 END) as count_confirmed,
      COALESCE(SUM(CASE WHEN r.status = 'confirmed' THEN COALESCE(m.base_price, 0) ELSE 0 END), 0) as amount_confirmed,
      COUNT(CASE WHEN r.status = 'tentative' THEN 1 END) as count_pending,
      COALESCE(SUM(CASE WHEN r.status = 'tentative' THEN COALESCE(m.base_price, 0) ELSE 0 END), 0) as amount_pending
    FROM reservations r
    LEFT JOIN menu_items m ON r.menu_item_id = m.menu_item_id
    WHERE strftime('%Y', r.reservation_date_time) = ?
      AND r.staff_id_main IS NOT NULL
  `;
  const binds: unknown[] = [year];
  if (userId) {
    sql += ' AND r.staff_id_main = ?';
    binds.push(userId);
  }
  sql += " GROUP BY strftime('%Y-%m', r.reservation_date_time), r.staff_id_main";

  const { results } = await db.prepare(sql).bind(...binds).all<Record<string, unknown>>();

  // Get yearly manual adjustments
  const { results: monthly } = await db.prepare(
    "SELECT * FROM incentive_monthly WHERE year_month LIKE ?"
  ).bind(`${year}-%`).all<Record<string, unknown>>();

  const totalIncentives = results.reduce((sum, r) => sum + ((r.amount_confirmed as number) || 0), 0);
  const totalConfirmedCount = results.reduce((sum, r) => sum + ((r.count_confirmed as number) || 0), 0);
  const totalPendingCount = results.reduce((sum, r) => sum + ((r.count_pending as number) || 0), 0);

  // Monthly totals (across all staff)
  const monthlyTotals: Record<string, { month: string; revenue: number; count: number }> = {};
  for (const r of results) {
    const m = r.month as string;
    if (!monthlyTotals[m]) monthlyTotals[m] = { month: m, revenue: 0, count: 0 };
    monthlyTotals[m].revenue += (r.amount_confirmed as number) || 0;
    monthlyTotals[m].count += (r.count_confirmed as number) || 0;
  }

  // Staff yearly totals
  const staffTotals: Record<string, { user_id: string; total: number; count: number; pendingCount: number; adjustTotal: number }> = {};
  for (const r of results) {
    const uid = r.user_id as string;
    if (!staffTotals[uid]) staffTotals[uid] = { user_id: uid, total: 0, count: 0, pendingCount: 0, adjustTotal: 0 };
    staffTotals[uid].total += (r.amount_confirmed as number) || 0;
    staffTotals[uid].count += (r.count_confirmed as number) || 0;
    staffTotals[uid].pendingCount += (r.count_pending as number) || 0;
  }
  // Add manual adjustments
  for (const m of monthly) {
    const uid = m.user_id as string;
    if (staffTotals[uid]) {
      staffTotals[uid].adjustTotal += (m.manual_adjust_yen as number) || 0;
    }
  }

  return {
    totalIncentives,
    totalConfirmedCount,
    totalPendingCount,
    averageIncentive: totalConfirmedCount > 0 ? totalIncentives / totalConfirmedCount : 0,
    monthlyData: Object.values(monthlyTotals).sort((a, b) => a.month.localeCompare(b.month)),
    staffYearlyData: Object.values(staffTotals),
  };
}

export async function getIncentivesRange(db: D1, start: string, end: string, userId?: string) {
  // start and end are YYYY-MM format
  let sql = `
    SELECT
      r.staff_id_main as user_id,
      COUNT(CASE WHEN r.status = 'tentative' THEN 1 END) as count_pending,
      COALESCE(SUM(CASE WHEN r.status = 'tentative' THEN COALESCE(m.base_price, 0) ELSE 0 END), 0) as amount_pending,
      COUNT(CASE WHEN r.status = 'confirmed' THEN 1 END) as count_confirmed,
      COALESCE(SUM(CASE WHEN r.status = 'confirmed' THEN COALESCE(m.base_price, 0) ELSE 0 END), 0) as amount_confirmed
    FROM reservations r
    LEFT JOIN menu_items m ON r.menu_item_id = m.menu_item_id
    WHERE strftime('%Y-%m', r.reservation_date_time) >= ?
      AND strftime('%Y-%m', r.reservation_date_time) <= ?
      AND r.staff_id_main IS NOT NULL
  `;
  const binds: unknown[] = [start, end];
  if (userId) {
    sql += ' AND r.staff_id_main = ?';
    binds.push(userId);
  }
  sql += ' GROUP BY r.staff_id_main';

  const { results } = await db.prepare(sql).bind(...binds).all<Record<string, unknown>>();

  // Get manual adjustments for the range
  const { results: monthly } = await db.prepare(
    'SELECT * FROM incentive_monthly WHERE year_month >= ? AND year_month <= ?'
  ).bind(start, end).all<Record<string, unknown>>();
  const monthlyMap = new Map<string, number>();
  const lockMap = new Map<string, boolean>();
  for (const m of monthly) {
    const uid = m.user_id as string;
    monthlyMap.set(uid, (monthlyMap.get(uid) || 0) + ((m.manual_adjust_yen as number) || 0));
    if (m.locked_flag) lockMap.set(uid, true);
  }

  return results.map(row => ({
    user_id: row.user_id,
    count_pending: row.count_pending,
    amount_pending: row.amount_pending,
    count_confirmed: row.count_confirmed,
    amount_confirmed: row.amount_confirmed,
    manual_adjust_yen: monthlyMap.get(row.user_id as string) ?? 0,
    locked_flag: lockMap.get(row.user_id as string) ?? false,
  }));
}

// ========== Sales Analytics ==========
export async function getSalesAnalytics(db: D1, startDate: string, endDate: string) {
  const { results: reservations } = await db.prepare(`
    SELECT r.reservation_id, r.status, r.reservation_date_time, r.additional_units,
           r.customer_id, r.menu_item_id,
           m.base_price, m.additional_unit_price,
           c.child_age_years, c.child_age_months
    FROM reservations r
    LEFT JOIN menu_items m ON r.menu_item_id = m.menu_item_id
    LEFT JOIN customers c ON r.customer_id = c.customer_id
    WHERE date(r.reservation_date_time) >= ? AND date(r.reservation_date_time) <= ?
    ORDER BY r.reservation_date_time
  `).bind(startDate, endDate).all<Record<string, unknown>>();

  let totalRevenue = 0;
  let confirmedRevenue = 0;
  let pendingRevenue = 0;
  let cancelledCount = 0;
  let rescheduledCount = 0;
  let totalAdditionalUnits = 0;
  let additionalUnitsCount = 0;
  let activeCount = 0;

  const dailyMap: Record<string, { date: string; revenue: number; count: number }> = {};
  const ageGroupMap: Record<string, { ageGroup: string; revenue: number; count: number; additionalCount: number; totalAdditionalUnits: number }> = {};
  const zeroAgeMonthsMap: Record<number, { months: number; label: string; revenue: number; count: number }> = {};

  for (const r of reservations) {
    if (r.status === 'cancelled') { cancelledCount++; continue; }
    if (r.status === 'rescheduled') { rescheduledCount++; continue; }

    const basePrice = (r.base_price as number) || 0;
    const additionalUnits = Math.max(0, ((r.additional_units as number) || 1) - 1);
    const addPrice = (r.additional_unit_price as number) || basePrice;
    const revenue = basePrice + additionalUnits * addPrice;

    totalRevenue += revenue;
    activeCount++;

    if (r.status === 'confirmed') {
      confirmedRevenue += revenue;
    } else {
      pendingRevenue += revenue;
    }

    // Daily sales
    const date = (r.reservation_date_time as string).split('T')[0];
    if (!dailyMap[date]) dailyMap[date] = { date, revenue: 0, count: 0 };
    dailyMap[date].revenue += revenue;
    dailyMap[date].count++;

    // Additional units stats
    if (additionalUnits > 0) {
      totalAdditionalUnits += additionalUnits;
      additionalUnitsCount++;
    }

    // Age group
    const years = r.child_age_years as number | null;
    const months = r.child_age_months as number | null;
    let ageGroup = '不明';
    if (years !== null && years !== undefined) {
      if (years === 0) ageGroup = '0歳';
      else if (years === 1) ageGroup = '1歳';
      else if (years === 2) ageGroup = '2歳';
      else if (years === 3) ageGroup = '3歳';
      else ageGroup = '4歳以上';
    }

    if (!ageGroupMap[ageGroup]) {
      ageGroupMap[ageGroup] = { ageGroup, revenue: 0, count: 0, additionalCount: 0, totalAdditionalUnits: 0 };
    }
    ageGroupMap[ageGroup].revenue += revenue;
    ageGroupMap[ageGroup].count++;
    if (additionalUnits > 0) {
      ageGroupMap[ageGroup].additionalCount++;
      ageGroupMap[ageGroup].totalAdditionalUnits += additionalUnits;
    }

    // Zero age months breakdown
    if (years === 0 && months !== null && months !== undefined) {
      if (!zeroAgeMonthsMap[months]) {
        zeroAgeMonthsMap[months] = { months, label: `${months}ヶ月`, revenue: 0, count: 0 };
      }
      zeroAgeMonthsMap[months].revenue += revenue;
      zeroAgeMonthsMap[months].count++;
    }
  }

  const confirmedCount = reservations.filter((r: any) => r.status === 'confirmed').length;

  return {
    totalRevenue,
    totalReservations: reservations.length,
    averageOrderValue: confirmedCount > 0 ? confirmedRevenue / confirmedCount : 0,
    confirmedRevenue,
    pendingRevenue,
    cancelledCount,
    rescheduledCount,
    dailySales: Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date)),
    additionalUnitsStats: {
      totalUnits: totalAdditionalUnits,
      reservationsCount: additionalUnitsCount,
      averagePerReservation: activeCount > 0 ? totalAdditionalUnits / activeCount : 0,
    },
    ageGroupSales: Object.values(ageGroupMap).sort((a, b) => a.ageGroup.localeCompare(b.ageGroup)),
    zeroAgeMonthsData: Object.values(zeroAgeMonthsMap).sort((a, b) => a.months - b.months),
  };
}

// ========== Dashboard ==========
export async function getDashboardData(db: D1) {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  const [
    topWOResult,
    todayResResult,
    tentativeResResult,
    customerCountRow,
    activeWOCountRow,
    upcomingResCountRow,
    overdueWOCountRow,
  ] = await Promise.all([
    // Top 5 work orders (not completed), ordered by priority then due_date
    db.prepare(`
      SELECT wo.*, c.parent_name, c.child_name, c.external_customer_number
      FROM work_orders wo
      LEFT JOIN customers c ON wo.customer_id = c.customer_id
      WHERE wo.status NOT IN ('完成', '受け取り済み', '引渡し済')
      ORDER BY COALESCE(wo.priority_order, 999999) ASC, wo.due_date ASC
      LIMIT 5
    `).all<Record<string, unknown>>(),

    // Today's reservations
    db.prepare(`
      SELECT r.*, c.parent_name, c.child_name, c.external_customer_number
      FROM reservations r
      LEFT JOIN customers c ON r.customer_id = c.customer_id
      WHERE date(r.reservation_date_time) = ?
      ORDER BY r.reservation_date_time
    `).bind(todayStr).all<Record<string, unknown>>(),

    // Tentative (standby) reservations - upcoming only
    db.prepare(`
      SELECT r.*, c.parent_name, c.child_name, c.external_customer_number
      FROM reservations r
      LEFT JOIN customers c ON r.customer_id = c.customer_id
      WHERE r.status = 'tentative'
      ORDER BY r.reservation_date_time
    `).all<Record<string, unknown>>(),

    db.prepare('SELECT COUNT(*) as cnt FROM customers WHERE active_flag = 1').first<{ cnt: number }>(),
    db.prepare("SELECT COUNT(*) as cnt FROM work_orders WHERE status NOT IN ('完成', '受け取り済み', '引渡し済')").first<{ cnt: number }>(),
    db.prepare("SELECT COUNT(*) as cnt FROM reservations WHERE date(reservation_date_time) >= ? AND status != 'cancelled'").bind(todayStr).first<{ cnt: number }>(),
    db.prepare("SELECT COUNT(*) as cnt FROM work_orders WHERE due_date < ? AND status NOT IN ('完成', '受け取り済み', '引渡し済')").bind(todayStr).first<{ cnt: number }>(),
  ]);

  // Parse rows embedding customer as sub-object
  const embedCustomer = (row: Record<string, unknown>) => {
    const { parent_name, child_name, external_customer_number, ...rest } = row;
    return {
      ...parseRow(rest),
      customer: { parent_name, child_name, external_customer_number },
    };
  };

  return {
    top_work_orders: topWOResult.results.map(embedCustomer),
    today_reservations: todayResResult.results.map(embedCustomer),
    tentative_reservations: tentativeResResult.results.map(embedCustomer),
    stats: {
      total_customers: customerCountRow?.cnt ?? 0,
      active_work_orders: activeWOCountRow?.cnt ?? 0,
      upcoming_reservations: upcomingResCountRow?.cnt ?? 0,
    },
    overdue_work_orders: overdueWOCountRow?.cnt ?? 0,
  };
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
