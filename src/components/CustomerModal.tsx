import { useState, useEffect } from 'react';
import { apiRequest } from '../utils/api';
import { toast } from 'sonner@2.0.3';
import { X, Edit2, Calendar, MapPin, Package } from 'lucide-react';
import { ReservationModal } from './ReservationModal';

interface CustomerModalProps {
  customer: any | null;
  onSave: () => void;
  onClose: () => void;
  mode?: 'view' | 'edit';
  reservations?: any[];
  menuItems?: any[];
  locations?: any[];
  staffData?: any[];
}

export function CustomerModal({ 
  customer, 
  onSave, 
  onClose, 
  mode = 'edit',
  reservations = [],
  menuItems = [],
  locations = [],
  staffData = []
}: CustomerModalProps) {
  const [currentMode, setCurrentMode] = useState<'view' | 'edit'>(mode);
  const [activeTab, setActiveTab] = useState<'info' | 'reservations'>('info');
  const [formData, setFormData] = useState({
    external_customer_number: '',
    parent_name: '',
    parent_name_kana: '',
    child_name: '',
    child_name_kana: '',
    child_age_years: '',
    child_age_months: '',
    phone: '',
    line_url: '',
    postal_code: '',
    address_text: '',
    notes_internal: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedReservation, setSelectedReservation] = useState<any>(null);
  const [reservationModalOpen, setReservationModalOpen] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);

  useEffect(() => {
    setCurrentMode(mode);
    // Reset to info tab when mode changes
    if (mode === 'edit') {
      setActiveTab('info');
    }
  }, [mode]);

  useEffect(() => {
    if (customer) {
      setFormData({
        external_customer_number: customer.external_customer_number || '',
        parent_name: customer.parent_name || '',
        parent_name_kana: customer.parent_name_kana || '',
        child_name: customer.child_name || '',
        child_name_kana: customer.child_name_kana || '',
        child_age_years: customer.child_age_years?.toString() || '',
        child_age_months: customer.child_age_months?.toString() || '',
        phone: customer.phone || '',
        line_url: customer.line_url || '',
        postal_code: customer.postal_code || '',
        address_text: customer.address_text || '',
        notes_internal: customer.notes_internal || '',
      });
    }
  }, [customer]);

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    try {
      const result = await apiRequest('/customers');
      setCustomers(result.customers);
    } catch (err: any) {
      console.error('Failed to load customers:', err);
    }
  };

  const handleReservationClick = (reservation: any) => {
    setSelectedReservation(reservation);
    setReservationModalOpen(true);
  };

  const handleReservationModalClose = () => {
    setReservationModalOpen(false);
    setSelectedReservation(null);
  };

  const handleReservationModalSave = async () => {
    setReservationModalOpen(false);
    setSelectedReservation(null);
    // Refresh the parent component data
    onSave();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await apiRequest('/customers', {
        method: 'POST',
        body: JSON.stringify({
          ...(customer ? { customer_id: customer.customer_id, customer_code: customer.customer_code } : {}),
          external_customer_number: formData.external_customer_number || null,
          parent_name: formData.parent_name,
          parent_name_kana: formData.parent_name_kana,
          child_name: formData.child_name,
          child_name_kana: formData.child_name_kana,
          child_age_years: formData.child_age_years ? parseInt(formData.child_age_years) : null,
          child_age_months: formData.child_age_months ? parseInt(formData.child_age_months) : null,
          phone: formData.phone,
          line_url: formData.line_url,
          postal_code: formData.postal_code,
          address_text: formData.address_text,
          notes_internal: formData.notes_internal,
        }),
      });

      onSave();
      toast.success(customer ? '顧客情報を更新しました' : '新しい顧客を登録しました');
    } catch (err: any) {
      console.error('Save error:', err);
      setError(err.message);
      toast.error('保存に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const isViewMode = currentMode === 'view';
  const title = isViewMode ? '顧客詳細' : (customer ? '顧客編集' : '新規顧客');

  const getMenuName = (menuItemId: number) => {
    const menuItem = menuItems.find((m) => m.menu_item_id === menuItemId);
    return menuItem ? menuItem.name : '不明なメニュー';
  };

  const getLocationName = (locationId: number) => {
    const location = locations.find((l) => l.location_id === locationId);
    return location ? location.location_name : '不明な場所';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${month}/${day} ${hours}:${minutes}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed': return 'bg-green-100 text-green-700';
      case 'pending': return 'bg-yellow-100 text-yellow-700';
      case 'cancelled': return 'bg-red-100 text-red-700';
      case 'completed': return 'bg-blue-100 text-blue-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'confirmed': return '✓ 確定';
      case 'pending': return '保留中';
      case 'cancelled': return 'キャンセル';
      case 'completed': return '完了';
      default: return status;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-8">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div>
            <h2 className="text-slate-900">{title}</h2>
            {customer && (
              <p className="text-xs text-slate-400 mt-1" title="開発用：内部ID">
                内部ID: {customer.customer_id}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        {customer && isViewMode && (
          <div className="flex border-b border-slate-200">
            <button
              onClick={() => setActiveTab('info')}
              className={`flex-1 px-6 py-3 transition ${
                activeTab === 'info'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              顧客情報
            </button>
            <button
              onClick={() => setActiveTab('reservations')}
              className={`flex-1 px-6 py-3 transition flex items-center justify-center gap-2 ${
                activeTab === 'reservations'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>予約履歴 ({reservations.length})</span>
            </button>
          </div>
        )}

        {activeTab === 'reservations' && customer && isViewMode ? (
          <div className="p-6">
            {reservations.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <Calendar className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                <p>予約履歴がありません</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-[500px] overflow-y-auto">
                {reservations.map((reservation) => (
                  <div
                    key={reservation.reservation_id}
                    onClick={() => handleReservationClick(reservation)}
                    className="bg-slate-50 rounded-xl p-4 border border-slate-200 cursor-pointer hover:bg-slate-100 hover:border-blue-300 transition"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="text-slate-900 mb-1">
                          {formatDate(reservation.reservation_date_time)}
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${getStatusColor(reservation.status)}`}>
                            {reservation.status === 'confirmed'
                              ? '✓ 確定'
                              : reservation.status === 'pending'
                              ? '保留中'
                              : reservation.status === 'cancelled'
                              ? 'キャンセル'
                              : reservation.status === 'completed'
                              ? '完了'
                              : reservation.status}
                          </span>
                          {reservation.payment_status === 'paid' && (
                            <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">
                              💰 支払済
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 text-sm text-slate-600">
                      <div className="flex items-start gap-2">
                        <span className="text-slate-500 shrink-0">メニュー:</span>
                        <div>
                          <span className="text-indigo-700">{getMenuName(reservation.menu_item_id)}</span>
                          {reservation.additional_units > 0 && (
                            <span className="ml-1 text-indigo-600">
                              + 追加{reservation.additional_units}部位
                            </span>
                          )}
                        </div>
                      </div>

                      {reservation.location_id && (
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-slate-400" />
                          <span>{getLocationName(reservation.location_id)}</span>
                        </div>
                      )}

                      {reservation.production_details && (
                        <div className="flex items-start gap-2">
                          <Package className="w-4 h-4 text-slate-400 mt-0.5" />
                          <span>{reservation.production_details}</span>
                        </div>
                      )}

                      {reservation.total_price > 0 && (
                        <div className="flex items-center gap-2 pt-2 border-t border-slate-300">
                          <span className="text-slate-500">金額:</span>
                          <span className="text-slate-900">¥{reservation.total_price.toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-3 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition text-center"
              >
                閉じる
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} className="p-6 space-y-6">
            {/* 顧客番号 */}
            <div>
              <label className="block text-slate-700 mb-2">
                表示用顧客番号
                {!isViewMode && <span className="text-slate-500 text-sm ml-2">（任意）</span>}
              </label>
              <input
                type="text"
                value={formData.external_customer_number}
                onChange={(e) => setFormData({ ...formData, external_customer_number: e.target.value })}
                placeholder={isViewMode ? (formData.external_customer_number ? '' : '未設定') : '例: 12345 または ABC-001'}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={isViewMode}
              />
              {!isViewMode && (
                <p className="text-xs text-slate-500 mt-1">
                  社内で使用している顧客番号を入力できます。未入力でも問題ありません。
                </p>
              )}
            </div>

            {/* 保護者情報 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 mb-2">
                保護者名 {!isViewMode && <span className="text-red-500">*</span>}
              </label>
              <input
                type="text"
                value={formData.parent_name}
                onChange={(e) => setFormData({ ...formData, parent_name: e.target.value })}
                placeholder="例: 山田 花子"
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                required={!isViewMode}
                disabled={isViewMode}
              />
            </div>

            <div>
              <label className="block text-slate-700 mb-2">保護者名フリガナ</label>
              <input
                type="text"
                value={formData.parent_name_kana}
                onChange={(e) => setFormData({ ...formData, parent_name_kana: e.target.value })}
                placeholder="例: ヤマダ ハナコ"
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={isViewMode}
              />
            </div>
          </div>

          {/* お子さま情報 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 mb-2">
                お子さま名 {!isViewMode && <span className="text-red-500">*</span>}
              </label>
              <input
                type="text"
                value={formData.child_name}
                onChange={(e) => setFormData({ ...formData, child_name: e.target.value })}
                placeholder="例: 太郎"
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                required={!isViewMode}
                disabled={isViewMode}
              />
            </div>

            <div>
              <label className="block text-slate-700 mb-2">お子さま名フリガナ</label>
              <input
                type="text"
                value={formData.child_name_kana}
                onChange={(e) => setFormData({ ...formData, child_name_kana: e.target.value })}
                placeholder="例: タロウ"
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={isViewMode}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 mb-2">お子さま年齢（歳）</label>
              <input
                type="number"
                min="0"
                max="20"
                value={formData.child_age_years}
                onChange={(e) => setFormData({ ...formData, child_age_years: e.target.value })}
                placeholder="0"
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={isViewMode}
              />
            </div>

            <div>
              <label className="block text-slate-700 mb-2">0歳場合（ヶ月）</label>
              <input
                type="number"
                min="0"
                max="11"
                value={formData.child_age_months}
                onChange={(e) => setFormData({ ...formData, child_age_months: e.target.value })}
                placeholder="0"
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={isViewMode}
              />
            </div>
          </div>

          {/* 連絡先情報 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 mb-2">電話番号</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="例: 090-1234-5678"
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={isViewMode}
              />
            </div>

            <div>
              <label className="block text-slate-700 mb-2">LINE URL</label>
              <input
                type="url"
                value={formData.line_url}
                onChange={(e) => setFormData({ ...formData, line_url: e.target.value })}
                placeholder="例: https://line.me/ti/p/..."
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={isViewMode}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 mb-2">郵便番号</label>
              <input
                type="text"
                value={formData.postal_code}
                onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                placeholder="例: 123-4567"
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={isViewMode}
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-700 mb-2">住所</label>
            <input
              type="text"
              value={formData.address_text}
              onChange={(e) => setFormData({ ...formData, address_text: e.target.value })}
              placeholder="例: 東京都渋谷区..."
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={isViewMode}
            />
          </div>

          <div>
            <label className="block text-slate-700 mb-2">内部メモ</label>
            <textarea
              value={formData.notes_internal}
              onChange={(e) => setFormData({ ...formData, notes_internal: e.target.value })}
              rows={3}
              placeholder="SNS掲載NG、要介助など"
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={isViewMode}
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

            {isViewMode ? (
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-3 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition text-center"
                >
                  閉じる
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('Edit button clicked, current mode:', currentMode);
                    setCurrentMode('edit');
                    setActiveTab('info');
                    console.log('Switched to edit mode');
                  }}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl hover:from-blue-600 hover:to-indigo-700 transition text-center flex items-center justify-center gap-2"
                >
                  <Edit2 className="w-4 h-4" />
                  <span>編集</span>
                </button>
              </div>
            ) : (
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-3 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition text-center"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl hover:from-blue-600 hover:to-indigo-700 transition disabled:opacity-50 text-center"
                >
                  {loading ? '保存中...' : '保存'}
                </button>
              </div>
            )}
          </form>
        )}
      </div>

      {/* Reservation Modal */}
      {reservationModalOpen && (
        <ReservationModal
          reservation={selectedReservation}
          customers={customers}
          menuItems={menuItems}
          locations={locations}
          users={staffData}
          onSave={handleReservationModalSave}
          onClose={handleReservationModalClose}
        />
      )}
    </div>
  );
}
