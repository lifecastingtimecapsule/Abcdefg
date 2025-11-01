import { useEffect, useState } from 'react';
import { apiRequest } from '../utils/api';
import { Plus, Edit2, Trash2, Search } from 'lucide-react';
import { ReservationModal } from './ReservationModal';

export function ReservationsPage({ userRole }: { userRole: string }) {
  const [reservations, setReservations] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingReservation, setEditingReservation] = useState<any>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [resData, custData, locData] = await Promise.all([
        apiRequest('/reservations'),
        apiRequest('/customers'),
        apiRequest('/locations'),
      ]);

      setReservations(resData.reservations);
      setCustomers(custData.customers);
      setLocations(locData.locations);

      // Try to load users if admin
      if (userRole === 'admin') {
        try {
          const userData = await apiRequest('/users');
          setUsers(userData.users);
        } catch (err) {
          console.error('Failed to load users:', err);
        }
      }
    } catch (err: any) {
      console.error('Load data error:', err);
    } finally {
      setLoading(false);
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
    return customer?.customer_code || '-';
  };

  const getLocationName = (locationId: string) => {
    const location = locations.find(l => l.location_id === locationId);
    return location?.location_name || '-';
  };

  const getStaffName = (staffId: string) => {
    const staff = users.find(u => u.user_id === staffId);
    return staff?.name || '-';
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const filteredReservations = reservations.filter(r => {
    const customerName = getCustomerName(r.customer_id);
    const customerCode = getCustomerCode(r.customer_id);
    const search = searchTerm.toLowerCase();
    return (
      customerName.toLowerCase().includes(search) ||
      customerCode.toLowerCase().includes(search) ||
      r.work_required?.toLowerCase().includes(search)
    );
  });

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
        <h1 className="text-slate-900">予約管理</h1>
        <button
          onClick={() => {
            setEditingReservation(null);
            setModalOpen(true);
          }}
          className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-4 py-2 rounded-xl hover:from-blue-600 hover:to-indigo-700 transition"
        >
          <Plus className="w-5 h-5" />
          <span>新規予約</span>
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="顧客名、顧客番号、内容で検索..."
          className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Reservations Table */}
      <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-slate-700">予約日時</th>
                <th className="px-4 py-3 text-left text-slate-700">顧客</th>
                <th className="px-4 py-3 text-left text-slate-700">拠点</th>
                <th className="px-4 py-3 text-left text-slate-700">内容</th>
                <th className="px-4 py-3 text-left text-slate-700">担当</th>
                <th className="px-4 py-3 text-left text-slate-700">支払</th>
                <th className="px-4 py-3 text-left text-slate-700">ステータス</th>
                <th className="px-4 py-3 text-left text-slate-700">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredReservations.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    予約がありません
                  </td>
                </tr>
              ) : (
                filteredReservations.map((reservation) => (
                  <tr key={reservation.reservation_id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-900">
                      {formatDateTime(reservation.reservation_date_time)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-slate-900">{getCustomerName(reservation.customer_id)}</div>
                      <div className="text-sm text-slate-600">{getCustomerCode(reservation.customer_id)}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{getLocationName(reservation.location_id)}</td>
                    <td className="px-4 py-3 text-slate-700">{reservation.work_required || '-'}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {reservation.staff_id_main ? getStaffName(reservation.staff_id_main) : '-'}
                    </td>
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
                        reservation.status === 'done' ? 'bg-green-100 text-green-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {reservation.status === 'confirmed' ? '確定' :
                         reservation.status === 'tentative' ? '仮予約' :
                         reservation.status === 'done' ? '完了' :
                         reservation.status === 'canceled' ? 'キャンセル' : reservation.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setEditingReservation(reservation);
                            setModalOpen(true);
                          }}
                          className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition"
                          title="編集"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {userRole === 'admin' && (
                          <button
                            onClick={() => handleDelete(reservation.reservation_id)}
                            className="p-2 hover:bg-red-50 text-red-600 rounded-lg transition"
                            title="削除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <ReservationModal
          reservation={editingReservation}
          customers={customers}
          locations={locations}
          users={users}
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
