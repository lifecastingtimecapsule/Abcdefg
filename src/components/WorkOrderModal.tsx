import { useState, useEffect } from 'react';
import { apiRequest } from '../utils/api';
import { toast } from 'sonner@2.0.3';
import { X, Edit2, Calendar, Package, Clock, User } from 'lucide-react';

interface WorkOrderModalProps {
  workOrder: any | null;
  reservations: any[];
  customers: any[];
  onSave: () => void;
  onClose: () => void;
  mode?: 'view' | 'edit';
}

export function WorkOrderModal({ workOrder, reservations, customers, onSave, onClose, mode = 'edit' }: WorkOrderModalProps) {
  const [currentMode, setCurrentMode] = useState<'view' | 'edit'>(mode);
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

  const isViewMode = currentMode === 'view' && workOrder;

  useEffect(() => {
    setCurrentMode(mode);
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
  }, [workOrder, mode]);

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
      toast.success(workOrder ? '制作物情報を更新しました' : '新しい制作物を登録しました');
    } catch (err: any) {
      console.error('Save error:', err);
      const errorMessage = err.message || '保存に失敗しました';
      setError(errorMessage);
      
      // Show specific message for duplicate work orders
      if (errorMessage.includes('既に存在')) {
        toast.error('同じ予約・同じ商品タイプの制作物が既に登録されています');
      } else {
        toast.error('保存に失敗しました');
      }
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '未設定';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'Asia/Tokyo',
    }).format(date);
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

  const reservation = reservations.find(r => r.reservation_id === formData.reservation_id);
  const customer = reservation ? customers.find(c => c.customer_id === reservation.customer_id) : null;

  return (
    <div 
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <h2 className="text-slate-900">
              {isViewMode ? '制作物詳細' : workOrder ? '制作物編集' : '制作物追加'}
            </h2>
            {isViewMode && (
              <button
                onClick={() => setCurrentMode('edit')}
                className="p-2 hover:bg-blue-50 rounded-lg transition text-blue-600"
                title="編集モードに切り替え"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            )}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {isViewMode ? (
          <div className="p-6 space-y-6">
            {/* 顧客情報 */}
            {customer && (
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100">
                <div className="flex items-center gap-2 mb-3">
                  <User className="w-5 h-5 text-blue-600" />
                  <span className="text-blue-900">顧客情報</span>
                </div>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-slate-600">お子さま名: </span>
                    <span className="text-slate-900">{customer.child_name || '-'}</span>
                  </div>
                  {customer.external_customer_number && (
                    <div>
                      <span className="text-slate-600">顧客番号: </span>
                      <span className="text-slate-900">{customer.external_customer_number}</span>
                    </div>
                  )}
                  {reservation && (
                    <div>
                      <span className="text-slate-600">予約日時: </span>
                      <span className="text-slate-900">
                        {new Intl.DateTimeFormat('ja-JP', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          timeZone: 'Asia/Tokyo',
                        }).format(new Date(reservation.reservation_date_time))}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 制作物情報 */}
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Package className="w-5 h-5 text-slate-500 mt-1" />
                <div className="flex-1">
                  <div className="text-sm text-slate-600 mb-1">作品タイプ</div>
                  <div className="text-slate-900">{formData.product_type || '-'}</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-5 h-5 mt-1 flex items-center justify-center">
                  <div className={`w-3 h-3 rounded-full ${
                    formData.status === '制作中' ? 'bg-yellow-500' :
                    formData.status === 'お渡し待ち' ? 'bg-green-500' :
                    'bg-blue-500'
                  }`} />
                </div>
                <div className="flex-1">
                  <div className="text-sm text-slate-600 mb-1">ステータス</div>
                  <span className={`inline-block px-3 py-1 rounded-full text-sm ${
                    formData.status === '制作中' ? 'bg-yellow-100 text-yellow-700' :
                    formData.status === 'お渡し待ち' ? 'bg-green-100 text-green-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {formData.status}
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-slate-500 mt-1" />
                <div className="flex-1">
                  <div className="text-sm text-slate-600 mb-1">納期</div>
                  <div className="text-slate-900">{formatDate(formData.due_date)}</div>
                </div>
              </div>

              {formData.delivered_date && (
                <div className="flex items-start gap-3">
                  <Calendar className="w-5 h-5 text-slate-500 mt-1" />
                  <div className="flex-1">
                    <div className="text-sm text-slate-600 mb-1">引渡し日</div>
                    <div className="text-slate-900">{formatDate(formData.delivered_date)}</div>
                  </div>
                </div>
              )}

              {formData.notes_internal && (
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 mt-1" />
                  <div className="flex-1">
                    <div className="text-sm text-slate-600 mb-1">制作メモ</div>
                    <div className="text-slate-700 bg-slate-50 rounded-lg p-3 whitespace-pre-wrap">
                      {formData.notes_internal}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-3 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition"
              >
                閉じる
              </button>
            </div>
          </div>
        ) : (
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
        )}
      </div>
    </div>
  );
}
