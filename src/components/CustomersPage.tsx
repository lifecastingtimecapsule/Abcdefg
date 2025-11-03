import { useEffect, useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner@2.0.3';
import { Plus, Edit2, Search, ChevronDown, ChevronUp, Calendar, Package, Clock, AlertCircle } from 'lucide-react';
import { CustomerModal } from './CustomerModal';
import { WorkOrderModal } from './WorkOrderModal';
import { ReservationModal } from './ReservationModal';
import { Customer, Reservation, MenuItem, Location, User, WorkOrder } from '../types';
import { useCustomers, useReservations, useWorkOrders, useMenuItems, useLocations, useUsers } from '../utils/queries';
import { invalidateQueries } from '../utils/queryClient';
import { apiRequest } from '../utils/api/client';
import { API_ENDPOINTS, withQuery } from '../utils/api/endpoints';
import { PermissionGate } from './rbac/PermissionGate';
import { Permission } from '../utils/rbac/permissions';

interface CustomersPageProps {
  userRole?: string;
  currentUser?: User | null;
}

export function CustomersPage({ userRole, currentUser = null }: CustomersPageProps) {
  
  // UI状態管理
  const [searchInput, setSearchInput] = useState(''); // For debounced search
  const [searchTerm, setSearchTerm] = useState('');
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

  // カスタマーデータ（ページネーション付き）
  const [paginatedCustomers, setPaginatedCustomers] = useState<Customer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(true);

  // React Queryでデータ取得（キャッシュ・リトライ付き）
  const reservationsQuery = useReservations();
  const workOrdersQuery = useWorkOrders();
  const menuItemsQuery = useMenuItems();
  const locationsQuery = useLocations();
  const usersQuery = useUsers();

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(searchInput);
      setCurrentPage(1); // Reset to first page on search
    }, 300);

    return () => clearTimeout(timer);
  }, [searchInput]);

  // ページネーション付きカスタマーデータの取得
  useEffect(() => {
    const loadPaginatedCustomers = async () => {
      try {
        setCustomersLoading(true);
        
        // Build query parameters
        const params: Record<string, string> = {
          page: currentPage.toString(),
          pageSize: pageSize.toString(),
        };
        
        if (searchTerm) {
          params.search = searchTerm;
        }

        const custData = await apiRequest(withQuery(API_ENDPOINTS.customers.list, params));
        
        setPaginatedCustomers(custData.customers);
        setTotal(custData.total || 0);
        setTotalPages(custData.totalPages || 1);
      } catch (err: any) {
        console.error('Load customers error:', err);
        toast.error('顧客データの読み込みに失敗しました');
      } finally {
        setCustomersLoading(false);
      }
    };

    loadPaginatedCustomers();
  }, [currentPage, searchTerm, pageSize]);

  const handleSave = useCallback(() => {
    setModalOpen(false);
    setEditingCustomer(null);
    // データを再取得
    invalidateQueries.customers();
  }, []);

  const toggleCustomerExpansion = useCallback((customerId: string) => {
    setExpandedCustomers(prev => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(customerId)) {
        newExpanded.delete(customerId);
      } else {
        newExpanded.add(customerId);
      }
      return newExpanded;
    });
  }, []);

  const getCustomerReservations = useCallback((customerId: string) => {
    const reservations = reservationsQuery.data || [];
    return reservations
      .filter(r => r.customer_id === customerId)
      .sort((a, b) => new Date(b.reservation_date_time).getTime() - new Date(a.reservation_date_time).getTime());
  }, [reservationsQuery.data]);

  const getCustomerWorkOrders = useCallback((customerId: string) => {
    const reservations = reservationsQuery.data || [];
    const workOrders = workOrdersQuery.data || [];
    
    const customerReservationIds = reservations
      .filter(r => r.customer_id === customerId)
      .map(r => r.reservation_id);
    
    return workOrders
      .filter(wo => customerReservationIds.includes(wo.reservation_id))
      .sort((a, b) => new Date(b.due_date).getTime() - new Date(a.due_date).getTime());
  }, [reservationsQuery.data, workOrdersQuery.data]);

  const getMenuName = useCallback((menuItemId: string) => {
    const menuItems = menuItemsQuery.data || [];
    const menu = menuItems.find(m => m.menu_item_id === menuItemId);
    return menu?.name || '-';
  }, [menuItemsQuery.data]);

  const getLocationName = useCallback((locationId: string) => {
    const locations = locationsQuery.data || [];
    const location = locations.find(l => l.location_id === locationId);
    return location?.location_name || '-';
  }, [locationsQuery.data]);

  // 日付フォーマット関数をuseMemoでメモ化
  const dateUtils = useMemo(() => ({
    formatDateTime: (dateString: string) => {
      const date = new Date(dateString);
      return new Intl.DateTimeFormat('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Tokyo',
      }).format(date);
    },
    formatDate: (dateString: string) => {
      const date = new Date(dateString);
      return new Intl.DateTimeFormat('ja-JP', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'Asia/Tokyo',
      }).format(date);
    },
    getJapanToday: () => {
      const now = new Date();
      const japanDateStr = now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' });
      return new Date(japanDateStr);
    },
  }), []);

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

  // ローディ��グ状態（いずれかのクエリがローディング中）
  const isLoading = customersLoading || reservationsQuery.isLoading || workOrdersQuery.isLoading || 
                    menuItemsQuery.isLoading || locationsQuery.isLoading || usersQuery.isLoading;

  if (isLoading && !paginatedCustomers.length) {
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
          <PermissionGate user={currentUser} permission={Permission.EDIT_SYSTEM_SETTINGS}>
            <button
              onClick={handleBatchFixAge}
              className="flex items-center gap-2 bg-amber-500 text-white px-4 py-2 rounded-xl hover:bg-amber-600 transition text-sm"
              title="月齢のみ入力されている顧客データの年齢を0歳に補完"
            >
              <AlertCircle className="w-4 h-4" />
              <span>年齢データ補完</span>
            </button>
          </PermissionGate>
          <PermissionGate user={currentUser} permission={Permission.CREATE_CUSTOMER}>
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
          </PermissionGate>
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

      {/* Customers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {paginatedCustomers.length === 0 ? (
          <div className="col-span-full bg-white rounded-2xl p-8 text-center text-slate-500">
            {searchTerm ? '検索条件に一致する顧客が見つかりません' : '顧客が登録されていません'}
          </div>
        ) : (
          paginatedCustomers.map((customer) => {
            const customerReservations = getCustomerReservations(customer.customer_id);
            const isExpanded = expandedCustomers.has(customer.customer_id);
            
            const customerWorkOrders = getCustomerWorkOrders(customer.customer_id);
            
            return (
              <div
                key={customer.customer_id}
                className="bg-white rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition overflow-hidden"
              >
                <div 
                  className="p-6 cursor-pointer"
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
                </div>


              </div>
            );
          })
        )}
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
