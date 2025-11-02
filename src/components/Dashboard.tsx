import { useEffect, useState } from 'react';
import { apiRequest } from '../utils/api';
import { Calendar, AlertCircle, Clock, Package } from 'lucide-react';
import { WorkOrderModal } from './WorkOrderModal';

export function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<any>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [reservations, setReservations] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);

  useEffect(() => {
    loadDashboard();
    loadAdditionalData();
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

  const loadAdditionalData = async () => {
    try {
      const [resData, custData] = await Promise.all([
        apiRequest('/reservations'),
        apiRequest('/customers'),
      ]);
      setReservations(resData.reservations);
      setCustomers(custData.customers);
    } catch (err: any) {
      console.error('Failed to load additional data:', err);
    }
  };

  const handleWorkOrderClick = (workOrder: any) => {
    setSelectedWorkOrder(workOrder);
    setModalOpen(true);
  };

  const handleModalClose = () => {
    setModalOpen(false);
    setSelectedWorkOrder(null);
  };

  const handleModalSave = async () => {
    setModalOpen(false);
    setSelectedWorkOrder(null);
    await loadDashboard();
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
    const getJapanToday = () => {
      const now = new Date();
      const japanDateStr = now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' });
      return new Date(japanDateStr);
    };
    return new Date(dueDate) < getJapanToday();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('ja-JP', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Tokyo',
    }).format(date);
  };

  const formatDateOnly = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('ja-JP', {
      month: 'numeric',
      day: 'numeric',
      timeZone: 'Asia/Tokyo',
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
                onClick={() => handleWorkOrderClick(wo)}
                className={`bg-white rounded-2xl p-4 shadow-sm border-2 transition hover:shadow-md cursor-pointer ${
                  isOverdue(wo.due_date) && wo.status !== '引渡し済'
                    ? 'border-red-300 bg-red-50 hover:border-red-400'
                    : 'border-slate-200 hover:border-blue-300'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  {wo.customer?.external_customer_number && (
                    <div className="text-sm text-slate-600">顧客番号: {wo.customer.external_customer_number}</div>
                  )}
                  {isOverdue(wo.due_date) && wo.status !== '引渡し済' && (
                    <AlertCircle className="w-5 h-5 text-red-500" />
                  )}
                </div>

                {/* 納期（大きく表示） */}
                <div className="mb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <span className="text-xs text-slate-500">納期</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-2xl text-slate-900">{formatDateOnly(wo.due_date)}</div>
                    {(() => {
                      const dueDate = new Date(wo.due_date);
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      dueDate.setHours(0, 0, 0, 0);
                      const daysUntilDue = Math.floor((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                      
                      if (wo.status === '引渡し済') return null;
                      if (daysUntilDue < 0) return null; // 期限切れは既存の赤枠で表示
                      if (daysUntilDue <= 7) {
                        return (
                          <span className="px-2 py-1 rounded-full text-xs bg-red-100 text-red-700">
                            1週間以内
                          </span>
                        );
                      }
                      if (daysUntilDue <= 14) {
                        return (
                          <span className="px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-700">
                            2週間以内
                          </span>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </div>

                <h3 className="text-slate-900 mb-2">{wo.customer?.child_name || '未設定'}</h3>

                <div className="space-y-2 text-sm">
                  <div className="text-slate-700">{wo.product_type}</div>

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
                        {reservation.customer?.external_customer_number && (
                          <div className="text-sm text-slate-600">顧客番号: {reservation.customer.external_customer_number}</div>
                        )}
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
                          reservation.status === 'modified' ? 'bg-orange-100 text-orange-700' :
                          reservation.status === 'done' ? 'bg-green-100 text-green-700' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {reservation.status === 'confirmed' ? '確定' :
                           reservation.status === 'tentative' ? '仮予約' :
                           reservation.status === 'modified' ? '予約変更' :
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
                        {reservation.customer?.external_customer_number && (
                          <div className="text-sm text-slate-600">顧客番号: {reservation.customer.external_customer_number}</div>
                        )}
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

      {/* Work Order Modal */}
      {modalOpen && (
        <WorkOrderModal
          workOrder={selectedWorkOrder}
          reservations={reservations}
          customers={customers}
          onSave={handleModalSave}
          onClose={handleModalClose}
        />
      )}
    </div>
  );
}
