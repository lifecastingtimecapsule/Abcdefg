/**
 * RouteGuard - ルートへのアクセスを権限に基づいて制御するコンポーネント
 */

import { ReactNode, useEffect } from 'react';
import { User } from '../../types';
import { canAccessRoute, getRedirectPath } from '../../utils/rbac/permissions';
import { toast } from 'sonner@2.0.3';

interface RouteGuardProps {
  children: ReactNode;
  user: User | null;
  currentPath: string;
  onNavigate: (path: string) => void;
}

/**
 * ルートガード - 権限のないルートへのアクセスをブロック
 * 
 * @example
 * <RouteGuard 
 *   user={currentUser} 
 *   currentPath={currentPage}
 *   onNavigate={setCurrentPage}
 * >
 *   <CurrentPageComponent />
 * </RouteGuard>
 */
export function RouteGuard({ children, user, currentPath, onNavigate }: RouteGuardProps) {
  useEffect(() => {
    // ログインページへのアクセスはチェック不要
    if (currentPath === '/login') return;

    // ユーザーがログインしていない場合
    if (!user) {
      onNavigate('/login');
      return;
    }

    // ルートへのアクセス権限をチェック
    if (!canAccessRoute(user, currentPath)) {
      const redirectPath = getRedirectPath(user);
      
      console.warn(`[RouteGuard] Access denied to ${currentPath}. Redirecting to ${redirectPath}`);
      toast.error('このページへのアクセス権限がありません');
      
      onNavigate(redirectPath);
    }
  }, [user, currentPath, onNavigate]);

  // ユーザーがログインしていない、または権限がない場合は何も表示しない
  if (!user || !canAccessRoute(user, currentPath)) {
    return null;
  }

  return <>{children}</>;
}
