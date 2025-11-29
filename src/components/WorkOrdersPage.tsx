import { useEffect, useState } from 'react';
import { apiRequest } from '../utils/api';
import { toast } from 'sonner@2.0.3';
import { Plus, AlertCircle, Clock, GripVertical, CheckCircle2, Circle, Palette, Hammer, Frame, Search, Filter } from 'lucide-react';
import { WorkOrderModal } from './WorkOrderModal';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { WorkOrder, Customer, Reservation } from '../types';
import { motion, AnimatePresence } from 'motion/react';

const ItemType = 'WORK_ORDER';

interface WorkOrderCardProps {
  workOrder: WorkOrder;
  index: number;
  moveCard: (dragIndex: number, hoverIndex: number) => void;
  onEdit: (workOrder: WorkOrder) => void;
  customers: Customer[];
  reservations: Reservation[];
}

const STATUS_CONFIG = {
  '乾燥中': { icon: Circle, color: 'text-orange-500', bg: 'bg-orange-50', border: 'border-orange-200' },
  '成形': { icon: Hammer, color: 'text-stone-600', bg: 'bg-stone-50', border: 'border-stone-200' },
  '着色': { icon: Palette, color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200' },
  '額装': { icon: Frame, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200' },
  '完成': { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
};

function WorkOrderCard({ workOrder, index, moveCard, onEdit, customers, reservations }: WorkOrderCardProps) {
  const [{ isDragging }, drag, preview] = useDrag({
    type: ItemType,
    item: { index },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const [, drop] = useDrop({
    accept: ItemType,
    hover(item: { index: number }) {
      if (item.index !== index) {
        moveCard(item.index, index);
        item.index = index;
      }
    },
  });

  const reservation = reservations.find(r => r.reservation_id === workOrder.reservation_id);
  const customer = customers.find(c => c.customer_id === reservation?.customer_id);

  const getJapanToday = () => {
    const now = new Date();
    const japanDateStr = now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' });
    return new Date(japanDateStr);
  };

  const isOverdue = workOrder.status !== '完成' && new Date(workOrder.due_date) < getJapanToday();

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('ja-JP', {
      month: 'numeric',
      day: 'numeric',
      timeZone: 'Asia/Tokyo',
    }).format(date);
  };

  const statusConfig = STATUS_CONFIG[workOrder.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG['乾燥中'];
  const StatusIcon = statusConfig.icon;

  return (
    <div
      ref={(node) => preview(drop(node))}
      className={`
        mb-3 bg-white rounded-none border-l-4 shadow-sm transition-all hover:shadow-md cursor-pointer
        ${isDragging ? 'opacity-50' : 'opacity-100'}
        ${statusConfig.border.replace('border-', 'border-l-')}
        border-y border-r border-gray-100
      `}
      onClick={() => onEdit(workOrder)}
    >
      <div className="p-4 flex items-start gap-3">
        <div 
          ref={drag} 
          className="mt-1 cursor-move text-gray-300 hover:text-gray-500 p-1"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-5 h-5" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start mb-1">
             <h3 className="text-[#2C2C2C] font-medium font-serif truncate text-lg">
               {customer?.child_name || '未登録顧客'}
               <span className="text-xs text-gray-400 ml-2 font-sans">{customer?.external_customer_number}</span>
             </h3>
             <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${statusConfig.bg} ${statusConfig.color}`}>
               <StatusIcon className="w-3 h-3" />
               {workOrder.status}
             </span>
          </div>
          
          <div className="text-sm text-gray-600 mb-2 font-serif">{workOrder.product_type}</div>
          
          <div className="flex items-center gap-4 text-xs text-gray-500">
             <div className={`flex items-center gap-1 ${isOverdue ? 'text-red-600 font-medium' : ''}`}>
                <Clock className="w-3.5 h-3.5" />
                <span>納期: {formatDate(workOrder.due_date)}</span>
                {isOverdue && <AlertCircle className="w-3.5 h-3.5" />}
             </div>
             
             {workOrder.nameplate_name && (
               <div className="truncate max-w-[120px] bg-gray-50 px-2 py-0.5 rounded text-gray-600">
                 📛 {workOrder.nameplate_name}
               </div>
             )}
          </div>

          {/* Color/Frame Indicators */}
          <div className="mt-3 flex gap-2">
             {workOrder.coloring_type && (
                <span className={`text-[10px] px-2 py-0.5 border rounded ${workOrder.coloring_type === '金' ? 'bg-[#F9F5E6] text-[#B8860B] border-[#E6D690]' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                  {workOrder.coloring_type}
                </span>
             )}
             {workOrder.frame_color && (
                <span className={`text-[10px] px-2 py-0.5 border rounded ${workOrder.frame_color === '黒' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200'}`}>
                  額: {workOrder.frame_color}
                </span>
             )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function WorkOrdersPage() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingWorkOrder, setEditingWorkOrder] = useState<WorkOrder | null>(null);
  const [modalMode, setModalMode] = useState<'view' | 'edit'>('edit');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [woData, custData, resData, menuData] = await Promise.all([
        apiRequest('/work-orders'),
        apiRequest('/customers'),
        apiRequest('/reservations'),
        apiRequest('/menu-items'),
      ]);

      setMenuItems(menuData.menu_items || []);

      await autoCreateWorkOrders(
        resData.reservations, 
        menuData.menu_items || [], 
        woData.work_orders
      );

      const updatedWoData = await apiRequest('/work-orders');
      const now = new Date();
      const japanNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));

      const filteredWorkOrders = updatedWoData.work_orders.filter((wo: any) => {
        const reservation = resData.reservations.find((r: any) => r.reservation_id === wo.reservation_id);
        if (!reservation) return true;
        if (reservation.status !== 'confirmed') return true;
        const reservationDate = new Date(reservation.reservation_date_time);
        return reservationDate < japanNow;
      });

      const sorted = filteredWorkOrders.sort((a: any, b: any) => {
        if (a.priority_order !== null && b.priority_order !== null) {
          return a.priority_order - b.priority_order;
        }
        if (a.priority_order !== null) return -1;
        if (b.priority_order !== null) return 1;
        const aDate = new Date(a.due_date);
        const bDate = new Date(b.due_date);
        if (aDate < bDate) return -1;
        if (aDate > bDate) return 1;
        return 0;
      });

      setWorkOrders(sorted);
      setCustomers(custData.customers);
      setReservations(resData.reservations);
    } catch (err: any) {
      console.error('Load data error:', err);
      toast.error('データの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const autoCreateWorkOrders = async (
    reservationsList: any[], 
    menuItemsList: any[], 
    existingWorkOrders: any[]
  ) => {
    try {
      const now = new Date();
      const japanNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));

      const pastConfirmedReservations = reservationsList.filter((reservation) => {
        const reservationDate = new Date(reservation.reservation_date_time);
        return (
          reservation.status === 'confirmed' &&
          reservationDate < japanNow
        );
      });

      if (pastConfirmedReservations.length === 0) return;

      const existingReservationIds = new Set(
        existingWorkOrders.map((wo: any) => wo.reservation_id).filter(Boolean)
      );

      const reservationsNeedingWorkOrders = pastConfirmedReservations.filter(
        (reservation) => !existingReservationIds.has(reservation.reservation_id)
      );

      if (reservationsNeedingWorkOrders.length === 0) return;

      let createdCount = 0;
      for (const reservation of reservationsNeedingWorkOrders) {
        try {
          const reservationDate = new Date(reservation.reservation_date_time);
          const dueDate = new Date(reservationDate);
          dueDate.setDate(dueDate.getDate() + 28); // 4 weeks
          const dueDateStr = dueDate.toISOString().split('T')[0];

          const menuItem = menuItemsList.find((m) => m.menu_item_id === reservation.menu_item_id);
          const workType = menuItem ? menuItem.name : 'メニュー不明';

          await apiRequest('/work-orders', {
            method: 'POST',
            body: JSON.stringify({
              reservation_id: reservation.reservation_id,
              product_type: workType,
              due_date: dueDateStr,
              status: '乾燥中', // Default new status
              notes: '予約確定により自動作成',
            }),
          });
          createdCount++;
        } catch (err: any) {
          console.error(err);
        }
      }

      if (createdCount > 0) {
        console.log(`✅ ${createdCount}件の制作物を自動作成しました`);
      }
    } catch (err) {
      console.error('Auto-create work orders error:', err);
    }
  };

  const handleSave = async () => {
    setModalOpen(false);
    setEditingWorkOrder(null);
    setModalMode('edit');
    await loadData();
  };

  const handleEdit = (workOrder: WorkOrder) => {
    setEditingWorkOrder(workOrder);
    setModalMode('edit');
    setModalOpen(true);
  };

  const moveCard = (dragIndex: number, hoverIndex: number) => {
    const dragCard = workOrders[dragIndex];
    const newWorkOrders = [...workOrders];
    newWorkOrders.splice(dragIndex, 1);
    newWorkOrders.splice(hoverIndex, 0, dragCard);
    setWorkOrders(newWorkOrders);
  };

  const savePriorityOrder = async () => {
    try {
      const orders = workOrders.map((wo, index) => ({
        work_order_id: wo.work_order_id,
        priority_order: index,
      }));

      await apiRequest('/work-orders/reorder', {
        method: 'POST',
        body: JSON.stringify({ orders }),
      });

      toast.success('並び順を保存しました');
    } catch (err: any) {
      console.error('Save order error:', err);
      toast.error('並び順の保存に失敗しました');
    }
  };

  const handleBatchCreateWorkOrders = async () => {
    if (!window.confirm('予約日が過ぎた確定済み予約で制作物がない場合、自動的に制作物を生成します。実行しますか？')) {
      return;
    }

    try {
      const result = await apiRequest('/reservations/batch-create-work-orders', {
        method: 'POST',
      });

      toast.success(result.message || `${result.created_count}件の制作物を生成しました`);
      await loadData();
    } catch (err: any) {
      console.error('Batch create work orders error:', err);
      toast.error('一括生成に失敗しました');
    }
  };

  const filteredWorkOrders = workOrders.filter(wo => {
    if (filterStatus !== 'all' && wo.status !== filterStatus) return false;
    
    if (searchTerm) {
       const reservation = reservations.find(r => r.reservation_id === wo.reservation_id);
       const customer = customers.find(c => c.customer_id === reservation?.customer_id);
       const name = customer?.child_name || '';
       const number = customer?.external_customer_number || '';
       const searchLower = searchTerm.toLowerCase();
       return name.toLowerCase().includes(searchLower) || number.toLowerCase().includes(searchLower);
    }
    
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[80vh] bg-white">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#C4A962] border-t-transparent"></div>
          <p className="text-[#C4A962] font-serif tracking-widest">読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="max-w-5xl mx-auto pb-20 font-serif text-[#2C2C2C]">
        {/* Header */}
        <div className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-[#E0E0E0] py-4 px-4 mb-6">
           <div className="flex items-center justify-between mb-4">
             <h1 className="text-2xl font-medium tracking-wide text-[#2C2C2C]">作品管理</h1>
             <div className="flex gap-2">
                <button
                  onClick={savePriorityOrder}
                  className="px-4 py-2 bg-white border border-[#C4A962] text-[#C4A962] text-sm rounded-none hover:bg-[#C4A962] hover:text-white transition-colors duration-300"
                >
                  並び順保存
                </button>
                <button
                  onClick={() => {
                    setEditingWorkOrder(null);
                    setModalMode('edit');
                    setModalOpen(true);
                  }}
                  className="px-4 py-2 bg-[#C4A962] text-white text-sm rounded-none hover:bg-[#B39851] transition-colors duration-300 flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  追加
                </button>
             </div>
           </div>
           
           {/* Search & Action Bar */}
           <div className="flex flex-col md:flex-row gap-3 mb-4">
              <div className="relative flex-1">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                 <input 
                    type="text" 
                    placeholder="名前や顧客番号で検索" 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-[#F9F9F9] border border-gray-200 focus:outline-none focus:border-[#C4A962] rounded-none transition-colors"
                 />
              </div>
              <button
                 onClick={handleBatchCreateWorkOrders}
                 className="px-4 py-2 bg-gray-100 text-gray-600 text-xs rounded-none hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
               >
                 <AlertCircle className="w-3 h-3" />
                 未作成予約を一括生成
               </button>
           </div>

           {/* Status Filters */}
           <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
              <button
                onClick={() => setFilterStatus('all')}
                className={`whitespace-nowrap px-4 py-1.5 rounded-full text-sm border transition-all ${
                  filterStatus === 'all' 
                    ? 'bg-[#2C2C2C] text-white border-[#2C2C2C]' 
                    : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                }`}
              >
                すべて
              </button>
              {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`whitespace-nowrap px-4 py-1.5 rounded-full text-sm border transition-all flex items-center gap-1.5 ${
                    filterStatus === status
                      ? `${config.bg} ${config.color} ${config.border}`
                      : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                   {filterStatus === status && <config.icon className="w-3 h-3" />}
                   {status}
                </button>
              ))}
           </div>
        </div>

        {/* Content */}
        <div className="px-4">
          {filteredWorkOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <Package className="w-8 h-8 text-gray-300" />
              </div>
              <p>表示する作品がありません</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredWorkOrders.map((workOrder, index) => (
                <WorkOrderCard
                  key={workOrder.work_order_id}
                  workOrder={workOrder}
                  index={index}
                  moveCard={moveCard}
                  onEdit={handleEdit}
                  customers={customers}
                  reservations={reservations}
                />
              ))}
            </div>
          )}
        </div>

        {modalOpen && (
          <WorkOrderModal
            workOrder={editingWorkOrder}
            reservations={reservations}
            customers={customers}
            mode={modalMode}
            onSave={handleSave}
            onClose={() => {
              setModalOpen(false);
              setEditingWorkOrder(null);
              setModalMode('edit');
            }}
          />
        )}
      </div>
    </DndProvider>
  );
}