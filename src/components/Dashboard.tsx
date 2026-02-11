import { useEffect, useState } from 'react';
import { apiRequest } from '../utils/api';
import { toast } from 'sonner@2.0.3';
import { Calendar, AlertCircle, Clock, Package, Users } from 'lucide-react';
import { WorkOrderModal } from './WorkOrderModal';
import { ReservationModal } from './ReservationModal';
import { WorkOrder, Reservation, Customer } from '../types';

interface DashboardData {
  top_work_orders: any[];
  today_reservations: any[];
  tentative_reservations: any[];
  stats: {
    total_customers: number;
    active_work_orders: number;
    upcoming_reservations: number;
  };
  overdue_work_orders: number;
}

interface DashboardProps {
  onNavigate?: (page: string) => void;
  userRole?: string;
}

export function Dashboard({ onNavigate, userRole = 'staff' }: DashboardProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WorkOrder | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [selectedReservation, setSelectedReservation] = useState<any | null>(null);
  const [reservationModalOpen, setReservationModalOpen] = useState(false);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const month = new Date().toISOString().slice(0, 7);
      const result = await apiRequest<DashboardData & {
        reservations?: Reservation[];
        customers?: Customer[];
        locations?: any[];
        users?: any[];
        menu_items?: any[];
      }>(`/dashboard?with_lists=1&month=${month}`);
      setData(result);
      if (result.reservations != null) setReservations(result.reservations);
      if (result.customers != null) setCustomers(result.customers);
      if (result.locations != null) setLocations(result.locations);
      if (result.users != null) setUsers(result.users);
      if (result.menu_items != null) setMenuItems(result.menu_items);
    } catch (err: any) {
      console.error('Load dashboard error:', err);
      setError(err.message);
      toast.error('ダッシュボードの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleWorkOrderClick = (workOrder: WorkOrder) => {
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

  const handleReservationClick = (reservation: any) => {
    setSelectedReservation(reservation);
    setReservationModalOpen(true);
  };

  const handleReservationModalClose = () => {
    setReservationModalOpen(false);
    setSelectedReservation(null);
  };

  const handleReservationModalSave = async () => {
    setReservationModalOpen(false);
    setSelectedReservation(null);
    await loadDashboard();
  };

  const handleReservationDelete = async (reservationId: string) => {
    try {
      await apiRequest(`/reservations/${reservationId}`, { method: 'DELETE' });
      toast.success('予約を削除しました');
      await loadDashboard();
    } catch (err: any) {
      console.error('Delete reservation error:', err);
      toast.error('削除に失敗しました: ' + err.message);
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
    const getJapanToday = () => {
      const now = new Date();
      const japanDateStr = now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' });
      return new Date(japanDateStr);
    };
    return new Date(dueDate) < getJapanToday();
  };

  const isCompleted = (status: string) => status === '完成' || status === '受け取り済み' || status === '引渡し済';

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

      {/* Stats Overview */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-slate-600">総顧客数</div>
            <Users className="w-5 h-5 text-blue-500" />
          </div>
          <div className="text-3xl text-slate-900">{data?.stats.total_customers || 0}</div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-slate-600">制作中</div>
            <Package className="w-5 h-5 text-yellow-500" />
          </div>
          <div className="text-3xl text-slate-900">{data?.stats.active_work_orders || 0}</div>
        </div>

        <div 
          onClick={() => onNavigate?.('calendar')}
          className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 cursor-pointer hover:border-green-300 hover:shadow-md transition"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-slate-600">今後の予約</div>
            <Calendar className="w-5 h-5 text-green-500" />
          </div>
          <div className="text-3xl text-slate-900">{data?.stats.upcoming_reservations || 0}</div>
          <div className="text-xs text-slate-500 mt-2">クリックして予約リストへ</div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-slate-600">納期超過</div>
            <AlertCircle className="w-5 h-5 text-red-500" />
          </div>
          <div className="text-3xl text-slate-900">{data?.overdue_work_orders || 0}</div>
        </div>
      </section>

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
                  isOverdue(wo.due_date) && !isCompleted(wo.status)
                    ? 'border-red-300 bg-red-50 hover:border-red-400'
                    : 'border-slate-200 hover:border-blue-300'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  {wo.customer?.external_customer_number && (
                    <div className="text-sm text-slate-600">顧客番号: {wo.customer.external_customer_number}</div>
                  )}
                  {isOverdue(wo.due_date) && !isCompleted(wo.status) && (
                    <AlertCircle className="w-5 h-5 text-red-500" />
                  )}
                </div>

                {/* 納期（大きく表示） */}
                {!isCompleted(wo.status) && (
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
                )}

                <h3 className="text-slate-900 mb-2">{wo.customer?.parent_name || wo.customer?.child_name || '未設定'}</h3>

                <div className="space-y-2 text-sm">
                  <div className="text-slate-700">{wo.product_type}</div>

                  <div className={`inline-block px-3 py-1 rounded-full text-xs ${
                    wo.status === '乾燥中' ? 'bg-orange-100 text-orange-700' :
                    wo.status === '成形' ? 'bg-stone-100 text-stone-700' :
                    wo.status === '着色' ? 'bg-yellow-100 text-yellow-700' :
                    wo.status === '額装' ? 'bg-indigo-100 text-indigo-700' :
                    wo.status === '完成' ? 'bg-emerald-100 text-emerald-700' :
                    'bg-slate-100 text-slate-700'
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
                        <div className="text-slate-900">{reservation.customer?.parent_name || reservation.customer?.child_name || '-'}</div>
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
                          reservation.status === 'tentative' ? 'bg-amber-100 text-amber-700' :
                          reservation.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {reservation.status === 'confirmed' ? '✓ 確定' :
                           reservation.status === 'tentative' ? '⏳ スタンバイ' :
                           reservation.status === 'cancelled' ? '✕ キャンセル' : reservation.status}
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
          <h2 className="text-slate-900">スタンバイ予約</h2>
        </div>

        {data.tentative_reservations.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center text-slate-500">
            スタンバイ予約はありません
          </div>
        ) : (
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-slate-700">予約日時</th>
                    <th className="px-4 py-3 text-left text-slate-700">ステータス</th>
                    <th className="px-4 py-3 text-left text-slate-700">顧客</th>
                    <th className="px-4 py-3 text-left text-slate-700">内容</th>
                    <th className="px-4 py-3 text-left text-slate-700">メモ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.tentative_reservations.map((reservation: any) => (
                    <tr 
                      key={reservation.reservation_id} 
                      className="border-b border-slate-100 hover:bg-blue-50 cursor-pointer transition-colors"
                      onClick={() => handleReservationClick(reservation)}
                    >
                      <td className="px-4 py-3 text-slate-900">
                        {formatDate(reservation.reservation_date_time)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${
                          reservation.status === 'tentative'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-slate-100 text-slate-700'
                        }`}>
                          {reservation.status === 'tentative' ? '⏳ スタンバイ' : reservation.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-slate-900">{reservation.customer?.parent_name || reservation.customer?.child_name || '-'}</div>
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
          menuItems={menuItems}
          onSave={handleModalSave}
          onClose={handleModalClose}
        />
      )}

      {/* Reservation Modal */}
      {reservationModalOpen && (
        <ReservationModal
          reservation={selectedReservation}
          customers={customers}
          locations={locations}
          users={users}
          menuItems={menuItems}
          onSave={handleReservationModalSave}
          onClose={handleReservationModalClose}
          onDelete={handleReservationDelete}
        />
      )}
    </div>
  );
}