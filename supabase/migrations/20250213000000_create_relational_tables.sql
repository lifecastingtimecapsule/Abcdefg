-- リレーショナルテーブル作成（KV からの移行用）
-- Supabase Dashboard の SQL Editor で実行するか、supabase db push で適用

-- 1. アプリユーザー（auth.users と 1:1 のプロフィール、login_id で検索）
CREATE TABLE IF NOT EXISTS app_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  login_id TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'staff',
  active_flag BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_app_users_login_id ON app_users(login_id);
CREATE INDEX IF NOT EXISTS idx_app_users_active ON app_users(active_flag) WHERE active_flag = true;

-- 2. 店舗
CREATE TABLE IF NOT EXISTS locations (
  location_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_name TEXT NOT NULL,
  address_text TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  active_flag BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_locations_active ON locations(active_flag) WHERE active_flag = true;

-- 3. 顧客
CREATE TABLE IF NOT EXISTS customers (
  customer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_code TEXT NOT NULL UNIQUE,
  external_customer_number TEXT,
  parent_name TEXT,
  parent_name_kana TEXT,
  child_name TEXT,
  child_name_kana TEXT,
  child_age_years INTEGER,
  child_age_months INTEGER,
  children JSONB DEFAULT '[]',
  phone TEXT,
  email TEXT,
  line_url TEXT,
  postal_code TEXT,
  address_text TEXT,
  notes_internal TEXT,
  active_flag BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customers_active ON customers(active_flag) WHERE active_flag = true;
CREATE INDEX IF NOT EXISTS idx_customers_created_at ON customers(created_at DESC);

-- 4. メニュー
CREATE TABLE IF NOT EXISTS menu_items (
  menu_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  base_price INTEGER DEFAULT 0,
  additional_unit_price INTEGER DEFAULT 0,
  description TEXT DEFAULT '',
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  is_active BOOLEAN NOT NULL DEFAULT true,
  discount_type TEXT DEFAULT 'none',
  discount_value NUMERIC,
  discount_end_date DATE,
  apply_discount_to_additional BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_menu_items_active ON menu_items(is_active) WHERE is_active = true;

-- 5. 店舗×メニュー（有効/無効）
CREATE TABLE IF NOT EXISTS location_menus (
  location_id UUID NOT NULL REFERENCES locations(location_id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES menu_items(menu_item_id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (location_id, menu_item_id)
);
CREATE INDEX IF NOT EXISTS idx_location_menus_location ON location_menus(location_id);

-- 6. 予約
CREATE TABLE IF NOT EXISTS reservations (
  reservation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_number TEXT NOT NULL UNIQUE,
  reservation_date_time TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  location_id UUID REFERENCES locations(location_id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(customer_id) ON DELETE SET NULL,
  staff_id_main UUID REFERENCES app_users(user_id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'tentative',
  payment_status TEXT DEFAULT 'unpaid',
  payment_method TEXT,
  work_required TEXT,
  notes_staff TEXT,
  menu_item_id UUID REFERENCES menu_items(menu_item_id) ON DELETE SET NULL,
  additional_units INTEGER DEFAULT 0,
  photo_required TEXT DEFAULT 'not_set',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_user_id UUID REFERENCES app_users(user_id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations(reservation_date_time);
CREATE INDEX IF NOT EXISTS idx_reservations_location ON reservations(location_id);
CREATE INDEX IF NOT EXISTS idx_reservations_customer ON reservations(customer_id);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);
CREATE INDEX IF NOT EXISTS idx_reservations_number ON reservations(reservation_number);

-- 7. 制作物（ワークオーダー）
CREATE TABLE IF NOT EXISTS work_orders (
  work_order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(customer_id) ON DELETE SET NULL,
  reservation_id UUID REFERENCES reservations(reservation_id) ON DELETE CASCADE,
  product_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '乾燥中',
  due_date DATE,
  delivered_date DATE,
  pickup_date DATE,
  priority_order INTEGER,
  notes_internal TEXT,
  photo_data_status TEXT DEFAULT 'not_set',
  nameplate_name TEXT,
  coloring_type TEXT,
  frame_color TEXT,
  mount_color TEXT,
  status_comments JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_user_id UUID REFERENCES app_users(user_id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_work_orders_reservation ON work_orders(reservation_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_customer ON work_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders(status);

-- 8. 予約設定（単一レコード）
CREATE TABLE IF NOT EXISTS reservation_settings (
  reservation_settings_id TEXT PRIMARY KEY DEFAULT 'default',
  allowed_days INTEGER[] NOT NULL DEFAULT '{1,2,3,4,5,6}',
  business_hours_start TEXT NOT NULL DEFAULT '09:00',
  business_hours_end TEXT NOT NULL DEFAULT '18:00',
  advance_reservation_days INTEGER NOT NULL DEFAULT 3,
  max_reservation_days INTEGER NOT NULL DEFAULT 90,
  max_reservations_per_day INTEGER NOT NULL DEFAULT 10,
  concurrent_reservations INTEGER NOT NULL DEFAULT 1,
  closed_dates DATE[] DEFAULT '{}',
  custom_hours JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. 店舗別営業・休業設定
CREATE TABLE IF NOT EXISTS location_availability (
  location_id UUID PRIMARY KEY REFERENCES locations(location_id) ON DELETE CASCADE,
  regular_closed_days INTEGER[] DEFAULT '{}',
  business_hours_start TEXT DEFAULT '09:00',
  business_hours_end TEXT DEFAULT '18:00',
  custom_hours JSONB DEFAULT '{}',
  closed_dates DATE[] DEFAULT '{}',
  special_dates JSONB DEFAULT '{}',
  max_reservations_per_day INTEGER DEFAULT 10,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. インセンティブ月次調整
CREATE TABLE IF NOT EXISTS incentive_monthly (
  user_id UUID NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  year_month TEXT NOT NULL,
  manual_adjust_yen NUMERIC NOT NULL DEFAULT 0,
  locked_flag BOOLEAN NOT NULL DEFAULT false,
  locked_at TIMESTAMPTZ,
  adjusted_by_user_id UUID REFERENCES app_users(user_id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, year_month)
);

-- 11. インセンティブ（予約紐付け、顧客削除時のカスケード用）
CREATE TABLE IF NOT EXISTS incentives (
  incentive_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES reservations(reservation_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_incentives_reservation ON incentives(reservation_id);

-- 12. 監査ログ
CREATE TABLE IF NOT EXISTS audit_logs (
  audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_table TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  before_json JSONB,
  after_json JSONB,
  acted_by_user_id UUID REFERENCES app_users(user_id) ON DELETE SET NULL,
  acted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_ref ON audit_logs(ref_table, ref_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_acted_at ON audit_logs(acted_at DESC);

-- 13. シフト
CREATE TABLE IF NOT EXISTS shifts (
  staff_id UUID NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  date DATE NOT NULL,
  shift_type TEXT NOT NULL DEFAULT 'work',
  start_time TEXT,
  end_time TEXT,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES app_users(user_id) ON DELETE SET NULL,
  PRIMARY KEY (staff_id, date)
);
CREATE INDEX IF NOT EXISTS idx_shifts_date ON shifts(date);

-- RLS: Edge Function は service_role でアクセスするため RLS をバイパスします。
-- クライアント直アクセスする場合は RLS を有効化しポリシーを追加してください。
-- ここではテーブル作成のみ行い、RLS はデフォルト（無効）のままにします。

COMMENT ON TABLE app_users IS 'アプリ用ユーザープロフィール（auth.users と 1:1）';
COMMENT ON TABLE locations IS '店舗';
COMMENT ON TABLE customers IS '顧客';
COMMENT ON TABLE menu_items IS 'メニュー';
COMMENT ON TABLE location_menus IS '店舗ごとのメニュー有効/無効';
COMMENT ON TABLE reservations IS '予約';
COMMENT ON TABLE work_orders IS '制作物（ワークオーダー）';
COMMENT ON TABLE reservation_settings IS '予約全体設定（1レコード）';
COMMENT ON TABLE location_availability IS '店舗別営業・休業設定';
COMMENT ON TABLE incentive_monthly IS 'インセンティブ月次手動調整';
COMMENT ON TABLE incentives IS '予約紐付けインセンティブ';
COMMENT ON TABLE audit_logs IS '監査ログ';
COMMENT ON TABLE shifts IS 'シフト';
