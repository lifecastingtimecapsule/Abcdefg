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

// 顧客関連
export interface Customer {
  id: string;
  external_customer_number: string;
  parent_name: string;
  child_name: string;
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
  status: '制作中' | 'お渡し待ち' | '引渡し済';
  due_date: string;
  delivery_date?: string;
  assigned_staff_id?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  customer?: Customer;
  assigned_staff?: User;
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
