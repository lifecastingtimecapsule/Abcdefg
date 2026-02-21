import { useEffect, useState } from 'react';
import { apiRequest } from '../utils/api';
import { toast } from 'sonner@2.0.3';
import { Location, User } from '../types';

interface UserLocationAccess {
  user_id: string;
  location_id: string;
}

export function LocationPermissionsPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [access, setAccess] = useState<UserLocationAccess[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [usersData, locsData, accessData] = await Promise.all([
          apiRequest('/users') as Promise<any>,
          apiRequest('/locations') as Promise<any>,
          apiRequest('/admin/user-location-access') as Promise<any>,
        ]);
        const staffUsers: User[] = (usersData.users ?? []).filter((u: User) => u.role === 'staff');
        setUsers(staffUsers);
        setLocations(locsData.locations ?? []);
        setAccess(accessData.access ?? []);

        if (staffUsers.length > 0) {
          setSelectedUserId(staffUsers[0].user_id);
        }
      } catch (err: any) {
        console.error('LocationPermissionsPage load error:', err);
        toast.error('データの読み込みに失敗しました');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ユーザー選択が変わったらチェック状態を更新
  useEffect(() => {
    if (!selectedUserId) {
      setCheckedIds(new Set());
      return;
    }
    const ids = access
      .filter(a => a.user_id === selectedUserId)
      .map(a => a.location_id);
    setCheckedIds(new Set(ids));
  }, [selectedUserId, access]);

  const handleToggle = (locationId: string) => {
    setCheckedIds(prev => {
      const next = new Set(prev);
      if (next.has(locationId)) {
        next.delete(locationId);
      } else {
        next.add(locationId);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!selectedUserId) return;
    setSaving(true);
    try {
      await apiRequest('/admin/user-location-access', {
        method: 'POST',
        body: JSON.stringify({
          user_id: selectedUserId,
          location_ids: [...checkedIds],
        }),
      });
      // access をローカルでも更新
      setAccess(prev => {
        const filtered = prev.filter(a => a.user_id !== selectedUserId);
        const added = [...checkedIds].map(lid => ({ user_id: selectedUserId, location_id: lid }));
        return [...filtered, ...added];
      });
      toast.success('権限を保存しました');
    } catch (err: any) {
      console.error('Save location access error:', err);
      toast.error('保存に失敗しました: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  const selectedUser = users.find(u => u.user_id === selectedUserId);

  return (
    <div className="space-y-6 max-w-2xl">
      {users.length === 0 ? (
        <p className="text-slate-500">スタッフユーザーがいません。</p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-slate-700 whitespace-nowrap">
              ユーザーを選択
            </label>
            <select
              value={selectedUserId}
              onChange={e => setSelectedUserId(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-700 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              {users.map(u => (
                <option key={u.user_id} value={u.user_id}>
                  {u.name}（{u.login_id}）
                </option>
              ))}
            </select>
          </div>

          {selectedUser && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                <span className="font-medium">{selectedUser.name}</span> がアクセスできる店舗:
              </p>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                {locations.length === 0 ? (
                  <p className="p-4 text-slate-500 text-sm">店舗が登録されていません。</p>
                ) : (
                  <table className="w-full text-sm">
                    <tbody>
                      {locations.map((loc, i) => (
                        <tr
                          key={loc.location_id}
                          className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}
                        >
                          <td className="px-4 py-3 w-8">
                            <input
                              type="checkbox"
                              checked={checkedIds.has(loc.location_id)}
                              onChange={() => handleToggle(loc.location_id)}
                              className="w-4 h-4 accent-blue-600 cursor-pointer"
                            />
                          </td>
                          <td className="px-4 py-3 text-slate-800 font-medium">
                            {loc.location_name}
                          </td>
                          <td className="px-4 py-3 text-slate-400 text-xs">
                            {loc.address_text || ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-sm font-medium transition shadow-sm"
                >
                  {saving ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
