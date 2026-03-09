import { ReactNode, useState } from 'react';
import { Calendar, Users, Package, DollarSign, UserCog, LogOut, Menu, X, UtensilsCrossed, TrendingUp, User as UserIcon } from 'lucide-react';
import { createClient } from '../utils/supabase/client';
import { User } from '../types';

interface LayoutProps {
  children: ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
  onLogout: () => void;
  userRole: string;
  currentUser: User | null;
}

export function Layout({ children, currentPage, onNavigate, onLogout, userRole, currentUser }: LayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const formatLastLogin = (dateString: string | undefined) => {
    if (!dateString) return '初回ログイン';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('ja-JP', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Tokyo',
    }).format(date);
  };

  const navSections = [
    {
      items: [
        { id: 'calendar', label: '予約カレンダー', icon: Calendar, roles: ['admin', 'staff'] },
        { id: 'customers', label: '顧客管理', icon: Users, roles: ['admin', 'staff'] },
        { id: 'work-orders', label: '作品管理', icon: Package, roles: ['admin', 'staff'] },
        { id: 'sales-incentives', label: '売上・インセンティブ', icon: TrendingUp, roles: ['admin'] },
        { id: 'operations', label: '運営管理', icon: UserCog, roles: ['admin'] },
      ]
    },
  ];

  const filteredNavSections = navSections
    .map(section => ({
      ...section,
      items: section.items.filter(item => item.roles.includes(userRole))
    }))
    .filter(section => 
      section.items.length > 0 && 
      (!section.roles || section.roles.includes(userRole))
    );

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    localStorage.removeItem('access_token');
    onLogout();
  };

  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden bg-slate-50">
      {/* Mobile header */}
      <div className="lg:hidden bg-white border-b border-slate-200 px-4 py-4 flex items-center justify-between sticky top-0 z-40">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">アマレット</h1>
          <p className="text-xs text-slate-500 mt-0.5">予約管理システム</p>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-3 hover:bg-slate-100 rounded-lg transition touch-manipulation"
          aria-label="メニュー"
        >
          {mobileMenuOpen ? <X className="w-7 h-7" /> : <Menu className="w-7 h-7" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 top-[57px] bg-white z-30 overflow-y-auto">
          <nav className="p-4 space-y-4">
            {/* User info at the top of mobile menu */}
            {currentUser && (
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 mb-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full flex items-center justify-center">
                    <UserIcon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-slate-900">{currentUser.name}</p>
                    <p className="text-xs text-slate-600">
                      {currentUser.role === 'admin' ? '管理者' : 'スタッフ'}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-slate-500">
                  前回ログイン: {formatLastLogin(currentUser.last_login_at)}
                </p>
              </div>
            )}

            {filteredNavSections.map((section, sectionIndex) => (
              <div key={sectionIndex}>
                {section.title && (
                  <div className="px-4 py-2 text-xs text-slate-500 uppercase tracking-wider">
                    {section.title}
                  </div>
                )}
                <div className="space-y-1">
                  {section.items.map(item => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          onNavigate(item.id);
                          setMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-4 px-4 py-4 rounded-xl transition text-left touch-manipulation ${
                          section.title ? 'pl-8' : ''
                        } ${
                          currentPage === item.id
                            ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white'
                            : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <Icon className="w-6 h-6 flex-shrink-0" />
                        <span className="text-base font-medium">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-4 px-4 py-4 rounded-xl text-red-600 hover:bg-red-50 transition mt-4 text-base font-medium touch-manipulation"
            >
              <LogOut className="w-6 h-6 flex-shrink-0" />
              <span>ログアウト</span>
            </button>
          </nav>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden lg:block fixed top-0 left-0 h-full w-64 bg-white border-r border-slate-200 z-30">
        <div className="p-6 border-b border-slate-200">
          <h1 className="text-lg font-semibold text-slate-900">アマレット</h1>
          <p className="text-slate-600 text-sm mt-1">予約管理システム</p>
        </div>

        <nav className="p-4 space-y-1">
          {filteredNavSections.map((section, sectionIndex) => (
            <div key={sectionIndex}>
              {section.title && (
                <div className="px-4 py-2 text-xs text-slate-500 uppercase tracking-wider">
                  {section.title}
                </div>
              )}
              <div className="space-y-1">
                {section.items.map(item => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => onNavigate(item.id)}
                      className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl transition text-left ${
                        section.title ? 'pl-8' : ''
                      } ${
                        currentPage === item.id
                          ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <Icon className="w-5 h-5 flex-shrink-0" />
                      <span className="text-base">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 border-t border-slate-200">
          {/* User info */}
          {currentUser && (
            <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <UserIcon className="w-5 h-5 text-white" />
                </div>
                <div className="overflow-hidden min-w-0">
                  <p className="text-slate-900 text-sm font-medium truncate">{currentUser.name}</p>
                  <p className="text-xs text-slate-600">
                    {currentUser.role === 'admin' ? '管理者' : 'スタッフ'}
                  </p>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                前回: {formatLastLogin(currentUser.last_login_at)}
              </p>
            </div>
          )}
          
          {/* Logout button */}
          <div className="p-4">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl text-red-600 hover:bg-red-50 transition text-base"
            >
              <LogOut className="w-5 h-5 flex-shrink-0" />
              <span>ログアウト</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="lg:ml-64 p-4 lg:p-6 pb-20 lg:pb-6 lg:h-full lg:overflow-y-auto lg:flex lg:flex-col">
        {children}
      </main>
    </div>
  );
}
