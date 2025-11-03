import { useEffect, useState } from 'react';
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
import { apiRequest, setUnauthorizedCallback } from './utils/api';
import { User, MeResponse } from './types';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [showReauthModal, setShowReauthModal] = useState(false);

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

  const renderPage = () => {
    if (!currentUser) return <Dashboard onNavigate={setCurrentPage} />;
    
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard onNavigate={setCurrentPage} />;
      case 'calendar':
        return <CalendarPage userRole={currentUser.role} />;
      case 'customers':
        return <CustomersPage />;
      case 'work-orders':
        return <WorkOrdersPage />;
      case 'sales-incentives':
        return <SalesIncentivesPage 
          userRole={currentUser.role}
          userId={currentUser.user_id}
          onReauthRequest={() => setShowReauthModal(true)} 
        />;
      case 'operations':
        return currentUser.role === 'admin' ? 
          <OperationsPage 
            userRole={currentUser.role} 
            onReauthRequest={() => setShowReauthModal(true)} 
          /> : <Dashboard onNavigate={setCurrentPage} />;
      default:
        return <Dashboard onNavigate={setCurrentPage} />;
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
      >
        {renderPage()}
      </Layout>
    </>
  );
}
