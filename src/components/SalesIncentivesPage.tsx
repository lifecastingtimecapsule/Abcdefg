import { useState } from 'react';
import { SalesAnalyticsPage } from './SalesAnalyticsPage';
import { IncentivesPage } from './IncentivesPage';

interface SalesIncentivesPageProps {
  userRole: string;
  userId: string;
  onReauthRequest: () => void;
}

export function SalesIncentivesPage({ userRole, userId, onReauthRequest }: SalesIncentivesPageProps) {
  const [activeTab, setActiveTab] = useState<'sales' | 'incentives'>(
    userRole === 'admin' ? 'sales' : 'incentives'
  );

  const tabs = [
    { id: 'sales' as const, label: '売上分析', roles: ['admin'] },
    { id: 'incentives' as const, label: 'インセンティブ', roles: ['admin', 'staff'] },
  ];

  const visibleTabs = tabs.filter(tab => tab.roles.includes(userRole));

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="border-b border-slate-200 bg-white rounded-t-2xl">
        <div className="flex gap-1 px-4">
          {visibleTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-3 transition relative ${
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
        {activeTab === 'sales' && userRole === 'admin' && (
          <SalesAnalyticsPage />
        )}
        {activeTab === 'incentives' && (
          <IncentivesPage userRole={userRole} userId={userId} />
        )}
      </div>
    </div>
  );
}
