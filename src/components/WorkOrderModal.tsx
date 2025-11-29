import { useState, useEffect } from 'react';
import { apiRequest } from '../utils/api';
import { toast } from 'sonner@2.0.3';
import { X, Edit2, Calendar, Package, Clock, User, CheckCircle2, Circle } from 'lucide-react';
import { WorkOrder } from '../types';

interface WorkOrderModalProps {
  workOrder: WorkOrder | null;
  reservations: any[];
  customers: any[];
  onSave: () => void;
  onClose: () => void;
  mode?: 'view' | 'edit';
}

const STATUS_STEPS = [
  { id: '乾燥中', label: '乾燥中' },
  { id: '成形', label: '成形' },
  { id: '着色', label: '着色' },
  { id: '額装', label: '額装' },
  { id: '完成', label: '完成' },
] as const;

export function WorkOrderModal({ workOrder, reservations, customers, onSave, onClose, mode = 'edit' }: WorkOrderModalProps) {
  const [currentMode, setCurrentMode] = useState<'view' | 'edit'>(mode);
  
  const [formData, setFormData] = useState<{
    reservation_id: string;
    product_type: string;
    status: WorkOrder['status'];
    due_date: string;
    delivered_date: string;
    notes_internal: string;
    photo_data_status: 'not_set' | 'available' | 'not_available';
    nameplate_name: string;
    coloring_type: '金' | '銀' | undefined;
    frame_color: '白' | '黒' | undefined;
    mount_color: '白' | '黒' | undefined;
    status_comments: Record<string, string>;
  }>({
    reservation_id: '',
    product_type: '',
    status: '乾燥中',
    due_date: '',
    delivered_date: '',
    notes_internal: '',
    photo_data_status: 'not_set',
    nameplate_name: '',
    coloring_type: undefined,
    frame_color: undefined,
    mount_color: undefined,
    status_comments: {},
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
        status: workOrder.status || '乾燥中',
        due_date: workOrder.due_date?.slice(0, 10) || '',
        delivered_date: workOrder.delivery_date?.slice(0, 10) || '',
        notes_internal: workOrder.notes || '',
        photo_data_status: workOrder.photo_data_status || 'not_set',
        nameplate_name: workOrder.nameplate_name || '',
        coloring_type: workOrder.coloring_type,
        frame_color: workOrder.frame_color,
        mount_color: workOrder.mount_color,
        status_comments: workOrder.status_comments || {},
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
          delivery_date: formData.delivered_date, // Map back to API field name if different
          notes: formData.notes_internal, // Map back to API field name
        }),
      });

      onSave();
      toast.success(workOrder ? '制作物情報を更新しました' : '新しい制作物を登録しました');
    } catch (err: any) {
      console.error('Save error:', err);
      const errorMessage = err.message || '保存に失敗しました';
      setError(errorMessage);
      toast.error('保存に失敗しました');
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
    return customerNumber ? `${name} (No. ${customerNumber})` : name;
  };

  const reservation = reservations.find(r => r.reservation_id === formData.reservation_id);
  const customer = reservation ? customers.find(c => c.customer_id === reservation.customer_id) : null;

  const updateStatusComment = (comment: string) => {
    setFormData(prev => ({
      ...prev,
      status_comments: {
        ...prev.status_comments,
        [prev.status]: comment
      }
    }));
  };

  // Common visual styles
  const labelClass = "block text-[#2C2C2C] font-medium mb-2 text-sm font-serif";
  const inputClass = "w-full px-4 py-3 bg-[#F9F9F9] border border-[#E0E0E0] rounded-none focus:outline-none focus:border-[#C4A962] focus:ring-1 focus:ring-[#C4A962] transition-colors font-serif";
  const radioLabelClass = "flex items-center gap-2 cursor-pointer p-3 border border-[#E0E0E0] rounded-none hover:bg-[#F9F9F9] transition-colors";
  const radioSelectedClass = "border-[#C4A962] bg-[#FDFBF6] text-[#C4A962]";

  return (
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto font-serif"
      onClick={onClose}
    >
      <div 
        className="bg-white w-full max-w-3xl my-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
        style={{ fontFamily: '"Noto Serif JP", serif' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#E0E0E0] bg-[#FCFCFC]">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl text-[#2C2C2C] font-medium tracking-wide">
              {isViewMode ? '制作物詳細' : workOrder ? '制作物編集' : '制作物追加'}
            </h2>
            {isViewMode && (
              <button
                onClick={() => setCurrentMode('edit')}
                className="p-2 hover:bg-[#F0EDE6] rounded-full transition text-[#C4A962]"
                title="編集モードに切り替え"
              >
                <Edit2 className="w-5 h-5" />
              </button>
            )}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[#F0EDE6] rounded-full transition text-[#2C2C2C]">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[calc(100vh-200px)] overflow-y-auto p-6 md:p-8">
          
          {/* Customer Info Section */}
          {customer && (
            <div className="mb-8 p-5 bg-[#FDFBF6] border-l-4 border-[#C4A962]">
               <div className="flex items-center gap-2 mb-3 text-[#C4A962]">
                  <User className="w-5 h-5" />
                  <span className="font-medium">顧客情報</span>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[#2C2C2C]">
                  <div>
                    <span className="text-sm text-gray-500 block">お子さま名</span>
                    <span className="text-lg font-medium">{customer.child_name || '-'}</span>
                  </div>
                  {customer.external_customer_number && (
                    <div>
                      <span className="text-sm text-gray-500 block">顧客番号</span>
                      <span>{customer.external_customer_number}</span>
                    </div>
                  )}
               </div>
            </div>
          )}

          <form onSubmit={handleSubmit} onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} className="space-y-8">
            
            {/* Main Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                 <label className={labelClass}>予約</label>
                 <select
                    value={formData.reservation_id}
                    onChange={(e) => setFormData({ ...formData, reservation_id: e.target.value })}
                    className={inputClass}
                    required
                    disabled={isViewMode}
                 >
                    <option value="">選択してください</option>
                    {reservations.map(reservation => (
                      <option key={reservation.reservation_id} value={reservation.reservation_id}>
                        {getCustomerName(reservation.reservation_id)}
                      </option>
                    ))}
                 </select>
              </div>
              <div>
                <label className={labelClass}>作品タイプ</label>
                <input
                  type="text"
                  value={formData.product_type}
                  onChange={(e) => setFormData({ ...formData, product_type: e.target.value })}
                  placeholder="例: 額4面、足型単品"
                  className={inputClass}
                  required
                  readOnly={isViewMode}
                />
              </div>
              <div>
                <label className={labelClass}>納期</label>
                <input
                  type="date"
                  value={formData.due_date}
                  onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                  className={inputClass}
                  required
                  readOnly={isViewMode}
                />
              </div>
            </div>

            {/* Status Workflow */}
            <div className="border-t border-[#E0E0E0] pt-8">
              <h3 className="text-lg font-medium text-[#2C2C2C] mb-6 flex items-center gap-2">
                <span className="w-1 h-6 bg-[#C4A962] block"></span>
                制作ステータス
              </h3>
              
              <div className="flex flex-wrap gap-2 mb-6">
                {STATUS_STEPS.map((step, index) => {
                  const isCurrent = formData.status === step.id;
                  const currentIndex = STATUS_STEPS.findIndex(s => s.id === formData.status);
                  const isPassed = index < currentIndex;
                  
                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => !isViewMode && setFormData({ ...formData, status: step.id })}
                      disabled={isViewMode}
                      className={`
                        flex-1 min-w-[80px] py-3 px-2 text-center border-b-2 text-sm font-medium transition-all
                        ${isCurrent 
                          ? 'border-[#C4A962] text-[#C4A962]' 
                          : isPassed 
                            ? 'border-[#C4A962]/50 text-[#C4A962]/70' 
                            : 'border-gray-200 text-gray-400'}
                      `}
                    >
                      <div className="flex flex-col items-center gap-1">
                        {isPassed || isCurrent ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                        {step.label}
                      </div>
                    </button>
                  );
                })}
              </div>
              
              <div className="bg-[#FDFBF6] p-4 border border-[#F0EDE6]">
                <label className="block text-sm text-[#C4A962] font-medium mb-2">
                  {formData.status}のコメント
                </label>
                <textarea
                  value={formData.status_comments[formData.status] || ''}
                  onChange={(e) => updateStatusComment(e.target.value)}
                  placeholder={`${formData.status}に関する作業メモやコメントを入力...`}
                  rows={3}
                  className="w-full px-4 py-3 bg-white border border-[#E0E0E0] focus:border-[#C4A962] focus:outline-none resize-none font-serif"
                  readOnly={isViewMode}
                />
              </div>
            </div>

            {/* Production Details */}
            <div className="border-t border-[#E0E0E0] pt-8">
               <h3 className="text-lg font-medium text-[#2C2C2C] mb-6 flex items-center gap-2">
                <span className="w-1 h-6 bg-[#C4A962] block"></span>
                作品詳細仕様
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Nameplate */}
                <div className="col-span-1 md:col-span-2">
                  <label className={labelClass}>ネームプレートの名前</label>
                  <input
                    type="text"
                    value={formData.nameplate_name}
                    onChange={(e) => setFormData({ ...formData, nameplate_name: e.target.value })}
                    placeholder="例: 2024.10.01  Sakura"
                    className={inputClass}
                    readOnly={isViewMode}
                  />
                </div>

                {/* Coloring */}
                <div>
                  <label className={labelClass}>着色 (金/銀)</label>
                  <div className="flex gap-4">
                    {['金', '銀'].map((color) => (
                      <label key={color} className={`${radioLabelClass} flex-1 justify-center ${formData.coloring_type === color ? radioSelectedClass : ''}`}>
                        <input
                          type="radio"
                          name="coloring"
                          value={color}
                          checked={formData.coloring_type === color}
                          onChange={() => setFormData({ ...formData, coloring_type: color as any })}
                          className="hidden"
                          disabled={isViewMode}
                        />
                        {color === '金' && <span className="w-4 h-4 rounded-full bg-[#D4AF37] border border-gray-200"></span>}
                        {color === '銀' && <span className="w-4 h-4 rounded-full bg-[#C0C0C0] border border-gray-200"></span>}
                        <span>{color}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Frame Color */}
                <div>
                  <label className={labelClass}>額縁の色 (白/黒)</label>
                  <div className="flex gap-4">
                    {['白', '黒'].map((color) => (
                      <label key={color} className={`${radioLabelClass} flex-1 justify-center ${formData.frame_color === color ? radioSelectedClass : ''}`}>
                        <input
                          type="radio"
                          name="frame"
                          value={color}
                          checked={formData.frame_color === color}
                          onChange={() => setFormData({ ...formData, frame_color: color as any })}
                          className="hidden"
                          disabled={isViewMode}
                        />
                        <span className={`w-4 h-4 rounded-full border border-gray-200 ${color === '黒' ? 'bg-gray-900' : 'bg-white'}`}></span>
                        <span>{color}</span>
                      </label>
                    ))}
                  </div>
                </div>

                 {/* Mount Color */}
                 <div>
                  <label className={labelClass}>台紙の色 (白/黒)</label>
                  <div className="flex gap-4">
                    {['白', '黒'].map((color) => (
                      <label key={color} className={`${radioLabelClass} flex-1 justify-center ${formData.mount_color === color ? radioSelectedClass : ''}`}>
                        <input
                          type="radio"
                          name="mount"
                          value={color}
                          checked={formData.mount_color === color}
                          onChange={() => setFormData({ ...formData, mount_color: color as any })}
                          className="hidden"
                          disabled={isViewMode}
                        />
                         <span className={`w-4 h-4 rounded-full border border-gray-200 ${color === '黒' ? 'bg-gray-900' : 'bg-white'}`}></span>
                        <span>{color}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Photo Data */}
                <div>
                   <label className={labelClass}>撮影データ</label>
                   <select
                      value={formData.photo_data_status}
                      onChange={(e) => setFormData({ ...formData, photo_data_status: e.target.value as any })}
                      className={inputClass}
                      disabled={isViewMode}
                   >
                      <option value="not_set">📋 未設定</option>
                      <option value="available">✅ データあり</option>
                      <option value="not_available">❌ データなし</option>
                   </select>
                </div>
              </div>
            </div>

            {/* Internal Notes */}
            <div className="border-t border-[#E0E0E0] pt-8">
               <label className={labelClass}>全体メモ (内部用)</label>
               <textarea
                 value={formData.notes_internal}
                 onChange={(e) => setFormData({ ...formData, notes_internal: e.target.value })}
                 rows={3}
                 placeholder="その他特記事項など"
                 className="w-full px-4 py-3 bg-[#F9F9F9] border border-[#E0E0E0] focus:border-[#C4A962] focus:outline-none resize-none"
                 readOnly={isViewMode}
               />
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 text-red-600 px-4 py-3 text-sm border border-red-200">
                {error}
              </div>
            )}

            {/* Actions */}
            {!isViewMode && (
              <div className="flex gap-4 pt-6">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-6 py-3 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors font-medium"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-6 py-3 bg-[#C4A962] text-white hover:bg-[#B39851] transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                >
                  {loading ? '保存中...' : '保存する'}
                </button>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}