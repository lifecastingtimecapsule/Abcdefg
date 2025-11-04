import { useEffect, useState } from 'react';
import { apiRequest } from '../utils/api';
import { toast } from 'sonner@2.0.3';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { ReservationModal } from './ReservationModal';
import { Reservation, Customer, Location, User, MenuItem } from '../types';

export function CalendarPage({ userRole }: { userRole: string }) {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingReservation, setEditingReservation] = useState<Reservation | null>(null);
  const [reservationMode, setReservationMode] = useState<'view' | 'edit'>('edit');
  
  // Initialize with Japan's current date
  const getJapanToday = () => {
    const now = new Date();
    const japanDateStr = now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' });
    return new Date(japanDateStr);
  };

  const [currentDate, setCurrentDate] = useState(getJapanToday());
  const [selectedDate, setSelectedDate] = useState(getJapanToday());

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // すべてのデータを並列取得（Promise.allSettledで個別エラーハンドリング）
      const results = await Promise.allSettled([
        apiRequest('/reservations'),
        apiRequest('/customers'),
        apiRequest('/locations'),
        apiRequest('/menu-items'),
        apiRequest('/users'), // スタッフ権限では限定情報のみ、403の可能性あり
      ]);

      let resData: any = { reservations: [] };
      let menuData: any = { menu_items: [] };

      // 各結果を個別に処理
      if (results[0].status === 'fulfilled') {
        resData = results[0].value;
        setReservations(resData.reservations);
      } else {
        console.error('Failed to load reservations:', results[0].reason);
        toast.error('予約データの読み込みに失敗しました');
      }

      if (results[1].status === 'fulfilled') {
        setCustomers(results[1].value.customers);
      } else {
        console.error('Failed to load customers:', results[1].reason);
      }

      if (results[2].status === 'fulfilled') {
        setLocations(results[2].value.locations);
      } else {
        console.error('Failed to load locations:', results[2].reason);
      }

      if (results[3].status === 'fulfilled') {
        menuData = results[3].value;
        setMenuItems(menuData.menu_items || []);
      } else {
        console.error('Failed to load menu items:', results[3].reason);
      }

      if (results[4].status === 'fulfilled') {
        setUsers(results[4].value.users);
      } else {
        console.error('Failed to load users:', results[4].reason);
        setUsers([]); // 403エラー時は空配列で継続
      }

      // Auto-create work orders for past confirmed reservations
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
      // Get current Japan time
      const now = new Date();
      const japanNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));

      // Find past confirmed reservations
      const pastConfirmedReservations = reservationsList.filter((reservation) => {
        const reservationDate = new Date(reservation.reservation_date_time);
        return (
          reservation.status === 'confirmed' &&
          reservationDate < japanNow
        );
      });

      if (pastConfirmedReservations.length === 0) {
        return; // No past confirmed reservations
      }

      // Load existing work orders to check which ones already exist
      const workOrdersData = await apiRequest('/work-orders');
      const existingWorkOrders = workOrdersData.work_orders || [];
      const existingReservationIds = new Set(
        existingWorkOrders.map((wo: any) => wo.reservation_id).filter(Boolean)
      );

      // Filter out reservations that already have work orders
      const reservationsNeedingWorkOrders = pastConfirmedReservations.filter(
        (reservation) => !existingReservationIds.has(reservation.reservation_id)
      );

      if (reservationsNeedingWorkOrders.length === 0) {
        return; // All past confirmed reservations already have work orders
      }

      // Create work orders for reservations that don't have them
      let createdCount = 0;
      for (const reservation of reservationsNeedingWorkOrders) {
        try {
          const reservationDate = new Date(reservation.reservation_date_time);
          
          // Calculate due date: 4 weeks (28 days) after reservation date
          const dueDate = new Date(reservationDate);
          dueDate.setDate(dueDate.getDate() + 28);
          const dueDateStr = dueDate.toISOString().split('T')[0];

          // Get menu name as work type
          const menuItem = menuItemsList.find((m) => m.menu_item_id === reservation.menu_item_id);
          const workType = menuItem ? menuItem.name : 'メニュー不明';

          // Create work order
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
          console.log(`Work order created for reservation ${reservation.reservation_id}`);
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
    if (!confirm('この予約を削除してもよろしいですか？')) return;

    try {
      await apiRequest(`/reservations/${reservationId}`, { method: 'DELETE' });
      await loadData();
    } catch (err: any) {
      alert('削除に失敗しました: ' + err.message);
    }
  };

  const handleSave = async () => {
    setModalOpen(false);
    setEditingReservation(null);
    await loadData();
  };

  const getCustomerName = (customerId: string) => {
    const customer = customers.find(c => c.customer_id === customerId);
    return customer?.child_name || customer?.parent_name || '-';
  };

  const getCustomerCode = (customerId: string) => {
    const customer = customers.find(c => c.customer_id === customerId);
    return customer?.external_customer_number || null;
  };

  const getLocationName = (locationId: string) => {
    const location = locations.find(l => l.location_id === locationId);
    return location?.location_name || '-';
  };

  const getStaffName = (staffId: string) => {
    const staff = users.find(u => u.user_id === staffId);
    return staff?.name || '-';
  };

  const getMenuInfo = (menuItemId: string, additionalUnits: number) => {
    if (!menuItemId) return null;
    const menu = menuItems.find(m => m.menu_item_id === menuItemId);
    if (!menu) return null;
    
    return {
      name: menu.name,
      hasAdditional: additionalUnits > 0,
      additionalUnits,
    };
  };

  // Convert UTC date string to Japan time Date object
  const toJapanDate = (dateString: string) => {
    const date = new Date(dateString);
    // Convert to Japan timezone
    return new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Tokyo',
    }).format(date);
  };

  // Calendar logic
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();

    const days: (Date | null)[] = [];
    
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(null);
    }
    
    // Add all days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }
    
    return days;
  };

  const isSameDay = (date1: Date, date2: Date) => {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  };

  const getReservationsForDate = (date: Date) => {
    return reservations.filter(r => {
      const resDate = toJapanDate(r.reservation_date_time);
      return isSameDay(resDate, date);
    });
  };

  const selectedDateReservations = getReservationsForDate(selectedDate).sort((a, b) => {
    return new Date(a.reservation_date_time).getTime() - new Date(b.reservation_date_time).getTime();
  });

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const calendarDays = getDaysInMonth(currentDate);
  const weekDays = ['日', '月', '火', '水', '木', '金', '土'];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-slate-900">カレンダー</h1>
        <button
          onClick={() => {
            setEditingReservation(null);
            setReservationMode('edit');
            setModalOpen(true);
          }}
          className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-4 py-2 rounded-xl hover:from-blue-600 hover:to-indigo-700 transition"
        >
          <Plus className="w-5 h-5" />
          <span>新規予約</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Calendar - Left Side */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-2xl shadow-sm p-6">
            {/* Month Navigation */}
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={previousMonth}
                className="p-2 hover:bg-slate-100 rounded-lg transition"
              >
                <ChevronLeft className="w-5 h-5 text-slate-600" />
              </button>
              <h2 className="text-slate-900">
                {currentDate.getFullYear()}年 {currentDate.getMonth() + 1}月
              </h2>
              <button
                onClick={nextMonth}
                className="p-2 hover:bg-slate-100 rounded-lg transition"
              >
                <ChevronRight className="w-5 h-5 text-slate-600" />
              </button>
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-2">
              {/* Week day headers */}
              {weekDays.map((day, index) => (
                <div
                  key={day}
                  className={`text-center py-2 text-sm ${
                    index === 0 ? 'text-red-600' : index === 6 ? 'text-blue-600' : 'text-slate-600'
                  }`}
                >
                  {day}
                </div>
              ))}

              {/* Calendar days */}
              {calendarDays.map((day, index) => {
                if (!day) {
                  return <div key={`empty-${index}`} className="aspect-square" />;
                }

                const dayReservations = getReservationsForDate(day);
                const isToday = isSameDay(day, getJapanToday());
                const isSelected = isSameDay(day, selectedDate);
                const dayOfWeek = day.getDay();

                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => setSelectedDate(day)}
                    className={`aspect-square p-2 rounded-xl transition relative ${
                      isSelected
                        ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg'
                        : isToday
                        ? 'bg-blue-50 text-blue-700 border-2 border-blue-500'
                        : dayOfWeek === 0
                        ? 'text-red-600 hover:bg-red-50'
                        : dayOfWeek === 6
                        ? 'text-blue-600 hover:bg-blue-50'
                        : 'text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex flex-col h-full items-center">
                      <span className={isSelected ? 'font-bold' : ''}>{day.getDate()}</span>
                      {dayReservations.length > 0 && (
                        <div className="flex-1 flex items-end justify-center pb-1">
                          <div
                            className={`w-1.5 h-1.5 rounded-full ${
                              isSelected ? 'bg-white' : 'bg-blue-500'
                            }`}
                          />
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Daily Reservations - Right Side */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <div className="mb-4">
              <h3 className="text-slate-900">
                {selectedDate.getMonth() + 1}月{selectedDate.getDate()}日の予約
              </h3>
              <p className="text-sm text-slate-600 mt-1">
                {selectedDateReservations.length}件の予約
              </p>
            </div>

            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {selectedDateReservations.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  この日の予約はありません
                </div>
              ) : (
                selectedDateReservations.map((reservation) => (
                  <div
                    key={reservation.reservation_id}
                    onClick={() => {
                      setEditingReservation(reservation);
                      setReservationMode('view');
                      setModalOpen(true);
                    }}
                    className="border border-slate-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition cursor-pointer"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className="text-blue-600">
                            {formatTime(reservation.reservation_date_time)}
                          </span>
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-xs ${
                              reservation.status === 'confirmed'
                                ? 'bg-blue-100 text-blue-700 font-medium'
                                : reservation.status === 'tentative'
                                ? 'bg-amber-100 text-amber-700'
                                : reservation.status === 'cancelled'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {reservation.status === 'confirmed'
                              ? '✓ 確定'
                              : reservation.status === 'tentative'
                              ? '⏳ スタンバイ'
                              : reservation.status === 'cancelled'
                              ? '✕ キャンセル'
                              : reservation.status}
                          </span>
                          {reservation.payment_status === 'paid' && (
                            <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 font-medium">
                              💰 支払済
                            </span>
                          )}
                        </div>
                        <div className="text-slate-900 mb-1">
                          {getCustomerName(reservation.customer_id)}
                        </div>
                        {(() => {
                          const menuInfo = getMenuInfo(reservation.menu_item_id, reservation.additional_units);
                          return menuInfo ? (
                            <div className="text-sm text-indigo-700 bg-indigo-50 rounded-lg px-2 py-1 mb-2 inline-block">
                              {menuInfo.name}
                              {menuInfo.hasAdditional && (
                                <span className="ml-1 text-indigo-600">
                                  + 追加{menuInfo.additionalUnits}部位
                                </span>
                              )}
                            </div>
                          ) : null;
                        })()}
                        {reservation.work_required && (
                          <div className="text-sm text-slate-700 mt-2">
                            {reservation.work_required}
                          </div>
                        )}
                        <div className="text-sm text-slate-600 mt-1">
                          {getLocationName(reservation.location_id)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
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
        />
      )}
    </div>
  );
}
