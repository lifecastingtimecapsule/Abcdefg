/**
 * PermissionGate - 権限に基づいて子要素の表示を制御するコンポーネント
 */

import { ReactNode } from 'react';
import { User } from '../../types';
import { Permission, hasPermission, hasAnyPermission, hasAllPermissions } from '../../utils/rbac/permissions';

interface PermissionGateProps {
  children: ReactNode;
  user: User | null;
  
  // 単一権限チェック
  permission?: Permission;
  
  // 複数権限チェック（いずれかがあればOK）
  anyPermissions?: Permission[];
  
  // 複数権限チェック（すべて必要）
  allPermissions?: Permission[];
  
  // 権限がない場合に表示する内容（オプション）
  fallback?: ReactNode;
}

/**
 * 権限に基づいて子要素を条件付きレンダリングするコンポーネント
 * 
 * @example
 * <PermissionGate user={currentUser} permission={Permission.CREATE_CUSTOMER}>
 *   <button>顧客を追加</button>
 * </PermissionGate>
 * 
 * @example
 * <PermissionGate 
 *   user={currentUser} 
 *   anyPermissions={[Permission.VIEW_INCENTIVES, Permission.VIEW_OWN_INCENTIVES]}
 * >
 *   <IncentivesTable />
 * </PermissionGate>
 */
export function PermissionGate({
  children,
  user,
  permission,
  anyPermissions,
  allPermissions,
  fallback = null,
}: PermissionGateProps) {
  // 権限チェック
  let hasRequiredPermission = false;

  if (permission) {
    hasRequiredPermission = hasPermission(user, permission);
  } else if (anyPermissions) {
    hasRequiredPermission = hasAnyPermission(user, anyPermissions);
  } else if (allPermissions) {
    hasRequiredPermission = hasAllPermissions(user, allPermissions);
  } else {
    // 権限指定がない場合は、ログインしていればOK
    hasRequiredPermission = user !== null;
  }

  if (!hasRequiredPermission) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

interface RoleGateProps {
  children: ReactNode;
  user: User | null;
  allowedRoles: ('admin' | 'staff')[];
  fallback?: ReactNode;
}

/**
 * ロールに基づいて子要素を条件付きレンダリングするコンポーネント
 * 
 * @example
 * <RoleGate user={currentUser} allowedRoles={['admin']}>
 *   <AdminPanel />
 * </RoleGate>
 */
export function RoleGate({ children, user, allowedRoles, fallback = null }: RoleGateProps) {
  if (!user || !allowedRoles.includes(user.role)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
