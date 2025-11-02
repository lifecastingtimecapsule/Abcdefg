import { useEffect, useState } from 'react';
import { apiRequest } from '../utils/api';
import { toast } from 'sonner@2.0.3';
import { DollarSign, Lock, Unlock } from 'lucide-react';

export function IncentivesPage({ userRole, userId }: { userRole: string; userId: string }) {
  const [incentives, setIncentives] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => {
    loadData();
  }, [selectedMonth]);

  const loadData = async () => {
    try {
      setLoading(true);
      const incentiveData = await apiRequest(`/incentives?year_month=${selectedMonth}${userRole !== 'admin' ? `&user_id=${userId}` : ''}`);
      setIncentives(incentiveData.incentives);

      if (userRole === 'admin') {
        try {
          const userData = await apiRequest('/users');
          setUsers(userData.users);
        } catch (err) {
          console.error('Failed to load users:', err);
        }
      }
    } catch (err: any) {
      console.error('Load incentives error:', err);
      toast.error('インセンティブデータの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleLockToggle = async (incentive: any) => {
    if (!window.confirm(`${incentive.locked_flag ? '解除' : 'ロック'}しますか？`)) return;

    try {
      await apiRequest('/incentives/lock', {
        method: 'POST',
        body: JSON.stringify({
          user_id: incentive.user_id,
          year_month: selectedMonth,
          locked_flag: !incentive.locked_flag,
          manual_adjust_yen: incentive.manual_adjust_yen || 0,
        }),
      });

      await loadData();
      toast.success(incentive.locked_flag ? 'ロックを解除しました' : 'ロックしました');
    } catch (err: any) {
      console.error('Lock toggle error:', err);
      toast.error('操作に失敗しました');
    }
  };

  const handleAdjustment = async (incentive: any) => {
    const input = prompt('手動調整額を入力してください（プラスまたはマイナス）:', String(incentive.manual_adjust_yen || 0));
    if (input === null) return;

    const amount = parseInt(input);
    if (isNaN(amount)) {
      toast.error('数値を入力してください');
      return;
    }

    try {
      await apiRequest('/incentives/lock', {
        method: 'POST',
        body: JSON.stringify({
          user_id: incentive.user_id,
          year_month: selectedMonth,
          locked_flag: incentive.locked_flag || false,
          manual_adjust_yen: amount,
        }),
      });

      await loadData();
      toast.success('手動調整額を更新しました');
    } catch (err: any) {
      console.error('Adjustment error:', err);
      toast.error('調整額の更新に失敗しました');
    }
  };

  const getUserName = (userId: string) => {
    const user = users.find(u => u.user_id === userId);
    return user?.name || userId;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-slate-900">インセンティブ管理</h1>
        
        <div>
          <label className="block text-sm text-slate-600 mb-1">対象月</label>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Summary Cards */}
      {userRole !== 'admin' && incentives.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {incentives.map(incentive => (
            <div key={incentive.user_id}>
              <div className="bg-gradient-to-br from-yellow-50 to-orange-50 rounded-2xl p-6 border border-orange-200">
                <div className="flex items-center gap-2 mb-4">
                  <DollarSign className="w-6 h-6 text-orange-600" />
                  <h2 className="text-slate-900">付与予定</h2>
                </div>
                <div className="space-y-2">
                  <div className="text-slate-700">件数: {incentive.count_pending}件</div>
                  <div className="text-orange-600">{formatCurrency(incentive.amount_pending)}</div>
                  <p className="text-sm text-slate-600">お渡し待ちの作品</p>
                </div>
              </div>

              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-6 border border-green-200 mt-4">
                <div className="flex items-center gap-2 mb-4">
                  <DollarSign className="w-6 h-6 text-green-600" />
                  <h2 className="text-slate-900">確定��</h2>
                </div>
                <div className="space-y-2">
                  <div className="text-slate-700">件数: {incentive.count_confirmed}件</div>
                  <div className="text-green-600">
                    {formatCurrency(incentive.amount_confirmed + (incentive.manual_adjust_yen || 0))}
                  </div>
                  {incentive.manual_adjust_yen !== 0 && (
                    <p className="text-sm text-slate-600">
                      （基本: {formatCurrency(incentive.amount_confirmed)} + 調整: {formatCurrency(incentive.manual_adjust_yen)}）
                    </p>
                  )}
                  <p className="text-sm text-slate-600">引渡し済みの作品（{selectedMonth}）</p>
                  {incentive.locked_flag && (
                    <div className="flex items-center gap-2 text-sm text-blue-700">
                      <Lock className="w-4 h-4" />
                      <span>この月は締め済みです</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Admin View - All Staff */}
      {userRole === 'admin' && (
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-slate-700">スタッフ</th>
                  <th className="px-4 py-3 text-left text-slate-700">付与予定</th>
                  <th className="px-4 py-3 text-left text-slate-700">確定件数</th>
                  <th className="px-4 py-3 text-left text-slate-700">確定額</th>
                  <th className="px-4 py-3 text-left text-slate-700">手動調整</th>
                  <th className="px-4 py-3 text-left text-slate-700">合計</th>
                  <th className="px-4 py-3 text-left text-slate-700">ステータス</th>
                  <th className="px-4 py-3 text-left text-slate-700">操作</th>
                </tr>
              </thead>
              <tbody>
                {incentives.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                      この月のインセンティブデータがありません
                    </td>
                  </tr>
                ) : (
                  incentives.map(incentive => (
                    <tr key={incentive.user_id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-900">{getUserName(incentive.user_id)}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {incentive.count_pending}件 / {formatCurrency(incentive.amount_pending)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{incentive.count_confirmed}件</td>
                      <td className="px-4 py-3 text-slate-700">{formatCurrency(incentive.amount_confirmed)}</td>
                      <td className="px-4 py-3">
                        <span className={incentive.manual_adjust_yen > 0 ? 'text-green-600' : incentive.manual_adjust_yen < 0 ? 'text-red-600' : 'text-slate-700'}>
                          {formatCurrency(incentive.manual_adjust_yen || 0)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-green-600">
                          {formatCurrency(incentive.amount_confirmed + (incentive.manual_adjust_yen || 0))}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {incentive.locked_flag ? (
                          <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs">
                            <Lock className="w-3 h-3" />
                            締め済み
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs">
                            <Unlock className="w-3 h-3" />
                            未確定
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleAdjustment(incentive)}
                            className="px-3 py-1 bg-orange-50 text-orange-600 rounded-lg hover:bg-orange-100 transition text-sm"
                          >
                            調整
                          </button>
                          <button
                            onClick={() => handleLockToggle(incentive)}
                            className={`px-3 py-1 rounded-lg transition text-sm ${
                              incentive.locked_flag
                                ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                            }`}
                          >
                            {incentive.locked_flag ? '解除' : 'ロック'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {incentives.length === 0 && userRole !== 'admin' && (
        <div className="bg-white rounded-2xl p-8 text-center text-slate-500">
          この月のインセンティブデータがありません
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h3 className="text-blue-900 mb-2">インセンティブ計算ルール</h3>
        <ul className="text-blue-800 text-sm space-y-1 list-disc list-inside">
          <li>基本: 1案件 = ¥1,000</li>
          <li>付与予定: お渡し待ちの作品（まだ支払い確定前）</li>
          <li>確定済: 引渡し済みの作品（支払い対象）</li>
          <li>管理者は手動調整・月締めロックが可能</li>
        </ul>
      </div>
    </div>
  );
}
