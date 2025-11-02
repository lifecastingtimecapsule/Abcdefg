import { ReactNode, useState } from 'react';
import { LayoutDashboard, Calendar, Users, Package, DollarSign, UserCog, MapPin, LogOut, Menu, X, UtensilsCrossed } from 'lucide-react';
import { createClient } from '../utils/supabase/client';

interface LayoutProps {
  children: ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
  onLogout: () => void;
  userRole: string;
}

export function Layout({ children, currentPage, onNavigate, onLogout, userRole }: LayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { id: 'dashboard', label: 'ダッシュボード', icon: LayoutDashboard, roles: ['admin', 'staff'] },
    { id: 'calendar', label: 'カレンダー', icon: Calendar, roles: ['admin', 'staff'] },
    { id: 'customers', label: '顧客管理', icon: Users, roles: ['admin', 'staff'] },
    { id: 'work-orders', label: '納期管理', icon: Package, roles: ['admin', 'staff'] },
    { id: 'incentives', label: 'インセンティブ', icon: DollarSign, roles: ['admin', 'staff'] },
    { id: 'staff', label: 'スタッフ管理', icon: UserCog, roles: ['admin'] },
    { id: 'locations', label: '拠点管理', icon: MapPin, roles: ['admin'] },
    { id: 'menu-settings', label: 'メニュー設定', icon: UtensilsCrossed, roles: ['admin'] },
  ];

  const filteredNavItems = navItems.filter(item => item.roles.includes(userRole));

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    localStorage.removeItem('access_token');
    onLogout();
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile header */}
      <div className="lg:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <h1 className="text-slate-900">アマレット</h1>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 hover:bg-slate-100 rounded-lg transition"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 top-[57px] bg-white z-30 overflow-y-auto">
          <nav className="p-4 space-y-2">
            {filteredNavItems.map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onNavigate(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition ${
                    currentPage === item.id
                      ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-600 hover:bg-red-50 transition"
            >
              <LogOut className="w-5 h-5" />
              <span>ログアウト</span>
            </button>
          </nav>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden lg:block fixed top-0 left-0 h-full w-64 bg-white border-r border-slate-200 z-30">
        <div className="p-6 border-b border-slate-200">
          <h1 className="text-slate-900">アマレット</h1>
          <p className="text-slate-600 text-sm mt-1">管理システム</p>
        </div>

        <nav className="p-4 space-y-2">
          {filteredNavItems.map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition ${
                  currentPage === item.id
                    ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-200">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-600 hover:bg-red-50 transition"
          >
            <LogOut className="w-5 h-5" />
            <span>ログアウト</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="lg:ml-64 p-4 lg:p-8 pb-20 lg:pb-8">
        {children}
      </main>
    </div>
  );
}
