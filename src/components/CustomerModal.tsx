import { useState, useEffect } from 'react';
import { apiRequest } from '../utils/api';
import { toast } from 'sonner@2.0.3';
import { X, Edit2, Calendar, MapPin, Package, Clock, AlertCircle, Plus, Trash2 } from 'lucide-react';
import { ReservationModal } from './ReservationModal';
import { WorkOrderModal } from './WorkOrderModal';
import { Child } from '../types';

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
  const [activeTab, setActiveTab] = useState<'info' | 'reservations' | 'workOrders'>('info');
  const [formData, setFormData] = useState({
    external_customer_number: '',
    parent_name: '',
    parent_name_kana: '',
    phone: '',
    email: '',
    line_url: '',
    postal_code: '',
    address_text: '',
    notes_internal: '',
    children: [] as Child[],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedReservation, setSelectedReservation] = useState<any>(null);
  const [reservationModalOpen, setReservationModalOpen] = useState(false);
  const [reservationModalMode, setReservationModalMode] = useState<'view' | 'edit'>('view');
  const [customers, setCustomers] = useState<any[]>([]);
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<any>(null);
  const [workOrderModalOpen, setWorkOrderModalOpen] = useState(false);
  const [workOrderModalMode, setWorkOrderModalMode] = useState<'view' | 'edit'>('view');

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
        phone: customer.phone || '',
        email: customer.email || '',
        line_url: customer.line_url || '',
        postal_code: customer.postal_code || '',
        address_text: customer.address_text || '',
        notes_internal: customer.notes_internal || '',
        children: customer.children && Array.isArray(customer.children) && customer.children.length > 0 
          ? customer.children 
          : [{
              name: customer.child_name || '',
              name_kana: customer.child_name_kana || '',
              age_years: customer.child_age_years,
              age_months: customer.child_age_months,
              gender: customer.child_gender || null, // customer data might not have gender initially
            }],
      });
    } else if (mode === 'edit' && !customer) {
      // Initialize with one empty child for new customer
      setFormData(prev => ({
        ...prev,
        children: [{ name: '', name_kana: '', age_years: null, age_months: null, gender: null }]
      }));
    }
  }, [customer, mode]);

  useEffect(() => {
    loadCustomers();
    if (customer) {
      loadWorkOrders();
    }
  }, [customer]);

  const loadCustomers = async () => {
    try {
      const result = await apiRequest('/customers');
      setCustomers(result.customers);
    } catch (err: any) {
      console.error('Failed to load customers:', err);
    }
  };

  const loadWorkOrders = async () => {
    if (!customer?.customer_id) return;
    try {
      const result = await apiRequest('/work-orders');
      
      // 顧客に紐づく予約IDの一覧を作成
      const customerReservationIds = reservations
        .filter(r => r.customer_id === customer.customer_id)
        .map(r => r.reservation_id);
      
      // その予約IDを持つ制作物をフィルタ、または直接顧客IDで紐づくものをフィルタ
      const customerWorkOrders = result.work_orders.filter(
        (wo: any) => wo.customer_id === customer.customer_id || customerReservationIds.includes(wo.reservation_id)
      );
      
      setWorkOrders(customerWorkOrders);
    } catch (err: any) {
      console.error('Failed to load work orders:', err);
    }
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

  const handleAddChild = () => {
    setFormData(prev => ({
      ...prev,
      children: [...prev.children, { name: '', name_kana: '', age_years: null, age_months: null, gender: null }]
    }));
  };

  const handleRemoveChild = (index: number) => {
    if (formData.children.length <= 1) {
      toast.error('少なくとも1人のお子さま情報が必要です');
      return;
    }
    setFormData(prev => ({
      ...prev,
      children: prev.children.filter((_, i) => i !== index)
    }));
  };

  const handleChildChange = (index: number, field: keyof Child, value: any) => {
    setFormData(prev => {
      const newChildren = [...prev.children];
      newChildren[index] = { ...newChildren[index], [field]: value };
      return { ...prev, children: newChildren };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // Validation
    const invalidChild = formData.children.find(c => !c.name.trim());
    if (invalidChild) {
      setError('すべてのお子さまの名前を入力してください');
      return;
    }

    setLoading(true);

    try {
      // Use the first child as the primary child for backward compatibility
      const primaryChild = formData.children[0];

      await apiRequest('/customers', {
        method: 'POST',
        body: JSON.stringify({
          ...(customer ? { customer_id: customer.customer_id, customer_code: customer.customer_code } : {}),
          external_customer_number: formData.external_customer_number || null,
          parent_name: formData.parent_name,
          parent_name_kana: formData.parent_name_kana,
          
          // Legacy fields (synced with first child)
          child_name: primaryChild.name,
          child_name_kana: primaryChild.name_kana,
          child_age_years: primaryChild.age_years,
          child_age_months: primaryChild.age_months,
          
          // New children array
          children: formData.children,
          
          phone: formData.phone,
          email: formData.email,
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

  const handleReservationClick = (reservation: any, mode: 'view' | 'edit' = 'view') => {
    setSelectedReservation(reservation);
    setReservationModalMode(mode);
    setReservationModalOpen(true);
  };

  const handleWorkOrderClick = (workOrder: any, mode: 'view' | 'edit' = 'view') => {
    setSelectedWorkOrder(workOrder);
    setWorkOrderModalMode(mode);
    setWorkOrderModalOpen(true);
  };

  const getJapanToday = () => {
    const now = new Date();
    const japanTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
    japanTime.setHours(0, 0, 0, 0);
    return japanTime;
  };

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
            <button
              onClick={() => setActiveTab('workOrders')}
              className={`flex-1 px-6 py-3 transition flex items-center justify-center gap-2 ${
                activeTab === 'workOrders'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Package className="w-4 h-4" />
              <span>作品 ({workOrders.length})</span>
            </button>
          </div>
        )}

        {activeTab === 'workOrders' && customer && isViewMode ? (
          <div className="p-6">
            {workOrders.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <Package className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                <p>作品がありません</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-[500px] overflow-y-auto">
                {workOrders.map((workOrder) => {
                  const isCompleted = workOrder.status === '完成' || workOrder.status === '受け取り済み' || workOrder.status === '引渡し済';
                  const isOverdue = !isCompleted && new Date(workOrder.due_date) < getJapanToday();
                  return (
                    <div
                      key={workOrder.work_order_id}
                      onClick={() => handleWorkOrderClick(workOrder, 'view')}
                      className={`rounded-xl p-4 border cursor-pointer hover:border-blue-300 transition ${
                        isOverdue ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="text-slate-900 mb-1 flex items-center gap-2">
                            {workOrder.product_type}
                            {isOverdue && <AlertCircle className="w-4 h-4 text-red-500" />}
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${
                              workOrder.status === '制作中' ? 'bg-yellow-100 text-yellow-700' :
                              workOrder.status === 'お渡し待ち' ? 'bg-green-100 text-green-700' :
                              'bg-blue-100 text-blue-700'
                            }`}>
                              {workOrder.status}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleWorkOrderClick(workOrder, 'edit');
                          }}
                          className="ml-2 p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition shrink-0"
                          title="作品を編集"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="space-y-2 text-sm text-slate-600">
                        {!isCompleted && (
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-slate-400" />
                            <span className={isOverdue ? 'text-red-600' : ''}>
                              納期: {formatDate(workOrder.due_date)}
                            </span>
                          </div>
                        )}

                        {workOrder.assigned_to && (
                          <div className="flex items-start gap-2">
                            <span className="text-slate-500 shrink-0">担当:</span>
                            <span>{staffData.find((s: any) => s.user_id === workOrder.assigned_to)?.name || '未割当'}</span>
                          </div>
                        )}

                        {workOrder.notes && (
                          <div className="flex items-start gap-2 pt-2 border-t border-slate-200">
                            <span className="text-slate-500 shrink-0">メモ:</span>
                            <span className="text-slate-700">{workOrder.notes}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
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
        ) : activeTab === 'reservations' && customer && isViewMode ? (
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
                    onClick={() => handleReservationClick(reservation, 'view')}
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
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReservationClick(reservation, 'edit');
                        }}
                        className="ml-2 p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition shrink-0"
                        title="予約を編集"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
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
                顧客番号
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
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="block text-slate-700 font-medium">
                お子さま情報 {!isViewMode && <span className="text-red-500">*</span>}
              </label>
              {!isViewMode && (
                <button
                  type="button"
                  onClick={handleAddChild}
                  className="text-sm flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium"
                >
                  <Plus className="w-4 h-4" />
                  <span>追加</span>
                </button>
              )}
            </div>

            <div className="space-y-4">
              {formData.children.map((child, index) => (
                <div key={index} className="p-4 bg-slate-50 border border-slate-200 rounded-xl relative">
                  {!isViewMode && formData.children.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveChild(index)}
                      className="absolute top-2 right-2 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                      title="削除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  
                  {index > 0 && <div className="text-xs text-slate-500 mb-2 font-medium">第{index + 1}子</div>}
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">お名前 {!isViewMode && <span className="text-red-500">*</span>}</label>
                      <input
                        type="text"
                        value={child.name}
                        onChange={(e) => handleChildChange(index, 'name', e.target.value)}
                        placeholder="例: 太郎"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                        required={!isViewMode}
                        disabled={isViewMode}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">フリガナ</label>
                      <input
                        type="text"
                        value={child.name_kana || ''}
                        onChange={(e) => handleChildChange(index, 'name_kana', e.target.value)}
                        placeholder="例: タロウ"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                        disabled={isViewMode}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">年齢（歳）</label>
                      <input
                        type="number"
                        min="0"
                        max="20"
                        value={child.age_years ?? ''}
                        onChange={(e) => {
                          const val = e.target.value === '' ? null : parseInt(e.target.value);
                          handleChildChange(index, 'age_years', val);
                        }}
                        placeholder="0"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                        disabled={isViewMode}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">0歳の場合（ヶ月）</label>
                      <input
                        type="number"
                        min="0"
                        max="11"
                        value={child.age_months ?? ''}
                        onChange={(e) => {
                          const val = e.target.value === '' ? null : parseInt(e.target.value);
                          handleChildChange(index, 'age_months', val);
                        }}
                        placeholder="0"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                        disabled={isViewMode}
                      />
                    </div>
                    <div className="col-span-2">
                       <label className="block text-xs text-slate-600 mb-1">性別</label>
                       <div className="flex gap-2">
                          {[
                            { value: 'boy', label: '男の子' },
                            { value: 'girl', label: '女の子' },
                            { value: 'other', label: 'その他' }
                          ].map(option => (
                            <label key={option.value} className={`flex-1 flex items-center justify-center gap-1 p-2 rounded-lg border cursor-pointer transition text-sm ${
                               child.gender === option.value 
                                 ? 'bg-blue-50 border-blue-200 text-blue-700 font-medium' 
                                 : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            } ${isViewMode ? 'cursor-default opacity-100' : ''}`}>
                               <input 
                                 type="radio" 
                                 name={`gender-${index}`}
                                 value={option.value}
                                 checked={child.gender === option.value}
                                 onChange={() => !isViewMode && handleChildChange(index, 'gender', option.value as any)}
                                 className="hidden"
                                 disabled={isViewMode}
                               />
                               {option.label}
                            </label>
                          ))}
                       </div>
                    </div>
                  </div>
                </div>
              ))}
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
              <label className="block text-slate-700 mb-2">メールアドレス</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="例: example@email.com"
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={isViewMode}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 mb-2">LINE URL</label>
              {isViewMode && formData.line_url ? (
                <a
                  href={formData.line_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 w-full px-4 py-2 bg-green-50 border border-green-300 rounded-xl text-green-700 hover:bg-green-100 hover:border-green-400 transition-colors"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
                  </svg>
                  <span className="truncate">{formData.line_url}</span>
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              ) : (
                <input
                  type="url"
                  value={formData.line_url}
                  onChange={(e) => setFormData({ ...formData, line_url: e.target.value })}
                  placeholder="例: https://line.me/ti/p/..."
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                  disabled={isViewMode}
                />
              )}
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
                    setCurrentMode('edit');
                    setActiveTab('info');
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
      {reservationModalOpen && selectedReservation && (
        <ReservationModal
          reservation={selectedReservation}
          customers={customers}
          menuItems={menuItems}
          locations={locations}
          users={staffData}
          mode={reservationModalMode}
          hideCustomerInfo={true}
          onSave={async () => {
            setReservationModalOpen(false);
            setSelectedReservation(null);
            await loadCustomers();
            onSave();
          }}
          onClose={() => {
            setReservationModalOpen(false);
            setSelectedReservation(null);
          }}
        />
      )}

      {/* Work Order Modal */}
      {workOrderModalOpen && selectedWorkOrder && (
        <WorkOrderModal
          workOrder={selectedWorkOrder}
          customers={customers}
          reservations={reservations}
          users={staffData}
          mode={workOrderModalMode}
          onSave={async () => {
            setWorkOrderModalOpen(false);
            setSelectedWorkOrder(null);
            await loadWorkOrders();
            onSave();
          }}
          onClose={() => {
            setWorkOrderModalOpen(false);
            setSelectedWorkOrder(null);
          }}
        />
      )}
    </div>
  );
}
