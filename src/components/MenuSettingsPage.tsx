import { useEffect, useState } from 'react';
import { apiRequest } from '../utils/api';
import { toast } from 'sonner@2.0.3';
import { Plus, Edit2, Trash2, X } from 'lucide-react';

export function MenuSettingsPage() {
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: '',
    base_price: '',
    additional_unit_price: '',
    description: '',
    is_active: true,
  });

  useEffect(() => {
    loadMenuItems();
  }, []);

  const loadMenuItems = async () => {
    try {
      setLoading(true);
      const data = await apiRequest('/menu-items');
      setMenuItems(data.menu_items || []);
    } catch (err: any) {
      console.error('Load menu items error:', err);
      toast.error('メニュー一覧の読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (item?: any) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        name: item.name,
        base_price: item.base_price.toString(),
        additional_unit_price: item.additional_unit_price.toString(),
        description: item.description || '',
        is_active: item.is_active ?? true,
      });
    } else {
      setEditingItem(null);
      setFormData({
        name: '',
        base_price: '',
        additional_unit_price: '',
        description: '',
        is_active: true,
      });
    }
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await apiRequest('/menu-items', {
        method: 'POST',
        body: JSON.stringify({
          ...(editingItem ? { menu_item_id: editingItem.menu_item_id } : {}),
          name: formData.name,
          base_price: parseFloat(formData.base_price),
          additional_unit_price: parseFloat(formData.additional_unit_price),
          description: formData.description,
          is_active: formData.is_active,
        }),
      });

      setModalOpen(false);
      setEditingItem(null);
      await loadMenuItems();
      toast.success(editingItem ? 'メニューを更新しました' : '新しいメニューを追加しました');
    } catch (err: any) {
      console.error('Save menu item error:', err);
      toast.error('保存に失敗しました');
    }
  };

  const handleDelete = async (menuItemId: string) => {
    if (!confirm('このメニューを削除してもよろしいですか？')) return;

    try {
      await apiRequest(`/menu-items/${menuItemId}`, { method: 'DELETE' });
      await loadMenuItems();
      toast.success('メニューを削除しました');
    } catch (err: any) {
      console.error('Delete menu item error:', err);
      toast.error('削除に失敗しました');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-slate-900">メニュー設定</h1>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-4 py-2 rounded-xl hover:from-blue-600 hover:to-indigo-700 transition"
        >
          <Plus className="w-5 h-5" />
          <span>メニュー追加</span>
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 text-left text-slate-700">メニュー名</th>
              <th className="px-6 py-4 text-left text-slate-700">基本料金</th>
              <th className="px-6 py-4 text-left text-slate-700">追加単価</th>
              <th className="px-6 py-4 text-left text-slate-700">説明</th>
              <th className="px-6 py-4 text-left text-slate-700">状態</th>
              <th className="px-6 py-4 text-right text-slate-700">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {menuItems.map((item) => (
              <tr key={item.menu_item_id} className="hover:bg-slate-50">
                <td className="px-6 py-4 text-slate-900">{item.name}</td>
                <td className="px-6 py-4 text-slate-900">¥{item.base_price.toLocaleString()}</td>
                <td className="px-6 py-4 text-slate-900">¥{item.additional_unit_price.toLocaleString()}</td>
                <td className="px-6 py-4 text-slate-600 text-sm">{item.description || '-'}</td>
                <td className="px-6 py-4">
                  <span
                    className={`px-2 py-1 rounded-lg text-xs ${
                      item.is_active
                        ? 'bg-green-100 text-green-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {item.is_active ? '有効' : '無効'}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleOpenModal(item)}
                      className="p-2 hover:bg-blue-50 rounded-lg transition text-blue-600"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(item.menu_item_id)}
                      className="p-2 hover:bg-red-50 rounded-lg transition text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setModalOpen(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-xl w-full max-w-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-slate-900">{editingItem ? 'メニュー編集' : 'メニュー追加'}</h2>
              <button onClick={() => setModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-lg transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} className="p-6 space-y-6">
              <div>
                <label className="block text-slate-700 mb-2">
                  メニュー名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="例: お好きな部位一本+写真"
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-700 mb-2">
                    基本料金（円） <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={formData.base_price}
                    onChange={(e) => setFormData({ ...formData, base_price: e.target.value })}
                    placeholder="15000"
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-2">
                    追加単価（円） <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={formData.additional_unit_price}
                    onChange={(e) => setFormData({ ...formData, additional_unit_price: e.target.value })}
                    placeholder="5000"
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 mb-2">説明</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="例: 部位の追加は一本当たり追加単価がかかります"
                  rows={3}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4 text-blue-600 bg-slate-100 border-slate-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="is_active" className="text-slate-700">有効にする</label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-6 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl hover:from-blue-600 hover:to-indigo-700 transition"
                >
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
