import { useState, useEffect } from 'react';
import { apiRequest } from '../utils/api';
import { X } from 'lucide-react';

interface WorkOrderModalProps {
  workOrder: any | null;
  reservations: any[];
  customers: any[];
  onSave: () => void;
  onClose: () => void;
}

export function WorkOrderModal({ workOrder, reservations, customers, onSave, onClose }: WorkOrderModalProps) {
  const [formData, setFormData] = useState({
    reservation_id: '',
    product_type: '',
    status: '制作中',
    due_date: '',
    delivered_date: '',
    notes_internal: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (workOrder) {
      setFormData({
        reservation_id: workOrder.reservation_id || '',
        product_type: workOrder.product_type || '',
        status: workOrder.status || '制作中',
        due_date: workOrder.due_date?.slice(0, 10) || '',
        delivered_date: workOrder.delivered_date?.slice(0, 10) || '',
        notes_internal: workOrder.notes_internal || '',
      });
    }
  }, [workOrder]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await apiRequest('/work-orders', {
        method: 'POST',
        body: JSON.stringify({
          ...(workOrder ? { work_order_id: workOrder.work_order_id, priority_order: workOrder.priority_order } : {}),
          ...formData,
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

  const getCustomerName = (reservationId: string) => {
    const reservation = reservations.find(r => r.reservation_id === reservationId);
    if (!reservation) return '';
    const customer = customers.find(c => c.customer_id === reservation.customer_id);
    if (!customer) return '';
    const name = customer.child_name || customer.parent_name;
    const customerNumber = customer.external_customer_number;
    return customerNumber ? `${name} (顧客番号: ${customerNumber})` : name;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-8">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-slate-900">{workOrder ? '制作物編集' : '制作物追加'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} className="p-6 space-y-6">
          <div>
            <label className="block text-slate-700 mb-2">予約</label>
            <select
              value={formData.reservation_id}
              onChange={(e) => setFormData({ ...formData, reservation_id: e.target.value })}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">選択してください</option>
              {reservations.map(reservation => (
                <option key={reservation.reservation_id} value={reservation.reservation_id}>
                  {getCustomerName(reservation.reservation_id)} - {new Date(reservation.reservation_date_time).toLocaleDateString('ja-JP')}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 mb-2">作品タイプ</label>
              <input
                type="text"
                value={formData.product_type}
                onChange={(e) => setFormData({ ...formData, product_type: e.target.value })}
                placeholder="例: 額4面、足型単品"
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-slate-700 mb-2">ステータス</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="制作中">制作中</option>
                <option value="お渡し待ち">お渡し待ち</option>
                <option value="引渡し済">引渡し済</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-700 mb-2">納期</label>
              <input
                type="date"
                value={formData.due_date}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-slate-700 mb-2">引渡し日</label>
              <input
                type="date"
                value={formData.delivered_date}
                onChange={(e) => setFormData({ ...formData, delivered_date: e.target.value })}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-700 mb-2">制作メモ</label>
            <textarea
              value={formData.notes_internal}
              onChange={(e) => setFormData({ ...formData, notes_internal: e.target.value })}
              rows={3}
              placeholder="再キャスト必要、キズ対応など"
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
