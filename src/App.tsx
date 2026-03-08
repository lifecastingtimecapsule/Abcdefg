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
import { User, MeResponse } from './types';

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
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState('calendar');
  const [showReauthModal, setShowReauthModal] = useState(false);

  // URL???E???????E
  useEffect(() => {
    console.log('[App] ?????E', window.location.pathname);
    
    const handlePopState = () => {
      console.log('[App] ?????:', window.location.pathname);
      setCurrentRoute(window.location.pathname);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    // 401?????E???????????E?????????E?E
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
        setLoading(false);
        return;
      }

      const userData = await apiRequest<MeResponse>('/me');
      setCurrentUser(userData.user);
      setIsAuthenticated(true);
    } catch (err: any) {
      if (err?.message === 'UNAUTHORIZED') {
        console.log('[Auth] Re-authentication required');
      } else {
        localStorage.removeItem('access_token');
        createClient().auth.signOut();
        setIsAuthenticated(false);
        setCurrentUser(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const tryInitializeSystem = async () => {
    try {
      // ???E??????????????????????E???????E?E
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
          console.log('????????????????');
        } else {
          console.log('?????????????', data);
        }
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error(`?????? (${response.status}):`, errorData.error || errorData);
      }
    } catch (err: any) {
      console.error('?????? (Network/Exception):', err?.message || err);
      // Network errors are often not critical for initialization check
      // The system might already be initialized
    }
  };

  const handleLogin = async (initialUser?: User) => {
    if (initialUser) {
      setCurrentUser(initialUser);
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
    if (!currentUser) return <CalendarPage userRole="staff" />;
    
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
