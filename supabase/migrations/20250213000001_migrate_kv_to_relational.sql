-- KV ストア (kv_store_fe84bde0) からリレーショナルテーブルへデータ移行
-- 注意: 20250213000000_create_relational_tables.sql を先に実行してください。
-- 既存の KV データがある場合のみ実行します。

-- 1. app_users（key が 'user:' で始まるもの、value に user_id を含む）
INSERT INTO app_users (user_id, name, email, login_id, role, active_flag, last_login_at, created_at, updated_at)
SELECT
  (NULLIF(TRIM(value->>'user_id'), ''))::uuid,
  value->>'name',
  value->>'email',
  value->>'login_id',
  COALESCE(value->>'role', 'staff'),
  COALESCE((value->>'active_flag')::boolean, true),
  (value->>'last_login_at')::timestamptz,
  COALESCE((value->>'created_at')::timestamptz, now()),
  COALESCE((value->>'updated_at')::timestamptz, now())
FROM kv_store_fe84bde0
WHERE key LIKE 'user:%' AND key != 'user:'
  AND value->>'user_id' IS NOT NULL AND TRIM(value->>'user_id') != ''
ON CONFLICT (user_id) DO UPDATE SET
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  login_id = EXCLUDED.login_id,
  role = EXCLUDED.role,
  active_flag = EXCLUDED.active_flag,
  last_login_at = EXCLUDED.last_login_at,
  updated_at = EXCLUDED.updated_at;

-- 2. locations
INSERT INTO locations (location_id, location_name, address_text, phone, active_flag, created_at, updated_at)
SELECT
  (NULLIF(TRIM(value->>'location_id'), ''))::uuid,
  value->>'location_name',
  COALESCE(value->>'address_text', ''),
  COALESCE(value->>'phone', ''),
  COALESCE((value->>'active_flag')::boolean, true),
  COALESCE((value->>'created_at')::timestamptz, now()),
  COALESCE((value->>'updated_at')::timestamptz, now())
FROM kv_store_fe84bde0
WHERE key LIKE 'location:%'
  AND value->>'location_id' IS NOT NULL AND TRIM(value->>'location_id') != ''
ON CONFLICT (location_id) DO UPDATE SET
  location_name = EXCLUDED.location_name,
  address_text = EXCLUDED.address_text,
  phone = EXCLUDED.phone,
  active_flag = EXCLUDED.active_flag,
  updated_at = EXCLUDED.updated_at;

-- 3. customers（同一 customer_code が複数ある場合は -2, -3 を付与して一意にする）
WITH kv_customers AS (
  SELECT
    key,
    value,
    ROW_NUMBER() OVER (PARTITION BY value->>'customer_code' ORDER BY value->>'created_at', key) AS rn
  FROM kv_store_fe84bde0
  WHERE key LIKE 'customer:%'
    AND value->>'customer_id' IS NOT NULL AND TRIM(value->>'customer_id') != ''
    AND value->>'customer_code' IS NOT NULL AND TRIM(value->>'customer_code') != ''
),
with_unique_code AS (
  SELECT
    (NULLIF(TRIM(value->>'customer_id'), ''))::uuid AS customer_id,
    CASE WHEN rn > 1 THEN (value->>'customer_code') || '-' || rn ELSE value->>'customer_code' END AS customer_code,
    value->>'external_customer_number' AS external_customer_number,
    value->>'parent_name' AS parent_name,
    value->>'parent_name_kana' AS parent_name_kana,
    value->>'child_name' AS child_name,
    value->>'child_name_kana' AS child_name_kana,
    (value->>'child_age_years')::integer AS child_age_years,
    (value->>'child_age_months')::integer AS child_age_months,
    COALESCE(value->'children', '[]'::jsonb) AS children,
    value->>'phone' AS phone,
    value->>'email' AS email,
    value->>'line_url' AS line_url,
    value->>'postal_code' AS postal_code,
    value->>'address_text' AS address_text,
    value->>'notes_internal' AS notes_internal,
    COALESCE((value->>'active_flag')::boolean, true) AS active_flag,
    COALESCE((value->>'created_at')::timestamptz, now()) AS created_at,
    COALESCE((value->>'updated_at')::timestamptz, now()) AS updated_at
  FROM kv_customers
)
INSERT INTO customers (customer_id, customer_code, external_customer_number, parent_name, parent_name_kana, child_name, child_name_kana, child_age_years, child_age_months, children, phone, email, line_url, postal_code, address_text, notes_internal, active_flag, created_at, updated_at)
SELECT
  customer_id,
  customer_code,
  external_customer_number,
  parent_name,
  parent_name_kana,
  child_name,
  child_name_kana,
  child_age_years,
  child_age_months,
  children,
  phone,
  email,
  line_url,
  postal_code,
  address_text,
  notes_internal,
  active_flag,
  created_at,
  updated_at
FROM with_unique_code
ON CONFLICT (customer_id) DO UPDATE SET
  customer_code = EXCLUDED.customer_code,
  parent_name = EXCLUDED.parent_name,
  child_name = EXCLUDED.child_name,
  phone = EXCLUDED.phone,
  updated_at = EXCLUDED.updated_at;

-- 4. menu_items
INSERT INTO menu_items (menu_item_id, name, base_price, additional_unit_price, description, duration_minutes, is_active, discount_type, discount_value, discount_end_date, apply_discount_to_additional, created_at, updated_at)
SELECT
  (NULLIF(TRIM(value->>'menu_item_id'), ''))::uuid,
  value->>'name',
  COALESCE((value->>'base_price')::integer, 0),
  COALESCE((value->>'additional_unit_price')::integer, 0),
  COALESCE(value->>'description', ''),
  COALESCE((value->>'duration_minutes')::integer, 60),
  COALESCE((value->>'is_active')::boolean, true),
  COALESCE(value->>'discount_type', 'none'),
  (value->>'discount_value')::numeric,
  (NULLIF(TRIM(value->>'discount_end_date'), ''))::date,
  COALESCE((value->>'apply_discount_to_additional')::boolean, false),
  COALESCE((value->>'created_at')::timestamptz, now()),
  COALESCE((value->>'updated_at')::timestamptz, now())
FROM kv_store_fe84bde0
WHERE key LIKE 'menu_item:%'
  AND value->>'menu_item_id' IS NOT NULL AND TRIM(value->>'menu_item_id') != ''
ON CONFLICT (menu_item_id) DO UPDATE SET
  name = EXCLUDED.name,
  base_price = EXCLUDED.base_price,
  duration_minutes = EXCLUDED.duration_minutes,
  updated_at = EXCLUDED.updated_at;

-- 5. location_menus（key 形式: location_menu:location_id:menu_item_id）
INSERT INTO location_menus (location_id, menu_item_id, enabled, created_at, updated_at)
SELECT
  (NULLIF(TRIM(split_part(key, ':', 2)), ''))::uuid,
  (NULLIF(TRIM(split_part(key, ':', 3)), ''))::uuid,
  COALESCE((value->>'enabled')::boolean, true),
  COALESCE((value->>'created_at')::timestamptz, now()),
  COALESCE((value->>'updated_at')::timestamptz, now())
FROM kv_store_fe84bde0
WHERE key LIKE 'location_menu:%' AND key ~ 'location_menu:[^:]+:[^:]+'
  AND TRIM(split_part(key, ':', 2)) != '' AND TRIM(split_part(key, ':', 3)) != ''
ON CONFLICT (location_id, menu_item_id) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  updated_at = EXCLUDED.updated_at;

-- 6. reservations（reservation_number が空の場合は MIG-{reservation_id} を付与。FK は参照先が存在する場合のみ設定）
INSERT INTO reservations (reservation_id, reservation_number, reservation_date_time, duration_minutes, location_id, customer_id, staff_id_main, status, payment_status, payment_method, work_required, notes_staff, menu_item_id, additional_units, photo_required, created_at, updated_at, updated_by_user_id)
SELECT
  (NULLIF(TRIM(value->>'reservation_id'), ''))::uuid,
  COALESCE(NULLIF(TRIM(value->>'reservation_number'), ''), 'MIG-' || REPLACE(value->>'reservation_id', '-', '')),
  (value->>'reservation_date_time')::timestamptz,
  COALESCE((value->>'duration_minutes')::integer, 30),
  CASE WHEN (NULLIF(TRIM(value->>'location_id'), ''))::uuid IS NOT NULL AND EXISTS (SELECT 1 FROM locations l WHERE l.location_id = (NULLIF(TRIM(value->>'location_id'), ''))::uuid) THEN (NULLIF(TRIM(value->>'location_id'), ''))::uuid ELSE NULL END,
  CASE WHEN (NULLIF(TRIM(value->>'customer_id'), ''))::uuid IS NOT NULL AND EXISTS (SELECT 1 FROM customers c WHERE c.customer_id = (NULLIF(TRIM(value->>'customer_id'), ''))::uuid) THEN (NULLIF(TRIM(value->>'customer_id'), ''))::uuid ELSE NULL END,
  CASE WHEN (NULLIF(TRIM(value->>'staff_id_main'), ''))::uuid IS NOT NULL AND EXISTS (SELECT 1 FROM app_users u WHERE u.user_id = (NULLIF(TRIM(value->>'staff_id_main'), ''))::uuid) THEN (NULLIF(TRIM(value->>'staff_id_main'), ''))::uuid ELSE NULL END,
  COALESCE(value->>'status', 'tentative'),
  COALESCE(value->>'payment_status', 'unpaid'),
  value->>'payment_method',
  value->>'work_required',
  value->>'notes_staff',
  CASE WHEN (NULLIF(TRIM(value->>'menu_item_id'), ''))::uuid IS NOT NULL AND EXISTS (SELECT 1 FROM menu_items m WHERE m.menu_item_id = (NULLIF(TRIM(value->>'menu_item_id'), ''))::uuid) THEN (NULLIF(TRIM(value->>'menu_item_id'), ''))::uuid ELSE NULL END,
  COALESCE((value->>'additional_units')::integer, 0),
  COALESCE(value->>'photo_required', 'not_set'),
  COALESCE((value->>'created_at')::timestamptz, now()),
  COALESCE((value->>'updated_at')::timestamptz, now()),
  CASE WHEN (NULLIF(TRIM(value->>'updated_by_user_id'), ''))::uuid IS NOT NULL AND EXISTS (SELECT 1 FROM app_users u WHERE u.user_id = (NULLIF(TRIM(value->>'updated_by_user_id'), ''))::uuid) THEN (NULLIF(TRIM(value->>'updated_by_user_id'), ''))::uuid ELSE NULL END
FROM kv_store_fe84bde0
WHERE key LIKE 'reservation:%'
  AND value->>'reservation_id' IS NOT NULL AND TRIM(value->>'reservation_id') != ''
ON CONFLICT (reservation_id) DO UPDATE SET
  reservation_date_time = EXCLUDED.reservation_date_time,
  status = EXCLUDED.status,
  updated_at = EXCLUDED.updated_at;

-- 7. work_orders
INSERT INTO work_orders (work_order_id, customer_id, reservation_id, product_type, status, due_date, delivered_date, pickup_date, priority_order, notes_internal, photo_data_status, nameplate_name, coloring_type, frame_color, mount_color, status_comments, created_at, updated_at, updated_by_user_id)
SELECT
  (NULLIF(TRIM(value->>'work_order_id'), ''))::uuid,
  (NULLIF(TRIM(value->>'customer_id'), ''))::uuid,
  (NULLIF(TRIM(value->>'reservation_id'), ''))::uuid,
  value->>'product_type',
  COALESCE(value->>'status', '乾燥中'),
  (NULLIF(TRIM(value->>'due_date'), ''))::date,
  (NULLIF(TRIM(value->>'delivered_date'), ''))::date,
  (NULLIF(TRIM(value->>'pickup_date'), ''))::date,
  (value->>'priority_order')::integer,
  value->>'notes_internal',
  COALESCE(value->>'photo_data_status', 'not_set'),
  value->>'nameplate_name',
  value->>'coloring_type',
  value->>'frame_color',
  value->>'mount_color',
  COALESCE(value->'status_comments', '{}'::jsonb),
  COALESCE((value->>'created_at')::timestamptz, now()),
  COALESCE((value->>'updated_at')::timestamptz, now()),
  (NULLIF(TRIM(value->>'updated_by_user_id'), ''))::uuid
FROM kv_store_fe84bde0
WHERE key LIKE 'work_order:%'
  AND value->>'work_order_id' IS NOT NULL AND TRIM(value->>'work_order_id') != ''
ON CONFLICT (work_order_id) DO UPDATE SET
  status = EXCLUDED.status,
  updated_at = EXCLUDED.updated_at;

-- 8. reservation_settings（key = reservation_settings:default）
INSERT INTO reservation_settings (reservation_settings_id, allowed_days, business_hours_start, business_hours_end, advance_reservation_days, max_reservation_days, max_reservations_per_day, concurrent_reservations, closed_dates, custom_hours, updated_at)
SELECT
  'default',
  COALESCE((SELECT array_agg(x::int) FROM jsonb_array_elements_text(value->'allowed_days') x), ARRAY[1,2,3,4,5,6]),
  COALESCE(value->>'business_hours_start', '09:00'),
  COALESCE(value->>'business_hours_end', '18:00'),
  COALESCE((value->>'advance_reservation_days')::integer, 3),
  COALESCE((value->>'max_reservation_days')::integer, 90),
  COALESCE((value->>'max_reservations_per_day')::integer, 10),
  COALESCE((value->>'concurrent_reservations')::integer, 1),
  COALESCE(ARRAY(SELECT (NULLIF(TRIM(x#>>'{}'), ''))::date FROM jsonb_array_elements(value->'closed_dates') x WHERE TRIM(COALESCE(x#>>'{}', '')) != ''), ARRAY[]::date[]),
  COALESCE(value->'custom_hours', '{}'::jsonb),
  COALESCE((value->>'updated_at')::timestamptz, now())
FROM kv_store_fe84bde0
WHERE key = 'reservation_settings:default'
ON CONFLICT (reservation_settings_id) DO UPDATE SET
  allowed_days = EXCLUDED.allowed_days,
  business_hours_start = EXCLUDED.business_hours_start,
  business_hours_end = EXCLUDED.business_hours_end,
  updated_at = EXCLUDED.updated_at;

-- 9. location_availability（key = location_availability:location_id）
INSERT INTO location_availability (location_id, regular_closed_days, business_hours_start, business_hours_end, custom_hours, closed_dates, special_dates, max_reservations_per_day, updated_at)
SELECT
  (NULLIF(TRIM(split_part(key, ':', 2)), ''))::uuid,
  COALESCE((SELECT array_agg(x::int) FROM jsonb_array_elements_text(value->'regular_closed_days') x), ARRAY[]::integer[]),
  COALESCE(value->>'business_hours_start', '09:00'),
  COALESCE(value->>'business_hours_end', '18:00'),
  COALESCE(value->'custom_hours', '{}'::jsonb),
  COALESCE(ARRAY(SELECT (NULLIF(TRIM(x#>>'{}'), ''))::date FROM jsonb_array_elements(value->'closed_dates') x WHERE TRIM(COALESCE(x#>>'{}', '')) != ''), ARRAY[]::date[]),
  COALESCE(value->'special_dates', '{}'::jsonb),
  COALESCE((value->>'max_reservations_per_day')::integer, 10),
  COALESCE((value->>'updated_at')::timestamptz, now())
FROM kv_store_fe84bde0
WHERE key LIKE 'location_availability:%' AND key != 'location_availability:'
  AND split_part(key, ':', 2) IS NOT NULL AND TRIM(split_part(key, ':', 2)) != ''
ON CONFLICT (location_id) DO UPDATE SET
  regular_closed_days = EXCLUDED.regular_closed_days,
  business_hours_start = EXCLUDED.business_hours_start,
  business_hours_end = EXCLUDED.business_hours_end,
  updated_at = EXCLUDED.updated_at;

-- 10. incentive_monthly（key = incentive_monthly:user_id:year_month）
INSERT INTO incentive_monthly (user_id, year_month, manual_adjust_yen, locked_flag, locked_at, adjusted_by_user_id, updated_at)
SELECT
  (NULLIF(TRIM(split_part(key, ':', 2)), ''))::uuid,
  split_part(key, ':', 3),
  COALESCE((value->>'manual_adjust_yen')::numeric, 0),
  COALESCE((value->>'locked_flag')::boolean, false),
  (value->>'locked_at')::timestamptz,
  (NULLIF(TRIM(value->>'adjusted_by_user_id'), ''))::uuid,
  COALESCE((value->>'updated_at')::timestamptz, now())
FROM kv_store_fe84bde0
WHERE key LIKE 'incentive_monthly:%' AND key ~ 'incentive_monthly:[^:]+:[^:]+'
  AND split_part(key, ':', 2) IS NOT NULL AND TRIM(split_part(key, ':', 2)) != ''
ON CONFLICT (user_id, year_month) DO UPDATE SET
  manual_adjust_yen = EXCLUDED.manual_adjust_yen,
  locked_flag = EXCLUDED.locked_flag,
  locked_at = EXCLUDED.locked_at,
  updated_at = EXCLUDED.updated_at;

-- 11. incentives（key = incentive:uuid、value に reservation_id）
INSERT INTO incentives (incentive_id, reservation_id, created_at)
SELECT
  (NULLIF(TRIM(split_part(key, ':', 2)), ''))::uuid,
  (NULLIF(TRIM(value->>'reservation_id'), ''))::uuid,
  COALESCE((value->>'created_at')::timestamptz, now())
FROM kv_store_fe84bde0
WHERE key LIKE 'incentive:%' AND key != 'incentive:'
  AND value->>'reservation_id' IS NOT NULL AND TRIM(value->>'reservation_id') != ''
  AND split_part(key, ':', 2) IS NOT NULL AND TRIM(split_part(key, ':', 2)) != ''
ON CONFLICT (incentive_id) DO NOTHING;

-- 12. audit_logs（key = audit:uuid）※件数が多い場合は省略可
INSERT INTO audit_logs (ref_table, ref_id, action_type, before_json, after_json, acted_by_user_id, acted_at)
SELECT
  value->>'ref_table',
  value->>'ref_id',
  value->>'action_type',
  value->'before_json',
  value->'after_json',
  (NULLIF(TRIM(value->>'acted_by_user_id'), ''))::uuid,
  COALESCE((value->>'acted_at')::timestamptz, now())
FROM kv_store_fe84bde0
WHERE key LIKE 'audit:%';

-- 13. shifts（key = shift:YYYY-MM-DD:staff_id）
INSERT INTO shifts (staff_id, date, shift_type, start_time, end_time, notes, updated_at, updated_by)
SELECT
  (NULLIF(TRIM(value->>'staff_id'), ''))::uuid,
  (NULLIF(TRIM(value->>'date'), ''))::date,
  COALESCE(value->>'shift_type', 'work'),
  value->>'start_time',
  value->>'end_time',
  value->>'notes',
  COALESCE((value->>'updated_at')::timestamptz, now()),
  (NULLIF(TRIM(value->>'updated_by'), ''))::uuid
FROM kv_store_fe84bde0
WHERE key LIKE 'shift:%' AND key ~ 'shift:[0-9]{4}-[0-9]{2}-[0-9]{2}:'
  AND value->>'staff_id' IS NOT NULL AND TRIM(value->>'staff_id') != ''
  AND value->>'date' IS NOT NULL AND TRIM(value->>'date') != ''
ON CONFLICT (staff_id, date) DO UPDATE SET
  shift_type = EXCLUDED.shift_type,
  start_time = EXCLUDED.start_time,
  end_time = EXCLUDED.end_time,
  notes = EXCLUDED.notes,
  updated_at = EXCLUDED.updated_at;
