import { useEffect, useState, useMemo, useCallback, memo } from 'react';
import { Calendar, momentLocalizer, Views } from 'react-big-calendar';
import moment from 'moment';
import 'moment/locale/ja';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { apiRequest } from '../utils/api';
import { toast } from 'sonner@2.0.3';
import { Plus } from 'lucide-react';
import { ReservationModal } from './ReservationModal';
import { WorkOrderModal } from './WorkOrderModal';
import { Reservation, Customer, Location, User, MenuItem, WorkOrder } from '../types';

// 日本語ロケール設定
moment.locale('ja');
const localizer = momentLocalizer(moment);

const messages = {
  allDay: '終日',
  previous: '前へ',
  next: '次へ',
  today: '今日',
  month: '月',
  week: '週',
  day: '日',
  agenda: '予定表',
  date: '日時',
  time: '時間',
  event: 'イベント',
  noEventsInRange: 'この期間に予約はありません',
  showMore: (total: number) => `+${total}件`,
};

const calendarStyle = { height: '100%', minHeight: 'max(1200px, calc(100vh - 180px))' as const };

/** Phase2（users/menuItems/workOrders）更新で親が再レンダーしても、events/date が同じならカレンダーは再描画しない */
const MemoizedCalendar = memo(function MemoizedCalendar_(props: {
  events: any[];
  date: Date;
  onNavigate: (d: Date) => void;
  eventPropGetter: (event: any) => { style?: React.CSSProperties };
  onSelectEvent: (event: any) => void;
}) {
  return (
    <Calendar
      localizer={localizer}
      events={props.events}
      startAccessor="start"
      endAccessor="end"
      style={calendarStyle}
      messages={messages}
      views={[Views.MONTH]}
      view={Views.MONTH}
      date={props.date}
      onNavigate={props.onNavigate}
      eventPropGetter={props.eventPropGetter}
      onSelectEvent={props.onSelectEvent}
      popup
      selectable
      allDayMaxRows={5}
    />
  );
});

export function CalendarPage({ userRole }: { userRole: string }) {
  const [reservations, setReservations] = useState<any[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [customersForModal, setCustomersForModal] = useState<Customer[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [workOrderModalOpen, setWorkOrderModalOpen] = useState(false);
  const [editingReservation, setEditingReservation] = useState<Reservation | null>(null);
  const [editingWorkOrder, setEditingWorkOrder] = useState<WorkOrder | null>(null);
  const [reservationMode, setReservationMode] = useState<'view' | 'edit'>('edit');
  
  const [date, setDate] = useState(new Date());

  const monthParam = useMemo(() => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }, [date]);

  useEffect(() => {
    loadCalendarData();
  }, [monthParam]);

  // 詳細モーダルを開いたときにメニュー一覧がまだ無ければその時点で取得（足りない分を取得）
  useEffect(() => {
    if (!modalOpen || menuItems.length > 0) return;
    apiRequest('/menu-items').then((data: any) => {
      if (data?.menu_items) setMenuItems(data.menu_items);
    }).catch(() => {});
  }, [modalOpen]);

  const loadCalendarData = async () => {
    try {
      setLoading(true);
      const month = monthParam;
      // Phase1: 名前と日付用に「予約一覧＋場所」だけ取得して先にカレンダー表示
      const [resSettled, locSettled] = await Promise.all([
        apiRequest(`/reservations?month=${month}`).then((v: any) => ({ status: 'fulfilled' as const, value: v })).catch(() => ({ status: 'rejected' as const, reason: null })),
        apiRequest('/locations').then((v: any) => ({ status: 'fulfilled' as const, value: v })).catch(() => ({ status: 'rejected' as const, reason: null })),
      ]);
      const resResult = resSettled.status === 'fulfilled' ? resSettled.value : null;
      const locResult = locSettled.status === 'fulfilled' ? locSettled.value : null;

      if (resResult) {
        setReservations((resResult as any).reservations || []);
      } else {
        console.error('Failed to load reservations');
        toast.error('予���データの読み込みに失敗しました');
      }

      if (locResult) setLocations((locResult as any).locations || []);

      setLoading(false);

      // Phase2: 裏でメニュー・ユーザー・制作物を取得（詳細モーダル用）。制作物自動作成は GET /reservations 内で実施済みのためここでは呼ばない
      Promise.allSettled([
        apiRequest('/menu-items'),
        apiRequest('/users'),
        apiRequest(`/work-orders?month=${month}`),
      ]).then(([menu, u, w]) => {
        if (menu.status === 'fulfilled' && (menu as any).value?.menu_items) setMenuItems((menu as any).value.menu_items);
        if (u.status === 'fulfilled' && (u as any).value?.users) setUsers((u as any).value.users);
        else if (u.status === 'rejected') setUsers([]);
        if (w.status === 'fulfilled' && (w as any).value?.work_orders) setWorkOrders((w as any).value.work_orders);
      });
    } catch (err: any) {
      console.error('Load data error:', err);
      toast.error('データの読み込みに失敗しました');
      setLoading(false);
    }
  };

  const handleDelete = async (reservationId: string) => {
    try {
      await apiRequest(`/reservations/${reservationId}`, { method: 'DELETE' });
      toast.success('予約を削除しました');
      await loadCalendarData();
    } catch (err: any) {
      console.error('Delete reservation error:', err);
      toast.error('削除に失敗しました: ' + err.message);
    }
  };

  const handleSave = async () => {
    setModalOpen(false);
    setEditingReservation(null);
    await loadCalendarData();
  };

  // Events for Calendar（APIからcustomer_name取得、フォールバックでchild_name/parent_name）
  const events = useMemo(() => {
    return reservations.map((r: any) => {
      const customerName = r.customer_name ?? r.child_name ?? r.parent_name ?? '名称未設定';
      const start = new Date(r.reservation_date_time);
      const end = new Date(start.getTime() + (r.duration_minutes || 30) * 60000);

      return {
        id: r.reservation_id,
        title: customerName,
        start,
        end,
        resourceId: r.location_id,
        resource: r,
        status: r.status
      };
    });
  }, [reservations]);

  const eventPropGetter = useCallback((event: any) => {
    let backgroundColor = '#64748b'; // slate-500
    if (event.status === 'confirmed') backgroundColor = '#2563eb'; // blue-600
    if (event.status === 'tentative') backgroundColor = '#d97706'; // amber-600
    if (event.status === 'cancelled') backgroundColor = '#dc2626'; // red-600
    if (event.status === 'completed') backgroundColor = '#059669'; // emerald-600
    
    return { 
      style: { 
        backgroundColor,
        borderRadius: '4px',
        opacity: 0.9,
        color: 'white',
        border: 'none',
        display: 'block'
      } 
    };
  }, []);

  const handleSelectEvent = useCallback(async (event: any) => {
    try {
      setDetailLoading(true);
      const data = await apiRequest(`/reservations/${event.resource.reservation_id}`) as any;
      const reservation = data.reservation;
      const customer = data.customer;
      const customersForDetail = customer ? [customer] : [];
      setCustomersForModal(customersForDetail);
      setEditingReservation(reservation);
      setReservationMode('view');
      // 詳細APIで返ってきた users を、まだ裏取得が終わっていなければ補完（足りない分を取得）
      setUsers(prev => (prev.length > 0 ? prev : (data.users || [])));
      setModalOpen(true);
    } catch (err: any) {
      console.error('Fetch reservation detail error:', err);
      toast.error('詳細の取得に失敗しました');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-4 min-h-0">
      <div className="flex-shrink-0 flex items-center justify-between flex-wrap gap-4">
         <h1 className="text-2xl font-bold text-slate-900">予約カレンダー</h1>
         <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-600"></span>確定</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-amber-600"></span>仮予約</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-600"></span>キャンセル</span>
            </div>
            <button
              onClick={() => {
                setEditingReservation(null);
                setCustomersForModal([]);
                setReservationMode('edit');
                setModalOpen(true);
              }}
              className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-4 py-2 rounded-xl hover:from-blue-600 hover:to-indigo-700 transition shadow-sm"
            >
              <Plus className="w-5 h-5" />
              <span>新規予約</span>
            </button>
         </div>
      </div>

      <div className="flex-1 min-h-0 bg-white rounded-2xl shadow-sm p-4 overflow-hidden calendar-compact-wrapper relative">
        {detailLoading && (
          <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-10 rounded-2xl">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent"></div>
          </div>
        )}
        <MemoizedCalendar
          events={events}
          date={date}
          onNavigate={setDate}
          eventPropGetter={eventPropGetter}
          onSelectEvent={handleSelectEvent}
        />
      </div>

      {modalOpen && (
        <ReservationModal
          reservation={editingReservation}
          customers={customersForModal}
          locations={locations}
          users={users}
          menuItems={menuItems}
          mode={reservationMode}
          onSave={handleSave}
          onClose={() => {
            setModalOpen(false);
            setEditingReservation(null);
          }}
          onDelete={handleDelete}
        />
      )}

      {workOrderModalOpen && (
        <WorkOrderModal
          workOrder={editingWorkOrder}
          reservations={reservations}
          customers={customersForModal}
          menuItems={menuItems}
          onSave={() => {
             setWorkOrderModalOpen(false);
             setEditingWorkOrder(null);
             loadCalendarData();
          }}
          onClose={() => {
            setWorkOrderModalOpen(false);
            setEditingWorkOrder(null);
          }}
        />
      )}
    </div>
  );
}
