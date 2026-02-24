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
  // 前月の空白
  for (let i = 0; i < startDow; i++) {
    row.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    row.push(new Date(year, month, d));
    if (row.length === 7) {
      rows.push(row);
      row = [];
    }
  }
  if (row.length > 0) {
    while (row.length < 7) row.push(null);
    rows.push(row);
  }
  return rows;
}

function getStatusBadgeClass(status: string): string {
  if (status === 'confirmed') return 'bg-primary';
  if (status === 'tentative') return 'bg-warning text-dark';
  if (status === 'cancelled') return 'bg-danger';
  if (status === 'completed') return 'bg-success';
  return 'bg-secondary';
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
    const m = String(month + 1).padStart(2, '0');
    return `${year}-${m}`;
  }, [year, month]);

  useEffect(() => {
    loadCalendarData();
  }, [monthParam]);


  const loadCalendarData = async () => {
    try {
      setLoading(true);
      // まず統合 API を試みる（1リクエスト）、失敗時は旧マルチリクエストにフォールバック
      let loaded = false;
      try {
        const data = await apiRequest<{
          reservations: any[];
          locations: any[];
          menu_items: any[];
          users: any[];
        }>(`/calendar?month=${monthParam}`);
        setReservations(data.reservations || []);
        setLocations(data.locations || []);
        setMenuItems(data.menu_items || []);
        setUsers(data.users || []);
        loaded = true;
      } catch (_) {
        // 統合 API が未デプロイの場合は旧方式にフォールバック
      }

      if (!loaded) {
        const [resResult, locResult] = await Promise.allSettled([
          apiRequest(`/reservations?month=${monthParam}`),
          apiRequest('/locations'),
        ]);
        if (resResult.status === 'fulfilled') setReservations((resResult.value as any).reservations || []);
        else toast.error('予約データの読み込みに失敗しました');
        if (locResult.status === 'fulfilled') setLocations((locResult.value as any).locations || []);

        // マスタを非同期で取得
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
      const reservation = data.reservation;
      const customer = data.customer;
      setCustomersForModal(customer ? [customer] : []);
      setEditingReservation(reservation);
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
      <div className="d-flex align-items-center justify-content-center" style={{ minHeight: '320px' }}>
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">読み込み中</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid p-0">
      {/* ヘッダー */}
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
        <h1 className="h4 fw-bold mb-0">予約カレンダー</h1>
        <div className="d-flex align-items-center gap-3 flex-wrap">
          <div className="d-flex align-items-center gap-2">
            <span className="badge bg-primary px-2 py-1" style={{ fontSize: '0.82rem' }}>確定</span>
            <span className="badge bg-warning text-dark px-2 py-1" style={{ fontSize: '0.82rem' }}>仮予約</span>
            <span className="badge bg-danger px-2 py-1" style={{ fontSize: '0.82rem' }}>キャンセル</span>
            <span className="badge bg-success px-2 py-1" style={{ fontSize: '0.82rem' }}>完了</span>
          </div>
          <div className="btn-group">
            <button type="button" className="btn btn-outline-secondary px-3" onClick={prevMonth} aria-label="前月">
              <ChevronLeft size={18} />
            </button>
            <button type="button" className="btn btn-outline-secondary px-3 fw-semibold" onClick={goToday}>
              今日
            </button>
            <button type="button" className="btn btn-outline-secondary px-3" onClick={nextMonth} aria-label="次月">
              <ChevronRight size={18} />
            </button>
          </div>
          <span className="fw-bold fs-5">{year}年{month + 1}月</span>
          <button
            type="button"
            className="btn btn-primary d-flex align-items-center gap-1 px-3"
            onClick={() => {
              setEditingReservation(null);
              setCustomersForModal([]);
              setReservationMode('edit');
              setModalOpen(true);
            }}
          >
            <Plus size={18} />
            新規予約
          </button>
        </div>
      </div>

      {/* カレンダー本体 */}
      <div className="position-relative">
        {detailLoading && (
          <div className="position-absolute top-0 start-0 end-0 bottom-0 d-flex align-items-center justify-content-center bg-white bg-opacity-75 rounded z-2" style={{ zIndex: 10 }}>
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">読み込み中</span>
            </div>
          </div>
        )}

        <div className="card shadow-sm">
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table table-bordered mb-0" style={{ tableLayout: 'fixed', width: '100%' }}>
                <thead className="table-light">
                  <tr>
                    {WEEKDAYS_JA.map((day, idx) => (
                      <th
                        key={day}
                        className="text-center py-2 fw-bold"
                        style={{
                          width: '14.28%',
                          fontSize: '1rem',
                          color: idx === 0 ? '#dc3545' : idx === 6 ? '#0d6efd' : undefined,
                        }}
                      >
                        {day}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {monthGrid.map((row, rowIdx) => (
                    <tr key={rowIdx} style={{ height: '130px' }}>
                      {row.map((cellDate, colIdx) => {
                        const key = cellDate ? cellDate.toISOString().slice(0, 10) : `empty-${rowIdx}-${colIdx}`;
                        const events = cellDate ? (eventsByDate[key] || []) : [];
                        const isToday = cellDate && new Date().toDateString() === cellDate.toDateString();
                        const dow = cellDate?.getDay();
                        return (
                          <td
                            key={key}
                            className="p-1 align-top"
                            style={{
                              verticalAlign: 'top',
                              backgroundColor: !cellDate ? '#f8f9fa' : undefined,
                            }}
                          >
                            {cellDate && (
                              <>
                                <div className="mb-1 d-flex justify-content-between align-items-center px-1">
                                  <span
                                    className={isToday ? 'badge bg-primary rounded-circle' : ''}
                                    style={{
                                      fontSize: '1rem',
                                      fontWeight: 600,
                                      color: isToday ? undefined : dow === 0 ? '#dc3545' : dow === 6 ? '#0d6efd' : '#212529',
                                      width: isToday ? '28px' : undefined,
                                      height: isToday ? '28px' : undefined,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                    }}
                                  >
                                    {cellDate.getDate()}
                                  </span>
                                  {events.length > 0 && (
                                    <small className="text-muted" style={{ fontSize: '0.7rem' }}>
                                      {events.length}件
                                    </small>
                                  )}
                                </div>
                                <div className="d-flex flex-column gap-1">
                                  {events.map((ev: any) => (
                                    <button
                                      key={ev.id}
                                      type="button"
                                      className={`badge ${getStatusBadgeClass(ev.status)} border-0 text-start w-100 text-truncate`}
                                      style={{
                                        fontSize: '0.8rem',
                                        cursor: 'pointer',
                                        padding: '4px 6px',
                                        lineHeight: 1.4,
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                      }}
                                      onClick={() => handleSelectEvent(ev)}
                                      title={ev.title}
                                    >
                                      {ev.title}
                                    </button>
                                  ))}
                                </div>
                              </>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
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
