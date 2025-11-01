import { useState, useEffect } from 'react';
import { apiRequest } from '../utils/api';
import { X } from 'lucide-react';

interface ReservationModalProps {
  reservation: any | null;
  customers: any[];
  locations: any[];
  users: any[];
  onSave: () => void;
  onClose: () => void;
}

export function ReservationModal({ reservation, customers, locations, users, onSave, onClose }: ReservationModalProps) {
  const [formData, setFormData] = useState({
    reservation_date_time: '',
    location_id: '',
    customer_id: '',
    staff_id_main: '',
    status: 'tentative',
    payment_status: 'unpaid',
    payment_method: '',
    work_required: '',
    notes_staff: '',
    // Customer fields for new customer
    parent_name: '',
    child_name: '',
    phone: '',
    postal_code: '',
    address_text: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [searchPhone, setSearchPhone] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);

  useEffect(() => {
    if (reservation) {
      setFormData({
        ...formData,
        reservation_date_time: reservation.reservation_date_time?.slice(0, 16) || '',
        location_id: reservation.location_id || '',
        customer_id: reservation.customer_id || '',
        staff_id_main: reservation.staff_id_main || '',
        status: reservation.status || 'tentative',
        payment_status: reservation.payment_status || 'unpaid',
        payment_method: reservation.payment_method || '',
        work_required: reservation.work_required || '',
        notes_staff: reservation.notes_staff || '',
      });
    }
  }, [reservation]);

  const handleSearchPhone = async () => {
    if (!searchPhone) return;
    
    try {
      const result = await apiRequest(`/customers/search?phone=${encodeURIComponent(searchPhone)}`);
      setSearchResults(result.customers);
      
      if (result.customers.length === 0) {
        setIsNewCustomer(true);
        setFormData(prev => ({ ...prev, phone: searchPhone }));
      }
    } catch (err: any) {
      console.error('Search error:', err);
    }
  };

  const handleSelectCustomer = (customer: any) => {
    setFormData(prev => ({ ...prev, customer_id: customer.customer_id }));
    setSearchResults([]);
    setIsNewCustomer(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let customerId = formData.customer_id;

      // Create new customer if needed
      if (isNewCustomer && !customerId) {
        const customerData = await apiRequest('/customers', {
          method: 'POST',
          body: JSON.stringify({
            parent_name: formData.parent_name,
            child_name: formData.child_name,
            phone: formData.phone,
            postal_code: formData.postal_code,
            address_text: formData.address_text,
          }),
        });
        customerId = customerData.customer.customer_id;
      }

      // Create/update reservation
      await apiRequest('/reservations', {
        method: 'POST',
        body: JSON.stringify({
          ...(reservation ? { reservation_id: reservation.reservation_id } : {}),
          reservation_date_time: formData.reservation_date_time,
          location_id: formData.location_id,
          customer_id: customerId,
          staff_id_main: formData.staff_id_main || null,
          status: formData.status,
          payment_status: formData.payment_status,
          payment_method: formData.payment_method,
          work_required: formData.work_required,
          notes_staff: formData.notes_staff,
        }),
      });

      onSave();
    } catch (err: any) {
      console.error('Save error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-8">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-slate-900">{reservation ? '予約編集' : '新規予約'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Customer Selection */}
          {!reservation && (
            <div className="space-y-4">
              <label className="block text-slate-700">顧客検索（電話番号）</label>
              <div className="flex gap-2">
                <input
                  type="tel"
                  value={searchPhone}
                  onChange={(e) => setSearchPhone(e.target.value)}
                  placeholder="電話番号で検索"
                  className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={handleSearchPhone}
                  className="px-4 py-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition"
                >
                  検索
                </button>
              </div>

              {searchResults.length > 0 && (
                <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                  <p className="text-sm text-slate-700">既存顧客を選択:</p>
                  {searchResults.map(customer => (
                    <button
                      key={customer.customer_id}
                      type="button"
                      onClick={() => handleSelectCustomer(customer)}
                      className="w-full text-left p-3 bg-white rounded-lg hover:bg-blue-50 transition"
                    >
                      <div className="text-slate-900">{customer.child_name || customer.parent_name}</div>
                      <div className="text-sm text-slate-600">{customer.customer_code} - {customer.phone}</div>
                    </button>
                  ))}
                </div>
              )}

              {isNewCustomer && (
                <div className="bg-blue-50 rounded-xl p-4 space-y-4">
                  <p className="text-sm text-blue-700">新規顧客情報を入力してください</p>
                  
                  <div>
                    <label className="block text-slate-700 mb-2">保護者名</label>
                    <input
                      type="text"
                      value={formData.parent_name}
                      onChange={(e) => setFormData({ ...formData, parent_name: e.target.value })}
                      className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 mb-2">お子さま名</label>
                    <input
                      type="text"
                      value={formData.child_name}
                      onChange={(e) => setFormData({ ...formData, child_name: e.target.value })}
                      className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 mb-2">郵便番号</label>
                    <input
                      type="text"
                      value={formData.postal_code}
                      onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                      className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 mb-2">住所</label>
                    <input
                      type="text"
                      value={formData.address_text}
                      onChange={(e) => setFormData({ ...formData, address_text: e.target.value })}
                      className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Existing customer for edit */}
          {reservation && (
            <div>
              <label className="block text-slate-700 mb-2">顧客</label>
              <select
                value={formData.customer_id}
                onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">選択してください</option>
                {customers.map(customer => (
                  <option key={customer.customer_id} value={customer.customer_id}>
                    {customer.child_name || customer.parent_name} ({customer.customer_code})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Reservation Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 mb-2">予約日時</label>
              <input
                type="datetime-local"
                value={formData.reservation_date_time}
                onChange={(e) => setFormData({ ...formData, reservation_date_time: e.target.value })}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-slate-700 mb-2">拠点</label>
              <select
                value={formData.location_id}
                onChange={(e) => setFormData({ ...formData, location_id: e.target.value })}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">選択してください</option>
                {locations.map(location => (
                  <option key={location.location_id} value={location.location_id}>
                    {location.location_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-700 mb-2">担当スタッフ</label>
              <select
                value={formData.staff_id_main}
                onChange={(e) => setFormData({ ...formData, staff_id_main: e.target.value })}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">未設定</option>
                {users.map(user => (
                  <option key={user.user_id} value={user.user_id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-700 mb-2">ステータス</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="tentative">仮予約</option>
                <option value="confirmed">確定</option>
                <option value="done">完了</option>
                <option value="canceled">キャンセル</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-700 mb-2">支払いステータス</label>
              <select
                value={formData.payment_status}
                onChange={(e) => setFormData({ ...formData, payment_status: e.target.value })}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="unpaid">未払</option>
                <option value="paid">支払済</option>
                <option value="refund_pending">返金待ち</option>
                <option value="refunded">返金済</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-700 mb-2">支払い方法</label>
              <input
                type="text"
                value={formData.payment_method}
                onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                placeholder="現金 / カード / その他"
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-700 mb-2">制作内容</label>
            <input
              type="text"
              value={formData.work_required}
              onChange={(e) => setFormData({ ...formData, work_required: e.target.value })}
              placeholder="例: 額4面×1、足型単品×1"
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-slate-700 mb-2">スタッフメモ</label>
            <textarea
              value={formData.notes_staff}
              onChange={(e) => setFormData({ ...formData, notes_staff: e.target.value })}
              rows={3}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl hover:from-blue-600 hover:to-indigo-700 transition disabled:opacity-50"
            >
              {loading ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
