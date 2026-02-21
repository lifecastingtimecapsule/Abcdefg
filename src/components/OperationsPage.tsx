import { LocationsPage } from './LocationsPage';
import { StaffManagementPage } from './StaffManagementPageEnhanced';
import { MenuSettingsPage } from './MenuSettingsPage';
import { ReservationSettingsPage } from './ReservationSettingsPage';
import { LocationAvailabilityPage } from './LocationAvailabilityPage';
import { SystemMaintenancePage } from './SystemMaintenancePage';
import { LocationPermissionsPage } from './LocationPermissionsPage';
import { MapPin, Users, UtensilsCrossed, CalendarClock, Store, Wrench, ShieldCheck } from 'lucide-react';

interface OperationsPageProps {
  userRole: string;
  onReauthRequest: () => void;
}

const SECTIONS: { id: string; label: string; icon: React.ComponentType<{ className?: string }>; description: string; adminOnly?: boolean }[] = [
  { id: 'locations', label: '拠点管理', icon: MapPin, description: '店舗・拠点の追加・編集' },
  { id: 'staff', label: 'スタッフ管理', icon: Users, description: 'ログインアカウントの管理' },
  { id: 'permissions', label: '権限管理', icon: ShieldCheck, description: 'スタッフの店舗閲覧権限を管理', adminOnly: true },
  { id: 'menu', label: 'メニュー設定', icon: UtensilsCrossed, description: 'メニューと料金・提供店舗' },
  { id: 'reservation-settings', label: '予約受付設定', icon: CalendarClock, description: '営業日・営業時間・休業日' },
  { id: 'location-availability', label: '店舗別予約可能日', icon: Store, description: '店舗ごとの定休日・営業時間' },
  { id: 'maintenance', label: 'メンテナンス', icon: Wrench, description: '整合性チェック・初期パスワード' },
];

export function OperationsPage({ userRole, onReauthRequest }: OperationsPageProps) {
  return (
    <div className="flex flex-col min-h-0 flex-1">
      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="space-y-10 pb-8">
          {SECTIONS.filter(s => !s.adminOnly || userRole === 'admin').map((section) => {
            const Icon = section.icon;
            return (
              <section key={section.id} id={section.id} className="scroll-mt-4">
                <div className="flex items-center gap-2 mb-4">
                  <Icon className="w-5 h-5 text-slate-500" />
                  <h2 className="text-xl font-semibold text-slate-900">{section.label}</h2>
                </div>
                <p className="text-sm text-slate-600 mb-4">{section.description}</p>
                <div>
                  {section.id === 'locations' && <LocationsPage />}
                  {section.id === 'staff' && <StaffManagementPage />}
                  {section.id === 'permissions' && <LocationPermissionsPage />}
                  {section.id === 'menu' && <MenuSettingsPage />}
                  {section.id === 'reservation-settings' && <ReservationSettingsPage />}
                  {section.id === 'location-availability' && <LocationAvailabilityPage />}
                  {section.id === 'maintenance' && <SystemMaintenancePage />}
                </div>
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}
