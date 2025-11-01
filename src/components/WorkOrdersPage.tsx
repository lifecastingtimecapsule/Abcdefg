import { useEffect, useState } from 'react';
import { apiRequest } from '../utils/api';
import { Plus, AlertCircle, Clock, GripVertical } from 'lucide-react';
import { WorkOrderModal } from './WorkOrderModal';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

const ItemType = 'WORK_ORDER';

interface WorkOrderRowProps {
  workOrder: any;
  index: number;
  moveCard: (dragIndex: number, hoverIndex: number) => void;
  onEdit: (workOrder: any) => void;
  customers: any[];
  reservations: any[];
}

function WorkOrderRow({ workOrder, index, moveCard, onEdit, customers, reservations }: WorkOrderRowProps) {
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

  const isOverdue = workOrder.status !== '引渡し済' && new Date(workOrder.due_date) < new Date();

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('ja-JP', {
      month: 'numeric',
      day: 'numeric',
    }).format(date);
  };

  return (
    <tr
      ref={(node) => preview(drop(node))}
      className={`border-b border-slate-100 hover:bg-slate-50 transition ${
        isDragging ? 'opacity-50' : ''
      } ${isOverdue ? 'bg-red-50' : ''}`}
    >
      <td ref={drag} className="px-4 py-3 cursor-move">
        <GripVertical className="w-5 h-5 text-slate-400" />
      </td>
      <td className="px-4 py-3">
        <div className="text-slate-900">{customer?.child_name || '-'}</div>
        <div className="text-sm text-slate-600">{customer?.customer_code || '-'}</div>
      </td>
      <td className="px-4 py-3 text-slate-700">{workOrder.product_type}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-slate-500" />
          <span className={isOverdue ? 'text-red-600' : 'text-slate-700'}>
            {formatDate(workOrder.due_date)}
          </span>
          {isOverdue && <AlertCircle className="w-4 h-4 text-red-500" />}
        </div>
      </td>
      <td className="px-4 py-3">
        <span className={`inline-block px-3 py-1 rounded-full text-xs ${
          workOrder.status === '制作中' ? 'bg-yellow-100 text-yellow-700' :
          workOrder.status === 'お渡し待ち' ? 'bg-green-100 text-green-700' :
          'bg-blue-100 text-blue-700'
        }`}>
          {workOrder.status}
        </span>
      </td>
      <td className="px-4 py-3 text-slate-600 text-sm max-w-xs truncate">
        {workOrder.notes_internal || '-'}
      </td>
      <td className="px-4 py-3">
        <button
          onClick={() => onEdit(workOrder)}
          className="px-3 py-1 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition text-sm"
        >
          編集
        </button>
      </td>
    </tr>
  );
}

export function WorkOrdersPage() {
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [reservations, setReservations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingWorkOrder, setEditingWorkOrder] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [woData, custData, resData] = await Promise.all([
        apiRequest('/work-orders'),
        apiRequest('/customers'),
        apiRequest('/reservations'),
      ]);

      // Sort work orders
      const sorted = woData.work_orders.sort((a: any, b: any) => {
        if (a.priority_order !== null && b.priority_order !== null) {
          return a.priority_order - b.priority_order;
        }
        if (a.priority_order !== null) return -1;
        if (b.priority_order !== null) return 1;

        const aDate = new Date(a.due_date);
        const bDate = new Date(b.due_date);
        if (aDate < bDate) return -1;
        if (aDate > bDate) return 1;

        const aRes = resData.reservations.find((r: any) => r.reservation_id === a.reservation_id);
        const bRes = resData.reservations.find((r: any) => r.reservation_id === b.reservation_id);
        if (aRes && bRes) {
          const aResDate = new Date(aRes.reservation_date_time);
          const bResDate = new Date(bRes.reservation_date_time);
          return aResDate.getTime() - bResDate.getTime();
        }

        return 0;
      });

      setWorkOrders(sorted);
      setCustomers(custData.customers);
      setReservations(resData.reservations);
    } catch (err: any) {
      console.error('Load data error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setModalOpen(false);
    setEditingWorkOrder(null);
    await loadData();
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

      alert('並び順を保存しました');
    } catch (err: any) {
      console.error('Save order error:', err);
      alert('並び順の保存に失敗しました: ' + err.message);
    }
  };

  const filteredWorkOrders = workOrders.filter(wo => {
    if (filterStatus === 'all') return true;
    return wo.status === filterStatus;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-slate-900">納期管理</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={savePriorityOrder}
              className="px-4 py-2 bg-green-500 text-white rounded-xl hover:bg-green-600 transition"
            >
              並び順を保存
            </button>
            <button
              onClick={() => {
                setEditingWorkOrder(null);
                setModalOpen(true);
              }}
              className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-4 py-2 rounded-xl hover:from-blue-600 hover:to-indigo-700 transition"
            >
              <Plus className="w-5 h-5" />
              <span>制作物追加</span>
            </button>
          </div>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-3 overflow-x-auto pb-2">
          <button
            onClick={() => setFilterStatus('all')}
            className={`px-4 py-2 rounded-xl transition whitespace-nowrap ${
              filterStatus === 'all'
                ? 'bg-blue-500 text-white'
                : 'bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            すべて
          </button>
          <button
            onClick={() => setFilterStatus('制作中')}
            className={`px-4 py-2 rounded-xl transition whitespace-nowrap ${
              filterStatus === '制作中'
                ? 'bg-yellow-500 text-white'
                : 'bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            制作中
          </button>
          <button
            onClick={() => setFilterStatus('お渡し待ち')}
            className={`px-4 py-2 rounded-xl transition whitespace-nowrap ${
              filterStatus === 'お渡し待ち'
                ? 'bg-green-500 text-white'
                : 'bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            お渡し待ち
          </button>
          <button
            onClick={() => setFilterStatus('引渡し済')}
            className={`px-4 py-2 rounded-xl transition whitespace-nowrap ${
              filterStatus === '引渡し済'
                ? 'bg-blue-500 text-white'
                : 'bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            引渡し済
          </button>
        </div>

        {/* Work Orders Table */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-slate-700 w-12"></th>
                  <th className="px-4 py-3 text-left text-slate-700">顧客</th>
                  <th className="px-4 py-3 text-left text-slate-700">作品タイプ</th>
                  <th className="px-4 py-3 text-left text-slate-700">納期</th>
                  <th className="px-4 py-3 text-left text-slate-700">ステータス</th>
                  <th className="px-4 py-3 text-left text-slate-700">メモ</th>
                  <th className="px-4 py-3 text-left text-slate-700">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredWorkOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      制作物がありません
                    </td>
                  </tr>
                ) : (
                  filteredWorkOrders.map((workOrder, index) => (
                    <WorkOrderRow
                      key={workOrder.work_order_id}
                      workOrder={workOrder}
                      index={index}
                      moveCard={moveCard}
                      onEdit={(wo) => {
                        setEditingWorkOrder(wo);
                        setModalOpen(true);
                      }}
                      customers={customers}
                      reservations={reservations}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-blue-900 text-sm">
            💡 ドラッグ＆ドロップで制作の優先順位を変更できます。変更したら「並び順を保存」ボタンをクリックしてください。
          </p>
        </div>

        {modalOpen && (
          <WorkOrderModal
            workOrder={editingWorkOrder}
            reservations={reservations}
            customers={customers}
            onSave={handleSave}
            onClose={() => {
              setModalOpen(false);
              setEditingWorkOrder(null);
            }}
          />
        )}
      </div>
    </DndProvider>
  );
}
