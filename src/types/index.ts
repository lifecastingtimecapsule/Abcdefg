// ユーザー・認証関連
export interface User {
  user_id: string;
  login_id: string;
  name: string;
  role: 'admin' | 'staff';
  email?: string;
  active_flag?: boolean;
  last_login_at?: string;
  created_at: string;
  updated_at: string;
  /** 初期パスワードでログインした初回のみ true。パスワード変更後に false */
  must_change_password?: boolean;
}

export interface LoginResponse {
  access_token: string;
  user: User;
}

export interface MeResponse {
  user: User;
}

export interface Child {
  name: string;
  name_kana?: string;
  age_years?: number | null;
  age_months?: number | null;
  gender?: 'boy' | 'girl' | 'other' | null;
  birth_date?: string;
  notes?: string;
}

// 顧客関連
export interface Customer {
  customer_id: string;
  customer_code?: string;
  external_customer_number?: string;
  parent_name: string;
  parent_name_kana?: string;
  child_name?: string;
  child_name_kana?: string;
  child_age_years?: number | null;
  child_age_months?: number | null;
  children?: Child[];
  phone: string;
  email?: string;
  line_url?: string;
  postal_code?: string;
  address_text?: string;
  notes_internal?: string;
  active_flag?: boolean;
  created_at: string;
  updated_at: string;
}

// 予約関連
export interface Reservation {
  reservation_id: string;
  reservation_number?: string;
  customer_id: string;
  location_id: string;
  menu_item_id?: string;
  staff_id_main?: string;
  reservation_date_time: string;
  duration_minutes?: number;
  status: 'confirmed' | 'tentative' | 'pending' | 'cancelled' | 'completed';
  notes_staff?: string;
  photo_required?: 'not_set' | 'required' | 'not_required';
  google_event_id?: string;
  created_at: string;
  updated_at: string;
  customer?: Customer;
  location?: Location;
}

// 制作物関連
export interface WorkOrder {
  work_order_id: string;
  customer_id: string;
  reservation_id?: string;
  product_type: string;
  status: '乾燥中' | '成形' | '着色' | '額装' | '完成' | '受け取り済み';
  due_date: string;
  delivery_date?: string;
  pickup_date?: string;
  assigned_staff_id?: string;
  notes?: string;
  nameplate_name?: string;
  nameplate_font?: '筆記体' | '明朝体' | 'ゴシック体';
  coloring_type?: '金' | '銀';
  frame_color?: '白' | '黒';
  mount_color?: '白' | '黒';
  status_comments?: Record<string, string>;
  photo_data_status?: 'not_set' | 'available' | 'not_available';
  priority_order?: number;
  created_at: string;
  updated_at: string;
  customer?: Customer;
  assigned_staff?: User;
}

// ロケーション関連
export interface Location {
  location_id: string;
  location_name: string;
  address_text?: string;
  phone?: string;
  active_flag?: boolean;
  created_at: string;
  updated_at: string;
}

// インセンティブ関連
export interface Incentive {
  incentive_id: string;
  staff_id: string;
  work_order_id: string;
  amount: number;
  paid: boolean;
  payment_date?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  staff?: User;
  work_order?: WorkOrder;
}

// メニュー設定関連
export interface MenuItem {
  menu_item_id: string;
  name: string;
  base_price: number;
  additional_unit_price: number;
  description?: string;
  duration_minutes?: number;
  is_active: boolean;
  discount_type?: 'none' | 'percentage' | 'fixed';
  discount_value?: number | null;
  discount_end_date?: string | null;
  apply_discount_to_additional?: boolean;
  created_at: string;
  updated_at: string;
}

// API エラーレスポンス
export interface ApiError {
  error: string;
  details?: string;
}
