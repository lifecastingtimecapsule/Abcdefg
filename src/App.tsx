import { useEffect, useState } from 'react';
import { Toaster } from 'sonner@2.0.3';
import { LoginPage } from './components/LoginPage';
import { PublicReservationPage } from './components/PublicReservationPage';
import { ReservationCompletePage } from './components/ReservationCompletePage';
import { ReauthModal } from './components/ReauthModal';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { CalendarPage } from './components/CalendarPage';
import { CustomersPage } from './components/CustomersPage';
import { WorkOrdersPage } from './components/WorkOrdersPage';
import { SalesIncentivesPage } from './components/SalesIncentivesPage';
import { OperationsPage } from './components/OperationsPage';
import { apiRequest, setUnauthorizedCallback } from './utils/api';
import { User, MeResponse } from './types';

export default function App() {
  const [currentRoute, setCurrentRoute] = useState(window.location.pathname);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [showReauthModal, setShowReauthModal] = useState(false);

  // URLルーティングの監視
  useEffect(() => {
    console.log('[App] 初期ルート:', window.location.pathname);
    
    const handlePopState = () => {
      console.log('[App] ルート変更:', window.location.pathname);
      setCurrentRoute(window.location.pathname);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    // 401エラー時のコールバックを設定（再認証モーダル表示）
    setUnauthorizedCallback(() => {
      setShowReauthModal(true);
    });
    
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('access_token');
      
      if (!token) {
        // トークンがない場合、システムの初期化を試みる
        await tryInitializeSystem();
        setIsAuthenticated(false);
        setCurrentUser(null);
        setLoading(false);
        return;
      }

      const userData = await apiRequest<MeResponse>('/me');
      setCurrentUser(userData.user);
      setIsAuthenticated(true);
    } catch (err: any) {
      // UNAUTHORIZEDエラーの場合は、再認証モーダルが既に表示されているので何もしない
      if (err?.message === 'UNAUTHORIZED') {
        // 再認証モーダルが表示される
        console.log('[Auth] Re-authentication required');
      } else {
        // その他のエラーの場合はログアウト
        localStorage.removeItem('access_token');
        setIsAuthenticated(false);
        setCurrentUser(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const tryInitializeSystem = async () => {
    try {
      // システムの初期化を試みる（既に初期化済みの場合はエラーが返る）
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
        console.log('✅ システムが初期化されました', data);
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        if (errorData.error?.includes('既に初期化')) {
          console.log('ℹ️ システムは既に初期化されています');
        } else {
          console.error(`初期化エラー (${response.status}):`, errorData.error || errorData);
        }
      }
    } catch (err: any) {
      console.error('初期化エラー (Network/Exception):', err?.message || err);
      // Network errors are often not critical for initialization check
      // The system might already be initialized
    }
  };

  const handleLogin = async () => {
    await checkAuth();
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    setIsAuthenticated(false);
    setCurrentUser(null);
    setCurrentPage('dashboard');
    setShowReauthModal(false);
  };

  const handleReauthSuccess = async (token: string) => {
    setShowReauthModal(false);
    // トークンを再取得したので、ユーザー情報を再読み込み
    await checkAuth();
  };

  const handleReauthCancel = () => {
    setShowReauthModal(false);
    handleLogout();
  };

  // 公開ページ（認証不要）
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



  // デフォルトルートから公開予約ページへリダイレクト
  if (currentRoute === '/' && !isAuthenticated && !loading) {
    window.history.pushState({}, '', '/reservation');
    setCurrentRoute('/reservation');
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  // スタッフ用ログインページ
  if (!isAuthenticated) {
    // スタッフ用ログインページは /login または /admin-sys-login でアクセス
    if (currentRoute !== '/login' && currentRoute !== '/admin-sys-login') {
      window.history.pushState({}, '', '/reservation');
      setCurrentRoute('/reservation');
      return null;
    }
    return <LoginPage onLogin={handleLogin} />;
  }

  const renderPage = () => {
    if (!currentUser) return <Dashboard onNavigate={setCurrentPage} />;
    
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

    // If no access, silently redirect to dashboard
    if (!hasAccess()) {
      // Use setTimeout to avoid state update during render
      setTimeout(() => setCurrentPage('dashboard'), 0);
      return <Dashboard onNavigate={setCurrentPage} />;
    }
    
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard onNavigate={setCurrentPage} userRole={currentUser.role} />;
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
        return <Dashboard onNavigate={setCurrentPage} userRole={currentUser.role} />;
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
