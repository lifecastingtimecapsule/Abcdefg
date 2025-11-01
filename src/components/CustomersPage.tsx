import { useEffect, useState } from 'react';
import { apiRequest } from '../utils/api';
import { Plus, Edit2, Search } from 'lucide-react';
import { CustomerModal } from './CustomerModal';

export function CustomersPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any>(null);

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    try {
      setLoading(true);
      const result = await apiRequest('/customers');
      setCustomers(result.customers);
    } catch (err: any) {
      console.error('Load customers error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setModalOpen(false);
    setEditingCustomer(null);
    await loadCustomers();
  };

  const filteredCustomers = customers.filter(c => {
    const search = searchTerm.toLowerCase();
    return (
      c.parent_name?.toLowerCase().includes(search) ||
      c.child_name?.toLowerCase().includes(search) ||
      c.customer_code?.toLowerCase().includes(search) ||
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
          placeholder="顧客名、顧客番号、電話番号で検索..."
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
          filteredCustomers.map((customer) => (
            <div
              key={customer.customer_id}
              className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 hover:shadow-md transition"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="text-sm text-blue-600 mb-1">{customer.customer_code}</div>
                  <h3 className="text-slate-900 mb-1">{customer.child_name || '名前未設定'}</h3>
                  <p className="text-slate-600 text-sm">保護者: {customer.parent_name || '-'}</p>
                </div>
                <button
                  onClick={() => {
                    setEditingCustomer(customer);
                    setModalOpen(true);
                  }}
                  className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition"
                  title="編集"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
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
          ))
        )}
      </div>

      {modalOpen && (
        <CustomerModal
          customer={editingCustomer}
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
