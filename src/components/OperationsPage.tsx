import { useState } from 'react';
import { LocationsPage } from './LocationsPage';
import { StaffManagementPage } from './StaffManagementPageEnhanced';
import { MenuSettingsPage } from './MenuSettingsPage';
import { ReservationSettingsPage } from './ReservationSettingsPage';
import { LocationAvailabilityPage } from './LocationAvailabilityPage';
import { SystemMaintenancePage } from './SystemMaintenancePage';

interface OperationsPageProps {
  userRole: string;
  onReauthRequest: () => void;
}

export function OperationsPage({ userRole, onReauthRequest }: OperationsPageProps) {
  const [activeTab, setActiveTab] = useState<'locations' | 'staff' | 'menu' | 'reservation-settings' | 'location-availability'>('locations');

  const tabs = [
    { id: 'locations' as const, label: '拠点管理' },
    { id: 'staff' as const, label: 'スタッフ管理' },
    { id: 'menu' as const, label: 'メニュー設定' },
    { id: 'reservation-settings' as const, label: '予約受付設定' },
    { id: 'location-availability' as const, label: '店舗別予約可能日' },
    { id: 'maintenance' as const, label: 'メンテナンス' },
  ];

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="border-b border-slate-200 bg-white rounded-t-2xl">
        <div className="flex gap-1 px-4 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-3 transition relative whitespace-nowrap ${
                activeTab === tab.id
                  ? 'text-blue-600'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'locations' && (
          <LocationsPage />
        )}
        {activeTab === 'staff' && (
          <StaffManagementPage />
        )}
        {activeTab === 'menu' && (
          <MenuSettingsPage />
        )}
        {activeTab === 'reservation-settings' && (
          <ReservationSettingsPage />
        )}
        {activeTab === 'location-availability' && (
          <LocationAvailabilityPage />
        )}
        {activeTab === 'maintenance' && (
          <SystemMaintenancePage />
        )}
      </div>
    </div>
  );
}
