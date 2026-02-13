import { useEffect, useState } from 'react';
import { apiRequest } from '../utils/api';
import { toast } from 'sonner@2.0.3';
import { Plus, Edit2, Trash2, X, Tag, Percent, MapPin } from 'lucide-react';

export function MenuSettingsPage() {
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [selectedMenuForLocation, setSelectedMenuForLocation] = useState<any>(null);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: '',
    base_price: '',
    additional_unit_price: '',
    description: '',
    duration_minutes: '60',
    is_active: true,
    discount_type: 'none' as 'none' | 'percentage' | 'fixed',
    discount_value: '',
    discount_end_date: '',
    apply_discount_to_additional: false,
  });
  const [menuLocationSettings, setMenuLocationSettings] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [menuRes, locRes] = await Promise.all([
          apiRequest('/menu-items'),
          apiRequest('/locations'),
        ]);
        setMenuItems(menuRes.menu_items || []);
        setLocations(locRes.locations || []);
      } catch (err: any) {
        console.error('Load error:', err);
        toast.error('メニュー・店舗の読み込みに失敗しました');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const loadMenuItems = async () => {
    try {
      const data = await apiRequest('/menu-items');
      setMenuItems(data.menu_items || []);
    } catch (err: any) {
      console.error('Load menu items error:', err);
      toast.error('メニュー一覧の読み込みに失敗しました');
    }
  };

  const loadLocations = async () => {
    try {
      const data = await apiRequest('/locations');
      setLocations(data.locations || []);
    } catch (err: any) {
      console.error('Load locations error:', err);
    }
  };

  const handleOpenLocationModal = (menu: any) => {
    setSelectedMenuForLocation(menu);
    setLocationModalOpen(true);
  };

  const handleOpenModal = async (item?: any) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        name: item.name,
        base_price: item.base_price.toString(),
        additional_unit_price: item.additional_unit_price.toString(),
        description: item.description || '',
        duration_minutes: item.duration_minutes ? item.duration_minutes.toString() : '60',
        is_active: item.is_active ?? true,
        discount_type: item.discount_type || 'none',
        discount_value: item.discount_value ? item.discount_value.toString() : '',
        discount_end_date: item.discount_end_date || '',
        apply_discount_to_additional: item.apply_discount_to_additional ?? false,
      });
      
      // 編集時は店舗設定を読み込む
      await loadMenuLocationSettings(item.menu_item_id);
    } else {
      setEditingItem(null);
      setFormData({
        name: '',
        base_price: '',
        additional_unit_price: '',
        description: '',
        duration_minutes: '60',
        is_active: true,
        discount_type: 'none',
        discount_value: '',
        discount_end_date: '',
        apply_discount_to_additional: false,
      });
      
      // 新規作成時は全店舗を無効化
      const initialSettings: Record<string, boolean> = {};
      locations.forEach(loc => {
        initialSettings[loc.location_id] = false;
      });
      setMenuLocationSettings(initialSettings);
    }
    setModalOpen(true);
  };
  
  const loadMenuLocationSettings = async (menuItemId: string) => {
    try {
      const data = await apiRequest<{ location_settings: Record<string, boolean> }>(
        `/menu-items/${menuItemId}/location-settings`
      );
      setMenuLocationSettings(data.location_settings || {});
    } catch (err) {
      console.error('Load menu location settings error:', err);
      setMenuLocationSettings({});
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const menuData = {
        ...(editingItem ? { menu_item_id: editingItem.menu_item_id } : {}),
        name: formData.name,
        base_price: parseFloat(formData.base_price),
        additional_unit_price: parseFloat(formData.additional_unit_price),
        description: formData.description,
        duration_minutes: parseInt(formData.duration_minutes),
        is_active: formData.is_active,
        discount_type: formData.discount_type,
        discount_value: formData.discount_type !== 'none' && formData.discount_value ? parseFloat(formData.discount_value) : null,
        discount_end_date: formData.discount_type !== 'none' && formData.discount_end_date ? formData.discount_end_date : null,
        apply_discount_to_additional: formData.discount_type !== 'none' ? formData.apply_discount_to_additional : false,
      };
      console.log('[管理画面] メニュー保存:', menuData);
      
      const result = await apiRequest('/menu-items', {
        method: 'POST',
        body: JSON.stringify(menuData),
      });
      
      // 店舗設定を保存
      const menuItemId = editingItem ? editingItem.menu_item_id : result.menu_item.menu_item_id;
      console.log('[管理画面] 店舗設定保存開始:', menuLocationSettings);
      
      for (const locationId of Object.keys(menuLocationSettings)) {
        try {
          await apiRequest(`/locations/${locationId}/menus/${menuItemId}/toggle`, {
            method: 'POST',
            body: JSON.stringify({ enabled: menuLocationSettings[locationId] }),
          });
        } catch (locErr) {
          console.error(`Failed to save location setting for ${locationId}:`, locErr);
        }
      }

      setModalOpen(false);
      setEditingItem(null);
      await loadMenuItems();
      toast.success(editingItem ? 'メニューと店舗設定を更新しました' : '新しいメニューと店舗設定を追加しました');
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
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-left text-slate-700">メニュー名</th>
                <th className="px-6 py-4 text-left text-slate-700">基本料金</th>
                <th className="px-6 py-4 text-left text-slate-700">追加単価</th>
                <th className="px-6 py-4 text-left text-slate-700">所要時間</th>
                <th className="px-6 py-4 text-left text-slate-700">割引</th>
                <th className="px-6 py-4 text-left text-slate-700">状態</th>
                <th className="px-6 py-4 text-left text-slate-700">店舗設定</th>
                <th className="px-6 py-4 text-right text-slate-700">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {menuItems.map((item) => {
                const hasActiveDiscount = item.discount_type && item.discount_type !== 'none' && 
                  (!item.discount_end_date || new Date(item.discount_end_date) >= new Date());
                
                const calculateDiscountedPrice = (price: number) => {
                  if (!hasActiveDiscount) return price;
                  if (item.discount_type === 'percentage') {
                    return Math.floor(price * (1 - item.discount_value / 100));
                  } else if (item.discount_type === 'fixed') {
                    return Math.max(0, price - item.discount_value);
                  }
                  return price;
                };

                return (
                  <tr key={item.menu_item_id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <span className="text-slate-900">{item.name}</span>
                        {item.description && (
                          <span className="text-slate-600 text-sm whitespace-pre-wrap">{item.description}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {hasActiveDiscount ? (
                        <div className="flex flex-col gap-1">
                          <span className="text-slate-400 line-through text-sm">
                            ¥{item.base_price.toLocaleString()}
                            <span className="text-xs ml-0.5">+TAX</span>
                          </span>
                          <span className="text-red-600">
                            ¥{calculateDiscountedPrice(item.base_price).toLocaleString()}
                            <span className="text-sm ml-0.5">+TAX</span>
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-900">
                          ¥{item.base_price.toLocaleString()}
                          <span className="text-sm ml-0.5 text-slate-600">+TAX</span>
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {hasActiveDiscount && item.apply_discount_to_additional ? (
                        <div className="flex flex-col gap-1">
                          <span className="text-slate-400 line-through text-sm">
                            ¥{item.additional_unit_price.toLocaleString()}
                            <span className="text-xs ml-0.5">+TAX</span>
                          </span>
                          <span className="text-red-600">
                            ¥{calculateDiscountedPrice(item.additional_unit_price).toLocaleString()}
                            <span className="text-sm ml-0.5">+TAX</span>
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-900">
                          ¥{item.additional_unit_price.toLocaleString()}
                          <span className="text-sm ml-0.5 text-slate-600">+TAX</span>
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-slate-900">
                        {item.duration_minutes || 60}分
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {hasActiveDiscount ? (
                        <div className="flex flex-col gap-1">
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-lg text-xs w-fit">
                            <Tag className="w-3 h-3" />
                            {item.discount_type === 'percentage' 
                              ? `${item.discount_value}% OFF`
                              : `¥${item.discount_value.toLocaleString()} OFF`
                            }
                          </span>
                          {item.apply_discount_to_additional && (
                            <span className="text-blue-600 text-xs">
                              追加の型取にも適用
                            </span>
                          )}
                          {item.discount_end_date && (
                            <span className="text-slate-500 text-xs">
                              {new Date(item.discount_end_date).toLocaleDateString('ja-JP')}まで
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
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
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleOpenLocationModal(item)}
                        className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition text-sm"
                      >
                        店舗管理
                      </button>
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
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setModalOpen(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-slate-200 sticky top-0 bg-white">
              <h2 className="text-slate-900">{editingItem ? 'メニュー編集' : 'メニュー追加'}</h2>
              <button onClick={() => setModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-lg transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} onKeyDown={(e) => { 
              // textareaでは改行を許可し、それ以外の要素ではEnterキーによるフォーム送信を防ぐ
              if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
                e.preventDefault();
              }
            }} className="p-6 space-y-6">
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

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

                <div>
                  <label className="block text-slate-700 mb-2">
                    所要時間（分） <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="15"
                    step="15"
                    value={formData.duration_minutes}
                    onChange={(e) => setFormData({ ...formData, duration_minutes: e.target.value })}
                    placeholder="60"
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 mb-2">
                  説明
                  <span className="text-slate-500 text-sm ml-2">（改行可能）</span>
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="例: 部位の追加は一本当たり追加単価がかかります&#10;※兄弟割引対象メニューです&#10;お気軽にお問い合わせください"
                  rows={5}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                  style={{ minHeight: '120px' }}
                />
              </div>

              {/* 割引設定 */}
              <div className="border-t border-slate-200 pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <Percent className="w-5 h-5 text-red-600" />
                  <h3 className="text-slate-900">割引設定</h3>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-slate-700 mb-2">割引タイプ</label>
                    <select
                      value={formData.discount_type}
                      onChange={(e) => setFormData({ ...formData, discount_type: e.target.value as any })}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="none">割引なし</option>
                      <option value="percentage">パーセント割引（%）</option>
                      <option value="fixed">固定額割引（円）</option>
                    </select>
                  </div>

                  {formData.discount_type !== 'none' && (
                    <>
                      <div>
                        <label className="block text-slate-700 mb-2">
                          割引額 {formData.discount_type === 'percentage' ? '（%）' : '（円）'}
                        </label>
                        <input
                          type="number"
                          min="0"
                          max={formData.discount_type === 'percentage' ? '100' : undefined}
                          step={formData.discount_type === 'percentage' ? '1' : '100'}
                          value={formData.discount_value}
                          onChange={(e) => setFormData({ ...formData, discount_value: e.target.value })}
                          placeholder={formData.discount_type === 'percentage' ? '10' : '1000'}
                          className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-700 mb-2">割引終了日（オプション）</label>
                        <input
                          type="date"
                          value={formData.discount_end_date}
                          onChange={(e) => setFormData({ ...formData, discount_end_date: e.target.value })}
                          className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <p className="text-slate-500 text-sm mt-1">
                          未設定の場合は無期限で割引が適用されます
                        </p>
                      </div>

                      <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-xl border border-blue-200">
                        <input
                          type="checkbox"
                          id="apply_discount_to_additional"
                          checked={formData.apply_discount_to_additional}
                          onChange={(e) => setFormData({ ...formData, apply_discount_to_additional: e.target.checked })}
                          className="w-4 h-4 text-blue-600 bg-white border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
                        />
                        <label htmlFor="apply_discount_to_additional" className="text-slate-700 cursor-pointer">
                          追加の型取にも割引を適用する
                        </label>
                      </div>
                    </>
                  )}
                </div>
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

              {/* 店舗設定 */}
              {locations.length > 0 && (
                <div className="border-t border-slate-200 pt-6">
                  <div className="flex items-center gap-2 mb-4">
                    <MapPin className="w-5 h-5 text-indigo-600" />
                    <h3 className="text-slate-900">店舗ごとの提供設定</h3>
                  </div>
                  <p className="text-slate-600 text-sm mb-4">
                    このメニューを提供する店舗にチェックを入れてください
                  </p>
                  <div className="space-y-2">
                    {locations.map((location) => (
                      <div
                        key={location.location_id}
                        className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition"
                      >
                        <input
                          type="checkbox"
                          id={`location_${location.location_id}`}
                          checked={menuLocationSettings[location.location_id] ?? false}
                          onChange={(e) => setMenuLocationSettings({
                            ...menuLocationSettings,
                            [location.location_id]: e.target.checked,
                          })}
                          className="w-4 h-4 text-indigo-600 bg-white border-slate-300 rounded focus:ring-2 focus:ring-indigo-500"
                        />
                        <label
                          htmlFor={`location_${location.location_id}`}
                          className="text-slate-700 cursor-pointer flex-1"
                        >
                          {location.location_name}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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

      {/* 店舗管理モーダル */}
      {locationModalOpen && selectedMenuForLocation && (
        <LocationMenuModal
          menu={selectedMenuForLocation}
          locations={locations}
          onClose={() => {
            setLocationModalOpen(false);
            setSelectedMenuForLocation(null);
          }}
        />
      )}
    </div>
  );
}

// 店舗メニュー管理モーダルコンポーネント
function LocationMenuModal({ menu, locations, onClose }: { menu: any; locations: any[]; onClose: () => void }) {
  const [locationSettings, setLocationSettings] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLocationSettings();
  }, [menu?.menu_item_id]);

  const loadLocationSettings = async () => {
    if (!menu?.menu_item_id) {
      setLocationSettings({});
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await apiRequest<{ location_settings: Record<string, boolean> }>(
        `/menu-items/${menu.menu_item_id}/location-settings`
      );
      setLocationSettings(data.location_settings || {});
    } catch (err) {
      console.error('[店舗メニュー設定] Load location settings error:', err);
      toast.error('店舗設定の読み込みに失敗しました');
      setLocationSettings({});
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (locationId: string) => {
    try {
      const newValue = !locationSettings[locationId];
      
      await apiRequest(`/locations/${locationId}/menus/${menu.menu_item_id}/toggle`, {
        method: 'POST',
        body: JSON.stringify({ enabled: newValue }),
      });
      
      setLocationSettings(prev => ({
        ...prev,
        [locationId]: newValue,
      }));
      
      toast.success(`${locations.find(l => l.location_id === locationId)?.location_name}での設定を更新しました`);
    } catch (err) {
      console.error('Toggle location menu error:', err);
      toast.error('更新に失敗しました');
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-slate-900">店舗ごとのメニュー設定</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="text-sm text-blue-800">
              <strong>{menu.name}</strong>
            </div>
            <div className="text-xs text-blue-600 mt-1">
              各店舗でこのメニューを利用可能にするかを設定できます
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
            </div>
          ) : (
            <div className="space-y-3">
              {locations.map((location) => (
                <div
                  key={location.location_id}
                  className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition"
                >
                  <div className="flex items-center gap-3">
                    <MapPin className="w-5 h-5 text-slate-400" />
                    <div>
                      <div className="text-slate-900">{location.location_name}</div>
                      {location.address_text && (
                        <div className="text-xs text-slate-500">{location.address_text}</div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleToggle(location.location_id)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                      locationSettings[location.location_id]
                        ? 'bg-green-500'
                        : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                        locationSettings[location.location_id]
                          ? 'translate-x-6'
                          : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-200">
          <button
            onClick={onClose}
            className="w-full px-6 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
