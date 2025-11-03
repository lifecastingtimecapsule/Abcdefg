import { useEffect, useState } from 'react';
import { apiRequest } from '../utils/api';
import { toast } from 'sonner@2.0.3';
import { TrendingUp, DollarSign, Calendar, Package, ChevronLeft, ChevronRight, Users } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface SalesData {
  totalRevenue: number;
  totalReservations: number;
  averageOrderValue: number;
  confirmedRevenue: number;
  pendingRevenue: number;
  cancelledCount: number;
  dailySales: { date: string; revenue: number; count: number }[];
  monthlySales?: { month: string; revenue: number; count: number }[];
  weekSales?: { date: string; revenue: number; count: number }[];
  additionalUnitsStats: {
    totalUnits: number;
    reservationsCount: number;
    averagePerReservation: number;
  };
  ageGroupSales: { ageGroup: string; revenue: number; count: number }[];
  zeroAgeMonthsData: { months: number; label: string; revenue: number; count: number }[];
}

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4'];

const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

type ViewMode = 'month' | 'year' | 'custom';

export function SalesAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [salesData, setSalesData] = useState<SalesData | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [showZeroAgeDetail, setShowZeroAgeDetail] = useState(false);
  
  const currentDate = new Date();
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1);
  
  const [customDateRange, setCustomDateRange] = useState({
    startDate: new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    loadSalesData();
  }, [viewMode, selectedYear, selectedMonth, customDateRange]);

  const getDateRange = () => {
    if (viewMode === 'month') {
      const startDate = new Date(selectedYear, selectedMonth - 1, 1);
      const endDate = new Date(selectedYear, selectedMonth, 0);
      return {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
      };
    } else if (viewMode === 'year') {
      return {
        startDate: `${selectedYear}-01-01`,
        endDate: `${selectedYear}-12-31`,
      };
    } else {
      return customDateRange;
    }
  };

  const loadSalesData = async () => {
    try {
      setLoading(true);
      const dateRange = getDateRange();
      const params = new URLSearchParams({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        viewMode,
      });
      const data = await apiRequest<SalesData>(`/sales-analytics?${params}`);
      setSalesData(data);
    } catch (err: any) {
      // UNAUTHORIZEDエラーの場合は再認証モーダルが表示されるので、ここではエラー表示しない
      if (err?.message !== 'UNAUTHORIZED') {
        console.error('Load sales data error:', err);
        toast.error('売上データの読み込みに失敗しました');
      }
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(value);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-slate-500">読み込み中...</div>
      </div>
    );
  }

  if (!salesData) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-slate-500">データがありません</div>
      </div>
    );
  }

  const cancellationRate = salesData.totalReservations > 0 
    ? ((salesData.cancelledCount / salesData.totalReservations) * 100).toFixed(1)
    : '0.0';

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-slate-900">売上分析</h1>
          <p className="text-slate-600 mt-1">予約データに基づく売上とトレンドの分析</p>
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg p-5 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-blue-100">総売上（確定）</span>
            <DollarSign className="w-5 h-5 text-blue-100" />
          </div>
          <div className="text-2xl">{formatCurrency(salesData.confirmedRevenue)}</div>
        </div>

        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg p-5 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-purple-100">予約数</span>
            <Calendar className="w-5 h-5 text-purple-100" />
          </div>
          <div className="text-2xl">{salesData.totalReservations}件</div>
          <div className="text-sm text-purple-100 mt-1">キャンセル率: {cancellationRate}%</div>
        </div>

        <div className="bg-gradient-to-br from-pink-500 to-pink-600 rounded-lg p-5 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-pink-100">平均単価</span>
            <TrendingUp className="w-5 h-5 text-pink-100" />
          </div>
          <div className="text-2xl">{formatCurrency(salesData.averageOrderValue)}</div>
          <div className="text-sm text-pink-100 mt-1">確定予約ベース</div>
        </div>


      </div>

      {/* Sales Trend Chart */}


      {/* Additional Units Stats */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8 mb-6">
        <h2 className="text-slate-900 mb-6 flex items-center gap-2">
          <Package className="w-6 h-6 text-green-600" />
          追加本数の統計
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="text-center p-8 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg">
            <div className="text-slate-600 mb-3">予約件数 / 追加あり</div>
            <div className="text-4xl text-blue-600">
              {salesData.totalReservations}件中<br/>
              <span className="text-5xl">{salesData.additionalUnitsStats.reservationsCount}件</span>
            </div>
            <div className="text-lg text-slate-500 mt-3">
              追加あり: {salesData.totalReservations > 0 
                ? ((salesData.additionalUnitsStats.reservationsCount / salesData.totalReservations) * 100).toFixed(1)
                : '0.0'}%
            </div>
          </div>
          <div className="text-center p-8 bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg">
            <div className="text-slate-600 mb-3">追加率</div>
            <div className="text-7xl text-orange-600">
              {salesData.totalReservations > 0 
                ? ((salesData.additionalUnitsStats.reservationsCount / salesData.totalReservations) * 100).toFixed(1)
                : '0.0'}
            </div>
            <div className="text-lg text-slate-500 mt-3">%</div>
          </div>
        </div>
      </div>

      {/* Age Group Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Age Group Sales Chart */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h2 className="text-slate-900 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            年齢別売上
          </h2>
          {salesData.ageGroupSales.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={salesData.ageGroupSales}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="ageGroup" stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                />
                <Legend />
                <Bar 
                  dataKey="revenue" 
                  name="売上" 
                  fill="#3b82f6"
                  onClick={(data) => {
                    if (data.ageGroup === '0歳') {
                      setShowZeroAgeDetail(true);
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                />
              </BarChart>
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
                className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
              >
                💡 0歳の月齢別詳細を見る
              </button>
            </div>
          )}
        </div>

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

      {/* 0歳月齢別詳細モーダル */}
      {showZeroAgeDetail && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={() => setShowZeroAgeDetail(false)}>
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
