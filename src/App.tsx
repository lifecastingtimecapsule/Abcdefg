import { useEffect, useState } from 'react';
import { Toaster } from 'sonner@2.0.3';
import { LoginPage } from './components/LoginPage';
import { PublicReservationPage } from './components/PublicReservationPage';
import { ReservationCompletePage } from './components/ReservationCompletePage';
import { ReauthModal } from './components/ReauthModal';
import { Layout } from './components/Layout';
import { MustChangePasswordModal } from './components/MustChangePasswordModal';
import { CalendarPage } from './components/CalendarPage';
import { CustomersPage } from './components/CustomersPage';
import { WorkOrdersPage } from './components/WorkOrdersPage';
import { SalesIncentivesPage } from './components/SalesIncentivesPage';
import { OperationsPage } from './components/OperationsPage';
import { apiRequest, setUnauthorizedCallback } from './utils/api';
import { prefetchAfterLogin } from './utils/calendarCache';
import { User, MeResponse } from './types';

export default function App() {
  const [currentRoute, setCurrentRoute] = useState(window.location.pathname);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState('calendar');
  const [showReauthModal, setShowReauthModal] = useState(false);

  useEffect(() => {
    const handlePopState = () => setCurrentRoute(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    setUnauthorizedCallback(() => {
      setShowReauthModal(true);
    });
    
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('access_token');
      
      if (!token) {
        await tryInitializeSystem();
        setIsAuthenticated(false);
        setCurrentUser(null);
        setLoading(false);
        return;
      }

      const cachedUserRaw = localStorage.getItem('cached_user');
      if (cachedUserRaw) {
        try {
          const cachedUser = JSON.parse(cachedUserRaw) as User;
          setCurrentUser(cachedUser);
          setIsAuthenticated(true);
          setLoading(false);
          apiRequest<MeResponse>('/me').then((userData) => {
            setCurrentUser(userData.user);
            localStorage.setItem('cached_user', JSON.stringify(userData.user));
          }).catch((err: any) => {
            if (err?.message === 'UNAUTHORIZED') setShowReauthModal(true);
          });
          return;
        } catch { /* invalid cache, fall through */ }
      }

      const userData = await apiRequest<MeResponse>('/me');
      setCurrentUser(userData.user);
      localStorage.setItem('cached_user', JSON.stringify(userData.user));
      setIsAuthenticated(true);
    } catch (err: any) {
      if (err?.message === 'UNAUTHORIZED') {
        setShowReauthModal(true);
      } else {
        localStorage.removeItem('access_token');
        localStorage.removeItem('cached_user');
        setIsAuthenticated(false);
        setCurrentUser(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const tryInitializeSystem = async () => {
    try {
      const { projectId, publicAnonKey } = await import('./utils/supabase/info');
      const apiUrl = `https://${projectId}.supabase.co/functions/v1/make-server-fe84bde0/initialize`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${publicAnonKey}` },
      });
      if (response.ok) {
        const data = await response.json();
        if (!data.already_initialized && data.success) {
          console.log('[Init] システムを初期化しました');
        }
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('[Init] 初期化エラー:', errorData.error || errorData);
      }
    } catch (err: any) {
      console.error('[Init] ネットワークエラー:', err?.message || err);
    }
  };

  const handleLogin = async (initialUser?: User) => {
    if (initialUser) {
      setCurrentUser(initialUser);
      setIsAuthenticated(true);
      setLoading(false);
      localStorage.setItem('cached_user', JSON.stringify(initialUser));
      // ログイン直後にアクセス可能ロケーションを取得してプリフェッチ開始
      apiRequest('/me/locations').then((data: any) => {
        const locationIds: string[] = (data.locations ?? []).map((l: any) => l.location_id);
        prefetchAfterLogin(locationIds);
      }).catch(() => {});
      return;
    }
    await checkAuth();
    // 既存トークンでの認証後もプリフェッチ開始
    apiRequest('/me/locations').then((data: any) => {
      const locationIds: string[] = (data.locations ?? []).map((l: any) => l.location_id);
      prefetchAfterLogin(locationIds);
    }).catch(() => {});
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('cached_user');
    setIsAuthenticated(false);
    setCurrentUser(null);
    setCurrentPage('calendar');
    setShowReauthModal(false);
  };

  const handleReauthSuccess = async (token: string) => {
    setShowReauthModal(false);
    // ??E????E?????E???????E????E????
    await checkAuth();
  };

  const handleReauthCancel = () => {
    setShowReauthModal(false);
    handleLogout();
  };

  // ???E???E?????E??E
  if (currentRoute === '/reservation' || currentRoute === '/yoyaku' || currentRoute === '/public/reservation') {
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
        <PublicReservationPage />
      </>
    );
  }

  if (currentRoute.startsWith('/public/reservation/complete')) {
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
        <ReservationCompletePage />
      </>
    );
  }



  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  // 未認証時: / または /login または /admin-sys-login ならログイン画面、それ以外は公開予約へ
  if (!isAuthenticated) {
    const showLogin = currentRoute === '/' || currentRoute === '/login' || currentRoute === '/admin-sys-login';
    if (!showLogin) {
      window.history.pushState({}, '', '/reservation');
      setCurrentRoute('/reservation');
      return null;
    }
    return <LoginPage onLogin={handleLogin} />;
  }

  const renderPage = () => {
    if (!currentUser) return <CalendarPage userRole="staff" />;
    
    const hasAccess = () => {
      if (currentPage === 'operations' && currentUser.role !== 'admin') return false;
      if (currentPage === 'sales-incentives' && currentUser.role !== 'admin') return false;
      return true;
    };

    if (!hasAccess()) {
      setTimeout(() => setCurrentPage('calendar'), 0);
      return <CalendarPage userRole={currentUser.role} />;
    }
    
    switch (currentPage) {
      case 'calendar':
        return <CalendarPage userRole={currentUser.role} />;
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
        return <CalendarPage userRole={currentUser.role} />;
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
      {/* ????????????????????????????????????E?? */}
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
