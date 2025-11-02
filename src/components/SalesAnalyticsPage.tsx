import { useEffect, useState } from 'react';
import { apiRequest } from '../utils/api';
import { toast } from 'sonner@2.0.3';
import { TrendingUp, DollarSign, Calendar, Users, Package, MapPin } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface SalesData {
  totalRevenue: number;
  totalReservations: number;
  averageOrderValue: number;
  confirmedRevenue: number;
  pendingRevenue: number;
  cancelledCount: number;
  dailySales: { date: string; revenue: number; count: number }[];
  menuSales: { name: string; revenue: number; count: number }[];
  locationSales: { name: string; revenue: number; count: number }[];
  staffSales: { name: string; revenue: number; count: number }[];
}

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#6366f1'];

export function SalesAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [salesData, setSalesData] = useState<SalesData | null>(null);
  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    loadSalesData();
  }, [dateRange]);

  const loadSalesData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
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

      {/* Date Range Filter */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 mb-6">
        <div className="flex items-center gap-4">
          <div>
            <label className="block text-sm text-slate-700 mb-1">開始日</label>
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
              className="px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-700 mb-1">終了日</label>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
              className="px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <button
            onClick={() => {
              const today = new Date().toISOString().split('T')[0];
              setDateRange({
                startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
                endDate: today,
              });
            }}
            className="mt-6 px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition"
          >
            今月にリセット
          </button>
        </div>
      </div>

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

      {/* Daily Sales Trend */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
        <h2 className="text-slate-900 mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-600" />
          日別売上推移
        </h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={salesData.dailySales}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="date" stroke="#64748b" />
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

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Menu Sales */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h2 className="text-slate-900 mb-4 flex items-center gap-2">
            <Package className="w-5 h-5 text-purple-600" />
            メニュー別売上
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={salesData.menuSales}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" stroke="#64748b" />
              <YAxis stroke="#64748b" />
              <Tooltip
                formatter={(value: number) => formatCurrency(value)}
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
              />
              <Legend />
              <Bar dataKey="revenue" name="売上" fill="#8b5cf6" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Location Sales */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h2 className="text-slate-900 mb-4 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-pink-600" />
            場所別売上
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={salesData.locationSales}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={(entry) => `${entry.name}: ${formatCurrency(entry.revenue)}`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="revenue"
              >
                {salesData.locationSales.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => formatCurrency(value)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Staff Sales */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        <h2 className="text-slate-900 mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-blue-600" />
          スタッフ別売上
        </h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={salesData.staffSales} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis type="number" stroke="#64748b" />
            <YAxis dataKey="name" type="category" stroke="#64748b" width={150} />
            <Tooltip
              formatter={(value: number) => formatCurrency(value)}
              contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
            />
            <Legend />
            <Bar dataKey="revenue" name="売上" fill="#3b82f6" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Summary Table */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mt-6">
        <h2 className="text-slate-900 mb-4">詳細サマリー</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-3 px-4 text-slate-700">カテゴリ</th>
                <th className="text-left py-3 px-4 text-slate-700">項目</th>
                <th className="text-right py-3 px-4 text-slate-700">売上</th>
                <th className="text-right py-3 px-4 text-slate-700">件数</th>
              </tr>
            </thead>
            <tbody>
              {salesData.menuSales.map((item, index) => (
                <tr key={index} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 px-4 text-slate-600">メニュー</td>
                  <td className="py-3 px-4 text-slate-900">{item.name}</td>
                  <td className="py-3 px-4 text-right text-slate-900">{formatCurrency(item.revenue)}</td>
                  <td className="py-3 px-4 text-right text-slate-600">{item.count}件</td>
                </tr>
              ))}
              {salesData.locationSales.map((item, index) => (
                <tr key={index} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 px-4 text-slate-600">場所</td>
                  <td className="py-3 px-4 text-slate-900">{item.name}</td>
                  <td className="py-3 px-4 text-right text-slate-900">{formatCurrency(item.revenue)}</td>
                  <td className="py-3 px-4 text-right text-slate-600">{item.count}件</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
