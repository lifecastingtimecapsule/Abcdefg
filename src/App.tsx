import { useEffect, useState } from 'react';
import { Toaster } from 'sonner@2.0.3';
import { LoginPage } from './components/LoginPage';
import { ReauthModal } from './components/ReauthModal';
import { Layout } from './components/Layout';
import { MustChangePasswordModal } from './components/MustChangePasswordModal';
import { CalendarPage } from './components/CalendarPage';
import { CustomersPage } from './components/CustomersPage';
import { WorkOrdersPage } from './components/WorkOrdersPage';
import { SalesIncentivesPage } from './components/SalesIncentivesPage';
import { OperationsPage } from './components/OperationsPage';
import { apiRequest, setUnauthorizedCallback, invalidateTokenCache } from './utils/api';
import { functionsBaseUrl, publicAnonKey } from './utils/supabase/info';
import { createClient } from './utils/supabase/client';
import { User, Location, MeResponse } from './types';

// アプリ起動直後に Edge Function をウォームアップ（コールドスタート対策）
const _warmup = (() => {
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 4000);
  fetch(`${functionsBaseUrl}/public/health`, { signal: ac.signal, headers: { Authorization: `Bearer ${publicAnonKey}` } }).catch(() => {});
})();

export default function App() {
  const [currentRoute, setCurrentRoute] = useState(window.location.pathname);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [accessibleLocations, setAccessibleLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState('calendar');
  const [showReauthModal, setShowReauthModal] = useState(false);

  // URL変更検知
  useEffect(() => {
    console.log('[App] 初期パス:', window.location.pathname);

    const handlePopState = () => {
      console.log('[App] ポップステート:', window.location.pathname);
      setCurrentRoute(window.location.pathname);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    // 401発生時の再認証コールバックを設定
    setUnauthorizedCallback(() => {
      setShowReauthModal(true);
    });

    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const { getAccessToken } = await import('./utils/api');
      const token = await getAccessToken();
      if (!token) {
        await tryInitializeSystem();
        setIsAuthenticated(false);
        setCurrentUser(null);
        setAccessibleLocations([]);
        setLoading(false);
        return;
      }

      // /me は v137 から { user, locations } を返す
      const meData = await apiRequest<MeResponse>('/me');
      setCurrentUser(meData.user);
      setAccessibleLocations(meData.locations || []);
      setIsAuthenticated(true);
    } catch (err: any) {
      if (err?.message === 'UNAUTHORIZED') {
        console.log('[Auth] Re-authentication required');
      } else {
        localStorage.removeItem('access_token');
        createClient().auth.signOut();
        setIsAuthenticated(false);
        setCurrentUser(null);
        setAccessibleLocations([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const tryInitializeSystem = async () => {
    try {
      const { projectId, publicAnonKey } = await import('./utils/supabase/info');
      const apiUrl = `https://${projectId}.supabase.co/functions/v1/make-server-fe84bde0/initialize`;

      console.log('[Init] Attempting system initialization...');

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.already_initialized) {
          console.log('システムは既に初期化済み');
        } else {
          console.log('システム初期化完了', data);
        }
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error(`初期化エラー (${response.status}):`, errorData.error || errorData);
      }
    } catch (err: any) {
      console.error('初期化エラー (Network/Exception):', err?.message || err);
    }
  };

  // LoginPage からログイン成功時に呼ばれる。
  // user + locations の両方を受け取ることで checkAuth() の /me 往復を省略する。
  const handleLogin = async (initialData?: { user: User; locations: Location[] }) => {
    if (initialData) {
      setCurrentUser(initialData.user);
      setAccessibleLocations(initialData.locations || []);
      setIsAuthenticated(true);
      setLoading(false);
      return;
    }
    await checkAuth();
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    invalidateTokenCache();
    createClient().auth.signOut();
    setIsAuthenticated(false);
    setCurrentUser(null);
    setAccessibleLocations([]);
    setCurrentPage('calendar');
    setShowReauthModal(false);
  };

  const handleReauthSuccess = async (_token: string) => {
    setShowReauthModal(false);
    // セッションを再取得してユーザー情報を更新
    await checkAuth();
  };

  const handleReauthCancel = () => {
    setShowReauthModal(false);
    handleLogout();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  // 未認証時: ログイン画面を表示
  if (!isAuthenticated) {
    return <LoginPage onLogin={handleLogin} />;
  }

  const renderPage = () => {
    if (!currentUser) return <CalendarPage userRole="staff" initialLocations={accessibleLocations} />;

    // Check if user has access to the current page
    const hasAccess = () => {
      if (currentPage === 'operations' && currentUser.role !== 'admin') {
        return false;
      }
      if (currentPage === 'sales-incentives' && currentUser.role !== 'admin') {
        return false;
      }
      return true;
    };

    // If no access, silently redirect to calendar
    if (!hasAccess()) {
      setTimeout(() => setCurrentPage('calendar'), 0);
      return <CalendarPage userRole={currentUser.role} initialLocations={accessibleLocations} />;
    }

    switch (currentPage) {
      case 'calendar':
        return <CalendarPage userRole={currentUser.role} initialLocations={accessibleLocations} />;
      case 'customers':
        return <CustomersPage userRole={currentUser.role} />;
      case 'work-orders':
        return <WorkOrdersPage />;
      case 'sales-incentives':
        return <SalesIncentivesPage
          userRole={currentUser.role}
          userId={currentUser.user_id}
          onReauthRequest={() => setShowReauthModal(true)}
        />;
      case 'operations':
        return <OperationsPage
          userRole={currentUser.role}
          onReauthRequest={() => setShowReauthModal(true)}
        />;
      default:
        return <CalendarPage userRole={currentUser.role} initialLocations={accessibleLocations} />;
    }
  };

  return (
    <>
      <Toaster
        position="top-center"
        richColors
        closeButton
        toastOptions={{
          duration: 4000,
        }}
      />
      {showReauthModal && (
        <ReauthModal
          onSuccess={handleReauthSuccess}
          onCancel={handleReauthCancel}
        />
      )}
      {/* パスワード変更が必要なユーザーにはモーダルを強制表示 */}
      {currentUser?.must_change_password && (
        <MustChangePasswordModal
          currentUser={currentUser}
          onSuccess={(updatedUser) => setCurrentUser(updatedUser)}
        />
      )}
      <Layout
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        onLogout={handleLogout}
        userRole={currentUser?.role || 'staff'}
        currentUser={currentUser}
      >
        {renderPage()}
      </Layout>
    </>
  );
}
