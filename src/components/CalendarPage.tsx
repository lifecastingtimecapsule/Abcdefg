import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { apiRequest, consumeCalendarPrefetch } from '../utils/api';
import { toast } from 'sonner@2.0.3';
import { Plus, ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import { ReservationModal } from './ReservationModal';
import { WorkOrderModal } from './WorkOrderModal';
import { Reservation, Customer, Location, User, MenuItem, WorkOrder } from '../types';

const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];
const MAX_PER_DAY = 5;

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
  if (status === 'cancelled') return 'bg-red-400 text-white';
  if (status === 'completed') return 'bg-green-500 text-white';
  return 'bg-slate-400 text-white';
}

// 空き枠インジケーターの色
function getAvailabilityStyle(count: number) {
  const remaining = MAX_PER_DAY - count;
  if (remaining <= 0) return { bar: 'bg-red-500', label: '満', labelClass: 'text-red-600 font-bold' };
  if (remaining === 1) return { bar: 'bg-orange-400', label: `残${remaining}`, labelClass: 'text-orange-500 font-semibold' };
  if (remaining <= 3) return { bar: 'bg-yellow-400', label: `残${remaining}`, labelClass: 'text-yellow-600' };
  return { bar: 'bg-emerald-400', label: `残${remaining}`, labelClass: 'text-emerald-600' };
}

function fmt2(n: number) { return String(n).padStart(2, '0'); }

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
                className={`min-h-[148px] p-1.5 border-r border-slate-100 last:border-r-0 ${
                  !cellDate ? 'bg-slate-50' : ''
                }`}
              >
                {cellDate && (
                  <>
                    <div className="h-4 w-5 bg-slate-200 rounded mb-1.5" />
                    {hasPlaceholder(colIdx, rowIdx) && (
                      <div className="h-5 w-full bg-slate-200 rounded mb-0.5" />
                    )}
                    {hasPlaceholder(colIdx + 1, rowIdx) && (
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

interface CalendarPageProps {
  userRole: string;
  /** App.tsx から受け取るアクセス可能ロケーション一覧（ページリフレッシュ時に使用） */
  initialLocations?: Location[];
}

export function CalendarPage({ userRole, initialLocations = [] }: CalendarPageProps) {
  const [reservations, setReservations] = useState<any[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [customersForModal, setCustomersForModal] = useState<Customer[]>([]);
  const [locations, setLocations] = useState<Location[]>(initialLocations);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
    initialLocations[0]?.location_id ?? null
  );
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

  // selectedLocationId を ref で追跡することで、loadCalendarData 内で
  // クロージャの古い値に依存せず常に最新値を参照できる
  const selectedLocationIdRef = useRef<string | null>(selectedLocationId);
  useEffect(() => {
    selectedLocationIdRef.current = selectedLocationId;
  }, [selectedLocationId]);

  // カレンダーデータを適用するヘルパー
  const applyCalendarData = useCallback((calData: any) => {
    setReservations(calData.reservations || []);
    setLocations(prev => calData.locations?.length ? calData.locations : prev);
    setMenuItems(calData.menu_items || []);
    setUsers(calData.users || []);
    if (calData.work_orders) {
      setWorkOrders(calData.work_orders);
    }
  }, []);

  const loadCalendarData = useCallback(async (locationIdOverride?: string | null) => {
    setLoading(true);
    try {
      // ── プリフェッチ結果を優先して使用 ────────────────────────────
      // ログイン直後なら /calendar-data はすでに進行中（または完了済み）。
      const prefetched = consumeCalendarPrefetch(monthParam);

      if (prefetched) {
        console.log('[CalendarPage] プリフェッチ結果を使用');
        const result = await prefetched;
        if (result) {
          const { meData, calendarData } = result;
          // プリフェッチが initialLocations なしに実行された場合（ログイン直後）、
          // meData から locations を補完する
          const locs = (meData.locations as Location[]);
          if (locs?.length > 0) {
            setLocations(locs);
            if (!selectedLocationIdRef.current) {
              const firstLocId = locs[0]?.location_id ?? null;
              setSelectedLocationId(firstLocId);
              selectedLocationIdRef.current = firstLocId;
            }
          }
          applyCalendarData(calendarData);
          return;
        }
      }

      // ── プリフェッチなし: 通常リクエスト ────────────────────────
      // location_id を決定する
      let locId = locationIdOverride !== undefined ? locationIdOverride : selectedLocationIdRef.current;

      // locations がまだ空の場合（稀: 初回リフレッシュで initialLocations が未渡し）、
      // /me を呼んでロケーション一覧を取得する
      if (!locId && locations.length === 0) {
        console.log('[CalendarPage] /me でロケーション取得');
        try {
          const meData = await apiRequest<{ user: any; locations: Location[] }>('/me');
          const locs = meData.locations || [];
          setLocations(locs);
          locId = locs[0]?.location_id ?? null;
          setSelectedLocationId(locId);
          selectedLocationIdRef.current = locId;
        } catch (meErr) {
          console.warn('[CalendarPage] /me 失敗:', meErr);
        }
      }

      const locationParam = locId ? `&location_id=${locId}` : '';
      const calData = await apiRequest(`/calendar-data?month=${monthParam}${locationParam}`);
      applyCalendarData(calData);

    } catch (err: any) {
      console.error('[CalendarPage] データ読み込み失敗:', err);
      toast.error('データの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [monthParam, applyCalendarData]);

  // 月が変わったら再取得
  useEffect(() => {
    loadCalendarData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthParam]);

  // ロケーション切り替え時に再取得（初回マウント時は monthParam の effect に任せる）
  const isFirstMountRef = useRef(true);
  useEffect(() => {
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      return;
    }
    loadCalendarData(selectedLocationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLocationId]);

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
  if (loading) {
    return <CalendarSkeleton year={year} month={month} />;
  }

  // 現在選択中のロケーション名
  const selectedLocation = locations.find(l => l.location_id === selectedLocationId);

  return (
    <div>
      {/* ヘッダー */}
      <div className="flex items-center justify-between gap-3 mb-4">
        {/* 左: 月ナビゲーション */}
        <div className="flex items-center gap-1">
          <button
            onClick={prevMonth}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition"
            aria-label="前月"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={goToday}
            className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition border border-slate-200"
          >
            今日
          </button>
          <button
            onClick={nextMonth}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition"
            aria-label="次月"
          >
            <ChevronRight size={20} />
          </button>
          <h1 className="text-xl font-bold text-slate-900 ml-2 tabular-nums">
            {year}年{month + 1}月
          </h1>
        </div>

        {/* 右: ロケーション + 新規予約 */}
        <div className="flex items-center gap-2">
          {/* ロケーションセレクター */}
          {locations.length > 1 && (
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
              <MapPin size={14} className="text-slate-400 flex-shrink-0" />
              <select
                value={selectedLocationId ?? ''}
                onChange={(e) => setSelectedLocationId(e.target.value || null)}
                className="text-sm text-slate-700 bg-transparent focus:outline-none pr-1"
              >
                {userRole === 'admin' && <option value="">全店舗</option>}
                {locations.map(loc => (
                  <option key={loc.location_id} value={loc.location_id}>{loc.name}</option>
                ))}
              </select>
            </div>
          )}
          {locations.length === 1 && (
            <div className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-600">
              <MapPin size={14} className="text-slate-400" />
              {locations[0].name}
            </div>
          )}
          <button
            onClick={() => {
              setEditingReservation(null);
              setCustomersForModal([]);
              setReservationMode('edit');
              setModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium shadow-sm"
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
              const avail = cellDate ? getAvailabilityStyle(events.length) : null;
              const remaining = MAX_PER_DAY - events.length;
              return (
                <div
                  key={key}
                  className={`min-h-[148px] p-1.5 border-r border-slate-100 last:border-r-0 flex flex-col ${
                    !cellDate ? 'bg-slate-50' : 'bg-white hover:bg-slate-50/50 transition-colors'
                  }`}
                >
                  {cellDate && (
                    <>
                      {/* 日付行 */}
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={`text-sm font-semibold inline-flex items-center justify-center w-7 h-7 rounded-full ${
                            isToday
                              ? 'bg-blue-600 text-white'
                              : dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-slate-800'
                          }`}
                        >
                          {cellDate.getDate()}
                        </span>
                        {/* 空き状況ラベル */}
                        <span className={`text-[10px] ${avail!.labelClass}`}>
                          {remaining <= 0 ? '満' : `残${remaining}`}
                        </span>
                      </div>

                      {/* 予約タグ一覧 */}
                      <div className="flex flex-col gap-0.5 flex-1">
                        {events.map((ev: any) => {
                          const timeStr = `${fmt2(ev.start.getHours())}:${fmt2(ev.start.getMinutes())}`;
                          return (
                            <button
                              key={ev.id}
                              onClick={() => handleSelectEvent(ev)}
                              className={`${getStatusColor(ev.status)} text-left text-xs px-1.5 py-1 rounded-md w-full hover:opacity-80 transition flex items-center gap-1 min-w-0`}
                              title={`${timeStr} ${ev.title}`}
                            >
                              <span className="opacity-80 flex-shrink-0 font-mono">{timeStr}</span>
                              <span className="truncate">{ev.title}</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* 空き枠ドットインジケーター */}
                      <div className="flex items-center gap-0.5 mt-1.5 pt-1 border-t border-slate-100">
                        {Array.from({ length: MAX_PER_DAY }).map((_, i) => (
                          <div
                            key={i}
                            className={`h-1.5 flex-1 rounded-full transition-colors ${
                              i < events.length
                                ? remaining <= 0
                                  ? 'bg-red-400'
                                  : remaining === 1
                                  ? 'bg-orange-400'
                                  : 'bg-blue-400'
                                : 'bg-slate-200'
                            }`}
                          />
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
