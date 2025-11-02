import { useState, useEffect } from 'react';
import { apiRequest } from '../utils/api';
import { X, Search, User, Phone, Hash, Edit2, ExternalLink, UtensilsCrossed, AlertCircle, Calendar, MapPin } from 'lucide-react';

interface ReservationModalProps {
  reservation: any | null;
  customers: any[];
  locations: any[];
  users: any[];
  menuItems?: any[];
  onSave: () => void;
  onClose: () => void;
  mode?: 'view' | 'edit';
}

export function ReservationModal({ 
  reservation, 
  customers, 
  locations, 
  users, 
  menuItems: propMenuItems,
  onSave, 
  onClose,
  mode = 'edit' 
}: ReservationModalProps) {
  const [currentMode, setCurrentMode] = useState<'view' | 'edit'>(mode);

  // Get today's date in JST (Asia/Tokyo)
  const getTodayJST = () => {
    const now = new Date();
    const jstOffset = 9 * 60; // JST is UTC+9
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const jstDate = new Date(utc + (jstOffset * 60000));
    return jstDate.toISOString().split('T')[0];
  };

  // Get day of week in Japanese
  const getDayOfWeek = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString + 'T00:00:00');
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    return days[date.getDay()];
  };

  const [formData, setFormData] = useState({
    reservation_date: getTodayJST(),
    reservation_time: '10:00',
    duration_minutes: '30',
    location_id: '',
    customer_id: '',
    staff_id_main: '',
    status: 'tentative',
    payment_status: 'unpaid',
    work_required: '',
    notes_staff: '',
    menu_item_id: '',
    additional_units: '0',
    // Customer fields for new customer
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
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState<'phone' | 'code' | 'name'>('phone');
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [showSaveModeDialog, setShowSaveModeDialog] = useState(false);
  const [initialCustomerData, setInitialCustomerData] = useState<any>(null);

  useEffect(() => {
    setCurrentMode(mode);
  }, [mode]);

  useEffect(() => {
    loadMenuItems();
    if (reservation) {
      const dateTime = reservation.reservation_date_time || '';
      const [date, time] = dateTime.split('T');
      
      // Find customer data
      const customer = customers.find(c => c.customer_id === reservation.customer_id);
      
      // Save initial customer data for comparison
      const customerData = {
        parent_name: customer?.parent_name || '',
        parent_name_kana: customer?.parent_name_kana || '',
        child_name: customer?.child_name || '',
        child_name_kana: customer?.child_name_kana || '',
        child_age_years: customer?.child_age_years?.toString() || '',
        child_age_months: customer?.child_age_months?.toString() || '',
        phone: customer?.phone || '',
        line_url: customer?.line_url || '',
        postal_code: customer?.postal_code || '',
        address_text: customer?.address_text || '',
        notes_internal: customer?.notes_internal || '',
      };
      
      setInitialCustomerData(customerData);
      
      setFormData({
        ...formData,
        reservation_date: date || '',
        reservation_time: time?.slice(0, 5) || '10:00',
        duration_minutes: reservation.duration_minutes?.toString() || '30',
        location_id: reservation.location_id || '',
        customer_id: reservation.customer_id || '',
        staff_id_main: reservation.staff_id_main || '',
        status: reservation.status || 'tentative',
        payment_status: reservation.payment_status || 'unpaid',
        work_required: reservation.work_required || '',
        notes_staff: reservation.notes_staff || '',
        menu_item_id: reservation.menu_item_id || '',
        additional_units: reservation.additional_units?.toString() || '0',
        // Load customer data for editing
        ...customerData,
      });
    }
  }, [reservation, customers]);

  const loadMenuItems = async () => {
    try {
      if (propMenuItems) {
        setMenuItems(propMenuItems.filter((item: any) => item.is_active) || []);
      } else {
        const data = await apiRequest('/menu-items');
        setMenuItems(data.menu_items.filter((item: any) => item.is_active) || []);
      }
    } catch (err) {
      console.error('Failed to load menu items:', err);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    try {
      let url = '';
      if (searchType === 'phone') {
        url = `/customers/search?phone=${encodeURIComponent(searchQuery)}`;
      } else if (searchType === 'code') {
        url = `/customers/search?code=${encodeURIComponent(searchQuery)}`;
      } else {
        url = `/customers/search?name=${encodeURIComponent(searchQuery)}`;
      }
      
      const result = await apiRequest(url);
      setSearchResults(result.customers);
      setError('');
    } catch (err: any) {
      console.error('Search error:', err);
      setError('検索中にエラーが発生しました');
    }
  };

  const handleSelectCustomer = (customer: any) => {
    // 既存顧客の情報をフォームに自動入力
    setFormData(prev => ({ 
      ...prev,
      customer_id: customer.customer_id,
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
    }));
    setSearchResults([]);
    setSearchQuery('');
  };

  // Check if customer data has been modified
  const isCustomerDataModified = () => {
    if (!reservation || !formData.customer_id || !initialCustomerData) {
      return false;
    }

    const currentData = {
      parent_name: formData.parent_name,
      parent_name_kana: formData.parent_name_kana,
      child_name: formData.child_name,
      child_name_kana: formData.child_name_kana,
      child_age_years: formData.child_age_years,
      child_age_months: formData.child_age_months,
      phone: formData.phone,
      line_url: formData.line_url,
      postal_code: formData.postal_code,
      address_text: formData.address_text,
      notes_internal: formData.notes_internal,
    };

    return JSON.stringify(currentData) !== JSON.stringify(initialCustomerData);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // If editing reservation and customer data is modified, show save mode dialog
    if (isCustomerDataModified()) {
      setShowSaveModeDialog(true);
      return;
    }
    
    // Otherwise proceed with normal save
    await performSave('update');
  };

  const performSave = async (mode: 'update' | 'create_new') => {
    setError('');
    setLoading(true);
    setShowSaveModeDialog(false);

    try {
      let customerId = formData.customer_id;

      // Create new customer if needed (for new reservations without existing customer_id)
      if (!customerId) {
        const customerData = await apiRequest('/customers', {
          method: 'POST',
          body: JSON.stringify({
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
        customerId = customerData.customer.customer_id;
      } else if (mode === 'create_new') {
        // Create a new customer (別の顧客として新規作成)
        const customerData = await apiRequest('/customers', {
          method: 'POST',
          body: JSON.stringify({
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
        customerId = customerData.customer.customer_id;
      } else if (mode === 'update') {
        // Update existing customer information (既存顧客を上書き)
        await apiRequest('/customers', {
          method: 'POST',
          body: JSON.stringify({
            customer_id: customerId,
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
      }

      // Combine date and time
      const reservation_date_time = `${formData.reservation_date}T${formData.reservation_time}`;

      // Create/update reservation
      await apiRequest('/reservations', {
        method: 'POST',
        body: JSON.stringify({
          ...(reservation ? { reservation_id: reservation.reservation_id } : {}),
          reservation_date_time,
          duration_minutes: parseInt(formData.duration_minutes) || 30,
          location_id: formData.location_id,
          customer_id: customerId,
          staff_id_main: formData.staff_id_main || null,
          status: formData.status,
          payment_status: formData.payment_status,
          work_required: formData.work_required,
          notes_staff: formData.notes_staff,
          menu_item_id: formData.menu_item_id || null,
          additional_units: formData.additional_units ? parseInt(formData.additional_units) : 0,
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

  const isViewMode = currentMode === 'view';
  const title = isViewMode ? '予約詳細' : (reservation ? '予約編集' : '新規予約');

  // Helper functions for view mode
  const getCustomerName = () => {
    return formData.child_name && formData.parent_name
      ? `${formData.child_name}（${formData.parent_name}）`
      : formData.child_name || formData.parent_name || '未設定';
  };

  const getLocationName = () => {
    const location = locations.find(l => l.location_id === formData.location_id);
    return location ? location.location_name : '未設定';
  };

  const getStaffName = () => {
    const staff = users?.find(u => u.user_id === formData.staff_id_main);
    return staff ? staff.name : '未設定';
  };

  const getMenuName = () => {
    const menu = menuItems.find(m => m.menu_item_id === formData.menu_item_id);
    return menu ? menu.name : '未設定';
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString + 'T00:00:00');
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const dayOfWeek = getDayOfWeek(dateString);
    return `${month}月${day}日（${dayOfWeek}）`;
  };

  const formatTime = (timeString: string) => {
    if (!timeString) return '';
    return timeString.slice(0, 5);
  };

  const getStatusDisplay = (status: string) => {
    switch (status) {
      case 'confirmed': return { text: '✓ 確定', class: 'bg-blue-100 text-blue-700' };
      case 'tentative': return { text: '仮予約', class: 'bg-yellow-100 text-yellow-700' };
      case 'done': return { text: '完了', class: 'bg-green-100 text-green-700' };
      case 'canceled': return { text: 'キャンセル', class: 'bg-slate-100 text-slate-700' };
      default: return { text: status, class: 'bg-slate-100 text-slate-700' };
    }
  };

  const getPaymentStatusDisplay = (status: string) => {
    switch (status) {
      case 'paid': return { text: '💰 支払済', class: 'bg-green-100 text-green-700' };
      case 'unpaid': return { text: '未払い', class: 'bg-slate-100 text-slate-700' };
      default: return { text: status, class: 'bg-slate-100 text-slate-700' };
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 flex-shrink-0">
          <div>
            <h2 className="text-slate-900">{title}</h2>
            {reservation && (
              <p className="text-xs text-slate-400 mt-1">
                予約ID: {reservation.reservation_id}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isViewMode && reservation && (
              <button
                onClick={() => setCurrentMode('edit')}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl hover:from-blue-600 hover:to-indigo-700 transition"
              >
                <Edit2 className="w-4 h-4" />
                <span>編集</span>
              </button>
            )}
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {isViewMode ? (
          // View Mode
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Customer Information */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-5 border border-blue-100">
              <div className="flex items-center gap-2 mb-4">
                <User className="w-5 h-5 text-blue-600" />
                <h3 className="text-slate-900">顧客情報</h3>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex items-start">
                  <span className="text-slate-600 w-32 shrink-0">お子さま名:</span>
                  <span className="text-slate-900">{formData.child_name || '未設定'}</span>
                </div>
                <div className="flex items-start">
                  <span className="text-slate-600 w-32 shrink-0">保護者名:</span>
                  <span className="text-slate-900">{formData.parent_name || '未設定'}</span>
                </div>
                {formData.child_age_years && (
                  <div className="flex items-start">
                    <span className="text-slate-600 w-32 shrink-0">年齢:</span>
                    <span className="text-slate-900">
                      {formData.child_age_years}歳
                      {formData.child_age_months && ` ${formData.child_age_months}ヶ月`}
                    </span>
                  </div>
                )}
                {formData.phone && (
                  <div className="flex items-start">
                    <span className="text-slate-600 w-32 shrink-0">電話番号:</span>
                    <span className="text-slate-900">{formData.phone}</span>
                  </div>
                )}
                {formData.line_url && (
                  <div className="flex items-start">
                    <span className="text-slate-600 w-32 shrink-0">LINE:</span>
                    <a
                      href={formData.line_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition text-xs"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>開く</span>
                    </a>
                  </div>
                )}
                {formData.notes_internal && (
                  <div className="flex items-start pt-3 border-t border-blue-200">
                    <span className="text-slate-600 w-32 shrink-0">内部メモ:</span>
                    <span className="text-slate-900">{formData.notes_internal}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Reservation Details */}
            <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-5 border border-purple-100">
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="w-5 h-5 text-purple-600" />
                <h3 className="text-slate-900">予約詳細</h3>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex items-start">
                  <span className="text-slate-600 w-32 shrink-0">予約日時:</span>
                  <div>
                    <div className="text-slate-900">
                      {formatDate(formData.reservation_date)} {formatTime(formData.reservation_time)}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      所要時間: {formData.duration_minutes}分
                    </div>
                  </div>
                </div>
                <div className="flex items-start">
                  <span className="text-slate-600 w-32 shrink-0">拠点:</span>
                  <span className="text-slate-900">{getLocationName()}</span>
                </div>
                <div className="flex items-start">
                  <span className="text-slate-600 w-32 shrink-0">担当スタッフ:</span>
                  <span className="text-slate-900">{getStaffName()}</span>
                </div>
                <div className="flex items-start">
                  <span className="text-slate-600 w-32 shrink-0">ステータス:</span>
                  <div className="flex gap-2 flex-wrap">
                    <span className={`inline-block px-3 py-1 rounded-full text-xs ${getStatusDisplay(formData.status).class}`}>
                      {getStatusDisplay(formData.status).text}
                    </span>
                    <span className={`inline-block px-3 py-1 rounded-full text-xs ${getPaymentStatusDisplay(formData.payment_status).class}`}>
                      {getPaymentStatusDisplay(formData.payment_status).text}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Menu Information */}
            {formData.menu_item_id && (
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-5 border border-green-100">
                <div className="flex items-center gap-2 mb-4">
                  <UtensilsCrossed className="w-5 h-5 text-green-600" />
                  <h3 className="text-slate-900">メニュー</h3>
                </div>
                <div className="space-y-3 text-sm">
                  <div className="flex items-start">
                    <span className="text-slate-600 w-32 shrink-0">メニュー:</span>
                    <div className="flex-1">
                      <div className="text-slate-900">{getMenuName()}</div>
                      {parseInt(formData.additional_units) > 0 && (
                        <div className="text-xs text-green-700 mt-1">
                          + 追加{formData.additional_units}部位
                        </div>
                      )}
                    </div>
                  </div>
                  {(() => {
                    const selectedMenu = menuItems.find(m => m.menu_item_id === formData.menu_item_id);
                    if (!selectedMenu) return null;
                    const additionalUnits = parseInt(formData.additional_units) || 0;
                    const totalPrice = selectedMenu.base_price + (selectedMenu.additional_unit_price * additionalUnits);
                    return (
                      <div className="flex items-start pt-3 border-t border-green-200">
                        <span className="text-slate-600 w-32 shrink-0">料金:</span>
                        <div>
                          <div className="text-slate-900">¥{totalPrice.toLocaleString()}</div>
                          <div className="text-xs text-slate-500 mt-1">
                            基本料金: ¥{selectedMenu.base_price.toLocaleString()}
                            {additionalUnits > 0 && ` + 追加料金: ¥${(selectedMenu.additional_unit_price * additionalUnits).toLocaleString()}`}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Notes */}
            {formData.notes_staff && (
              <div className="bg-slate-50 rounded-xl p-5 border border-slate-200">
                <h3 className="text-slate-900 mb-3">スタッフメモ</h3>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{formData.notes_staff}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
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
          // Edit Mode
          <form onSubmit={handleSubmit} onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} className="flex-1 overflow-y-auto">
            <div className="p-5 space-y-5">
              {/* Customer Search - Only for New Reservations */}
              {!reservation && (
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-100">
                  <div className="flex items-center gap-2 mb-3">
                    <Search className="w-4 h-4 text-blue-600" />
                    <h3 className="text-sm text-blue-900">既存顧客を検索</h3>
                  </div>
                  
                  <div className="space-y-2.5">
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSearchType('phone')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition text-sm ${
                          searchType === 'phone'
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'bg-white text-slate-700 hover:bg-blue-50'
                        }`}
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>電話番号</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSearchType('code')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition text-sm ${
                          searchType === 'code'
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'bg-white text-slate-700 hover:bg-blue-50'
                        }`}
                      >
                        <Hash className="w-3.5 h-3.5" />
                        <span>顧客番号</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSearchType('name')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition text-sm ${
                          searchType === 'name'
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'bg-white text-slate-700 hover:bg-blue-50'
                        }`}
                      >
                        <User className="w-3.5 h-3.5" />
                        <span>名前</span>
                      </button>
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleSearch())}
                        placeholder={
                          searchType === 'phone' ? '090-1234-5678' :
                          searchType === 'code' ? 'C00001' :
                          '山田 花子'
                        }
                        className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      />
                      <button
                        type="button"
                        onClick={handleSearch}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition shadow-sm text-sm"
                      >
                        検索
                      </button>
                    </div>

                    {searchResults.length > 0 && (
                      <div className="bg-white rounded-lg p-2.5 space-y-1.5 border border-slate-200 shadow-sm">
                        <p className="text-xs text-slate-600 px-2">
                          {searchResults.length}件の顧客が見つかりました
                        </p>
                        <div className="space-y-1.5 max-h-40 overflow-y-auto">
                          {searchResults.map(customer => (
                            <button
                              key={customer.customer_id}
                              type="button"
                              onClick={() => handleSelectCustomer(customer)}
                              className="w-full text-left p-2.5 bg-slate-50 rounded-lg hover:bg-blue-50 hover:border-blue-200 transition border border-transparent"
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="text-sm text-slate-900">
                                    {customer.child_name && <span className="mr-2">{customer.child_name}</span>}
                                    {customer.parent_name && <span className="text-slate-600">({customer.parent_name})</span>}
                                  </div>
                                  <div className="text-xs text-slate-500 mt-0.5">
                                    {customer.external_customer_number && <span>顧客番号: {customer.external_customer_number} • </span>}
                                    {customer.phone}
                                  </div>
                                </div>
                                <div className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                                  選択
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {formData.customer_id && (
                    <div className="mt-2.5 p-2.5 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center gap-2 text-green-800">
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                        <span className="text-xs">既存顧客が選択されています</span>
                      </div>
                    </div>
                  )}
              </div>
            )}

              {/* Customer Information Form - Show for Both New and Edit */}
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-5 bg-blue-600 rounded-full"></div>
                    <h3 className="text-sm text-slate-900">顧客情報{reservation && ' (編集可能)'}</h3>
                  </div>
                  {reservation && isCustomerDataModified() && (
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs">
                      <span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse"></span>
                      <span>変更あり</span>
                    </div>
                  )}
                </div>

                {reservation && formData.customer_id && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-xs text-amber-900 leading-relaxed">
                      💡 <strong>ヒント：</strong>顧客情報を変更して保存する際、既存顧客を更新するか、新規顧客として登録するかを選択できます。
                    </p>
                  </div>
                )}

                  {/* 保護者情報 */}
                  <div className="bg-slate-50 rounded-lg p-3.5 space-y-3">
                    <p className="text-xs text-slate-600">保護者情報</p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-slate-700 mb-1.5">
                          保護者名 <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={formData.parent_name}
                          onChange={(e) => setFormData({ ...formData, parent_name: e.target.value })}
                          placeholder="山田 花子"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-slate-700 mb-1.5">
                          保護者名フリガナ
                        </label>
                        <input
                          type="text"
                          value={formData.parent_name_kana}
                          onChange={(e) => setFormData({ ...formData, parent_name_kana: e.target.value })}
                          placeholder="ヤマダ ハナコ"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  {/* お子さま情報 */}
                  <div className="bg-slate-50 rounded-lg p-3.5 space-y-3">
                    <p className="text-xs text-slate-600">お子さま情報</p>
                  
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-slate-700 mb-1.5">
                          お子さま名 <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={formData.child_name}
                          onChange={(e) => setFormData({ ...formData, child_name: e.target.value })}
                          placeholder="太郎"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-slate-700 mb-1.5">
                          お子さま名フリガナ
                        </label>
                        <input
                          type="text"
                          value={formData.child_name_kana}
                          onChange={(e) => setFormData({ ...formData, child_name_kana: e.target.value })}
                          placeholder="タロウ"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-slate-700 mb-1.5">年齢（歳）</label>
                        <input
                          type="number"
                          min="0"
                          max="20"
                          value={formData.child_age_years}
                          onChange={(e) => setFormData({ ...formData, child_age_years: e.target.value })}
                          placeholder="0"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-slate-700 mb-1.5">0歳の場合（ヶ月）</label>
                        <input
                          type="number"
                          min="0"
                          max="11"
                          value={formData.child_age_months}
                          onChange={(e) => setFormData({ ...formData, child_age_months: e.target.value })}
                          placeholder="0"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        />
                      </div>
                    </div>
                </div>

                  {/* 連絡先情報 */}
                  <div className="bg-slate-50 rounded-lg p-3.5 space-y-3">
                    <p className="text-xs text-slate-600">連絡先</p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-slate-700 mb-1.5">
                          電話番号
                        </label>
                        <input
                          type="tel"
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          placeholder="090-1234-5678"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-slate-700 mb-1.5">LINE URL</label>
                        <div className="flex gap-2">
                          <input
                            type="url"
                            value={formData.line_url}
                            onChange={(e) => setFormData({ ...formData, line_url: e.target.value })}
                            placeholder="https://line.me/ti/p/..."
                            className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                          />
                          {formData.line_url && (
                            <a
                              href={formData.line_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-center px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition"
                              title="LINEを開く"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="md:col-span-1">
                        <label className="block text-xs text-slate-700 mb-1.5">郵便番号</label>
                        <input
                          type="text"
                          value={formData.postal_code}
                          onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                          placeholder="123-4567"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-xs text-slate-700 mb-1.5">住所</label>
                        <input
                          type="text"
                          value={formData.address_text}
                          onChange={(e) => setFormData({ ...formData, address_text: e.target.value })}
                          placeholder="東京都渋谷区..."
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 内部メモ */}
                  <div>
                    <label className="block text-xs text-slate-700 mb-1.5">内部メモ</label>
                    <textarea
                      value={formData.notes_internal || ''}
                      onChange={(e) => setFormData({ ...formData, notes_internal: e.target.value })}
                      rows={2}
                      placeholder="SNS掲載NG、など"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-sm"
                    />
                  </div>

                {/* Customer Info Display for Edit Mode */}
                {reservation && formData.customer_id && (() => {
                  const customer = customers.find(c => c.customer_id === formData.customer_id);
                  return (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      {customer?.external_customer_number && (
                        <div className="flex items-center gap-2 text-sm text-blue-900">
                          <User className="w-4 h-4" />
                          <span>顧客番号: {customer.external_customer_number}</span>
                        </div>
                      )}
                      {formData.line_url && (
                        <a
                          href={formData.line_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition text-xs"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>LINE</span>
                        </a>
                      )}
                    </div>
                  </div>
                  );
                })()}
              </div>

              {/* Reservation Details */}
              <div className="space-y-4 pt-4 border-t border-slate-200">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-5 bg-indigo-600 rounded-full"></div>
                  <h3 className="text-sm text-slate-900">予約詳細</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-slate-700 mb-1.5">
                      予約日
                    </label>
                    <input
                      type="date"
                      value={formData.reservation_date}
                      onChange={(e) => setFormData({ ...formData, reservation_date: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-700 mb-1.5">
                      予約時間
                    </label>
                    <select
                      value={formData.reservation_time}
                      onChange={(e) => setFormData({ ...formData, reservation_time: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    >
                      <option value="09:00">9:00</option>
                      <option value="09:30">9:30</option>
                      <option value="10:00">10:00</option>
                      <option value="10:30">10:30</option>
                      <option value="11:00">11:00</option>
                      <option value="11:30">11:30</option>
                      <option value="12:00">12:00</option>
                      <option value="12:30">12:30</option>
                      <option value="13:00">13:00</option>
                      <option value="13:30">13:30</option>
                      <option value="14:00">14:00</option>
                      <option value="14:30">14:30</option>
                      <option value="15:00">15:00</option>
                      <option value="15:30">15:30</option>
                      <option value="16:00">16:00</option>
                      <option value="16:30">16:30</option>
                      <option value="17:00">17:00</option>
                      <option value="custom">その他の時間...</option>
                    </select>
                  </div>

                  {formData.reservation_time === 'custom' && (
                    <div>
                      <label className="block text-xs text-slate-700 mb-1.5">
                        カスタム時間
                      </label>
                      <input
                        type="time"
                        onChange={(e) => setFormData({ ...formData, reservation_time: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs text-slate-700 mb-1.5">
                      所要時間（分）
                    </label>
                    <select
                      value={formData.duration_minutes}
                      onChange={(e) => setFormData({ ...formData, duration_minutes: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    >
                      <option value="15">15分</option>
                      <option value="30">30分（標準）</option>
                      <option value="45">45分</option>
                      <option value="60">60分</option>
                      <option value="90">90分</option>
                      <option value="120">120分</option>
                      <option value="custom">その他...</option>
                    </select>
                  </div>

                  {formData.duration_minutes === 'custom' && (
                    <div>
                      <label className="block text-xs text-slate-700 mb-1.5">
                        カスタム時間（分）
                      </label>
                      <input
                        type="number"
                        min="5"
                        max="480"
                        step="5"
                        onChange={(e) => setFormData({ ...formData, duration_minutes: e.target.value })}
                        placeholder="分数を入力"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-700 mb-1.5">
                      拠点
                    </label>
                    <select
                      value={formData.location_id}
                      onChange={(e) => setFormData({ ...formData, location_id: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
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
                    <label className="block text-xs text-slate-700 mb-1.5">担当スタッフ</label>
                    <select
                      value={formData.staff_id_main}
                      onChange={(e) => setFormData({ ...formData, staff_id_main: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    >
                      <option value="">未設定</option>
                      {users?.map(user => (
                        <option key={user.user_id} value={user.user_id}>
                          {user.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-700 mb-1.5">予約ステータス</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    >
                      <option value="tentative">仮予約</option>
                      <option value="confirmed">確定</option>
                      <option value="done">完了</option>
                      <option value="canceled">キャンセル</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-700 mb-1.5">支払いステータス</label>
                    <select
                      value={formData.payment_status}
                      onChange={(e) => setFormData({ ...formData, payment_status: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    >
                    <option value="unpaid">未払い</option>
                    <option value="paid">支払い済み</option>
                  </select>
                </div>

                </div>

                {/* Menu Selection */}
                <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg p-4 border border-purple-100">
                  <div className="flex items-center gap-2 mb-3">
                    <UtensilsCrossed className="w-4 h-4 text-purple-600" />
                    <h3 className="text-sm text-purple-900">メニュー選択</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-2">
                      <label className="block text-xs text-slate-700 mb-1.5">メニュー</label>
                      <select
                        value={formData.menu_item_id}
                        onChange={(e) => {
                          setFormData({ ...formData, menu_item_id: e.target.value });
                          // Update work_required with menu name
                          const selectedMenu = menuItems.find(m => m.menu_item_id === e.target.value);
                          if (selectedMenu) {
                            setFormData(prev => ({ 
                              ...prev, 
                              menu_item_id: e.target.value,
                              work_required: selectedMenu.name 
                            }));
                          }
                        }}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                      >
                        <option value="">選択してください</option>
                        {menuItems.map(item => (
                          <option key={item.menu_item_id} value={item.menu_item_id}>
                            {item.name} - ¥{item.base_price.toLocaleString()}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-slate-700 mb-1.5">追加本数</label>
                      <input
                        type="number"
                        min="0"
                        max="10"
                        value={formData.additional_units}
                        onChange={(e) => setFormData({ ...formData, additional_units: e.target.value })}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                      />
                    </div>
                  </div>

                  {/* Price Display */}
                  {formData.menu_item_id && (() => {
                    const selectedMenu = menuItems.find(m => m.menu_item_id === formData.menu_item_id);
                    if (!selectedMenu) return null;
                    
                    const additionalUnits = parseInt(formData.additional_units) || 0;
                    const totalPrice = selectedMenu.base_price + (selectedMenu.additional_unit_price * additionalUnits);
                    
                    return (
                      <div className="mt-3 p-3 bg-white/70 rounded-lg border border-purple-200">
                        <div className="flex items-center justify-between text-sm">
                          <div>
                            <p className="text-slate-600">基本料金</p>
                            <p className="text-purple-900">¥{selectedMenu.base_price.toLocaleString()}</p>
                          </div>
                          {additionalUnits > 0 && (
                            <div>
                              <p className="text-slate-600">追加料金</p>
                              <p className="text-purple-900">¥{(selectedMenu.additional_unit_price * additionalUnits).toLocaleString()}</p>
                            </div>
                          )}
                          <div className="text-right">
                            <p className="text-slate-600">合計金額</p>
                            <p className="text-purple-900">¥{totalPrice.toLocaleString()}</p>
                          </div>
                        </div>
                        {selectedMenu.description && (
                          <p className="text-xs text-slate-600 mt-2 border-t border-purple-100 pt-2">
                            {selectedMenu.description}
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </div>

                <div>
                  <label className="block text-xs text-slate-700 mb-1.5">スタッフメモ</label>
                  <textarea
                    value={formData.notes_staff}
                    onChange={(e) => setFormData({ ...formData, notes_staff: e.target.value })}
                    rows={2}
                    placeholder="特記事項があればこちらに記入"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-sm"
                  />
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2.5 rounded-lg text-sm">
                  {error}
                </div>
              )}
            </div>

            <div className="flex gap-3 p-5 border-t border-slate-200 flex-shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-5 py-2.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition text-sm"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition disabled:opacity-50 shadow-md hover:shadow-lg text-sm"
              >
                {loading ? '保存中...' : '保存'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Save Mode Dialog */}
      {showSaveModeDialog && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-10 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
            <div className="p-6 border-b border-slate-200">
              <h3 className="text-lg text-slate-900">顧客情報の保存方法を選択してください</h3>
              <p className="text-sm text-slate-600 mt-2">
                顧客情報が変更されています。どのように保存しますか？
              </p>
            </div>

            <div className="p-6 space-y-4">
              {/* Option A: Update existing customer */}
              <button
                type="button"
                onClick={() => performSave('update')}
                disabled={loading}
                className="w-full text-left p-5 bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200 rounded-xl hover:border-amber-400 hover:shadow-lg transition group disabled:opacity-50"
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-10 h-10 bg-amber-500 text-white rounded-full flex items-center justify-center text-lg group-hover:scale-110 transition-transform">
                    A
                  </div>
                  <div className="flex-1">
                    <h4 className="text-base text-slate-900 mb-2">
                      この顧客を更新する（既存顧客の上書き）
                    </h4>
                    <p className="text-sm text-slate-600 mb-2">
                      現在の予約が参照している顧客情報を直接更新します。
                    </p>
                    <div className="bg-amber-100 border border-amber-300 rounded-lg p-3 text-sm text-amber-900">
                      <p className="flex items-start gap-2">
                        <span>⚠️</span>
                        <span>この顧客に紐づく他の予約も、更新後の情報が表示されます。</span>
                      </p>
                    </div>
                  </div>
                </div>
              </button>

              {/* Option B: Create new customer */}
              <button
                type="button"
                onClick={() => performSave('create_new')}
                disabled={loading}
                className="w-full text-left p-5 bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl hover:border-blue-400 hover:shadow-lg transition group disabled:opacity-50"
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-10 h-10 bg-blue-500 text-white rounded-full flex items-center justify-center text-lg group-hover:scale-110 transition-transform">
                    B
                  </div>
                  <div className="flex-1">
                    <h4 className="text-base text-slate-900 mb-2">
                      別の顧客として新規作成
                    </h4>
                    <p className="text-sm text-slate-600 mb-2">
                      入力した情報で新しい顧客を作成し、この予約を新顧客に紐付けます。
                    </p>
                    <div className="bg-blue-100 border border-blue-300 rounded-lg p-3 text-sm text-blue-900">
                      <p className="flex items-start gap-2">
                        <span>✓</span>
                        <span>元の顧客情報は変更されず、新しい顧客番号（A-xxxx）が発行されます。</span>
                      </p>
                    </div>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setShowSaveModeDialog(false)}
                className="w-full px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition text-sm"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
