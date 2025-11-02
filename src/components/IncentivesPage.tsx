import { useEffect, useState } from 'react';
import { apiRequest } from '../utils/api';
import { toast } from 'sonner@2.0.3';
import { DollarSign, Lock, Unlock, ChevronLeft, ChevronRight, TrendingUp, Users } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

type ViewMode = 'month' | 'year' | 'custom';

interface IncentiveData {
  user_id: string;
  count_pending: number;
  amount_pending: number;
  count_confirmed: number;
  amount_confirmed: number;
  manual_adjust_yen: number;
  locked_flag: boolean;
}

interface YearlyData {
  totalIncentives: number;
  totalConfirmedCount: number;
  totalPendingCount: number;
  averageIncentive: number;
  monthlyData: { month: string; totalAmount: number; confirmedCount: number }[];
  staffYearlyData: { name: string; totalAmount: number; confirmedCount: number }[];
}

const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

export function IncentivesPage({ userRole, userId }: { userRole: string; userId: string }) {
  const [incentives, setIncentives] = useState<IncentiveData[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [yearlyData, setYearlyData] = useState<YearlyData | null>(null);

  const currentDate = new Date();
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1);
  
  const [customDateRange, setCustomDateRange] = useState({
    startMonth: `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`,
    endMonth: `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`,
  });

  useEffect(() => {
    loadData();
  }, [viewMode, selectedYear, selectedMonth, customDateRange]);

  const loadData = async () => {
    try {
      setLoading(true);

      if (viewMode === 'month') {
        // 月間ビュー: 既存のAPI
        const yearMonth = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
        const incentiveData = await apiRequest(`/incentives?year_month=${yearMonth}${userRole !== 'admin' ? `&user_id=${userId}` : ''}`);
        setIncentives(incentiveData.incentives);
      } else if (viewMode === 'year') {
        // 年間ビュー: 新しいAPI
        const yearData = await apiRequest(`/incentives/yearly?year=${selectedYear}${userRole !== 'admin' ? `&user_id=${userId}` : ''}`);
        setYearlyData(yearData);
      } else {
        // カスタムビュー: 範囲指定API
        const rangeData = await apiRequest(`/incentives/range?start=${customDateRange.startMonth}&end=${customDateRange.endMonth}${userRole !== 'admin' ? `&user_id=${userId}` : ''}`);
        setIncentives(rangeData.incentives);
      }

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

  const handleLockToggle = async (incentive: IncentiveData) => {
    if (!window.confirm(`${incentive.locked_flag ? '解除' : 'ロック'}しますか？`)) return;

    try {
      const yearMonth = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
      await apiRequest('/incentives/lock', {
        method: 'POST',
        body: JSON.stringify({
          user_id: incentive.user_id,
          year_month: yearMonth,
          locked_flag: !incentive.locked_flag,
          manual_adjust_yen: incentive.manual_adjust_yen || 0,
        }),
      });

      await loadData();
      toast.success(incentive.locked_flag ? 'ロックを解除しました' : 'ロ��クしました');
    } catch (err: any) {
      console.error('Lock toggle error:', err);
      toast.error('操作に失敗しました');
    }
  };

  const handleAdjustment = async (incentive: IncentiveData) => {
    const input = prompt('手動調整額を入力してください（プラスまたはマイナス）:', String(incentive.manual_adjust_yen || 0));
    if (input === null) return;

    const amount = parseInt(input);
    if (isNaN(amount)) {
      toast.error('数値を入力してください');
      return;
    }

    try {
      const yearMonth = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
      await apiRequest('/incentives/lock', {
        method: 'POST',
        body: JSON.stringify({
          user_id: incentive.user_id,
          year_month: yearMonth,
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

  const handlePreviousMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  const handlePreviousYear = () => {
    setSelectedYear(selectedYear - 1);
  };

  const handleNextYear = () => {
    setSelectedYear(selectedYear + 1);
  };

  const renderPeriodSelector = () => {
    if (viewMode === 'month') {
      return (
        <div className="flex items-center gap-2">
          <button
            onClick={handlePreviousMonth}
            className="p-2 hover:bg-slate-100 rounded-lg transition"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="px-3 py-2 border border-slate-300 rounded-lg bg-white"
            >
              {Array.from({ length: 10 }, (_, i) => currentDate.getFullYear() - 5 + i).map((year) => (
                <option key={year} value={year}>{year}年</option>
              ))}
            </select>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="px-3 py-2 border border-slate-300 rounded-lg bg-white"
            >
              {MONTH_NAMES.map((name, index) => (
                <option key={index + 1} value={index + 1}>{name}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleNextMonth}
            className="p-2 hover:bg-slate-100 rounded-lg transition"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <button
            onClick={() => {
              setSelectedYear(currentDate.getFullYear());
              setSelectedMonth(currentDate.getMonth() + 1);
            }}
            className="ml-2 px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition"
          >
            今月
          </button>
        </div>
      );
    } else if (viewMode === 'year') {
      return (
        <div className="flex items-center gap-2">
          <button
            onClick={handlePreviousYear}
            className="p-2 hover:bg-slate-100 rounded-lg transition"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="px-4 py-2 border border-slate-300 rounded-lg bg-white"
          >
            {Array.from({ length: 10 }, (_, i) => currentDate.getFullYear() - 5 + i).map((year) => (
              <option key={year} value={year}>{year}年</option>
            ))}
          </select>
          <button
            onClick={handleNextYear}
            className="p-2 hover:bg-slate-100 rounded-lg transition"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <button
            onClick={() => setSelectedYear(currentDate.getFullYear())}
            className="ml-2 px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition"
          >
            今年
          </button>
        </div>
      );
    } else {
      return (
        <div className="flex items-center gap-4">
          <div>
            <label className="block text-sm text-slate-700 mb-1">開始月</label>
            <input
              type="month"
              value={customDateRange.startMonth}
              onChange={(e) => setCustomDateRange({ ...customDateRange, startMonth: e.target.value })}
              className="px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-700 mb-1">終了月</label>
            <input
              type="month"
              value={customDateRange.endMonth}
              onChange={(e) => setCustomDateRange({ ...customDateRange, endMonth: e.target.value })}
              className="px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
        </div>
      );
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  // 年間ビュー
  if (viewMode === 'year' && yearlyData) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-slate-900">インセンティブ管理</h1>
            <p className="text-slate-600 mt-1">年間のインセンティブ推移と実績</p>
          </div>
        </div>

        {/* View Mode Tabs */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4">
            <div className="flex gap-2">
              <button
                onClick={() => setViewMode('month')}
                className={`px-4 py-2 rounded-lg transition ${
                  viewMode === 'month'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                月間
              </button>
              <button
                onClick={() => setViewMode('year')}
                className={`px-4 py-2 rounded-lg transition ${
                  viewMode === 'year'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                年間
              </button>
              <button
                onClick={() => setViewMode('custom')}
                className={`px-4 py-2 rounded-lg transition ${
                  viewMode === 'custom'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                カスタム
              </button>
            </div>
            
            <div className="flex-1">
              {renderPeriodSelector()}
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg p-5 text-white shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-green-100">年間合計</span>
              <DollarSign className="w-5 h-5 text-green-100" />
            </div>
            <div className="text-2xl">{formatCurrency(yearlyData.totalIncentives)}</div>
            <div className="text-sm text-green-100 mt-1">確定済インセンティブ</div>
          </div>

          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg p-5 text-white shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-blue-100">確定件数</span>
              <TrendingUp className="w-5 h-5 text-blue-100" />
            </div>
            <div className="text-2xl">{yearlyData.totalConfirmedCount}件</div>
            <div className="text-sm text-blue-100 mt-1">引渡し完了作品数</div>
          </div>

          <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg p-5 text-white shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-purple-100">月平均</span>
              <DollarSign className="w-5 h-5 text-purple-100" />
            </div>
            <div className="text-2xl">{formatCurrency(yearlyData.averageIncentive)}</div>
            <div className="text-sm text-purple-100 mt-1">月あたりの平均額</div>
          </div>

          <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg p-5 text-white shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-orange-100">保留件数</span>
              <Users className="w-5 h-5 text-orange-100" />
            </div>
            <div className="text-2xl">{yearlyData.totalPendingCount}件</div>
            <div className="text-sm text-orange-100 mt-1">お渡し待ち</div>
          </div>
        </div>

        {/* Monthly Trend Chart */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
          <h2 className="text-slate-900 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            月別インセンティブ推移
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={yearlyData.monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" stroke="#64748b" />
              <YAxis stroke="#64748b" />
              <Tooltip
                formatter={(value: number) => formatCurrency(value)}
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
              />
              <Legend />
              <Line type="monotone" dataKey="totalAmount" name="インセンティブ" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Staff Yearly Performance */}
        {userRole === 'admin' && yearlyData.staffYearlyData.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
            <h2 className="text-slate-900 mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-purple-600" />
              スタッフ別年間実績
            </h2>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={yearlyData.staffYearlyData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" stroke="#64748b" />
                <YAxis dataKey="name" type="category" stroke="#64748b" width={150} />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                />
                <Legend />
                <Bar dataKey="totalAmount" name="年間合計" fill="#8b5cf6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Summary Table */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
          <h2 className="text-slate-900 mb-4">月別詳細</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 text-slate-700">月</th>
                  <th className="text-right py-3 px-4 text-slate-700">確定件数</th>
                  <th className="text-right py-3 px-4 text-slate-700">インセンティブ</th>
                  <th className="text-right py-3 px-4 text-slate-700">平均単価</th>
                </tr>
              </thead>
              <tbody>
                {yearlyData.monthlyData.map((item, index) => (
                  <tr key={index} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4 text-slate-900">{item.month}</td>
                    <td className="py-3 px-4 text-right text-slate-700">{item.confirmedCount}件</td>
                    <td className="py-3 px-4 text-right text-slate-900">{formatCurrency(item.totalAmount)}</td>
                    <td className="py-3 px-4 text-right text-slate-600">
                      {formatCurrency(item.confirmedCount > 0 ? item.totalAmount / item.confirmedCount : 0)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-50">
                  <td className="py-3 px-4 text-slate-900">合計</td>
                  <td className="py-3 px-4 text-right text-slate-900">{yearlyData.totalConfirmedCount}件</td>
                  <td className="py-3 px-4 text-right text-slate-900">{formatCurrency(yearlyData.totalIncentives)}</td>
                  <td className="py-3 px-4 text-right text-slate-700">
                    {formatCurrency(yearlyData.totalConfirmedCount > 0 ? yearlyData.totalIncentives / yearlyData.totalConfirmedCount : 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <h3 className="text-blue-900 mb-2">インセンティブ計算ルール</h3>
          <ul className="text-blue-800 text-sm space-y-1 list-disc list-inside">
            <li>基本: 1案件 = ¥1,000</li>
            <li>年間データは確定済み（引渡し完了）のみ集計</li>
            <li>手動調整額も含めた合計額を表示</li>
          </ul>
        </div>
      </div>
    );
  }

  // 月間ビュー
  const yearMonth = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-slate-900">インセンティブ管理</h1>
          <p className="text-slate-600 mt-1">スタッフのインセンティブ実績</p>
        </div>
      </div>

      {/* View Mode Tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('month')}
              className={`px-4 py-2 rounded-lg transition ${
                viewMode === 'month'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              月間
            </button>
            <button
              onClick={() => setViewMode('year')}
              className={`px-4 py-2 rounded-lg transition ${
                viewMode === 'year'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              年間
            </button>
            <button
              onClick={() => setViewMode('custom')}
              className={`px-4 py-2 rounded-lg transition ${
                viewMode === 'custom'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              カスタム
            </button>
          </div>
          
          <div className="flex-1">
            {renderPeriodSelector()}
          </div>
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
                  <h2 className="text-slate-900">確定額</h2>
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
                  <p className="text-sm text-slate-600">引渡し済みの作品（{yearMonth}）</p>
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
