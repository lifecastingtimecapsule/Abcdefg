/**
 * リレーショナルテーブル用データアクセス層（KV の代替）
 * マイグレーション適用後に index.tsx からこちらを参照する
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

function getClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

// ========== Users (app_users) ==========
export async function getAppUser(userId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await getClient()
    .from('app_users')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Record<string, unknown> | null;
}

export async function getAppUsers(): Promise<Record<string, unknown>[]> {
  const { data, error } = await getClient().from('app_users').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Record<string, unknown>[];
}

export async function getAppUserByLoginId(loginId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await getClient()
    .from('app_users')
    .select('*')
    .eq('login_id', loginId)
    .eq('active_flag', true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Record<string, unknown> | null;
}

export async function upsertAppUser(row: Record<string, unknown>): Promise<void> {
  const { error } = await getClient().from('app_users').upsert({
    user_id: row.user_id,
    name: row.name,
    email: row.email,
    login_id: row.login_id,
    role: row.role ?? 'staff',
    active_flag: row.active_flag !== false,
    last_login_at: row.last_login_at ?? null,
    password_hash: row.password_hash ?? null,
    must_change_password: row.must_change_password ?? false,
    created_at: row.created_at ?? new Date().toISOString(),
    updated_at: row.updated_at ?? new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (error) throw new Error(error.message);
}

// ========== Locations ==========
export async function getLocation(locationId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await getClient()
    .from('locations')
    .select('*')
    .eq('location_id', locationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Record<string, unknown> | null;
}

export async function getLocations(): Promise<Record<string, unknown>[]> {
  const { data, error } = await getClient().from('locations').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Record<string, unknown>[];
}

export async function upsertLocation(row: Record<string, unknown>): Promise<void> {
  const { error } = await getClient().from('locations').upsert({
    location_id: row.location_id,
    location_name: row.location_name,
    address_text: row.address_text ?? '',
    phone: row.phone ?? '',
    active_flag: row.active_flag !== false,
    created_at: row.created_at ?? new Date().toISOString(),
    updated_at: row.updated_at ?? new Date().toISOString(),
  }, { onConflict: 'location_id' });
  if (error) throw new Error(error.message);
}

// ========== Customers ==========
export async function getCustomer(customerId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await getClient()
    .from('customers')
    .select('*')
    .eq('customer_id', customerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Record<string, unknown> | null;
}

export async function getCustomers(filters?: { activeOnly?: boolean }): Promise<Record<string, unknown>[]> {
  let q = getClient().from('customers').select('*').order('created_at', { ascending: false });
  if (filters?.activeOnly !== false) {
    q = q.eq('active_flag', true);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Record<string, unknown>[];
}

/** 次の顧客コード用の最大番号取得（A-1001 形式） */
export async function getMaxCustomerCodeNumber(): Promise<number> {
  const { data, error } = await getClient()
    .from('customers')
    .select('customer_code');
  if (error) throw new Error(error.message);
  const codes = (data ?? []) as { customer_code?: string }[];
  const max = codes.reduce((m, c) => {
    const match = c.customer_code?.match(/A-(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      return num > m ? num : m;
    }
    return m;
  }, 1000);
  return max;
}

export async function upsertCustomer(row: Record<string, unknown>): Promise<void> {
  const { error } = await getClient().from('customers').upsert({
    customer_id: row.customer_id,
    customer_code: row.customer_code,
    external_customer_number: row.external_customer_number ?? null,
    parent_name: row.parent_name ?? null,
    parent_name_kana: row.parent_name_kana ?? null,
    child_name: row.child_name ?? null,
    child_name_kana: row.child_name_kana ?? null,
    child_age_years: row.child_age_years ?? null,
    child_age_months: row.child_age_months ?? null,
    children: row.children ?? [],
    phone: row.phone ?? null,
    email: row.email ?? null,
    line_url: row.line_url ?? null,
    postal_code: row.postal_code ?? null,
    address_text: row.address_text ?? null,
    notes_internal: row.notes_internal ?? null,
    active_flag: row.active_flag !== false,
    created_at: row.created_at ?? new Date().toISOString(),
    updated_at: row.updated_at ?? new Date().toISOString(),
  }, { onConflict: 'customer_id' });
  if (error) throw new Error(error.message);
}

export async function deleteCustomer(customerId: string): Promise<void> {
  const { error } = await getClient().from('customers').delete().eq('customer_id', customerId);
  if (error) throw new Error(error.message);
}

// ========== Menu Items ==========
export async function getMenuItem(menuItemId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await getClient()
    .from('menu_items')
    .select('*')
    .eq('menu_item_id', menuItemId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Record<string, unknown> | null;
}

export async function getMenuItems(): Promise<Record<string, unknown>[]> {
  const { data, error } = await getClient().from('menu_items').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Record<string, unknown>[];
}

export async function upsertMenuItem(row: Record<string, unknown>): Promise<void> {
  const { error } = await getClient().from('menu_items').upsert({
    menu_item_id: row.menu_item_id,
    name: row.name,
    base_price: row.base_price ?? 0,
    additional_unit_price: row.additional_unit_price ?? 0,
    description: row.description ?? '',
    duration_minutes: row.duration_minutes ?? 60,
    is_active: row.is_active !== false,
    discount_type: row.discount_type ?? 'none',
    discount_value: row.discount_value ?? null,
    discount_end_date: row.discount_end_date ?? null,
    apply_discount_to_additional: row.apply_discount_to_additional === true,
    created_at: row.created_at ?? new Date().toISOString(),
    updated_at: row.updated_at ?? new Date().toISOString(),
  }, { onConflict: 'menu_item_id' });
  if (error) throw new Error(error.message);
}

export async function deleteMenuItem(menuItemId: string): Promise<void> {
  const { error } = await getClient().from('menu_items').delete().eq('menu_item_id', menuItemId);
  if (error) throw new Error(error.message);
}

// ========== Location Menus ==========
export async function getLocationMenus(locationId: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await getClient()
    .from('location_menus')
    .select('*')
    .eq('location_id', locationId);
  if (error) throw new Error(error.message);
  return (data ?? []) as Record<string, unknown>[];
}

export async function upsertLocationMenu(row: Record<string, unknown>): Promise<void> {
  const { error } = await getClient().from('location_menus').upsert({
    location_id: row.location_id,
    menu_item_id: row.menu_item_id,
    enabled: row.enabled !== false,
    created_at: row.created_at ?? new Date().toISOString(),
    updated_at: row.updated_at ?? new Date().toISOString(),
  }, { onConflict: 'location_id,menu_item_id' });
  if (error) throw new Error(error.message);
}

export async function getLocationMenu(locationId: string, menuItemId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await getClient()
    .from('location_menus')
    .select('*')
    .eq('location_id', locationId)
    .eq('menu_item_id', menuItemId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Record<string, unknown> | null;
}

export async function getLocationMenusByMenuItemId(menuItemId: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await getClient()
    .from('location_menus')
    .select('*')
    .eq('menu_item_id', menuItemId);
  if (error) throw new Error(error.message);
  return (data ?? []) as Record<string, unknown>[];
}

// ========== Reservations ==========
export async function getReservation(reservationId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await getClient()
    .from('reservations')
    .select('*')
    .eq('reservation_id', reservationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Record<string, unknown> | null;
}

export async function getReservations(): Promise<Record<string, unknown>[]> {
  const { data, error } = await getClient().from('reservations').select('*').order('reservation_date_time', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Record<string, unknown>[];
}

/** 月別・範囲指定で予約を取得（全件取得を避けDB負荷削減） */
export async function getReservationsByDateRange(startDate: Date, endDate: Date): Promise<Record<string, unknown>[]> {
  const { data, error } = await getClient()
    .from('reservations')
    .select('*')
    .gte('reservation_date_time', startDate.toISOString())
    .lte('reservation_date_time', endDate.toISOString())
    .order('reservation_date_time', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Record<string, unknown>[];
}

/** 指定IDの顧客をまとめて取得（カレンダー表示用。非アクティブ含む） */
export async function getCustomersByIds(customerIds: string[]): Promise<Record<string, unknown>[]> {
  if (customerIds.length === 0) return [];
  const uniqueIds = [...new Set(customerIds.filter(Boolean))];
  const { data, error } = await getClient()
    .from('customers')
    .select('customer_id, child_name, parent_name, external_customer_number, active_flag')
    .in('customer_id', uniqueIds);
  if (error) throw new Error(error.message);
  return (data ?? []) as Record<string, unknown>[];
}

/** 日付で絞り込み（公開API用） */
export async function getReservationsByDate(dateStr: string, locationId?: string): Promise<Record<string, unknown>[]> {
  const targetDate = new Date(dateStr);
  const start = new Date(targetDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(targetDate);
  end.setHours(23, 59, 59, 999);
  let q = getClient()
    .from('reservations')
    .select('*')
    .gte('reservation_date_time', start.toISOString())
    .lte('reservation_date_time', end.toISOString())
    .neq('status', 'cancelled');
  if (locationId) q = q.eq('location_id', locationId);
  const { data, error } = await q.order('reservation_date_time', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Record<string, unknown>[];
}

export async function getReservationNumbers(): Promise<string[]> {
  const { data, error } = await getClient().from('reservations').select('reservation_number').not('reservation_number', 'is', null);
  if (error) throw new Error(error.message);
  return ((data ?? []) as { reservation_number: string }[]).map((r) => r.reservation_number);
}

export async function upsertReservation(row: Record<string, unknown>): Promise<void> {
  const { error } = await getClient().from('reservations').upsert({
    reservation_id: row.reservation_id,
    reservation_number: row.reservation_number,
    reservation_date_time: row.reservation_date_time,
    duration_minutes: row.duration_minutes ?? 30,
    location_id: row.location_id ?? null,
    customer_id: row.customer_id ?? null,
    staff_id_main: row.staff_id_main ?? null,
    status: row.status ?? 'tentative',
    payment_status: row.payment_status ?? 'unpaid',
    payment_method: row.payment_method ?? null,
    work_required: row.work_required ?? null,
    notes_staff: row.notes_staff ?? null,
    menu_item_id: row.menu_item_id ?? null,
    additional_units: row.additional_units ?? 0,
    photo_required: row.photo_required ?? 'not_set',
    created_at: row.created_at ?? new Date().toISOString(),
    updated_at: row.updated_at ?? new Date().toISOString(),
    updated_by_user_id: row.updated_by_user_id ?? null,
  }, { onConflict: 'reservation_id' });
  if (error) throw new Error(error.message);
}

export async function deleteReservation(reservationId: string): Promise<void> {
  const { error } = await getClient().from('reservations').delete().eq('reservation_id', reservationId);
  if (error) throw new Error(error.message);
}

// ========== Work Orders ==========
export async function getWorkOrder(workOrderId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await getClient()
    .from('work_orders')
    .select('*')
    .eq('work_order_id', workOrderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Record<string, unknown> | null;
}

export async function getWorkOrders(): Promise<Record<string, unknown>[]> {
  const { data, error } = await getClient().from('work_orders').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Record<string, unknown>[];
}

/** 指定予約IDの制作物だけ取得（ensure チェック用: reservation_id のみ返す） */
export async function getWorkOrdersByReservationIds(
  reservationIds: string[],
): Promise<{ work_order_id: string; reservation_id: string }[]> {
  if (reservationIds.length === 0) return [];
  const { data, error } = await getClient()
    .from('work_orders')
    .select('work_order_id, reservation_id')
    .in('reservation_id', reservationIds);
  if (error) throw new Error(error.message);
  return (data ?? []) as { work_order_id: string; reservation_id: string }[];
}

/** 指定顧客IDの予約を全件取得（顧客ページ用） */
export async function getReservationsByCustomerIds(
  customerIds: string[],
): Promise<Record<string, unknown>[]> {
  if (customerIds.length === 0) return [];
  const { data, error } = await getClient()
    .from('reservations')
    .select('*')
    .in('customer_id', customerIds)
    .order('reservation_date_time', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Record<string, unknown>[];
}

/** 指定予約IDの制作物を全件取得（顧客ページ用） */
export async function getWorkOrdersByReservationIdsAll(
  reservationIds: string[],
): Promise<Record<string, unknown>[]> {
  if (reservationIds.length === 0) return [];
  const { data, error } = await getClient()
    .from('work_orders')
    .select('*')
    .in('reservation_id', reservationIds);
  if (error) throw new Error(error.message);
  return (data ?? []) as Record<string, unknown>[];
}

export async function upsertWorkOrder(row: Record<string, unknown>): Promise<void> {
  const { error } = await getClient().from('work_orders').upsert({
    work_order_id: row.work_order_id,
    customer_id: row.customer_id ?? null,
    reservation_id: row.reservation_id ?? null,
    product_type: row.product_type,
    status: row.status ?? '乾燥中',
    due_date: row.due_date ?? null,
    delivered_date: row.delivered_date ?? null,
    pickup_date: row.pickup_date ?? null,
    priority_order: row.priority_order ?? null,
    notes_internal: row.notes_internal ?? null,
    photo_data_status: row.photo_data_status ?? 'not_set',
    nameplate_name: row.nameplate_name ?? null,
    coloring_type: row.coloring_type ?? null,
    frame_color: row.frame_color ?? null,
    mount_color: row.mount_color ?? null,
    status_comments: row.status_comments ?? {},
    created_at: row.created_at ?? new Date().toISOString(),
    updated_at: row.updated_at ?? new Date().toISOString(),
    updated_by_user_id: row.updated_by_user_id ?? null,
  }, { onConflict: 'work_order_id' });
  if (error) throw new Error(error.message);
}

export async function deleteWorkOrder(workOrderId: string): Promise<void> {
  const { error } = await getClient().from('work_orders').delete().eq('work_order_id', workOrderId);
  if (error) throw new Error(error.message);
}

// ========== Reservation Settings ==========
export async function getReservationSettings(): Promise<Record<string, unknown> | null> {
  const { data, error } = await getClient()
    .from('reservation_settings')
    .select('*')
    .eq('reservation_settings_id', 'default')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Record<string, unknown> | null;
}

export async function upsertReservationSettings(row: Record<string, unknown>): Promise<void> {
  const { error } = await getClient().from('reservation_settings').upsert({
    reservation_settings_id: row.reservation_settings_id ?? 'default',
    allowed_days: row.allowed_days ?? [1, 2, 3, 4, 5, 6],
    business_hours_start: row.business_hours_start ?? '09:00',
    business_hours_end: row.business_hours_end ?? '18:00',
    advance_reservation_days: row.advance_reservation_days ?? 3,
    max_reservation_days: row.max_reservation_days ?? 90,
    max_reservations_per_day: row.max_reservations_per_day ?? 10,
    concurrent_reservations: row.concurrent_reservations ?? 1,
    closed_dates: row.closed_dates ?? [],
    custom_hours: row.custom_hours ?? {},
    updated_at: row.updated_at ?? new Date().toISOString(),
  }, { onConflict: 'reservation_settings_id' });
  if (error) throw new Error(error.message);
}

// ========== Location Availability ==========
export async function getLocationAvailability(locationId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await getClient()
    .from('location_availability')
    .select('*')
    .eq('location_id', locationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Record<string, unknown> | null;
}

export async function upsertLocationAvailability(row: Record<string, unknown>): Promise<void> {
  const { error } = await getClient().from('location_availability').upsert({
    location_id: row.location_id,
    regular_closed_days: row.regular_closed_days ?? [],
    business_hours_start: row.business_hours_start ?? '09:00',
    business_hours_end: row.business_hours_end ?? '18:00',
    custom_hours: row.custom_hours ?? {},
    closed_dates: row.closed_dates ?? [],
    special_dates: row.special_dates ?? {},
    max_reservations_per_day: row.max_reservations_per_day ?? 10,
    updated_at: row.updated_at ?? new Date().toISOString(),
  }, { onConflict: 'location_id' });
  if (error) throw new Error(error.message);
}

// ========== Incentive Monthly ==========
export async function getIncentiveMonthly(userId: string, yearMonth: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await getClient()
    .from('incentive_monthly')
    .select('*')
    .eq('user_id', userId)
    .eq('year_month', yearMonth)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Record<string, unknown> | null;
}

export async function getAllIncentiveMonthly(): Promise<Record<string, unknown>[]> {
  const { data, error } = await getClient().from('incentive_monthly').select('*');
  if (error) throw new Error(error.message);
  return (data ?? []) as Record<string, unknown>[];
}

export async function upsertIncentiveMonthly(row: Record<string, unknown>): Promise<void> {
  const { error } = await getClient().from('incentive_monthly').upsert({
    user_id: row.user_id,
    year_month: row.year_month,
    manual_adjust_yen: row.manual_adjust_yen ?? 0,
    locked_flag: row.locked_flag === true,
    locked_at: row.locked_at ?? null,
    adjusted_by_user_id: row.adjusted_by_user_id ?? null,
    updated_at: row.updated_at ?? new Date().toISOString(),
  }, { onConflict: 'user_id,year_month' });
  if (error) throw new Error(error.message);
}

// ========== Incentives (予約紐付け) ==========
export async function getIncentives(): Promise<Record<string, unknown>[]> {
  const { data, error } = await getClient().from('incentives').select('*');
  if (error) throw new Error(error.message);
  return (data ?? []) as Record<string, unknown>[];
}

export async function deleteIncentive(incentiveId: string): Promise<void> {
  const { error } = await getClient().from('incentives').delete().eq('incentive_id', incentiveId);
  if (error) throw new Error(error.message);
}

// ========== Audit Logs ==========
export async function insertAuditLog(row: Record<string, unknown>): Promise<void> {
  const { error } = await getClient().from('audit_logs').insert({
    ref_table: row.ref_table,
    ref_id: row.ref_id,
    action_type: row.action_type,
    before_json: row.before_json ?? null,
    after_json: row.after_json ?? null,
    acted_by_user_id: row.acted_by_user_id ?? null,
    acted_at: row.acted_at ?? new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

// ========== Shifts ==========
export async function getShiftsByYearMonth(yearMonth: string): Promise<Record<string, unknown>[]> {
  const [year, month] = yearMonth.split('-').map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  const { data, error } = await getClient()
    .from('shifts')
    .select('*')
    .gte('date', start.toISOString().slice(0, 10))
    .lte('date', end.toISOString().slice(0, 10));
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Record<string, unknown>[];
  return rows.map((r) => ({ ...r, shift_id: `${r.date}:${r.staff_id}` }));
}

export async function upsertShift(row: Record<string, unknown>): Promise<void> {
  const { error } = await getClient().from('shifts').upsert({
    staff_id: row.staff_id,
    date: row.date,
    shift_type: row.shift_type ?? 'work',
    start_time: row.start_time ?? null,
    end_time: row.end_time ?? null,
    notes: row.notes ?? null,
    updated_at: row.updated_at ?? new Date().toISOString(),
    updated_by: row.updated_by ?? null,
  }, { onConflict: 'staff_id,date' });
  if (error) throw new Error(error.message);
}

export async function deleteShift(staffId: string, date: string): Promise<void> {
  const { error } = await getClient().from('shifts').delete().eq('staff_id', staffId).eq('date', date);
  if (error) throw new Error(error.message);
}
