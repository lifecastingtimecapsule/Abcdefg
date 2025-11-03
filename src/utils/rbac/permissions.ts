/**
 * RBAC - ロールベースアクセス制御
 * 権限定義と権限チェックユーティリティ
 */

import { User } from '../../types';

// ============================================
// ロール定義
// ============================================

export type Role = 'admin' | 'staff';

export const ROLES = {
  ADMIN: 'admin' as Role,
  STAFF: 'staff' as Role,
} as const;

// ============================================
// 権限（パーミッション）定義
// ============================================

export enum Permission {
  // ダッシュボード
  VIEW_DASHBOARD = 'view_dashboard',

  // 顧客管理
  VIEW_CUSTOMERS = 'view_customers',
  CREATE_CUSTOMER = 'create_customer',
  EDIT_CUSTOMER = 'edit_customer',
  DELETE_CUSTOMER = 'delete_customer',

  // 予約管理
  VIEW_RESERVATIONS = 'view_reservations',
  CREATE_RESERVATION = 'create_reservation',
  EDIT_RESERVATION = 'edit_reservation',
  DELETE_RESERVATION = 'delete_reservation',
  CANCEL_RESERVATION = 'cancel_reservation',

  // 制作物管理
  VIEW_WORK_ORDERS = 'view_work_orders',
  CREATE_WORK_ORDER = 'create_work_order',
  EDIT_WORK_ORDER = 'edit_work_order',
  DELETE_WORK_ORDER = 'delete_work_order',
  ASSIGN_WORK_ORDER = 'assign_work_order',

  // インセンティブ管理
  VIEW_INCENTIVES = 'view_incentives',
  VIEW_OWN_INCENTIVES = 'view_own_incentives',
  EDIT_INCENTIVES = 'edit_incentives',
  LOCK_INCENTIVES = 'lock_incentives',

  // 売上分析
  VIEW_SALES_ANALYTICS = 'view_sales_analytics',
  EXPORT_SALES_DATA = 'export_sales_data',

  // スタッフ管理
  VIEW_STAFF = 'view_staff',
  CREATE_STAFF = 'create_staff',
  EDIT_STAFF = 'edit_staff',
  DELETE_STAFF = 'delete_staff',
  MANAGE_STAFF_ROLES = 'manage_staff_roles',

  // 設定管理
  VIEW_SETTINGS = 'view_settings',
  EDIT_MENU_SETTINGS = 'edit_menu_settings',
  EDIT_LOCATION_SETTINGS = 'edit_location_settings',
  EDIT_SYSTEM_SETTINGS = 'edit_system_settings',

  // カレンダー
  VIEW_CALENDAR = 'view_calendar',
}

// ============================================
// ロール別権限マッピング
// ============================================

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    // すべての権限
    Permission.VIEW_DASHBOARD,
    Permission.VIEW_CUSTOMERS,
    Permission.CREATE_CUSTOMER,
    Permission.EDIT_CUSTOMER,
    Permission.DELETE_CUSTOMER,
    Permission.VIEW_RESERVATIONS,
    Permission.CREATE_RESERVATION,
    Permission.EDIT_RESERVATION,
    Permission.DELETE_RESERVATION,
    Permission.CANCEL_RESERVATION,
    Permission.VIEW_WORK_ORDERS,
    Permission.CREATE_WORK_ORDER,
    Permission.EDIT_WORK_ORDER,
    Permission.DELETE_WORK_ORDER,
    Permission.ASSIGN_WORK_ORDER,
    Permission.VIEW_INCENTIVES,
    Permission.VIEW_OWN_INCENTIVES,
    Permission.EDIT_INCENTIVES,
    Permission.LOCK_INCENTIVES,
    Permission.VIEW_SALES_ANALYTICS,
    Permission.EXPORT_SALES_DATA,
    Permission.VIEW_STAFF,
    Permission.CREATE_STAFF,
    Permission.EDIT_STAFF,
    Permission.DELETE_STAFF,
    Permission.MANAGE_STAFF_ROLES,
    Permission.VIEW_SETTINGS,
    Permission.EDIT_MENU_SETTINGS,
    Permission.EDIT_LOCATION_SETTINGS,
    Permission.EDIT_SYSTEM_SETTINGS,
    Permission.VIEW_CALENDAR,
  ],
  staff: [
    // スタッフの権限（閲覧と基本操作のみ）
    Permission.VIEW_DASHBOARD,
    Permission.VIEW_CUSTOMERS,
    Permission.CREATE_CUSTOMER,
    Permission.EDIT_CUSTOMER,
    Permission.VIEW_RESERVATIONS,
    Permission.CREATE_RESERVATION,
    Permission.EDIT_RESERVATION,
    Permission.CANCEL_RESERVATION,
    Permission.VIEW_WORK_ORDERS,
    Permission.EDIT_WORK_ORDER, // 自分に割り当てられた制作物のステータス更新
    Permission.VIEW_OWN_INCENTIVES, // 自分のインセンティブのみ閲覧可能
    Permission.VIEW_CALENDAR,
  ],
};

// ============================================
// 権限チェック関数
// ============================================

/**
 * ユーザーが指定された権限を持っているかチェック
 */
export function hasPermission(user: User | null, permission: Permission): boolean {
  if (!user) return false;
  
  const userRole = user.role as Role;
  const permissions = ROLE_PERMISSIONS[userRole];
  
  return permissions.includes(permission);
}

/**
 * ユーザーが指定された権限のいずれかを持っているかチェック
 */
export function hasAnyPermission(user: User | null, permissions: Permission[]): boolean {
  if (!user) return false;
  
  return permissions.some(permission => hasPermission(user, permission));
}

/**
 * ユーザーが指定された権限をすべて持っているかチェック
 */
export function hasAllPermissions(user: User | null, permissions: Permission[]): boolean {
  if (!user) return false;
  
  return permissions.every(permission => hasPermission(user, permission));
}

/**
 * 管理者かどうかチェック
 */
export function isAdmin(user: User | null): boolean {
  if (!user) return false;
  return user.role === ROLES.ADMIN;
}

/**
 * スタッフかどうかチェック
 */
export function isStaff(user: User | null): boolean {
  if (!user) return false;
  return user.role === ROLES.STAFF;
}

/**
 * 特定のユーザー自身かどうかチェック
 */
export function isSelf(user: User | null, targetUserId: string): boolean {
  if (!user) return false;
  return user.user_id === targetUserId;
}

/**
 * 制作物の編集権限チェック（自分に割り当てられているか、または管理者か）
 */
export function canEditWorkOrder(user: User | null, workOrder: { assigned_staff_id?: string }): boolean {
  if (!user) return false;
  
  // 管理者は常に編集可能
  if (isAdmin(user)) return true;
  
  // スタッフは自分に割り当てられた制作物のみ編集可能
  if (isStaff(user) && workOrder.assigned_staff_id === user.user_id) {
    return hasPermission(user, Permission.EDIT_WORK_ORDER);
  }
  
  return false;
}

/**
 * インセンティブの閲覧権限チェック（自分のもの、または管理者か）
 */
export function canViewIncentive(user: User | null, incentive: { staff_id: string }): boolean {
  if (!user) return false;
  
  // 管理者はすべて閲覧可能
  if (isAdmin(user) && hasPermission(user, Permission.VIEW_INCENTIVES)) {
    return true;
  }
  
  // スタッフは自分のインセンティブのみ閲覧可能
  if (isSelf(user, incentive.staff_id) && hasPermission(user, Permission.VIEW_OWN_INCENTIVES)) {
    return true;
  }
  
  return false;
}

// ============================================
// ルート権限マッピング
// ============================================

export const ROUTE_PERMISSIONS: Record<string, Permission[]> = {
  '/': [Permission.VIEW_DASHBOARD],
  '/dashboard': [Permission.VIEW_DASHBOARD],
  '/customers': [Permission.VIEW_CUSTOMERS],
  '/calendar': [Permission.VIEW_CALENDAR],
  '/work-orders': [Permission.VIEW_WORK_ORDERS],
  '/incentives': [Permission.VIEW_INCENTIVES, Permission.VIEW_OWN_INCENTIVES], // どちらかがあればOK
  '/sales-analytics': [Permission.VIEW_SALES_ANALYTICS],
  '/staff': [Permission.VIEW_STAFF],
  '/settings/menu': [Permission.VIEW_SETTINGS],
  '/settings/locations': [Permission.VIEW_SETTINGS],
  '/operations': [Permission.VIEW_DASHBOARD], // 業務フローは基本的にすべてのユーザーが閲覧可能
};

/**
 * ルートへのアクセス権限チェック
 */
export function canAccessRoute(user: User | null, path: string): boolean {
  if (!user) return false;
  
  const requiredPermissions = ROUTE_PERMISSIONS[path];
  
  // ルートが定義されていない場合は、ログイン済みであればアクセス可能
  if (!requiredPermissions) return true;
  
  // いずれかの権限があればアクセス可能
  return hasAnyPermission(user, requiredPermissions);
}

/**
 * アクセス拒否時のリダイレクト先を取得
 */
export function getRedirectPath(user: User | null): string {
  if (!user) return '/login';
  
  // スタッフの場合、最初にアクセス可能なページにリダイレクト
  if (isStaff(user)) {
    // スタッフはダッシュボードにアクセス可能
    if (hasPermission(user, Permission.VIEW_DASHBOARD)) return '/';
    if (hasPermission(user, Permission.VIEW_CALENDAR)) return '/calendar';
    if (hasPermission(user, Permission.VIEW_CUSTOMERS)) return '/customers';
  }
  
  // デフォルトはダッシュボード
  return '/';
}
