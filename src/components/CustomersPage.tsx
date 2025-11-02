import { useEffect, useState } from 'react';
import { apiRequest } from '../utils/api';
import { Plus, Edit2, Search, ChevronDown, ChevronUp, Calendar } from 'lucide-react';
import { CustomerModal } from './CustomerModal';

export function CustomersPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [reservations, setReservations] = useState<any[]>([]);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [staffData, setStaffData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [custData, resData, menuData, locData, staffDataRes] = await Promise.all([
        apiRequest('/customers'),
        apiRequest('/reservations'),
        apiRequest('/menu-items'),
        apiRequest('/locations'),
        apiRequest('/staff'),
      ]);
      setCustomers(custData.customers);
      setReservations(resData.reservations || []);
      setMenuItems(menuData.menu_items || []);
      setLocations(locData.locations || []);
      setStaffData(staffDataRes.staff || []);
    } catch (err: any) {
      console.error('Load data error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setModalOpen(false);
    setEditingCustomer(null);
    await loadData();
  };

  const toggleCustomerExpansion = (customerId: string) => {
    const newExpanded = new Set(expandedCustomers);
    if (newExpanded.has(customerId)) {
      newExpanded.delete(customerId);
    } else {
      newExpanded.add(customerId);
    }
    setExpandedCustomers(newExpanded);
  };

  const getCustomerReservations = (customerId: string) => {
    return reservations
      .filter(r => r.customer_id === customerId)
      .sort((a, b) => new Date(b.reservation_date_time).getTime() - new Date(a.reservation_date_time).getTime());
  };

  const getMenuName = (menuItemId: string) => {
    const menu = menuItems.find(m => m.menu_item_id === menuItemId);
    return menu?.name || '-';
  };

  const getLocationName = (locationId: string) => {
    const location = locations.find(l => l.location_id === locationId);
    return location?.location_name || '-';
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Tokyo',
    }).format(date);
  };

  const getAgeDisplay = (customer: any) => {
    if (customer.child_age_years === null || customer.child_age_years === undefined) {
      return '';
    }
    
    if (customer.child_age_years === 0 && customer.child_age_months !== null && customer.child_age_months !== undefined) {
      return `${customer.child_age_months}ヶ月`;
    }
    
    return `${customer.child_age_years}歳`;
  };

  const filteredCustomers = customers.filter(c => {
    const search = searchTerm.toLowerCase();
    return (
      c.parent_name?.toLowerCase().includes(search) ||
      c.parent_name_kana?.toLowerCase().includes(search) ||
      c.child_name?.toLowerCase().includes(search) ||
      c.child_name_kana?.toLowerCase().includes(search) ||
      c.customer_code?.toLowerCase().includes(search) ||
      c.external_customer_number?.toLowerCase().includes(search) ||
      c.phone?.includes(search)
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
        <h1 className="text-slate-900">顧客管理</h1>
        <button
          onClick={() => {
            setEditingCustomer(null);
            setModalOpen(true);
          }}
          className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-4 py-2 rounded-xl hover:from-blue-600 hover:to-indigo-700 transition"
        >
          <Plus className="w-5 h-5" />
          <span>新規顧客</span>
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="顧客名、フリガナ、顧客番号、電話番号で検索..."
          className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Customers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCustomers.length === 0 ? (
          <div className="col-span-full bg-white rounded-2xl p-8 text-center text-slate-500">
            顧客が見つかりません
          </div>
        ) : (
          filteredCustomers.map((customer) => {
            const customerReservations = getCustomerReservations(customer.customer_id);
            const isExpanded = expandedCustomers.has(customer.customer_id);
            
            return (
              <div
                key={customer.customer_id}
                className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 hover:shadow-md transition cursor-pointer"
                onClick={() => {
                  setEditingCustomer(customer);
                  setModalOpen(true);
                }}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    {customer.external_customer_number && (
                      <div className="text-sm text-blue-600 mb-1">顧客番号: {customer.external_customer_number}</div>
                    )}
                    <h3 className="text-slate-900 mb-1">
                      {customer.parent_name || '保護者名未設定'}
                      {customer.parent_name_kana && (
                        <span className="text-sm text-slate-500 ml-2">({customer.parent_name_kana})</span>
                      )}
                    </h3>
                    <p className="text-slate-600 text-sm mb-1">
                      お子さま: {customer.child_name || '-'}
                      {customer.child_name_kana && (
                        <span className="text-slate-500"> ({customer.child_name_kana})</span>
                      )}
                    </p>
                    {getAgeDisplay(customer) && (
                      <p className="text-slate-600 text-sm">
                        年齢: {getAgeDisplay(customer)}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-2 text-sm text-slate-700">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">電話:</span>
                    <span>{customer.phone || '-'}</span>
                  </div>
                  {customer.address_text && (
                    <div className="flex items-start gap-2">
                      <span className="text-slate-500 shrink-0">住所:</span>
                      <span className="break-words">{customer.address_text}</span>
                    </div>
                  )}
                  {customer.notes_internal && (
                    <div className="mt-3 pt-3 border-t border-slate-200">
                      <span className="text-slate-500">メモ: </span>
                      <span className="text-slate-600">{customer.notes_internal}</span>
                    </div>
                  )}
                </div>

                {/* Reservation History Section */}
                {customerReservations.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-200">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCustomerExpansion(customer.customer_id);
                      }}
                      className="flex items-center justify-between w-full text-left hover:bg-slate-50 rounded-lg p-2 -mx-2 transition"
                    >
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-indigo-600" />
                        <span className="text-sm text-slate-700">
                          予約履歴 ({customerReservations.length}件)
                        </span>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="mt-3 space-y-3">
                        {customerReservations.map((reservation) => (
                          <div
                            key={reservation.reservation_id}
                            className="bg-slate-50 rounded-lg p-3 text-sm"
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="text-slate-900">
                                {formatDateTime(reservation.reservation_date_time)}
                              </div>
                              <div className="flex gap-1 flex-wrap justify-end">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded-full text-xs ${
                                    reservation.status === 'confirmed'
                                      ? 'bg-blue-100 text-blue-700'
                                      : reservation.status === 'tentative'
                                      ? 'bg-yellow-100 text-yellow-700'
                                      : reservation.status === 'done'
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-slate-100 text-slate-700'
                                  }`}
                                >
                                  {reservation.status === 'confirmed'
                                    ? '✓ 確定'
                                    : reservation.status === 'tentative'
                                    ? '仮予約'
                                    : reservation.status === 'done'
                                    ? '完了'
                                    : reservation.status === 'canceled'
                                    ? 'キャンセル'
                                    : reservation.status}
                                </span>
                                {reservation.payment_status === 'paid' && (
                                  <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">
                                    💰 支払済
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="space-y-1 text-slate-600">
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

                              <div className="flex items-center gap-2">
                                <span className="text-slate-500">場所:</span>
                                <span>{getLocationName(reservation.location_id)}</span>
                              </div>

                              {reservation.work_required && (
                                <div className="flex items-start gap-2">
                                  <span className="text-slate-500 shrink-0">制作内容:</span>
                                  <span>{reservation.work_required}</span>
                                </div>
                              )}

                              {reservation.amount_total !== null && reservation.amount_total !== undefined && (
                                <div className="flex items-center gap-2">
                                  <span className="text-slate-500">金額:</span>
                                  <span className="text-slate-900">
                                    ¥{reservation.amount_total.toLocaleString()}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {modalOpen && (
        <CustomerModal
          customer={editingCustomer}
          mode={editingCustomer ? 'view' : 'edit'}
          reservations={editingCustomer ? getCustomerReservations(editingCustomer.customer_id) : []}
          menuItems={menuItems}
          locations={locations}
          staffData={staffData}
          onSave={handleSave}
          onClose={() => {
            setModalOpen(false);
            setEditingCustomer(null);
          }}
        />
      )}
    </div>
  );
}
