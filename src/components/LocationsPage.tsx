import { useEffect, useState } from 'react';
import { apiRequest } from '../utils/api';
import { toast } from 'sonner@2.0.3';
import { Plus, Edit2, MapPin } from 'lucide-react';

export function LocationsPage() {
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<any>(null);
  const [formData, setFormData] = useState({
    location_name: '',
    address_text: '',
    phone: '',
  });
  const [formLoading, setFormLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadLocations();
  }, []);

  const loadLocations = async () => {
    try {
      setLoading(true);
      const result = await apiRequest('/locations');
      setLocations(result.locations);
    } catch (err: any) {
      console.error('Load locations error:', err);
      toast.error('ロケーション一覧の読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (location: any = null) => {
    if (location) {
      setEditingLocation(location);
      setFormData({
        location_name: location.location_name || '',
        address_text: location.address_text || '',
        phone: location.phone || '',
      });
    } else {
      setEditingLocation(null);
      setFormData({
        location_name: '',
        address_text: '',
        phone: '',
      });
    }
    setModalOpen(true);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFormLoading(true);

    try {
      await apiRequest('/locations', {
        method: 'POST',
        body: JSON.stringify({
          ...(editingLocation ? { location_id: editingLocation.location_id, created_at: editingLocation.created_at } : {}),
          ...formData,
        }),
      });

      setModalOpen(false);
      setEditingLocation(null);
      await loadLocations();
      toast.success(editingLocation ? 'ロケーションを更新しました' : '新しいロケーションを追加しました');
    } catch (err: any) {
      console.error('Save location error:', err);
      setError(err.message);
      toast.error('ロケーションの保存に失敗しました');
    } finally {
      setFormLoading(false);
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
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-slate-900">拠点管理</h1>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-4 py-2 rounded-xl hover:from-blue-600 hover:to-indigo-700 transition"
        >
          <Plus className="w-5 h-5" />
          <span>新規拠点</span>
        </button>
      </div>

      {/* Locations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {locations.length === 0 ? (
          <div className="col-span-full bg-white rounded-2xl p-8 text-center text-slate-500">
            拠点がありません
          </div>
        ) : (
          locations.map((location) => (
            <div
              key={location.location_id}
              className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 hover:shadow-md transition"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3 flex-1">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-xl flex items-center justify-center">
                    <MapPin className="w-6 h-6 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-slate-900 break-words">{location.location_name}</h3>
                  </div>
                </div>
                <button
                  onClick={() => handleOpenModal(location)}
                  className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition shrink-0"
                  title="編集"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2 text-sm text-slate-700">
                <div className="flex items-start gap-2">
                  <span className="text-slate-500 shrink-0">住所:</span>
                  <span className="break-words">{location.address_text || '-'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">電話:</span>
                  <span>{location.phone || '-'}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto"
          onClick={() => setModalOpen(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-xl w-full max-w-md my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-slate-900">{editingLocation ? '拠点編集' : '新規拠点'}</h2>
              <button
                onClick={() => setModalOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition"
              >
                <span className="text-xl">&times;</span>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-slate-700 mb-2">拠点名</label>
                <input
                  type="text"
                  value={formData.location_name}
                  onChange={(e) => setFormData({ ...formData, location_name: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-2">住所</label>
                <input
                  type="text"
                  value={formData.address_text}
                  onChange={(e) => setFormData({ ...formData, address_text: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-2">電話番号</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition text-center"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl hover:from-blue-600 hover:to-indigo-700 transition disabled:opacity-50 text-center"
                >
                  {formLoading ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
