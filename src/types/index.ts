// ユーザー・認証関連
export interface User {
  user_id: string;
  login_id: string;
  name: string;
  role: 'admin' | 'staff';
  created_at: string;
  updated_at: string;
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
  id: string;
  external_customer_number: string;
  parent_name: string;
  child_name: string;
  children?: Child[];
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

// 予約関連
export interface Reservation {
  reservation_id: string;
  customer_id: string;
  reservation_date: string;
  reservation_time: string;
  location_id: string;
  status: 'confirmed' | 'cancelled' | 'completed';
  notes?: string;
  photo_required?: 'not_set' | 'required' | 'not_required';
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
  // New statuses
  status: '乾燥中' | '成形' | '着色' | '額装' | '完成' | '受け取り済み';
  due_date: string;
  delivery_date?: string;
  pickup_date?: string; // 受け取り可能日
  assigned_staff_id?: string;
  notes?: string;
  // New fields
  nameplate_name?: string;
  nameplate_font?: '筆記体' | '明朝体' | 'ゴシック体';
  coloring_type?: '金' | '銀';
  frame_color?: '白' | '黒';
  mount_color?: '白' | '黒';
  status_comments?: Record<string, string>; // Key is status, value is comment
  
  photo_data_status?: 'not_set' | 'available' | 'not_available';
  created_at: string;
  updated_at: string;
  customer?: Customer;
  assigned_staff?: User;
  priority_order?: number;
}

// ロケーション関連
export interface Location {
  location_id: string;
  name: string;
  address?: string;
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
  menu_id: string;
  name: string;
  price: number;
  category?: string;
  description?: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

// API エラーレスポンス
export interface ApiError {
  error: string;
  details?: string;
}

// API 共通レスポンス型
export interface ApiResponse<T> {
  data?: T;
  error?: string;
}
