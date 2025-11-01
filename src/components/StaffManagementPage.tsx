import { useEffect, useState } from 'react';
import { apiRequest } from '../utils/api';
import { Plus, Edit2, UserCheck, UserX } from 'lucide-react';

export function StaffManagementPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    login_id: '',
    password: '',
    role: 'staff',
    active_flag: true,
  });
  const [formLoading, setFormLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const result = await apiRequest('/users');
      setUsers(result.users);
    } catch (err: any) {
      console.error('Load users error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (user: any = null) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        name: user.name || '',
        email: user.email || '',
        login_id: user.login_id || '',
        password: '',
        role: user.role || 'staff',
        active_flag: user.active_flag ?? true,
      });
    } else {
      setEditingUser(null);
      setFormData({
        name: '',
        email: '',
        login_id: '',
        password: '',
        role: 'staff',
        active_flag: true,
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
      if (editingUser) {
        // Update existing user
        await apiRequest('/users/update', {
          method: 'POST',
          body: JSON.stringify({
            user_id: editingUser.user_id,
            name: formData.name,
            role: formData.role,
            active_flag: formData.active_flag,
          }),
        });
      } else {
        // Create new user
        if (!formData.password) {
          setError('新規ユーザーにはパスワードが必要です');
          setFormLoading(false);
          return;
        }
        if (!formData.login_id) {
          setError('ログインIDが必要です');
          setFormLoading(false);
          return;
        }
        await apiRequest('/signup', {
          method: 'POST',
          body: JSON.stringify({
            name: formData.name,
            email: formData.email,
            login_id: formData.login_id,
            password: formData.password,
            role: formData.role,
          }),
        });
      }

      setModalOpen(false);
      setEditingUser(null);
      await loadUsers();
    } catch (err: any) {
      console.error('Save user error:', err);
      setError(err.message);
    } finally {
      setFormLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).format(date);
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
        <h1 className="text-slate-900">スタッフ管理</h1>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-4 py-2 rounded-xl hover:from-blue-600 hover:to-indigo-700 transition"
        >
          <Plus className="w-5 h-5" />
          <span>新規スタッフ</span>
        </button>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-slate-700">名前</th>
                <th className="px-4 py-3 text-left text-slate-700">ログインID</th>
                <th className="px-4 py-3 text-left text-slate-700">メール</th>
                <th className="px-4 py-3 text-left text-slate-700">ロール</th>
                <th className="px-4 py-3 text-left text-slate-700">ステータス</th>
                <th className="px-4 py-3 text-left text-slate-700">最終ログイン</th>
                <th className="px-4 py-3 text-left text-slate-700">操作</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    ユーザーがいません
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.user_id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-900">{user.name}</td>
                    <td className="px-4 py-3 text-slate-700">{user.login_id || '-'}</td>
                    <td className="px-4 py-3 text-slate-700">{user.email || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-3 py-1 rounded-full text-xs ${
                        user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {user.role === 'admin' ? '管理者' : 'スタッフ'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {user.active_flag !== false ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs">
                          <UserCheck className="w-3 h-3" />
                          有効
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs">
                          <UserX className="w-3 h-3" />
                          停止
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{formatDate(user.last_login_at)}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleOpenModal(user)}
                        className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition"
                        title="編集"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md my-8">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-slate-900">{editingUser ? 'スタッフ編集' : '新規スタッフ'}</h2>
              <button
                onClick={() => setModalOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition"
              >
                <span className="text-xl">&times;</span>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-slate-700 mb-2">名前</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              {!editingUser && (
                <>
                  <div>
                    <label className="block text-slate-700 mb-2">ログインID</label>
                    <input
                      type="text"
                      value={formData.login_id}
                      onChange={(e) => setFormData({ ...formData, login_id: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="例: yamada_t"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 mb-2">メールアドレス</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="内部認証用"
                      required
                    />
                    <p className="text-xs text-slate-500 mt-1">※内部認証用です。ログインには使用しません</p>
                  </div>

                  <div>
                    <label className="block text-slate-700 mb-2">パスワード</label>
                    <input
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-slate-700 mb-2">ロール</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="staff">スタッフ</option>
                  <option value="admin">管理者</option>
                </select>
              </div>

              {editingUser && (
                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.active_flag}
                      onChange={(e) => setFormData({ ...formData, active_flag: e.target.checked })}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-slate-700">アカウント有効</span>
                  </label>
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl hover:from-blue-600 hover:to-indigo-700 transition disabled:opacity-50"
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
