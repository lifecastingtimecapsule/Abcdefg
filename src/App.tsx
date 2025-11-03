import { useEffect, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Toaster } from 'sonner@2.0.3';
import { LoginPage } from './components/LoginPage';
import { ReauthModal } from './components/ReauthModal';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { CalendarPage } from './components/CalendarPage';
import { CustomersPage } from './components/CustomersPage';
import { WorkOrdersPage } from './components/WorkOrdersPage';
import { SalesIncentivesPage } from './components/SalesIncentivesPage';
import { OperationsPage } from './components/OperationsPage';
import { RouteGuard } from './components/rbac/RouteGuard';
import { apiRequest, setUnauthorizedCallback } from './utils/api/client';
import { API_ENDPOINTS } from './utils/api/endpoints';
import { queryClient } from './utils/queryClient';
import { User, MeResponse } from './types';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [showReauthModal, setShowReauthModal] = useState(false);

  useEffect(() => {
    // 401エラー時のコールバックを設定（ログイン済みの場合のみ再認証モーダル表示）
    setUnauthorizedCallback(() => {
      // ログイン済みの場合のみ再認証モーダルを表示
      if (isAuthenticated) {
        setShowReauthModal(true);
      }
    });
    
    checkAuth();
  }, [isAuthenticated]);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('access_token');
      
      if (!token) {
        setIsAuthenticated(false);
        setCurrentUser(null);
        setLoading(false);
        return;
      }

      const userData = await apiRequest<MeResponse>(API_ENDPOINTS.auth.me);
      setCurrentUser(userData.user);
      setIsAuthenticated(true);
    } catch (err: any) {
      // UNAUTHORIZEDエラーの場合は、ログアウト状態にする
      console.log('[Auth] Authentication failed:', err.message);
      localStorage.removeItem('access_token');
      setIsAuthenticated(false);
      setCurrentUser(null);
    } finally {
      setLoading(false);
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage onLogin={handleLogin} />;
  }

  const getRoutePath = (page: string): string => {
    const routeMap: Record<string, string> = {
      'dashboard': '/',
      'calendar': '/calendar',
      'customers': '/customers',
      'work-orders': '/work-orders',
      'sales-incentives': '/incentives',
      'operations': '/operations',
    };
    return routeMap[page] || '/';
  };

  const renderPage = () => {
    if (!currentUser) return <Dashboard onNavigate={setCurrentPage} />;
    
    const currentPath = getRoutePath(currentPage);
    
    // RouteGuardで権限チェック
    return (
      <RouteGuard 
        user={currentUser} 
        currentPath={currentPath}
        onNavigate={(path) => {
          // パスからページ名に変換
          const pageMap: Record<string, string> = {
            '/': 'dashboard',
            '/dashboard': 'dashboard',
            '/calendar': 'calendar',
            '/customers': 'customers',
            '/work-orders': 'work-orders',
            '/incentives': 'sales-incentives',
            '/operations': 'operations',
          };
          setCurrentPage(pageMap[path] || 'dashboard');
        }}
      >
        {(() => {
          switch (currentPage) {
            case 'dashboard':
              return <Dashboard onNavigate={setCurrentPage} />;
            case 'calendar':
              return <CalendarPage userRole={currentUser.role} currentUser={currentUser} />;
            case 'customers':
              return <CustomersPage userRole={currentUser.role} currentUser={currentUser} />;
            case 'work-orders':
              return <WorkOrdersPage currentUser={currentUser} />;
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
              return <Dashboard onNavigate={setCurrentPage} />;
          }
        })()}
      </RouteGuard>
    );
  };

  return (
    <QueryClientProvider client={queryClient}>
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
      >
        {renderPage()}
      </Layout>
      {/* 開発環境用：React Query Devtools */}
      <ReactQueryDevtools initialIsOpen={false} position="bottom-right" />
    </QueryClientProvider>
  );
}
