import { useEffect, useState } from 'react';
import { apiRequest } from '../utils/api';
import { toast } from 'sonner@2.0.3';
import { Plus, Edit2, Search, ChevronDown, ChevronUp, Calendar, Package, Clock, AlertCircle, Trash2 } from 'lucide-react';
import { CustomerModal } from './CustomerModal';
import { WorkOrderModal } from './WorkOrderModal';
import { ReservationModal } from './ReservationModal';
import { Customer, Reservation, MenuItem, Location, User, WorkOrder } from '../types';

interface CustomersPageProps {
  userRole?: string;
}

export function CustomersPage({ userRole }: CustomersPageProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [staffData, setStaffData] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchInput, setSearchInput] = useState(''); // For debounced search
  const [modalOpen, setModalOpen] = useState(false);
  const [workOrderModalOpen, setWorkOrderModalOpen] = useState(false);
  const [reservationModalOpen, setReservationModalOpen] = useState(false);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WorkOrder | null>(null);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize] = useState(30);

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(searchInput);
      setCurrentPage(1); // Reset to first page on search
    }, 300);

    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    loadData();
  }, [currentPage, searchTerm]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Build query parameters
      const params = new URLSearchParams({
        page: currentPage.toString(),
        pageSize: pageSize.toString(),
      });
      
      if (searchTerm) {
        params.append('search', searchTerm);
      }

      // まず顧客・マスタを並列取得
      const [customerRes, menuRes, locRes, userRes] = await Promise.allSettled([
        apiRequest(`/customers?${params.toString()}`),
        apiRequest('/menu-items'),
        apiRequest('/locations'),
        apiRequest('/users'),
      ]);

      if (customerRes.status === 'fulfilled') {
        const customerData = customerRes.value.customers || [];
        setCustomers(customerData);
        setTotal(customerRes.value.total || 0);
        setTotalPages(customerRes.value.totalPages || 1);

        // 表示中の顧客IDだけで reservations/work-orders を取得（全件取得を回避）
        const customerIds = customerData.map((c: any) => c.customer_id).filter(Boolean);
        if (customerIds.length > 0) {
          const resResult = await apiRequest<{ reservations: any[] }>(
            `/reservations?customer_ids=${customerIds.join(',')}`
          ).catch(() => null);
          const fetchedReservations = resResult?.reservations || [];
          setReservations(fetchedReservations);

          const reservationIds = fetchedReservations.map((r: any) => r.reservation_id).filter(Boolean);
          if (reservationIds.length > 0) {
            const woResult = await apiRequest<{ work_orders: any[] }>(
              `/work-orders?reservation_ids=${reservationIds.join(',')}`
            ).catch(() => null);
            setWorkOrders(woResult?.work_orders || []);
          } else {
            setWorkOrders([]);
          }
        } else {
          setReservations([]);
          setWorkOrders([]);
        }
      } else {
        console.error('Failed to load customers:', customerRes.reason);
        toast.error('顧客データの読み込みに失敗しました');
      }

      if (menuRes.status === 'fulfilled') setMenuItems(menuRes.value.menu_items || []);
      if (locRes.status === 'fulfilled') setLocations(locRes.value.locations || []);
      if (userRes.status === 'fulfilled') {
        setStaffData(userRes.value.users || []);
      } else {
        setStaffData([]);
      }
    } catch (err: any) {
      console.error('Load data error:', err);
      toast.error('データの読み込みに失敗しました');
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

  const getCustomerWorkOrders = (customerId: string) => {
    const customerReservationIds = reservations
      .filter(r => r.customer_id === customerId)
      .map(r => r.reservation_id);
    
    return workOrders
      .filter(wo => customerReservationIds.includes(wo.reservation_id))
      .sort((a, b) => new Date(b.due_date).getTime() - new Date(a.due_date).getTime());
  };

  const getMenuName = (menuItemId: string) => {
    const menu = menuItems.find(m => m.menu_item_id === menuItemId);
    return menu?.name || '-';
  };

  const handleDeleteCustomer = async (customer: Customer) => {
    const customerReservations = getCustomerReservations(customer.customer_id);
    const customerWorkOrders = getCustomerWorkOrders(customer.customer_id);
    
    const confirmMessage = `顧客「${customer.customer_code || customer.parent_name}」を削除してもよろしいですか？\n\n以下の関連データも同時に削除されます：\n・予約: ${customerReservations.length}件\n・制作物: ${customerWorkOrders.length}件\n\nこの操作は取り消せません。`;
    
    if (!confirm(confirmMessage)) {
      return;
    }
    
    try {
      setLoading(true);
      const result = await apiRequest(`/customers/${customer.customer_id}`, {
        method: 'DELETE',
      });
      
      toast.success(result.message || '顧客を削除しました');
      await loadData();
    } catch (err: any) {
      console.error('Delete customer error:', err);
      toast.error(err.message || '顧客の削除に失敗しました');
    } finally {
      setLoading(false);
    }
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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'Asia/Tokyo',
    }).format(date);
  };

  const getJapanToday = () => {
    const now = new Date();
    const japanDateStr = now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' });
    return new Date(japanDateStr);
  };

  const handleBatchFixAge = async () => {
    if (!confirm('既存の顧客データで、月齢が入力されているが年齢が未入力のレコードを一括で補完します。\n\nこの操作により、過去の予約データも年齢別集計に反映されるようになります。\n\n実行しますか？')) {
      return;
    }

    try {
      setLoading(true);
      const result = await apiRequest('/customers/batch-fix-age', {
        method: 'POST',
      });
      
      toast.success(result.message || `${result.updated_count}件のデータを補完しました`);
      
      // データを再読み込み
      await loadData();
    } catch (err: any) {
      console.error('Batch fix age error:', err);
      toast.error(err.message || 'データ補完に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const getAgeDisplay = (customer: any) => {
    // If children array exists and has items, use that
    if (customer.children && Array.isArray(customer.children) && customer.children.length > 0) {
      return customer.children.map((child: any) => {
        const hasMonths = child.age_months !== null && child.age_months !== undefined;
        const years = child.age_years ?? (hasMonths ? 0 : null);
        
        if (years === null || years === undefined) return '';
        
        const ageStr = (years === 0 && hasMonths) ? `${child.age_months}ヶ月` : `${years}歳`;
        return `${child.name} (${ageStr})`;
      }).filter(Boolean).join('、');
    }

    // Legacy fallback
    // 月齢が入力されている場合は、歳がnullでも0歳として扱う
    const hasMonths = customer.child_age_months !== null && customer.child_age_months !== undefined;
    const years = customer.child_age_years ?? (hasMonths ? 0 : null);
    
    if (years === null || years === undefined) {
      return '';
    }
    
    // 0歳の場合は月齢だけ表示
    if (years === 0 && hasMonths) {
      return `${customer.child_age_months}ヶ月`;
    }
    
    return `${years}歳`;
  };

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
        <div className="flex items-center gap-3">
          {userRole === 'admin' && (
            <button
              onClick={handleBatchFixAge}
              className="flex items-center gap-2 bg-amber-500 text-white px-4 py-2 rounded-xl hover:bg-amber-600 transition text-sm"
              title="月齢のみ入力されている顧客データの年齢を0歳に補完"
            >
              <AlertCircle className="w-4 h-4" />
              <span>年齢データ補完</span>
            </button>
          )}
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
      </div>

      {/* Search and Results Info */}
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="顧客名、フリガナ、顧客番号、電話番号で検索..."
            className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        
        {/* Results info */}
        <div className="flex items-center justify-between text-sm text-slate-600">
          <div>
            全{total}件中 {Math.min((currentPage - 1) * pageSize + 1, total)}〜{Math.min(currentPage * pageSize, total)}件を表示
          </div>
        </div>
      </div>

      {/* Customers Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-3 py-2 text-slate-600 font-medium whitespace-nowrap">顧客番号</th>
                <th className="text-left px-3 py-2 text-slate-600 font-medium whitespace-nowrap">保護者名</th>
                <th className="text-left px-3 py-2 text-slate-600 font-medium whitespace-nowrap">フリガナ</th>
                <th className="text-left px-3 py-2 text-slate-600 font-medium whitespace-nowrap">お子さま</th>
                <th className="text-left px-3 py-2 text-slate-600 font-medium whitespace-nowrap">年齢</th>
                <th className="text-left px-3 py-2 text-slate-600 font-medium whitespace-nowrap">電話</th>
                <th className="text-left px-3 py-2 text-slate-600 font-medium whitespace-nowrap">予約</th>
                <th className="text-left px-3 py-2 text-slate-600 font-medium whitespace-nowrap">制作物</th>
                <th className="text-left px-3 py-2 text-slate-600 font-medium whitespace-nowrap min-w-[120px]">メモ</th>
                <th className="px-3 py-2 text-slate-600 font-medium whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                    {searchTerm ? '検索条件に一致する顧客が見つかりません' : '顧客が登録されていません'}
                  </td>
                </tr>
              ) : (
                customers.map((customer, idx) => {
                  const customerReservations = getCustomerReservations(customer.customer_id);
                  const customerWorkOrders = getCustomerWorkOrders(customer.customer_id);
                  const childDisplay = customer.children && customer.children.length > 0
                    ? customer.children.map((c: any) => c.name).filter(Boolean).join('、')
                    : customer.child_name || '-';
                  const childKana = customer.children && customer.children.length > 0
                    ? customer.children.map((c: any) => c.name_kana).filter(Boolean).join('、')
                    : customer.child_name_kana || '';
                  return (
                    <tr
                      key={customer.customer_id}
                      className={`border-b border-slate-100 hover:bg-blue-50 transition cursor-pointer ${idx % 2 === 0 ? '' : 'bg-slate-50/50'}`}
                      onClick={() => { setEditingCustomer(customer); setModalOpen(true); }}
                    >
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="text-xs text-blue-600 font-medium">
                          {customer.external_customer_number || customer.customer_code || '-'}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap font-medium text-slate-800">
                        {customer.parent_name || '未設定'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-500">
                        {customer.parent_name_kana || '-'}
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-slate-800">{childDisplay}</div>
                        {childKana && <div className="text-xs text-slate-400">{childKana}</div>}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-700">
                        {getAgeDisplay(customer) || '-'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-700">
                        {customer.phone || '-'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-center">
                        {customerReservations.length > 0 ? (
                          <span className="inline-block bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full">
                            {customerReservations.length}件
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-center">
                        {customerWorkOrders.length > 0 ? (
                          <span className="inline-block bg-emerald-100 text-emerald-700 text-xs font-medium px-2 py-0.5 rounded-full">
                            {customerWorkOrders.length}件
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2 max-w-[160px]">
                        {customer.notes_internal ? (
                          <span className="text-xs text-slate-600 line-clamp-2" title={customer.notes_internal}>
                            {customer.notes_internal.slice(0, 40)}{customer.notes_internal.length > 40 ? '…' : ''}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-xs">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            className="p-1.5 rounded hover:bg-blue-100 text-blue-600 transition"
                            title="編集"
                            onClick={() => { setEditingCustomer(customer); setModalOpen(true); }}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          {userRole === 'admin' && (
                            <button
                              className="p-1.5 rounded hover:bg-red-100 text-red-500 transition"
                              title="削除"
                              onClick={() => handleDeleteCustomer(customer)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            className="px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            前へ
          </button>
          
          <div className="flex items-center gap-2">
            {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
              let pageNum;
              if (totalPages <= 7) {
                pageNum = i + 1;
              } else if (currentPage <= 4) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 3) {
                pageNum = totalPages - 6 + i;
              } else {
                pageNum = currentPage - 3 + i;
              }
              
              return (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`w-10 h-10 rounded-lg transition ${
                    currentPage === pageNum
                      ? 'bg-blue-500 text-white'
                      : 'bg-white border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>
          
          <button
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
            className="px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            次へ
          </button>
        </div>
      )}

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

      {workOrderModalOpen && selectedWorkOrder && (
        <WorkOrderModal
          workOrder={selectedWorkOrder}
          reservations={reservations}
          customers={customers}
          menuItems={menuItems}
          mode="view"
          onSave={async () => {
            setWorkOrderModalOpen(false);
            setSelectedWorkOrder(null);
            await loadData();
          }}
          onClose={() => {
            setWorkOrderModalOpen(false);
            setSelectedWorkOrder(null);
          }}
        />
      )}

      {reservationModalOpen && selectedReservation && (
        <ReservationModal
          reservation={selectedReservation}
          customers={customers}
          menuItems={menuItems}
          locations={locations}
          users={staffData}
          mode="view"
          onSave={async () => {
            setReservationModalOpen(false);
            setSelectedReservation(null);
            await loadData();
          }}
          onClose={() => {
            setReservationModalOpen(false);
            setSelectedReservation(null);
          }}
        />
      )}
    </div>
  );
}
