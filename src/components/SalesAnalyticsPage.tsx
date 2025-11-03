import { useState, useMemo, useCallback } from 'react';
import { toast } from 'sonner@2.0.3';
import { TrendingUp, DollarSign, Calendar, Package, ChevronLeft, ChevronRight, Users, XCircle } from 'lucide-react';
import { useSalesAnalytics } from '../utils/queries';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface SalesData {
  totalRevenue: number;
  totalReservations: number;
  averageOrderValue: number;
  confirmedRevenue: number;
  pendingRevenue: number;
  cancelledCount: number;
  rescheduledCount: number;
  dailySales: { date: string; revenue: number; count: number }[];
  monthlySales?: { month: string; revenue: number; count: number }[];
  weekSales?: { date: string; revenue: number; count: number }[];
  additionalUnitsStats: {
    totalUnits: number;
    reservationsCount: number;
    averagePerReservation: number;
  };
  ageGroupSales: { ageGroup: string; revenue: number; count: number; additionalCount: number; totalAdditionalUnits: number }[];
  zeroAgeMonthsData: { months: number; label: string; revenue: number; count: number }[];
}

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4'];

const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

type ViewMode = 'month' | 'year' | 'custom';
type DataMode = 'period' | 'cumulative';

export function SalesAnalyticsPage() {
  const currentDate = new Date();
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [dataMode, setDataMode] = useState<DataMode>('period');
  const [showZeroAgeDetail, setShowZeroAgeDetail] = useState(false);
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1);
  
  const [customDateRange, setCustomDateRange] = useState({
    startDate: new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });

  // 日付範囲を計算（useMemoでメモ化）
  const dateRange = useMemo(() => {
    if (dataMode === 'cumulative') {
      // 累計データは全期間を取得
      return {
        startDate: '2000-01-01',
        endDate: '2099-12-31',
        viewMode: 'custom',
      };
    }

    if (viewMode === 'month') {
      const startDate = new Date(selectedYear, selectedMonth - 1, 1);
      const endDate = new Date(selectedYear, selectedMonth, 0);
      return {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        viewMode,
      };
    } else if (viewMode === 'year') {
      return {
        startDate: `${selectedYear}-01-01`,
        endDate: `${selectedYear}-12-31`,
        viewMode,
      };
    } else {
      return {
        ...customDateRange,
        viewMode,
      };
    }
  }, [viewMode, selectedYear, selectedMonth, customDateRange, dataMode]);

  // React Queryでデータ取得（キャッシュ・リトライ付き）
  const { data: salesData, isLoading, isError } = useSalesAnalytics(dateRange);

  // 通貨フォーマット（useCallbackでメモ化）
  const formatCurrency = useCallback((value: number) => {
    return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(value);
  }, []);

  // イベントハンドラーをuseCallbackでメモ化
  const handlePreviousMonth = useCallback(() => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear(prev => prev - 1);
    } else {
      setSelectedMonth(prev => prev - 1);
    }
  }, [selectedMonth]);

  const handleNextMonth = useCallback(() => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear(prev => prev + 1);
    } else {
      setSelectedMonth(prev => prev + 1);
    }
  }, [selectedMonth]);

  const handlePreviousYear = useCallback(() => {
    setSelectedYear(prev => prev - 1);
  }, []);

  const handleNextYear = useCallback(() => {
    setSelectedYear(prev => prev + 1);
  }, []);

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
            <label className="block text-sm text-slate-700 mb-1">開始日</label>
            <input
              type="date"
              value={customDateRange.startDate}
              onChange={(e) => setCustomDateRange({ ...customDateRange, startDate: e.target.value })}
              className="px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-700 mb-1">終了日</label>
            <input
              type="date"
              value={customDateRange.endDate}
              onChange={(e) => setCustomDateRange({ ...customDateRange, endDate: e.target.value })}
              className="px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
        </div>
      );
    }
  };

  // ローディング状態
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  // エラー状態
  if (isError || !salesData) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
        売上データの読み込みに失敗しました。ページを再読み込みしてください。
      </div>
    );
  }

  // キャンセル率の計算（useMemoでメモ化）
  const { totalCancellationsAndChanges, cancellationRate } = useMemo(() => {
    const total = salesData.cancelledCount + salesData.rescheduledCount;
    const rate = salesData.totalReservations > 0 
      ? ((total / salesData.totalReservations) * 100).toFixed(1)
      : '0.0';
    return { totalCancellationsAndChanges: total, cancellationRate: rate };
  }, [salesData.cancelledCount, salesData.rescheduledCount, salesData.totalReservations]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-slate-900">売上分析</h1>
          <p className="text-slate-600 mt-1">
            {dataMode === 'cumulative' ? '全期間の累計データ' : '予約データに基づく売上とトレンドの分析'}
          </p>
        </div>
      </div>

      {/* Data Mode Tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 mb-6">
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setDataMode('period')}
            className={`px-6 py-2 rounded-lg transition ${
              dataMode === 'period'
                ? 'bg-green-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            期間別
          </button>
          <button
            onClick={() => setDataMode('cumulative')}
            className={`px-6 py-2 rounded-lg transition ${
              dataMode === 'cumulative'
                ? 'bg-green-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            累計
          </button>
        </div>

        {dataMode === 'period' && (
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
        )}
      </div>



      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg p-5 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-blue-100">{dataMode === 'cumulative' ? '累計売上（確定）' : '総売上（確定）'}</span>
            <DollarSign className="w-5 h-5 text-blue-100" />
          </div>
          <div className="text-2xl">{formatCurrency(salesData.confirmedRevenue)}</div>
        </div>

        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg p-5 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-purple-100">{dataMode === 'cumulative' ? '累計予約数' : '予約数'}</span>
            <Calendar className="w-5 h-5 text-purple-100" />
          </div>
          <div className="text-2xl">{salesData.totalReservations}件</div>
        </div>

        <div className="bg-gradient-to-br from-pink-500 to-pink-600 rounded-lg p-5 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-pink-100">平均単価</span>
            <TrendingUp className="w-5 h-5 text-pink-100" />
          </div>
          <div className="text-2xl">{formatCurrency(salesData.averageOrderValue)}</div>
          <div className="text-sm text-pink-100 mt-1">確定予約ベース</div>
        </div>

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg p-5 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-orange-100">キャンセル・変更</span>
            <XCircle className="w-5 h-5 text-orange-100" />
          </div>
          <div className="flex items-center gap-3 mb-2">
            <div>
              <div className="text-sm text-orange-100">キャンセル</div>
              <div className="text-xl">{salesData.cancelledCount}件</div>
            </div>
            <div className="h-10 w-px bg-orange-300"></div>
            <div>
              <div className="text-sm text-orange-100">予約変更</div>
              <div className="text-xl">{salesData.rescheduledCount}件</div>
            </div>
          </div>
          <div className="text-sm text-orange-100 mt-1">キャンセル率: {cancellationRate}%</div>
        </div>

      </div>

      {/* Sales Trend Chart */}


      {/* Additional Units Stats */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
        <h2 className="text-slate-900 mb-4 flex items-center gap-2">
          <Package className="w-5 h-5 text-green-600" />
          追加本数の統計
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border border-slate-200 rounded-lg p-4">
            <div className="text-slate-600 text-sm mb-1">総予約件数</div>
            <div className="text-2xl text-slate-900">{salesData.totalReservations}件</div>
          </div>
          <div className="border border-slate-200 rounded-lg p-4">
            <div className="text-slate-600 text-sm mb-1">追加あり件数</div>
            <div className="text-2xl text-slate-900">{salesData.additionalUnitsStats.reservationsCount}件</div>
          </div>
          <div className="border border-slate-200 rounded-lg p-4">
            <div className="text-slate-600 text-sm mb-1">追加率</div>
            <div className="text-2xl text-slate-900">
              {salesData.totalReservations > 0 
                ? ((salesData.additionalUnitsStats.reservationsCount / salesData.totalReservations) * 100).toFixed(1)
                : '0.0'}%
            </div>
          </div>
        </div>
      </div>

      {/* Age Group Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Age Group Sales Chart */}


        {/* Age Group Distribution */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h2 className="text-slate-900 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-purple-600" />
            年齢別比率
          </h2>
          {salesData.ageGroupSales.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={salesData.ageGroupSales}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.ageGroup}: ${entry.count}件`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="count"
                  onClick={(data) => {
                    if (data.ageGroup === '0歳') {
                      setShowZeroAgeDetail(true);
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  {salesData.ageGroupSales.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-slate-500">
              年齢データがありません
            </div>
          )}
          {salesData.ageGroupSales.some(g => g.ageGroup === '0歳') && (
            <div className="mt-4 text-center">
              <button
                onClick={() => setShowZeroAgeDetail(true)}
                className="text-sm text-purple-600 hover:text-purple-700 hover:underline"
              >
                💡 0歳の月齢別詳細を見る
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Age Group Statistics Table */}
      {salesData.ageGroupSales.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mt-6">
          <h2 className="text-slate-900 mb-4 flex items-center gap-2">
            <Package className="w-5 h-5 text-green-600" />
            年齢別統計（件数・追加本数・追加率）
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 text-slate-700">年齢</th>
                  <th className="text-right py-3 px-4 text-slate-700">売上</th>
                  <th className="text-right py-3 px-4 text-slate-700">予約件数</th>
                  <th className="text-right py-3 px-4 text-slate-700">追加あり件数</th>
                  <th className="text-right py-3 px-4 text-slate-700">追加率</th>
                  <th className="text-right py-3 px-4 text-slate-700">追加本数合計</th>
                </tr>
              </thead>
              <tbody>
                {salesData.ageGroupSales.map((group, index) => {
                  const additionRate = group.count > 0 
                    ? ((group.additionalCount / group.count) * 100).toFixed(1) 
                    : '0.0';
                  
                  return (
                    <tr 
                      key={group.ageGroup} 
                      className={`border-b border-slate-100 hover:bg-slate-50 transition ${
                        group.ageGroup === '0歳' ? 'cursor-pointer' : ''
                      }`}
                      onClick={() => {
                        if (group.ageGroup === '0歳') {
                          setShowZeroAgeDetail(true);
                        }
                      }}
                    >
                      <td className="py-3 px-4">
                        <span className="text-slate-900">{group.ageGroup}</span>
                        {group.ageGroup === '0歳' && (
                          <span className="text-xs text-slate-500 ml-2">（クリック）</span>
                        )}
                      </td>
                      <td className="text-right py-3 px-4 text-slate-900">
                        {formatCurrency(group.revenue)}
                      </td>
                      <td className="text-right py-3 px-4 text-slate-900">
                        {group.count}
                      </td>
                      <td className="text-right py-3 px-4 text-slate-900">
                        {group.additionalCount}
                      </td>
                      <td className="text-right py-3 px-4 text-slate-900">
                        {additionRate}%
                      </td>
                      <td className="text-right py-3 px-4 text-slate-900">
                        {group.totalAdditionalUnits}
                      </td>
                    </tr>
                  );
                })}
                {/* Total row */}
                <tr className="bg-slate-50 border-t-2 border-slate-300">
                  <td className="py-3 px-4 text-slate-900">
                    合計
                  </td>
                  <td className="text-right py-3 px-4 text-slate-900">
                    {formatCurrency(salesData.ageGroupSales.reduce((sum, g) => sum + g.revenue, 0))}
                  </td>
                  <td className="text-right py-3 px-4 text-slate-900">
                    {salesData.ageGroupSales.reduce((sum, g) => sum + g.count, 0)}
                  </td>
                  <td className="text-right py-3 px-4 text-slate-900">
                    {salesData.ageGroupSales.reduce((sum, g) => sum + g.additionalCount, 0)}
                  </td>
                  <td className="text-right py-3 px-4 text-slate-900">
                    {salesData.ageGroupSales.reduce((sum, g) => sum + g.count, 0) > 0
                      ? ((salesData.ageGroupSales.reduce((sum, g) => sum + g.additionalCount, 0) / 
                          salesData.ageGroupSales.reduce((sum, g) => sum + g.count, 0)) * 100).toFixed(1)
                      : '0.0'}%
                  </td>
                  <td className="text-right py-3 px-4 text-slate-900">
                    {salesData.ageGroupSales.reduce((sum, g) => sum + g.totalAdditionalUnits, 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 0歳月齢別詳細モーダル */}
      {showZeroAgeDetail && (
        <div className="fixed inset-0 bg-slate-900 bg-opacity-20 flex items-center justify-center p-4 z-50" onClick={() => setShowZeroAgeDetail(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <h2 className="text-slate-900 flex items-center gap-2">
                  <Users className="w-6 h-6 text-blue-600" />
                  0歳の月齢別詳細
                </h2>
                <button
                  onClick={() => setShowZeroAgeDetail(false)}
                  className="text-slate-400 hover:text-slate-600 transition"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="p-6">
              {salesData.zeroAgeMonthsData && salesData.zeroAgeMonthsData.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* 月齢別売上グラフ */}
                  <div>
                    <h3 className="text-slate-800 mb-4">月齢別売上</h3>
                    <ResponsiveContainer width="100%" height={350}>
                      <BarChart data={salesData.zeroAgeMonthsData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="label" stroke="#64748b" angle={-45} textAnchor="end" height={80} />
                        <YAxis stroke="#64748b" />
                        <Tooltip
                          formatter={(value: number) => formatCurrency(value)}
                          contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                        />
                        <Legend />
                        <Bar dataKey="revenue" name="売上" fill="#3b82f6" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* 月齢別件数グラフ */}
                  <div>
                    <h3 className="text-slate-800 mb-4">月齢別予約件数</h3>
                    <ResponsiveContainer width="100%" height={350}>
                      <BarChart data={salesData.zeroAgeMonthsData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="label" stroke="#64748b" angle={-45} textAnchor="end" height={80} />
                        <YAxis stroke="#64748b" />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                        />
                        <Legend />
                        <Bar dataKey="count" name="予約件数" fill="#10b981" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-[300px] text-slate-500">
                  0歳の月齢データがありません
                </div>
              )}

              {/* 統計テーブル */}
              {salesData.zeroAgeMonthsData && salesData.zeroAgeMonthsData.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-slate-800 mb-3">詳細データ</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-slate-700">月齢</th>
                          <th className="px-4 py-2 text-right text-slate-700">売上</th>
                          <th className="px-4 py-2 text-right text-slate-700">件数</th>
                          <th className="px-4 py-2 text-right text-slate-700">平均単価</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {salesData.zeroAgeMonthsData.map((data, index) => (
                          <tr key={index} className="hover:bg-slate-50">
                            <td className="px-4 py-2 text-slate-900">{data.label}</td>
                            <td className="px-4 py-2 text-right text-slate-900">{formatCurrency(data.revenue)}</td>
                            <td className="px-4 py-2 text-right text-slate-900">{data.count}件</td>
                            <td className="px-4 py-2 text-right text-slate-900">
                              {formatCurrency(data.count > 0 ? data.revenue / data.count : 0)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-blue-50">
                        <tr>
                          <td className="px-4 py-2 text-slate-900">合計</td>
                          <td className="px-4 py-2 text-right text-slate-900">
                            {formatCurrency(salesData.zeroAgeMonthsData.reduce((sum, d) => sum + d.revenue, 0))}
                          </td>
                          <td className="px-4 py-2 text-right text-slate-900">
                            {salesData.zeroAgeMonthsData.reduce((sum, d) => sum + d.count, 0)}件
                          </td>
                          <td className="px-4 py-2 text-right text-slate-900">
                            {(() => {
                              const totalRevenue = salesData.zeroAgeMonthsData.reduce((sum, d) => sum + d.revenue, 0);
                              const totalCount = salesData.zeroAgeMonthsData.reduce((sum, d) => sum + d.count, 0);
                              return formatCurrency(totalCount > 0 ? totalRevenue / totalCount : 0);
                            })()}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
