import { useEffect, useState } from 'react';
import { apiRequest } from '../utils/api';
import { Calendar, AlertCircle, Clock, Package } from 'lucide-react';

export function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const result = await apiRequest('/dashboard');
      setData(result);
    } catch (err: any) {
      console.error('Dashboard load error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
        エラー: {error}
      </div>
    );
  }

  const isOverdue = (dueDate: string) => {
    return new Date(dueDate) < new Date();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('ja-JP', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const formatDateOnly = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('ja-JP', {
      month: 'numeric',
      day: 'numeric',
    }).format(date);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <h1 className="text-slate-900">ダッシュボード</h1>

      {/* Top 5 Priority Work Orders */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Package className="w-6 h-6 text-blue-500" />
          <h2 className="text-slate-900">優先制作トップ5</h2>
        </div>

        {data.top_work_orders.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center text-slate-500">
            制作物がありません
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {data.top_work_orders.map((wo: any) => (
              <div
                key={wo.work_order_id}
                className={`bg-white rounded-2xl p-4 shadow-sm border-2 transition hover:shadow-md ${
                  isOverdue(wo.due_date) && wo.status !== '引渡し済'
                    ? 'border-red-300 bg-red-50'
                    : 'border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="text-sm text-slate-600">{wo.customer?.customer_code || '-'}</div>
                  {isOverdue(wo.due_date) && wo.status !== '引渡し済' && (
                    <AlertCircle className="w-5 h-5 text-red-500" />
                  )}
                </div>

                <h3 className="text-slate-900 mb-2">{wo.customer?.child_name || '未設定'}</h3>

                <div className="space-y-2 text-sm">
                  <div className="text-slate-700">{wo.product_type}</div>
                  
                  <div className="flex items-center gap-2 text-slate-600">
                    <Clock className="w-4 h-4" />
                    <span>納期: {formatDateOnly(wo.due_date)}</span>
                  </div>

                  <div className={`inline-block px-3 py-1 rounded-full text-xs ${
                    wo.status === '制作中' ? 'bg-yellow-100 text-yellow-700' :
                    wo.status === 'お渡し待ち' ? 'bg-green-100 text-green-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {wo.status}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Today's Reservations */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-6 h-6 text-green-500" />
          <h2 className="text-slate-900">今日の予約</h2>
        </div>

        {data.today_reservations.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center text-slate-500">
            今日の予約はありません
          </div>
        ) : (
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-slate-700">時間</th>
                    <th className="px-4 py-3 text-left text-slate-700">顧客</th>
                    <th className="px-4 py-3 text-left text-slate-700">内容</th>
                    <th className="px-4 py-3 text-left text-slate-700">支払</th>
                    <th className="px-4 py-3 text-left text-slate-700">ステータス</th>
                  </tr>
                </thead>
                <tbody>
                  {data.today_reservations.map((reservation: any) => (
                    <tr key={reservation.reservation_id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-900">
                        {formatDate(reservation.reservation_date_time)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-slate-900">{reservation.customer?.child_name || '-'}</div>
                        <div className="text-sm text-slate-600">{reservation.customer?.customer_code || '-'}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{reservation.work_required || '-'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-3 py-1 rounded-full text-xs ${
                          reservation.payment_status === 'paid' ? 'bg-green-100 text-green-700' :
                          reservation.payment_status === 'unpaid' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {reservation.payment_status === 'paid' ? '支払済' :
                           reservation.payment_status === 'unpaid' ? '未払' : reservation.payment_status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-3 py-1 rounded-full text-xs ${
                          reservation.status === 'confirmed' ? 'bg-blue-100 text-blue-700' :
                          reservation.status === 'tentative' ? 'bg-yellow-100 text-yellow-700' :
                          reservation.status === 'done' ? 'bg-green-100 text-green-700' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {reservation.status === 'confirmed' ? '確定' :
                           reservation.status === 'tentative' ? '仮予約' :
                           reservation.status === 'done' ? '完了' :
                           reservation.status === 'canceled' ? 'キャンセル' : reservation.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Tentative Reservations */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <AlertCircle className="w-6 h-6 text-yellow-500" />
          <h2 className="text-slate-900">未処理の仮予約</h2>
        </div>

        {data.tentative_reservations.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center text-slate-500">
            仮予約はありません
          </div>
        ) : (
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-slate-700">予約日時</th>
                    <th className="px-4 py-3 text-left text-slate-700">顧客</th>
                    <th className="px-4 py-3 text-left text-slate-700">内容</th>
                    <th className="px-4 py-3 text-left text-slate-700">メモ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.tentative_reservations.map((reservation: any) => (
                    <tr key={reservation.reservation_id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-900">
                        {formatDate(reservation.reservation_date_time)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-slate-900">{reservation.customer?.child_name || '-'}</div>
                        <div className="text-sm text-slate-600">{reservation.customer?.customer_code || '-'}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{reservation.work_required || '-'}</td>
                      <td className="px-4 py-3 text-slate-600 text-sm">{reservation.notes_staff || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
