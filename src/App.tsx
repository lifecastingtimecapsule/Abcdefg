import { useEffect, useState } from 'react';
import { LoginPage } from './components/LoginPage';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { CalendarPage } from './components/CalendarPage';
import { CustomersPage } from './components/CustomersPage';
import { WorkOrdersPage } from './components/WorkOrdersPage';
import { IncentivesPage } from './components/IncentivesPage';
import { StaffManagementPage } from './components/StaffManagementPage';
import { LocationsPage } from './components/LocationsPage';
import { MenuSettingsPage } from './components/MenuSettingsPage';
import { apiRequest, setUnauthorizedCallback } from './utils/api';
import { User, MeResponse } from './types';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState('dashboard');

  useEffect(() => {
    // 401エラー時のコールバックを設定
    setUnauthorizedCallback(() => {
      handleLogout();
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
    } catch (err) {
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
    if (!currentUser) return <Dashboard />;
    
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'calendar':
        return <CalendarPage userRole={currentUser.role} />;
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
      case 'menu-settings':
        return currentUser.role === 'admin' ? <MenuSettingsPage /> : <Dashboard />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <Layout
      currentPage={currentPage}
      onNavigate={setCurrentPage}
      onLogout={handleLogout}
      userRole={currentUser?.role || 'staff'}
    >
      {renderPage()}
    </Layout>
  );
}
