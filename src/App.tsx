import { useEffect, useState } from 'react';
import { LoginPage } from './components/LoginPage';
import { InitializePage } from './components/InitializePage';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { CalendarPage } from './components/CalendarPage';
import { CustomersPage } from './components/CustomersPage';
import { WorkOrdersPage } from './components/WorkOrdersPage';
import { IncentivesPage } from './components/IncentivesPage';
import { StaffManagementPage } from './components/StaffManagementPage';
import { LocationsPage } from './components/LocationsPage';
import { MenuSettingsPage } from './components/MenuSettingsPage';
import { apiRequest } from './utils/api';

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
      const token = localStorage.getItem('access_token');
      console.log('Checking auth, token exists:', !!token);
      console.log('Token length:', token?.length);
      console.log('Token preview:', token?.substring(0, 20) + '...');
      
      if (!token) {
        console.log('No token found, user not authenticated');
        setIsAuthenticated(false);
        setCurrentUser(null);
        setLoading(false);
        return;
      }

      console.log('Fetching user data with token...');
      const userData = await apiRequest('/me');
      console.log('User data received:', userData);
      setCurrentUser(userData.user);
      setIsAuthenticated(true);
    } catch (err) {
      console.error('Auth check error:', err);
      localStorage.removeItem('access_token');
      setIsAuthenticated(false);
      setCurrentUser(null);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    console.log('handleLogin called, checking token after login...');
    const token = localStorage.getItem('access_token');
    console.log('Token immediately after login:', !!token);
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
    if (showInitialize) {
      return <InitializePage onComplete={() => setShowInitialize(false)} />;
    }
    return <LoginPage onLogin={handleLogin} onShowInitialize={() => setShowInitialize(true)} />;
  }

  const renderPage = () => {
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
      userRole={currentUser.role}
    >
      {renderPage()}
    </Layout>
  );
}
