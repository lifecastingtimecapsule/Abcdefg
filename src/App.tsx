import { useEffect, useState } from 'react';
import { Toaster } from 'sonner@2.0.3';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { LoginPage } from './components/LoginPage';
import { PublicReservationPage } from './components/PublicReservationPage';
import { ReservationCompletePage } from './components/ReservationCompletePage';
import { ReauthModal } from './components/ReauthModal';
import { Layout } from './components/Layout';
import { MustChangePasswordModal } from './components/MustChangePasswordModal';
import { Dashboard } from './components/Dashboard';
import { CalendarPage } from './components/CalendarPage';
import { ShiftManagementPage } from './components/ShiftManagementPage';
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
      const token = localStorage.getItem('access_token');
      
      if (!token) {
        // ??E?????E???????E??????????E
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
      // UNAUTHORIZED???????E??E???????????????E?????????E
      if (err?.message === 'UNAUTHORIZED') {
        // ?????????????E
        console.log('[Auth] Re-authentication required');
      } else {
        // ??E??E???????E?????E
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
    setIsAuthenticated(false);
    setCurrentUser(null);
    setCurrentPage('dashboard');
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
        <SpeedInsights />
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
        <SpeedInsights />
      </>
    );
  }



  if (loading) {
    return (
      <>
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
        </div>
        <SpeedInsights />
      </>
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
    return (
      <>
        <LoginPage onLogin={handleLogin} />
        <SpeedInsights />
      </>
    );
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
      case 'shifts':
        return <ShiftManagementPage />;
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
      <SpeedInsights />
    </>
  );
}
