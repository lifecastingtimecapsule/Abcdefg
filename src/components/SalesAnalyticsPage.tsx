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
}

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4'];

const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

type ViewMode = 'month' | 'year' | 'custom';

export function SalesAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [salesData, setSalesData] = useState<SalesData | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  
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
      console.error('Load sales data error:', err);
      toast.error('売上データの読み込みに失敗しました');
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

      {/* Week Sales Chart - Show only in month view */}
      {viewMode === 'month' && salesData.weekSales && salesData.weekSales.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
          <h2 className="text-slate-900 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-600" />
            直近7日間の売上推移
          </h2>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={salesData.weekSales}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis 
                dataKey="date" 
                tickFormatter={(value) => {
                  const date = new Date(value);
                  return `${date.getMonth() + 1}/${date.getDate()}`;
                }}
                stroke="#64748b"
              />
              <YAxis stroke="#64748b" />
              <Tooltip 
                formatter={(value: number) => formatCurrency(value)}
                labelFormatter={(label) => {
                  const date = new Date(label);
                  return new Intl.DateTimeFormat('ja-JP').format(date);
                }}
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
              />
              <Line 
                type="monotone" 
                dataKey="revenue" 
                name="売上"
                stroke="#10b981" 
                strokeWidth={2}
                dot={{ fill: '#10b981', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-4 grid grid-cols-2 gap-4 pt-4 border-t border-slate-200">
            <div>
              <div className="text-sm text-slate-600">週間売上合計</div>
              <div className="text-xl text-slate-900">
                {formatCurrency(salesData.weekSales.reduce((sum, day) => sum + day.revenue, 0))}
              </div>
            </div>
            <div>
              <div className="text-sm text-slate-600">週間予約件数</div>
              <div className="text-xl text-slate-900">
                {salesData.weekSales.reduce((sum, day) => sum + day.count, 0)}件
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg p-5 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-blue-100">総売上（確定）</span>
            <DollarSign className="w-5 h-5 text-blue-100" />
          </div>
          <div className="text-2xl">{formatCurrency(salesData.confirmedRevenue)}</div>
          <div className="text-sm text-blue-100 mt-1">予定含む: {formatCurrency(salesData.totalRevenue)}</div>
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

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg p-5 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-orange-100">保留中売上</span>
            <Package className="w-5 h-5 text-orange-100" />
          </div>
          <div className="text-2xl">{formatCurrency(salesData.pendingRevenue)}</div>
          <div className="text-sm text-orange-100 mt-1">未確定の予約分</div>
        </div>
      </div>

      {/* Sales Trend Chart */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
        <h2 className="text-slate-900 mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-600" />
          {viewMode === 'year' ? '月別売上推移' : '日別売上推移'}
        </h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={viewMode === 'year' ? salesData.monthlySales : salesData.dailySales}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis 
              dataKey={viewMode === 'year' ? 'month' : 'date'} 
              stroke="#64748b"
              angle={viewMode === 'year' ? 0 : -45}
              textAnchor={viewMode === 'year' ? 'middle' : 'end'}
              height={viewMode === 'year' ? 30 : 60}
            />
            <YAxis stroke="#64748b" />
            <Tooltip
              formatter={(value: number) => formatCurrency(value)}
              contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
            />
            <Legend />
            <Line type="monotone" dataKey="revenue" name="売上" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6' }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Additional Units Stats */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8 mb-6">
        <h2 className="text-slate-900 mb-6 flex items-center gap-2">
          <Package className="w-6 h-6 text-green-600" />
          追加本数の統計
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="text-center p-6 bg-gradient-to-br from-green-50 to-green-100 rounded-lg">
            <div className="text-slate-600 mb-2">合計追加本数</div>
            <div className="text-5xl text-green-600">{salesData.additionalUnitsStats.totalUnits}</div>
            <div className="text-sm text-slate-500 mt-1">本</div>
          </div>
          <div className="text-center p-6 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg">
            <div className="text-slate-600 mb-2">追加あり予約</div>
            <div className="text-3xl text-blue-600">
              {salesData.totalReservations}件中<br/>
              {salesData.additionalUnitsStats.reservationsCount}件
            </div>
            <div className="text-sm text-slate-500 mt-1">
              ({salesData.totalReservations > 0 
                ? ((salesData.additionalUnitsStats.reservationsCount / salesData.totalReservations) * 100).toFixed(1)
                : '0.0'}%)
            </div>
          </div>
          <div className="text-center p-6 bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg">
            <div className="text-slate-600 mb-2">平均追加本数</div>
            <div className="text-5xl text-purple-600">
              {salesData.additionalUnitsStats.averagePerReservation.toFixed(1)}
            </div>
            <div className="text-sm text-slate-500 mt-1">本/件</div>
          </div>
          <div className="text-center p-6 bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg">
            <div className="text-slate-600 mb-2">追加率</div>
            <div className="text-5xl text-orange-600">
              {salesData.totalReservations > 0 
                ? ((salesData.additionalUnitsStats.reservationsCount / salesData.totalReservations) * 100).toFixed(1)
                : '0.0'}
            </div>
            <div className="text-sm text-slate-500 mt-1">%</div>
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
                <Bar dataKey="revenue" name="売上" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-slate-500">
              年齢データがありません
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
        </div>
      </div>
    </div>
  );
}
