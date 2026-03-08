import { useEffect, useState, useMemo, useCallback } from 'react';
import { apiRequest, consumeCalendarPrefetch } from '../utils/api';
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

// ────────────────────────────────────────────────────────────
// スケルトン UI
// ロード中でもカレンダーの骨格を表示し「空白の間」をなくす
// ────────────────────────────────────────────────────────────
function CalendarSkeleton({ year, month }: { year: number; month: number }) {
  const grid = useMemo(() => getMonthGrid(year, month), [year, month]);
  // 予約が入っているように見せる固定パターン（列インデックスで決定）
  const hasPlaceholder = (col: number, row: number) => (col + row * 3) % 5 === 0;

  return (
    <div className="animate-pulse">
      {/* ヘッダー骨格 */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="h-7 w-28 bg-slate-200 rounded" />
        <div className="flex items-center gap-2">
          <div className="h-9 w-32 bg-slate-200 rounded-lg" />
          <div className="h-9 w-20 bg-slate-200 rounded-lg" />
        </div>
      </div>

      {/* カレンダーグリッド骨格 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* 曜日ヘッダー */}
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
          {WEEKDAYS_JA.map((day, idx) => (
            <div
              key={day}
              className={`text-center py-2 text-sm font-semibold ${
                idx === 0 ? 'text-red-400' : idx === 6 ? 'text-blue-400' : 'text-slate-400'
              }`}
            >
              {day}
            </div>
          ))}
        </div>

        {/* 日付セル */}
        {grid.map((row, rowIdx) => (
          <div key={rowIdx} className="grid grid-cols-7 border-b border-slate-100 last:border-b-0">
            {row.map((cellDate, colIdx) => (
              <div
                key={cellDate ? cellDate.toISOString().slice(0, 10) : `e-${rowIdx}-${colIdx}`}
                className={`min-h-[100px] p-1 border-r border-slate-100 last:border-r-0 ${
                  !cellDate ? 'bg-slate-50' : ''
                }`}
              >
                {cellDate && (
                  <>
                    <div className="h-4 w-5 bg-slate-200 rounded mb-1.5" />
                    {hasPlaceholder(colIdx, rowIdx) && (
                      <div className="h-5 w-full bg-slate-200 rounded mb-0.5" />
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
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

      // ── プリフェッチ結果を優先して使用 ──────────────────────
      // ログイン直後なら /calendar はすでに進行中（または完了済み）。
      // await すると即座に値が返るか、残りミリ秒だけ待つだけでよい。
      const prefetched = consumeCalendarPrefetch(monthParam);
      let calendarData: {
        reservations: any[]; locations: any[]; menu_items: any[]; users: any[];
      } | null = null;

      if (prefetched) {
        console.log('[CalendarPage] プリフェッチ結果を使用');
        calendarData = await prefetched;
      }

      // プリフェッチがない、または失敗した場合は通常リクエスト
      if (!calendarData) {
        try {
          calendarData = await apiRequest<{
            reservations: any[]; locations: any[]; menu_items: any[]; users: any[];
          }>(`/calendar?month=${monthParam}`);
        } catch (primaryErr) {
          console.warn('[CalendarPage] /calendar 失敗、フォールバックへ:', primaryErr);
        }
      }

      if (calendarData) {
        // ── 正常系：単一エンドポイントからすべてのデータを取得 ──
        setReservations(calendarData.reservations || []);
        setLocations(calendarData.locations || []);
        setMenuItems(calendarData.menu_items || []);
        setUsers(calendarData.users || []);
      } else {
        // ── フォールバック：個別エンドポイントを並列取得 ────────
        // すべての結果を await してから setLoading(false) を呼ぶ（fire-and-forget を防ぐ）
        console.log('[CalendarPage] フォールバック: 個別エンドポイントを並列取得');
        const [resResult, locResult, menuResult, usersResult] = await Promise.allSettled([
          apiRequest(`/reservations?month=${monthParam}`),
          apiRequest('/locations'),
          apiRequest('/menu-items'),
          apiRequest('/users'),
        ]);

        if (resResult.status === 'fulfilled') {
          setReservations((resResult.value as any).reservations || []);
        } else {
          console.error('[CalendarPage] /reservations 失敗:', resResult.reason);
          toast.error('予約データの読み込みに失敗しました');
        }
        if (locResult.status === 'fulfilled') {
          setLocations((locResult.value as any).locations || []);
        } else {
          console.error('[CalendarPage] /locations 失敗:', locResult.reason);
        }
        if (menuResult.status === 'fulfilled' && (menuResult.value as any)?.menu_items) {
          setMenuItems((menuResult.value as any).menu_items);
        } else if (menuResult.status === 'rejected') {
          console.warn('[CalendarPage] /menu-items 失敗:', menuResult.reason);
        }
        if (usersResult.status === 'fulfilled' && (usersResult.value as any)?.users) {
          setUsers((usersResult.value as any).users);
        } else if (usersResult.status === 'rejected') {
          console.warn('[CalendarPage] /users 失敗:', usersResult.reason);
        }
      }
    } catch (err: any) {
      console.error('[CalendarPage] データ読み込み失敗:', err);
      toast.error('データの読み込みに失敗しました');
    } finally {
      // すべての await が完了してから loading を false にする
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

  // ── ロード中はスケルトン UI を表示 ──────────────────────────
  // 単純なスピナーではなくカレンダー骨格を見せることで
  // 「空白の間」の知覚を軽減する
  if (loading) {
    return <CalendarSkeleton year={year} month={month} />;
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
