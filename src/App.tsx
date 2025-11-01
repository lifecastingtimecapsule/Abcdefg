import { useEffect, useState } from 'react';
import { LoginPage } from './components/LoginPage';
import { InitializePage } from './components/InitializePage';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { ReservationsPage } from './components/ReservationsPage';
import { CustomersPage } from './components/CustomersPage';
import { WorkOrdersPage } from './components/WorkOrdersPage';
import { IncentivesPage } from './components/IncentivesPage';
import { StaffManagementPage } from './components/StaffManagementPage';
import { LocationsPage } from './components/LocationsPage';
import { apiRequest } from './utils/api';
import { createClient } from './utils/supabase/client';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [showInitialize, setShowInitialize] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      
      if (data.session?.access_token) {
        localStorage.setItem('access_token', data.session.access_token);
        const userData = await apiRequest('/me');
        setCurrentUser(userData.user);
        setIsAuthenticated(true);
      }
    } catch (err) {
      console.error('Auth check error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    await checkAuth();
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentUser(null);
    setCurrentPage('dashboard');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    if (showInitialize) {
      return <InitializePage onComplete={() => setShowInitialize(false)} />;
    }
    return <LoginPage onLogin={handleLogin} onShowInitialize={() => setShowInitialize(true)} />;
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'reservations':
        return <ReservationsPage userRole={currentUser.role} />;
      case 'customers':
        return <CustomersPage />;
      case 'work-orders':
        return <WorkOrdersPage />;
      case 'incentives':
        return <IncentivesPage userRole={currentUser.role} userId={currentUser.user_id} />;
      case 'staff':
        return currentUser.role === 'admin' ? <StaffManagementPage /> : <Dashboard />;
      case 'locations':
        return currentUser.role === 'admin' ? <LocationsPage /> : <Dashboard />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <Layout
      currentPage={currentPage}
      onNavigate={setCurrentPage}
      onLogout={handleLogout}
      userRole={currentUser.role}
    >
      {renderPage()}
    </Layout>
  );
}
