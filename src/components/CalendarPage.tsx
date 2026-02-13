import { useEffect, useState, useMemo, useCallback } from 'react';
import { Calendar, momentLocalizer, Views, View } from 'react-big-calendar';
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

export function CalendarPage({ userRole }: { userRole: string }) {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [modalOpen, setModalOpen] = useState(false);
  const [workOrderModalOpen, setWorkOrderModalOpen] = useState(false);
  const [editingReservation, setEditingReservation] = useState<Reservation | null>(null);
  const [editingWorkOrder, setEditingWorkOrder] = useState<WorkOrder | null>(null);
  const [reservationMode, setReservationMode] = useState<'view' | 'edit'>('edit');
  
  const [view, setView] = useState<View>(Views.MONTH);
  const [date, setDate] = useState(new Date());

  const monthParam = useMemo(() => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }, [date]);

  useEffect(() => {
    loadData();
  }, [monthParam]);

  const loadData = async () => {
    try {
      setLoading(true);
      const month = monthParam;
      const results = await Promise.allSettled([
        apiRequest(`/reservations?month=${month}`),
        apiRequest('/customers'),
        apiRequest('/locations'),
        apiRequest('/menu-items'),
        apiRequest('/users'),
        apiRequest(`/work-orders?month=${month}`),
      ]);

      let resData: any = { reservations: [] };
      let menuData: any = { menu_items: [] };

      if (results[0].status === 'fulfilled') {
        resData = results[0].value;
        setReservations(resData.reservations);
      } else {
        console.error('Failed to load reservations:', results[0].reason);
        toast.error('予���データの読み込みに失敗しました');
      }

      if (results[1].status === 'fulfilled') {
        setCustomers(results[1].value.customers);
      }

      if (results[2].status === 'fulfilled') {
        setLocations(results[2].value.locations);
      }

      if (results[3].status === 'fulfilled') {
        menuData = results[3].value;
        setMenuItems(menuData.menu_items || []);
      }

      if (results[4].status === 'fulfilled') {
        setUsers(results[4].value.users);
      } else {
        setUsers([]);
      }

      if (results[5].status === 'fulfilled') {
        setWorkOrders(results[5].value.work_orders || []);
      }

      await autoCreateWorkOrders(resData.reservations, menuData.menu_items || []);
    } catch (err: any) {
      console.error('Load data error:', err);
      toast.error('データの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const autoCreateWorkOrders = async (reservationsList: any[], menuItemsList: any[]) => {
    try {
      const now = new Date();
      const japanNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));

      const pastConfirmedReservations = reservationsList.filter((reservation) => {
        const reservationDate = new Date(reservation.reservation_date_time);
        return (
          reservation.status === 'confirmed' &&
          reservationDate < japanNow
        );
      });

      if (pastConfirmedReservations.length === 0) return;

      const workOrdersData = await apiRequest('/work-orders');
      const existingWorkOrders = workOrdersData.work_orders || [];
      const existingReservationIds = new Set(
        existingWorkOrders.map((wo: any) => wo.reservation_id).filter(Boolean)
      );

      const reservationsNeedingWorkOrders = pastConfirmedReservations.filter(
        (reservation) => !existingReservationIds.has(reservation.reservation_id)
      );

      if (reservationsNeedingWorkOrders.length === 0) return;

      let createdCount = 0;
      for (const reservation of reservationsNeedingWorkOrders) {
        try {
          const reservationDate = new Date(reservation.reservation_date_time);
          const dueDate = new Date(reservationDate);
          dueDate.setDate(dueDate.getDate() + 28);
          const dueDateStr = dueDate.toISOString().split('T')[0];

          const menuItem = menuItemsList.find((m: any) => m.menu_item_id === reservation.menu_item_id);
          const workType = menuItem ? menuItem.name : 'メニュー不明';

          await apiRequest('/work-orders', {
            method: 'POST',
            body: JSON.stringify({
              reservation_id: reservation.reservation_id,
              product_type: workType,
              due_date: dueDateStr,
              status: '制作中',
              notes_internal: '予約確定により自動作成',
            }),
          });
          createdCount++;
        } catch (err) {
          console.error(`Failed to create work order for reservation ${reservation.reservation_id}:`, err);
        }
      }

      if (createdCount > 0) {
        console.log(`✅ ${createdCount}件の制作物を自動作成しました`);
      }
    } catch (err) {
      console.error('Auto-create work orders error:', err);
    }
  };

  const handleDelete = async (reservationId: string) => {
    try {
      await apiRequest(`/reservations/${reservationId}`, { method: 'DELETE' });
      toast.success('予約を削除しました');
      await loadData();
    } catch (err: any) {
      console.error('Delete reservation error:', err);
      toast.error('削除に失敗しました: ' + err.message);
    }
  };

  const handleSave = async () => {
    setModalOpen(false);
    setEditingReservation(null);
    await loadData();
  };

  // Events for Calendar
  const events = useMemo(() => {
    return reservations.map(r => {
      const customer = customers.find(c => c.customer_id === r.customer_id);
      const menuItem = menuItems.find(m => m.menu_item_id === r.menu_item_id);
      const customerName = customer 
        ? (customer.child_name || customer.parent_name || '名称未設���') 
        : '顧客不明';
      
      const start = new Date(r.reservation_date_time);
      const end = new Date(start.getTime() + (r.duration_minutes || 30) * 60000);

      return {
        id: r.reservation_id,
        title: `${customerName} / ${menuItem?.name || 'メニュー不明'}`,
        start,
        end,
        resourceId: r.location_id,
        resource: r,
        status: r.status
      };
    });
  }, [reservations, customers, menuItems]);

  // Resources for Day View
  const resources = useMemo(() => {
    return locations
        .filter(l => l.active_flag !== false)
        .map(l => ({
            id: l.location_id,
            title: l.location_name
        }));
  }, [locations]);

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

  const handleSelectEvent = useCallback((event: any) => {
    setEditingReservation(event.resource);
    setReservationMode('view');
    setModalOpen(true);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
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

      <div className="flex-1 bg-white rounded-2xl shadow-sm p-4 overflow-hidden min-h-[600px]">
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          style={{ height: '100%', minHeight: '600px' }}
          messages={messages}
          views={[Views.MONTH, Views.WEEK, Views.DAY]}
          defaultView={Views.MONTH}
          view={view}
          onView={setView}
          date={date}
          onNavigate={setDate}
          resources={view === Views.DAY ? resources : undefined}
          resourceIdAccessor="id"
          resourceTitleAccessor="title"
          eventPropGetter={eventPropGetter}
          onSelectEvent={handleSelectEvent}
          min={new Date(0, 0, 0, 9, 0, 0)}
          max={new Date(0, 0, 0, 19, 0, 0)}
          step={15}
          timeslots={2}
          popup
          selectable
        />
      </div>

      {modalOpen && (
        <ReservationModal
          reservation={editingReservation}
          customers={customers}
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
          customers={customers}
          menuItems={menuItems}
          onSave={() => {
             setWorkOrderModalOpen(false);
             setEditingWorkOrder(null);
             loadData();
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
