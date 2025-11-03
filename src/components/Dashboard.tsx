import { useState, useCallback, useMemo, useEffect } from 'react';
import { Calendar, AlertCircle, Clock, Package, Users } from 'lucide-react';
import { WorkOrderModal } from './WorkOrderModal';
import { ReservationModal } from './ReservationModal';
import { WorkOrder } from '../types';
import { useDashboardData } from '../utils/queries';
import { invalidateQueries } from '../utils/queryClient';
import { getOverdueWorkOrders, getUpcomingDueWorkOrders } from '../utils/workflow/reservationWorkflow';

interface DashboardProps {
  onNavigate?: (page: string) => void;
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WorkOrder | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<any | null>(null);
  const [reservationModalOpen, setReservationModalOpen] = useState(false);

  // React Queryでデータ取得（キャッシュ・リトライ付き）
  const {
    dashboard,
    reservations,
    customers,
    locations,
    users,
    menuItems,
    isLoading,
    isError,
  } = useDashboardData();

  // イベントハンドラーをuseCallbackでメモ化
  const handleWorkOrderClick = useCallback((workOrder: WorkOrder) => {
    setSelectedWorkOrder(workOrder);
    setModalOpen(true);
  }, []);

  const handleModalClose = useCallback(() => {
    setModalOpen(false);
    setSelectedWorkOrder(null);
  }, []);

  const handleModalSave = useCallback(() => {
    setModalOpen(false);
    setSelectedWorkOrder(null);
    // ダッシュボードデータを再取得
    invalidateQueries.dashboard();
  }, []);

  const handleReservationClick = useCallback((reservation: any) => {
    setSelectedReservation(reservation);
    setReservationModalOpen(true);
  }, []);

  const handleReservationModalClose = useCallback(() => {
    setReservationModalOpen(false);
    setSelectedReservation(null);
  }, []);

  const handleReservationModalSave = useCallback(() => {
    setReservationModalOpen(false);
    setSelectedReservation(null);
    // ダッシュボードと予約データを再取得
    invalidateQueries.dashboard();
    invalidateQueries.reservations();
  }, []);

  // 日付関連のユーティリティ関数をuseMemoでメモ化
  const dateUtils = useMemo(() => ({
    isOverdue: (dueDate: string) => {
      const getJapanToday = () => {
        const now = new Date();
        const japanDateStr = now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' });
        return new Date(japanDateStr);
      };
      return new Date(dueDate) < getJapanToday();
    },
    formatDate: (dateString: string) => {
      const date = new Date(dateString);
      return new Intl.DateTimeFormat('ja-JP', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Tokyo',
      }).format(date);
    },
    formatDateOnly: (dateString: string) => {
      const date = new Date(dateString);
      return new Intl.DateTimeFormat('ja-JP', {
        month: 'numeric',
        day: 'numeric',
        timeZone: 'Asia/Tokyo',
      }).format(date);
    },
  }), []);

  // 期限アラート統計
  const overdueCount = useMemo(() => {
    if (!dashboard.data?.top_work_orders) return 0;
    return getOverdueWorkOrders(dashboard.data.top_work_orders).length;
  }, [dashboard.data]);

  const upcomingCount = useMemo(() => {
    if (!dashboard.data?.top_work_orders) return 0;
    return getUpcomingDueWorkOrders(dashboard.data.top_work_orders, 7).length;
  }, [dashboard.data]);

  // ローディング状態
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  // エラー状態
  if (isError || !dashboard.data) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
        ダッシュボードの読み込みに失敗しました。ページを再読み込みしてください。
      </div>
    );
  }

  const data = dashboard.data;

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
          <div className="text-3xl text-slate-900">{data.stats.total_customers || 0}</div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-slate-600">制作中</div>
            <Package className="w-5 h-5 text-yellow-500" />
          </div>
          <div className="text-3xl text-slate-900">{data.stats.active_work_orders || 0}</div>
        </div>

        <div 
          onClick={() => onNavigate?.('calendar')}
          className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 cursor-pointer hover:border-green-300 hover:shadow-md transition"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-slate-600">今後の予約</div>
            <Calendar className="w-5 h-5 text-green-500" />
          </div>
          <div className="text-3xl text-slate-900">{data.stats.upcoming_reservations || 0}</div>
          <div className="text-xs text-slate-500 mt-2">クリックして予約リストへ</div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-slate-600">納期超過</div>
            <AlertCircle className="w-5 h-5 text-red-500" />
          </div>
          <div className="text-3xl text-slate-900">{data.overdue_work_orders || 0}</div>
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
            {data.top_work_orders.map((wo: any) => {
              const dueDate = new Date(wo.due_date);
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              dueDate.setHours(0, 0, 0, 0);
              const daysUntilDue = Math.floor((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              const isOverdue = dateUtils.isOverdue(wo.due_date);

              return (
                <div
                  key={wo.work_order_id}
                  onClick={() => handleWorkOrderClick(wo)}
                  className={`bg-white rounded-2xl p-4 shadow-sm border-2 transition hover:shadow-md cursor-pointer ${
                    isOverdue && wo.status !== '引渡し済'
                      ? 'border-red-300 bg-red-50 hover:border-red-400'
                      : 'border-slate-200 hover:border-blue-300'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    {wo.customer?.external_customer_number && (
                      <div className="text-sm text-slate-600">顧客番号: {wo.customer.external_customer_number}</div>
                    )}
                    {isOverdue && wo.status !== '引渡し済' && (
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
                      <div className="text-2xl text-slate-900">{dateUtils.formatDateOnly(wo.due_date)}</div>
                      {wo.status !== '引渡し済' && daysUntilDue >= 0 && daysUntilDue <= 7 && (
                        <span className={`text-xs px-2 py-1 rounded ${
                          daysUntilDue <= 2 ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          残り{daysUntilDue}日
                        </span>
                      )}
                      {wo.status !== '引渡し済' && daysUntilDue < 0 && (
                        <span className="text-xs px-2 py-1 rounded bg-red-100 text-red-700">
                          {Math.abs(daysUntilDue)}日超過
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 顧客名 */}
                  <div className="text-sm text-slate-900 mb-2">
                    {wo.customer?.parent_name || wo.customer_name || '顧客不明'}
                  </div>

                  {/* ステータス */}
                  <div className="flex items-center justify-between">
                    <span className={`px-2 py-1 rounded text-xs ${
                      wo.status === '未着手' ? 'bg-slate-100 text-slate-700' :
                      wo.status === '制作中' ? 'bg-blue-100 text-blue-700' :
                      wo.status === '完成・引渡し前' ? 'bg-green-100 text-green-700' :
                      wo.status === '引渡し済' ? 'bg-purple-100 text-purple-700' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {wo.status}
                    </span>
                    {wo.priority_rank && (
                      <span className="text-xs text-slate-500">優先度: {wo.priority_rank}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Today's Reservations */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-6 h-6 text-green-500" />
          <h2 className="text-slate-900">本日の予約</h2>
        </div>

        {data.today_reservations.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center text-slate-500">
            本日の予約はありません
          </div>
        ) : (
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-200">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs text-slate-600">予約時間</th>
                    <th className="px-6 py-3 text-left text-xs text-slate-600">顧客名</th>
                    <th className="px-6 py-3 text-left text-xs text-slate-600">施術内容</th>
                    <th className="px-6 py-3 text-left text-xs text-slate-600">担当スタッフ</th>
                    <th className="px-6 py-3 text-left text-xs text-slate-600">ステータス</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {data.today_reservations.map((res: any) => (
                    <tr
                      key={res.reservation_id}
                      onClick={() => handleReservationClick(res)}
                      className="hover:bg-slate-50 cursor-pointer transition"
                    >
                      <td className="px-6 py-4 text-sm text-slate-900">
                        {dateUtils.formatDate(res.reservation_date_time)}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-900">
                        {res.customer?.parent_name || '不明'}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-900">
                        {res.menu_item?.menu_name || '不明'}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-900">
                        {res.staff_main?.display_name || '未割当'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-xs ${
                          res.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                          res.status === 'tentative' ? 'bg-yellow-100 text-yellow-700' :
                          res.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                          res.status === 'rescheduled' ? 'bg-blue-100 text-blue-700' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {res.status === 'confirmed' ? '確定' :
                           res.status === 'tentative' ? '仮予約' :
                           res.status === 'cancelled' ? 'キャンセル' :
                           res.status === 'rescheduled' ? '変更' :
                           res.status}
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
          <Clock className="w-6 h-6 text-yellow-500" />
          <h2 className="text-slate-900">仮予約</h2>
        </div>

        {data.tentative_reservations.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center text-slate-500">
            仮予約はありません
          </div>
        ) : (
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-200">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs text-slate-600">予約日時</th>
                    <th className="px-6 py-3 text-left text-xs text-slate-600">顧客名</th>
                    <th className="px-6 py-3 text-left text-xs text-slate-600">施術内容</th>
                    <th className="px-6 py-3 text-left text-xs text-slate-600">担当スタッフ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {data.tentative_reservations.map((res: any) => (
                    <tr
                      key={res.reservation_id}
                      onClick={() => handleReservationClick(res)}
                      className="hover:bg-slate-50 cursor-pointer transition"
                    >
                      <td className="px-6 py-4 text-sm text-slate-900">
                        {dateUtils.formatDate(res.reservation_date_time)}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-900">
                        {res.customer?.parent_name || '不明'}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-900">
                        {res.menu_item?.menu_name || '不明'}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-900">
                        {res.staff_main?.display_name || '未割当'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Modals */}
      {modalOpen && selectedWorkOrder && (
        <WorkOrderModal
          workOrder={selectedWorkOrder}
          onClose={handleModalClose}
          onSave={handleModalSave}
        />
      )}

      {reservationModalOpen && selectedReservation && (
        <ReservationModal
          reservation={selectedReservation}
          reservations={reservations.data || []}
          customers={customers.data || []}
          locations={locations.data || []}
          users={users.data || []}
          menuItems={menuItems.data || []}
          onClose={handleReservationModalClose}
          onSave={handleReservationModalSave}
        />
      )}
    </div>
  );
}
