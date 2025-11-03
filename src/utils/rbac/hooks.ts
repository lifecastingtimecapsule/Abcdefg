/**
 * RBAC - React Hooks
 * 権限チェック用のカスタムフック
 */

import { useMemo } from 'react';
import { User } from '../../types';
import {
  Permission,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  isAdmin,
  isStaff,
  canAccessRoute,
  canEditWorkOrder,
  canViewIncentive,
} from './permissions';

/**
 * 現在のユーザーの権限を管理するフック
 */
export function usePermissions(user: User | null) {
  return useMemo(() => ({
    // 単一権限チェック
    can: (permission: Permission) => hasPermission(user, permission),
    
    // いずれかの権限チェック
    canAny: (permissions: Permission[]) => hasAnyPermission(user, permissions),
    
    // すべての権限チェック
    canAll: (permissions: Permission[]) => hasAllPermissions(user, permissions),
    
    // ロールチェック
    isAdmin: () => isAdmin(user),
    isStaff: () => isStaff(user),
    
    // ルートアクセスチェック
    canAccessRoute: (path: string) => canAccessRoute(user, path),
    
    // 制作物編集権限チェック
    canEditWorkOrder: (workOrder: { assigned_staff_id?: string }) => 
      canEditWorkOrder(user, workOrder),
    
    // インセンティブ閲覧権限チェック
    canViewIncentive: (incentive: { staff_id: string }) => 
      canViewIncentive(user, incentive),
  }), [user]);
}

/**
 * 特定の権限を持っているかチェックするフック
 */
export function useHasPermission(user: User | null, permission: Permission): boolean {
  return useMemo(() => hasPermission(user, permission), [user, permission]);
}

/**
 * 管理者かどうかチェックするフック
 */
export function useIsAdmin(user: User | null): boolean {
  return useMemo(() => isAdmin(user), [user]);
}

/**
 * スタッフかどうかチェックするフック
 */
export function useIsStaff(user: User | null): boolean {
  return useMemo(() => isStaff(user), [user]);
}
