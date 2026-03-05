import { useEffect, useState, useMemo, useCallback } from 'react';
import { apiRequest } from '../utils/api';
import { toast } from 'sonner@2.0.3';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { ReservationModal } from './ReservationModal';
import { WorkOrderModal } from './WorkOrderModal';
import { Reservation, Customer, Location, User, MenuItem, WorkOrder } from '../types';

const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];

function getMonthGrid(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startDow = first.getDay();
  const daysInMonth = last.getDate();
  const rows: (Date | null)[][] = [];
  let row: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) row.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    row.push(new Date(year, month, d));
    if (row.length === 7) { rows.push(row); row = []; }
  }
  if (row.length > 0) {
    while (row.length < 7) row.push(null);
    rows.push(row);
  }
  return rows;
}

function getStatusColor(status: string) {
  if (status === 'confirmed') return 'bg-blue-500 text-white';
  if (status === 'tentative') return 'bg-amber-400 text-slate-900';
  if (status === 'cancelled') return 'bg-red-500 text-white';
  if (status === 'completed') return 'bg-green-500 text-white';
  return 'bg-slate-400 text-white';
}

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

  const year = date.getFullYear();
  const month = date.getMonth();
  const monthParam = useMemo(() => {
    return `${year}-${String(month + 1).padStart(2, '0')}`;
  }, [year, month]);

  useEffect(() => { loadCalendarData(); }, [monthParam]);

  const loadCalendarData = async () => {
    try {
      setLoading(true);
      let loaded = false;
      try {
        const data = await apiRequest<{
          reservations: any[]; locations: any[]; menu_items: any[]; users: any[];
        }>(`/calendar?month=${monthParam}`);
        setReservations(data.reservations || []);
        setLocations(data.locations || []);
        setMenuItems(data.menu_items || []);
        setUsers(data.users || []);
        loaded = true;
      } catch (_) {}

      if (!loaded) {
        const [resResult, locResult] = await Promise.allSettled([
          apiRequest(`/reservations?month=${monthParam}`),
          apiRequest('/locations'),
        ]);
        if (resResult.status === 'fulfilled') setReservations((resResult.value as any).reservations || []);
        else toast.error('予約データの読み込みに失敗しました');
        if (locResult.status === 'fulfilled') setLocations((locResult.value as any).locations || []);

        Promise.allSettled([
          apiRequest('/menu-items'),
          apiRequest('/users'),
        ]).then(([menu, u]) => {
          if (menu.status === 'fulfilled' && (menu.value as any)?.menu_items) setMenuItems((menu.value as any).menu_items);
          if (u.status === 'fulfilled' && (u.value as any)?.users) setUsers((u.value as any).users);
        });
      }
    } catch (err: any) {
      toast.error('データの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (reservationId: string) => {
    try {
      await apiRequest(`/reservations/${reservationId}`, { method: 'DELETE' });
      toast.success('予約を削除しました');
      await loadCalendarData();
    } catch (err: any) {
      toast.error('削除に失敗しました: ' + err.message);
    }
  };

  const handleSave = async () => {
    setModalOpen(false);
    setEditingReservation(null);
    await loadCalendarData();
  };

  const eventsByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    reservations.forEach((r: any) => {
      const customerName = r.customer_name ?? r.child_name ?? r.parent_name ?? '名称未設定';
      const start = new Date(r.reservation_date_time);
      const key = start.toISOString().slice(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push({
        id: r.reservation_id,
        title: customerName,
        start,
        resource: r,
        status: r.status,
      });
    });
    return map;
  }, [reservations]);

  const handleSelectEvent = useCallback(async (event: any) => {
    try {
      setDetailLoading(true);
      const data = await apiRequest(`/reservations/${event.resource.reservation_id}`) as any;
      setCustomersForModal(data.customer ? [data.customer] : []);
      setEditingReservation(data.reservation);
      setReservationMode('view');
      setUsers(prev => (prev.length > 0 ? prev : (data.users || [])));
      setModalOpen(true);
    } catch (err: any) {
      toast.error('詳細の取得に失敗しました');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const monthGrid = useMemo(() => getMonthGrid(year, month), [year, month]);

  const prevMonth = () => setDate(new Date(year, month - 1, 1));
  const nextMonth = () => setDate(new Date(year, month + 1, 1));
  const goToday = () => setDate(new Date());

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[320px]">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      {/* ヘッダー */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-xl font-bold text-slate-900">{year}年{month + 1}月</h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-300 overflow-hidden">
            <button onClick={prevMonth} className="px-3 py-2 hover:bg-slate-100 transition" aria-label="前月">
              <ChevronLeft size={18} />
            </button>
            <button onClick={goToday} className="px-3 py-2 hover:bg-slate-100 transition border-x border-slate-300 text-sm font-medium">
              今日
            </button>
            <button onClick={nextMonth} className="px-3 py-2 hover:bg-slate-100 transition" aria-label="次月">
              <ChevronRight size={18} />
            </button>
          </div>
          <button
            onClick={() => {
              setEditingReservation(null);
              setCustomersForModal([]);
              setReservationMode('edit');
              setModalOpen(true);
            }}
            className="flex items-center gap-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
          >
            <Plus size={16} />
            新規予約
          </button>
        </div>
      </div>

      {/* カレンダー */}
      <div className="relative bg-white rounded-xl border border-slate-200 overflow-hidden">
        {detailLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/75 z-10">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent" />
          </div>
        )}

        {/* 曜日ヘッダー */}
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
          {WEEKDAYS_JA.map((day, idx) => (
            <div
              key={day}
              className={`text-center py-2 text-sm font-semibold ${
                idx === 0 ? 'text-red-500' : idx === 6 ? 'text-blue-500' : 'text-slate-700'
              }`}
            >
              {day}
            </div>
          ))}
        </div>

        {/* 日付グリッド */}
        {monthGrid.map((row, rowIdx) => (
          <div key={rowIdx} className="grid grid-cols-7 border-b border-slate-100 last:border-b-0">
            {row.map((cellDate, colIdx) => {
              const key = cellDate ? cellDate.toISOString().slice(0, 10) : `empty-${rowIdx}-${colIdx}`;
              const events = cellDate ? (eventsByDate[key] || []) : [];
              const isToday = cellDate && new Date().toDateString() === cellDate.toDateString();
              const dow = cellDate?.getDay();
              return (
                <div
                  key={key}
                  className={`min-h-[100px] p-1 border-r border-slate-100 last:border-r-0 ${
                    !cellDate ? 'bg-slate-50' : ''
                  }`}
                >
                  {cellDate && (
                    <>
                      <div className="flex items-center justify-between px-0.5 mb-0.5">
                        <span
                          className={`text-sm font-semibold inline-flex items-center justify-center ${
                            isToday
                              ? 'bg-blue-600 text-white w-7 h-7 rounded-full'
                              : dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-slate-800'
                          }`}
                        >
                          {cellDate.getDate()}
                        </span>
                        {events.length > 0 && (
                          <span className="text-[10px] text-slate-400">{events.length}件</span>
                        )}
                      </div>
                      <div className="flex flex-col gap-0.5">
                        {events.map((ev: any) => (
                          <button
                            key={ev.id}
                            onClick={() => handleSelectEvent(ev)}
                            className={`${getStatusColor(ev.status)} text-left text-xs px-1.5 py-0.5 rounded truncate w-full hover:opacity-80 transition`}
                            title={ev.title}
                          >
                            {ev.title}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ))}
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
