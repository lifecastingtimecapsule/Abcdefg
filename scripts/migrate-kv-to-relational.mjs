/**
 * KV ストア (kv_store_fe84bde0) からリレーショナルテーブルへデータを移行するスクリプト
 * 実行: node scripts/migrate-kv-to-relational.mjs
 * 前提: 1) 新テーブル作成済み 2) .env.local に SUPABASE_SERVICE_ROLE_KEY を設定
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// .env.local を読み込み（VITE_ と SUPABASE_ を利用）
function loadEnv() {
  const path = resolve(process.cwd(), '.env.local');
  if (!existsSync(path)) {
    console.warn('.env.local が見つかりません。環境変数で SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を設定してください。');
    return;
  }
  const content = readFileSync(path, 'utf8');
  content.split('\n').forEach((line) => {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m) {
      const key = m[1].trim();
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
        val = val.slice(1, -1);
      process.env[key] = val;
    }
  });
}

loadEnv();

const projectId = process.env.VITE_SUPABASE_PROJECT_ID;
const supabaseUrl = process.env.SUPABASE_URL || (projectId ? `https://${projectId}.supabase.co` : null);
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を設定してください。.env.local に SUPABASE_SERVICE_ROLE_KEY を追加するか、環境変数で指定してください。');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);
const KV_TABLE = 'kv_store_fe84bde0';

function safeStr(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}
function safeUuid(v) {
  const s = safeStr(v);
  if (!s) return null;
  try {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return s;
  } catch (_) {}
  return null;
}
function safeInt(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function safeBool(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'boolean') return v;
  const s = String(v).toLowerCase();
  return s === 'true' || s === '1' ? true : s === 'false' || s === '0' ? false : null;
}
function safeDate(v) {
  const s = safeStr(v);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
function safeJsonArray(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try {
      const a = JSON.parse(v);
      return Array.isArray(a) ? a : [];
    } catch (_) {}
  }
  return [];
}

/** 全件取得（ページネーション、key でソート） */
async function fetchAllFromKv() {
  const rows = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from(KV_TABLE)
      .select('key, value')
      .order('key', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`KV 取得エラー: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function main() {
  console.log('KV ストアからデータを取得しています...');
  const allRows = await fetchAllFromKv();
  console.log(`取得件数: ${allRows.length}`);

  const byPrefix = (prefix) => allRows.filter((r) => r.key && r.key.startsWith(prefix) && r.key !== prefix);
  const get = (key) => allRows.find((r) => r.key === key)?.value;

  const existingIds = {
    location: new Set(),
    customer: new Set(),
    menuItem: new Set(),
    appUser: new Set(),
    reservation: new Set(),
    workOrder: new Set(),
  };

  // 1. app_users
  const userRows = byPrefix('user:');
  console.log(`app_users: ${userRows.length} 件`);
  for (const { value } of userRows) {
    const user_id = safeUuid(value?.user_id);
    if (!user_id) continue;
    const { error } = await supabase.from('app_users').upsert(
      {
        user_id,
        name: safeStr(value?.name) ?? '',
        email: safeStr(value?.email) ?? '',
        login_id: safeStr(value?.login_id) ?? '',
        role: safeStr(value?.role) || 'staff',
        active_flag: safeBool(value?.active_flag) !== false,
        last_login_at: value?.last_login_at ? safeDate(value.last_login_at) : null,
        created_at: safeDate(value?.created_at) || new Date().toISOString(),
        updated_at: safeDate(value?.updated_at) || new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
    if (error) console.error('app_users upsert error', value?.user_id, error.message);
    else existingIds.appUser.add(user_id);
  }

  // 2. locations
  const locationRows = byPrefix('location:');
  console.log(`locations: ${locationRows.length} 件`);
  for (const { value } of locationRows) {
    const location_id = safeUuid(value?.location_id);
    if (!location_id) continue;
    const { error } = await supabase.from('locations').upsert(
      {
        location_id,
        location_name: safeStr(value?.location_name) ?? '',
        address_text: safeStr(value?.address_text) ?? '',
        phone: safeStr(value?.phone) ?? '',
        active_flag: safeBool(value?.active_flag) !== false,
        created_at: safeDate(value?.created_at) || new Date().toISOString(),
        updated_at: safeDate(value?.updated_at) || new Date().toISOString(),
      },
      { onConflict: 'location_id' }
    );
    if (error) console.error('locations upsert error', value?.location_id, error.message);
    else existingIds.location.add(location_id);
  }

  // 3. customers（customer_code 重複時は -2, -3 付与）
  const customerRows = byPrefix('customer:').filter((r) => safeUuid(r.value?.customer_id) && safeStr(r.value?.customer_code));
  const codeCount = {};
  console.log(`customers: ${customerRows.length} 件`);
  for (const { value } of customerRows) {
    const customer_id = safeUuid(value?.customer_id);
    if (!customer_id) continue;
    let code = safeStr(value?.customer_code);
    if (!code) continue;
    codeCount[code] = (codeCount[code] || 0) + 1;
    if (codeCount[code] > 1) code = `${code}-${codeCount[code]}`;
    const { error } = await supabase.from('customers').upsert(
      {
        customer_id,
        customer_code: code,
        external_customer_number: safeStr(value?.external_customer_number),
        parent_name: safeStr(value?.parent_name),
        parent_name_kana: safeStr(value?.parent_name_kana),
        child_name: safeStr(value?.child_name),
        child_name_kana: safeStr(value?.child_name_kana),
        child_age_years: safeInt(value?.child_age_years),
        child_age_months: safeInt(value?.child_age_months),
        children: value?.children ?? [],
        phone: safeStr(value?.phone),
        email: safeStr(value?.email),
        line_url: safeStr(value?.line_url),
        postal_code: safeStr(value?.postal_code),
        address_text: safeStr(value?.address_text),
        notes_internal: safeStr(value?.notes_internal),
        active_flag: safeBool(value?.active_flag) !== false,
        created_at: safeDate(value?.created_at) || new Date().toISOString(),
        updated_at: safeDate(value?.updated_at) || new Date().toISOString(),
      },
      { onConflict: 'customer_id' }
    );
    if (error) console.error('customers upsert error', value?.customer_id, error.message);
    else existingIds.customer.add(customer_id);
  }

  // 4. menu_items
  const menuRows = byPrefix('menu_item:');
  console.log(`menu_items: ${menuRows.length} 件`);
  for (const { value } of menuRows) {
    const menu_item_id = safeUuid(value?.menu_item_id);
    if (!menu_item_id) continue;
    const { error } = await supabase.from('menu_items').upsert(
      {
        menu_item_id,
        name: safeStr(value?.name) ?? '',
        base_price: safeInt(value?.base_price) ?? 0,
        additional_unit_price: safeInt(value?.additional_unit_price) ?? 0,
        description: safeStr(value?.description) ?? '',
        duration_minutes: safeInt(value?.duration_minutes) ?? 60,
        is_active: safeBool(value?.is_active) !== false,
        discount_type: safeStr(value?.discount_type) || 'none',
        discount_value: value?.discount_value != null ? Number(value.discount_value) : null,
        discount_end_date: safeDate(value?.discount_end_date)?.slice(0, 10) || null,
        apply_discount_to_additional: safeBool(value?.apply_discount_to_additional) === true,
        created_at: safeDate(value?.created_at) || new Date().toISOString(),
        updated_at: safeDate(value?.updated_at) || new Date().toISOString(),
      },
      { onConflict: 'menu_item_id' }
    );
    if (error) console.error('menu_items upsert error', value?.menu_item_id, error.message);
    else existingIds.menuItem.add(menu_item_id);
  }

  // 5. location_menus
  const locMenuRows = allRows.filter((r) => r.key && r.key.startsWith('location_menu:') && r.key.split(':').length >= 3);
  console.log(`location_menus: ${locMenuRows.length} 件`);
  for (const { key, value } of locMenuRows) {
    const parts = key.split(':');
    const location_id = safeUuid(parts[1]);
    const menu_item_id = safeUuid(parts[2]);
    if (!location_id || !menu_item_id) continue;
    if (!existingIds.location.has(location_id) || !existingIds.menuItem.has(menu_item_id)) continue;
    const { error } = await supabase.from('location_menus').upsert(
      {
        location_id,
        menu_item_id,
        enabled: safeBool(value?.enabled) !== false,
        created_at: safeDate(value?.created_at) || new Date().toISOString(),
        updated_at: safeDate(value?.updated_at) || new Date().toISOString(),
      },
      { onConflict: 'location_id,menu_item_id' }
    );
    if (error) console.error('location_menus upsert error', key, error.message);
  }

  // 6. reservations（FK は参照先が存在する場合のみ設定）
  const resRows = byPrefix('reservation:').filter((r) => safeUuid(r.value?.reservation_id));
  console.log(`reservations: ${resRows.length} 件`);
  for (const { value } of resRows) {
    const reservation_id = safeUuid(value?.reservation_id);
    if (!reservation_id) continue;
    let reservation_number = safeStr(value?.reservation_number);
    if (!reservation_number) reservation_number = 'MIG-' + String(reservation_id).replace(/-/g, '');
    const _lid = safeUuid(value?.location_id);
    const _cid = safeUuid(value?.customer_id);
    const _sid = safeUuid(value?.staff_id_main);
    const _mid = safeUuid(value?.menu_item_id);
    const _uid = safeUuid(value?.updated_by_user_id);
    const location_id = _lid && existingIds.location.has(_lid) ? _lid : null;
    const customer_id = _cid && existingIds.customer.has(_cid) ? _cid : null;
    const staff_id_main = _sid && existingIds.appUser.has(_sid) ? _sid : null;
    const menu_item_id = _mid && existingIds.menuItem.has(_mid) ? _mid : null;
    const updated_by_user_id = _uid && existingIds.appUser.has(_uid) ? _uid : null;
    const { error } = await supabase.from('reservations').upsert(
      {
        reservation_id,
        reservation_number,
        reservation_date_time: safeDate(value?.reservation_date_time) || new Date().toISOString(),
        duration_minutes: safeInt(value?.duration_minutes) ?? 30,
        location_id,
        customer_id,
        staff_id_main,
        status: safeStr(value?.status) || 'tentative',
        payment_status: safeStr(value?.payment_status) || 'unpaid',
        payment_method: safeStr(value?.payment_method),
        work_required: safeStr(value?.work_required),
        notes_staff: safeStr(value?.notes_staff),
        menu_item_id,
        additional_units: safeInt(value?.additional_units) ?? 0,
        photo_required: safeStr(value?.photo_required) || 'not_set',
        created_at: safeDate(value?.created_at) || new Date().toISOString(),
        updated_at: safeDate(value?.updated_at) || new Date().toISOString(),
        updated_by_user_id,
      },
      { onConflict: 'reservation_id' }
    );
    if (error) console.error('reservations upsert error', value?.reservation_id, error.message);
    else existingIds.reservation.add(reservation_id);
  }

  // 7. work_orders
  const woRows = byPrefix('work_order:').filter((r) => safeUuid(r.value?.work_order_id));
  console.log(`work_orders: ${woRows.length} 件`);
  for (const { value } of woRows) {
    const work_order_id = safeUuid(value?.work_order_id);
    if (!work_order_id) continue;
    const _wo_cid = safeUuid(value?.customer_id);
    const _wo_rid = safeUuid(value?.reservation_id);
    const _wo_uid = safeUuid(value?.updated_by_user_id);
    const customer_id = _wo_cid && existingIds.customer.has(_wo_cid) ? _wo_cid : null;
    const reservation_id = _wo_rid && existingIds.reservation.has(_wo_rid) ? _wo_rid : null;
    const updated_by_user_id = _wo_uid && existingIds.appUser.has(_wo_uid) ? _wo_uid : null;
    const { error } = await supabase.from('work_orders').upsert(
      {
        work_order_id,
        customer_id,
        reservation_id,
        product_type: safeStr(value?.product_type) ?? '',
        status: safeStr(value?.status) || '乾燥中',
        due_date: safeDate(value?.due_date)?.slice(0, 10) || null,
        delivered_date: safeDate(value?.delivered_date)?.slice(0, 10) || null,
        pickup_date: safeDate(value?.pickup_date)?.slice(0, 10) || null,
        priority_order: safeInt(value?.priority_order),
        notes_internal: safeStr(value?.notes_internal),
        photo_data_status: safeStr(value?.photo_data_status) || 'not_set',
        nameplate_name: safeStr(value?.nameplate_name),
        coloring_type: safeStr(value?.coloring_type),
        frame_color: safeStr(value?.frame_color),
        mount_color: safeStr(value?.mount_color),
        status_comments: value?.status_comments ?? {},
        created_at: safeDate(value?.created_at) || new Date().toISOString(),
        updated_at: safeDate(value?.updated_at) || new Date().toISOString(),
        updated_by_user_id,
      },
      { onConflict: 'work_order_id' }
    );
    if (error) console.error('work_orders upsert error', value?.work_order_id, error.message);
    else existingIds.workOrder.add(work_order_id);
  }

  // 8. reservation_settings
  const settings = get('reservation_settings:default');
  if (settings) {
    const closedDates = safeJsonArray(settings.closed_dates)
      .map((x) => (typeof x === 'string' ? x : x?.toString?.())?.trim())
      .filter(Boolean);
    const allowedDays = safeJsonArray(settings.allowed_days).filter((d) => Number.isFinite(Number(d)));
    const { error } = await supabase.from('reservation_settings').upsert(
      {
        reservation_settings_id: 'default',
        allowed_days: allowedDays.length ? allowedDays.map(Number) : [1, 2, 3, 4, 5, 6],
        business_hours_start: safeStr(settings.business_hours_start) || '09:00',
        business_hours_end: safeStr(settings.business_hours_end) || '18:00',
        advance_reservation_days: safeInt(settings.advance_reservation_days) ?? 3,
        max_reservation_days: safeInt(settings.max_reservation_days) ?? 90,
        max_reservations_per_day: safeInt(settings.max_reservations_per_day) ?? 10,
        concurrent_reservations: safeInt(settings.concurrent_reservations) ?? 1,
        closed_dates: closedDates,
        custom_hours: settings.custom_hours ?? {},
        updated_at: safeDate(settings.updated_at) || new Date().toISOString(),
      },
      { onConflict: 'reservation_settings_id' }
    );
    if (error) console.error('reservation_settings upsert error', error.message);
    else console.log('reservation_settings: 1 件');
  }

  // 9. location_availability
  const locAvailRows = allRows.filter((r) => r.key && r.key.startsWith('location_availability:') && r.key !== 'location_availability:');
  console.log(`location_availability: ${locAvailRows.length} 件`);
  for (const { key, value } of locAvailRows) {
    const location_id = safeUuid(key.split(':')[1]);
    if (!location_id || !existingIds.location.has(location_id)) continue;
    const closedDates = safeJsonArray(value?.closed_dates)
      .map((x) => (typeof x === 'string' ? x : x?.toString?.())?.trim())
      .filter(Boolean);
    const { error } = await supabase.from('location_availability').upsert(
      {
        location_id,
        regular_closed_days: safeJsonArray(value?.regular_closed_days).filter((d) => Number.isFinite(Number(d))).map(Number),
        business_hours_start: safeStr(value?.business_hours_start) || '09:00',
        business_hours_end: safeStr(value?.business_hours_end) || '18:00',
        custom_hours: value?.custom_hours ?? {},
        closed_dates: closedDates,
        special_dates: value?.special_dates ?? {},
        max_reservations_per_day: safeInt(value?.max_reservations_per_day) ?? 10,
        updated_at: safeDate(value?.updated_at) || new Date().toISOString(),
      },
      { onConflict: 'location_id' }
    );
    if (error) console.error('location_availability upsert error', key, error.message);
  }

  // 10. incentive_monthly
  const incMonthlyRows = allRows.filter((r) => r.key && /^incentive_monthly:[^:]+:[^:]+$/.test(r.key));
  console.log(`incentive_monthly: ${incMonthlyRows.length} 件`);
  for (const { key, value } of incMonthlyRows) {
    const parts = key.split(':');
    const user_id = safeUuid(parts[1]);
    const year_month = safeStr(parts[2]);
    if (!user_id || !year_month || !existingIds.appUser.has(user_id)) continue;
    const { error } = await supabase.from('incentive_monthly').upsert(
      {
        user_id,
        year_month,
        manual_adjust_yen: value?.manual_adjust_yen != null ? Number(value.manual_adjust_yen) : 0,
        locked_flag: safeBool(value?.locked_flag) === true,
        locked_at: value?.locked_at ? safeDate(value.locked_at) : null,
        adjusted_by_user_id: existingIds.appUser.has(safeUuid(value?.adjusted_by_user_id) || '') ? safeUuid(value?.adjusted_by_user_id) : null,
        updated_at: safeDate(value?.updated_at) || new Date().toISOString(),
      },
      { onConflict: 'user_id,year_month' }
    );
    if (error) console.error('incentive_monthly upsert error', key, error.message);
  }

  // 11. incentives
  const incRows = allRows.filter((r) => r.key && r.key.startsWith('incentive:') && r.key !== 'incentive:');
  console.log(`incentives: ${incRows.length} 件`);
  for (const { key, value } of incRows) {
    const incentive_id = safeUuid(key.split(':')[1]);
    const reservation_id = safeUuid(value?.reservation_id);
    if (!incentive_id || !reservation_id || !existingIds.reservation.has(reservation_id)) continue;
    const { error } = await supabase.from('incentives').upsert(
      {
        incentive_id,
        reservation_id,
        created_at: safeDate(value?.created_at) || new Date().toISOString(),
      },
      { onConflict: 'incentive_id' }
    );
    if (error) console.error('incentives upsert error', key, error.message);
  }

  // 12. audit_logs（件数多ならスキップ可）
  const auditRows = byPrefix('audit:');
  console.log(`audit_logs: ${auditRows.length} 件`);
  for (const { value } of auditRows) {
    const acted_by = safeUuid(value?.acted_by_user_id);
    const { error } = await supabase.from('audit_logs').insert({
      ref_table: safeStr(value?.ref_table) ?? '',
      ref_id: safeStr(value?.ref_id) ?? '',
      action_type: safeStr(value?.action_type) ?? '',
      before_json: value?.before_json ?? null,
      after_json: value?.after_json ?? null,
      acted_by_user_id: acted_by && existingIds.appUser.has(acted_by) ? acted_by : null,
      acted_at: safeDate(value?.acted_at) || new Date().toISOString(),
    });
    if (error) console.error('audit_logs insert error', error.message);
  }

  // 13. shifts
  const shiftRows = allRows.filter((r) => r.key && /^shift:[0-9]{4}-[0-9]{2}-[0-9]{2}:/.test(r.key));
  console.log(`shifts: ${shiftRows.length} 件`);
  for (const { key, value } of shiftRows) {
    const parts = key.split(':');
    const dateStr = safeStr(parts[1]);
    const staff_id = safeUuid(parts[2]);
    if (!dateStr || !staff_id || !existingIds.appUser.has(staff_id)) continue;
    const updated_by = safeUuid(value?.updated_by);
    const { error } = await supabase.from('shifts').upsert(
      {
        staff_id,
        date: dateStr,
        shift_type: safeStr(value?.shift_type) || 'work',
        start_time: safeStr(value?.start_time),
        end_time: safeStr(value?.end_time),
        notes: safeStr(value?.notes),
        updated_at: safeDate(value?.updated_at) || new Date().toISOString(),
        updated_by: updated_by && existingIds.appUser.has(updated_by) ? updated_by : null,
      },
      { onConflict: 'staff_id,date' }
    );
    if (error) console.error('shifts upsert error', key, error.message);
  }

  console.log('移行処理を完了しました。');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
