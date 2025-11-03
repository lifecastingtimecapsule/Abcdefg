import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form@7.55.0';
import { apiRequest } from '../utils/api';
import { toast } from 'sonner@2.0.3';
import { Plus, Edit2, UserCheck, UserX, AlertCircle } from 'lucide-react';
import { User } from '../types';

interface StaffFormData {
  name: string;
  email: string;
  login_id: string;
  password: string;
  role: 'admin' | 'staff';
  active_flag: boolean;
  update_login_id?: string;
  update_password?: string;
}

export function StaffManagementPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setError,
    formState: { errors },
  } = useForm<StaffFormData>({
    defaultValues: {
      name: '',
      email: '',
      login_id: '',
      password: '',
      role: 'staff',
      active_flag: true,
      update_login_id: '',
      update_password: '',
    },
  });

  const watchLoginId = watch('login_id');
  const watchUpdateLoginId = watch('update_login_id');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const result = await apiRequest<{ users: User[] }>('/users');
      setUsers(result.users);
    } catch (err: any) {
      // UNAUTHORIZEDエラーの場合は再認証モーダルが表示されるので、ここではエラー表示しない
      if (err?.message !== 'UNAUTHORIZED') {
        console.error('Load users error:', err);
        toast.error('スタッフ一覧の読み込みに失敗しました');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (user: User | null = null) => {
    if (user) {
      setEditingUser(user);
      reset({
        name: user.name || '',
        email: user.email || '',
        login_id: user.login_id || '',
        password: '',
        role: user.role || 'staff',
        active_flag: user.active_flag ?? true,
        update_login_id: '',
        update_password: '',
      });
    } else {
      setEditingUser(null);
      reset({
        name: '',
        email: '',
        login_id: '',
        password: '',
        role: 'staff',
        active_flag: true,
        update_login_id: '',
        update_password: '',
      });
    }
    setModalOpen(true);
  };

  const validateLoginIdUnique = (loginId: string, currentUserId?: string) => {
    const existingUser = users.find(
      (u) => u.login_id === loginId && u.user_id !== currentUserId
    );
    return !existingUser;
  };

  const onSubmit = async (data: StaffFormData) => {
    setFormLoading(true);

    try {
      if (editingUser) {
        // 更新時のバリデーション
        if (data.update_login_id) {
          // ログインIDを変更する場合、重複チェック
          if (!validateLoginIdUnique(data.update_login_id, editingUser.user_id)) {
            setError('update_login_id', {
              type: 'manual',
              message: 'このログインIDは既に使用されています',
            });
            setFormLoading(false);
            return;
          }
        }

        // Update existing user
        await apiRequest('/users/update', {
          method: 'POST',
          body: JSON.stringify({
            user_id: editingUser.user_id,
            name: data.name,
            role: data.role,
            active_flag: data.active_flag,
            update_login_id: data.update_login_id || undefined,
            update_password: data.update_password || undefined,
          }),
        });

        toast.success('スタッフ情報を更新しました');
      } else {
        // 新規作成時のバリデーション
        if (!data.password) {
          setError('password', {
            type: 'manual',
            message: '新規ユーザーにはパスワードが必要です',
          });
          setFormLoading(false);
          return;
        }

        if (!data.login_id) {
          setError('login_id', {
            type: 'manual',
            message: 'ログインIDが必要です',
          });
          setFormLoading(false);
          return;
        }

        // ログインID重複チェック
        if (!validateLoginIdUnique(data.login_id)) {
          setError('login_id', {
            type: 'manual',
            message: 'このログインIDは既に使用されています',
          });
          setFormLoading(false);
          return;
        }

        // メール形式の簡易チェック
        if (!data.email.includes('@')) {
          setError('email', {
            type: 'manual',
            message: '有効なメールアドレスを入力してください',
          });
          setFormLoading(false);
          return;
        }

        // パスワード強度チェック
        if (data.password.length < 6) {
          setError('password', {
            type: 'manual',
            message: 'パスワードは6文字以上で入力してください',
          });
          setFormLoading(false);
          return;
        }

        // Create new user
        await apiRequest('/signup', {
          method: 'POST',
          body: JSON.stringify({
            name: data.name,
            email: data.email,
            login_id: data.login_id,
            password: data.password,
            role: data.role,
          }),
        });

        toast.success('新しいスタッフを追加しました');
      }

      setModalOpen(false);
      setEditingUser(null);
      await loadUsers();
    } catch (err: any) {
      console.error('Save user error:', err);
      toast.error(err.message || 'スタッフ情報の保存に失敗しました');
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
      timeZone: 'Asia/Tokyo',
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
                    <td className="px-4 py-3 text-slate-700 font-mono text-sm">{user.login_id || '-'}</td>
                    <td className="px-4 py-3 text-slate-700 text-sm">{user.email || '-'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-xs ${
                          user.role === 'admin'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
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
                    <td className="px-4 py-3 text-slate-700 text-sm">{formatDate(user.last_login_at || '')}</td>
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
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto"
          onClick={() => setModalOpen(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-xl w-full max-w-md my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-slate-900">{editingUser ? 'スタッフ編集' : '新規スタッフ'}</h2>
              <button
                onClick={() => setModalOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition"
              >
                <span className="text-xl">&times;</span>
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
              <div>
                <label className="block text-slate-700 mb-2">
                  名前 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  {...register('name', { required: '名前を入力してください' })}
                  className={`w-full px-4 py-2 bg-slate-50 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.name ? 'border-red-300' : 'border-slate-200'
                  }`}
                />
                {errors.name && (
                  <p className="text-red-600 text-sm mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {errors.name.message}
                  </p>
                )}
              </div>

              {!editingUser && (
                <>
                  <div>
                    <label className="block text-slate-700 mb-2">
                      ログインID <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      {...register('login_id', { required: 'ログインIDを入力してください' })}
                      className={`w-full px-4 py-2 bg-slate-50 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono ${
                        errors.login_id ? 'border-red-300' : 'border-slate-200'
                      }`}
                      placeholder="例: yamada_t"
                    />
                    {errors.login_id && (
                      <p className="text-red-600 text-sm mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {errors.login_id.message}
                      </p>
                    )}
                    <p className="text-xs text-slate-500 mt-1">
                      ※半角英数字とアンダースコアのみ使用可能
                    </p>
                  </div>

                  <div>
                    <label className="block text-slate-700 mb-2">
                      メールアドレス <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      {...register('email', { required: 'メールアドレスを入力してください' })}
                      className={`w-full px-4 py-2 bg-slate-50 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        errors.email ? 'border-red-300' : 'border-slate-200'
                      }`}
                      placeholder="内部認証用"
                    />
                    {errors.email && (
                      <p className="text-red-600 text-sm mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {errors.email.message}
                      </p>
                    )}
                    <p className="text-xs text-slate-500 mt-1">※内部認証用です。ログインには使用しません</p>
                  </div>

                  <div>
                    <label className="block text-slate-700 mb-2">
                      パスワード <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="password"
                      {...register('password', { required: 'パスワードを入力してください' })}
                      className={`w-full px-4 py-2 bg-slate-50 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        errors.password ? 'border-red-300' : 'border-slate-200'
                      }`}
                      placeholder="6文字以上"
                    />
                    {errors.password && (
                      <p className="text-red-600 text-sm mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {errors.password.message}
                      </p>
                    )}
                  </div>
                </>
              )}

              <div>
                <label className="block text-slate-700 mb-2">ロール</label>
                <select
                  {...register('role')}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="staff">スタッフ</option>
                  <option value="admin">管理者</option>
                </select>
              </div>

              {editingUser && (
                <>
                  <div className="border-t border-slate-200 pt-4">
                    <p className="text-sm text-slate-600 mb-3">認証情報を変更する場合のみ入力してください</p>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-slate-700 mb-2">新しいログインID</label>
                        <input
                          type="text"
                          {...register('update_login_id')}
                          className={`w-full px-4 py-2 bg-slate-50 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono ${
                            errors.update_login_id ? 'border-red-300' : 'border-slate-200'
                          }`}
                          placeholder="変更する場合のみ入力"
                        />
                        {errors.update_login_id && (
                          <p className="text-red-600 text-sm mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            {errors.update_login_id.message}
                          </p>
                        )}
                        <p className="text-xs text-slate-500 mt-1">
                          現在: {editingUser.login_id || '未設定'}
                        </p>
                      </div>

                      <div>
                        <label className="block text-slate-700 mb-2">新しいパスワード</label>
                        <input
                          type="password"
                          {...register('update_password')}
                          className={`w-full px-4 py-2 bg-slate-50 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            errors.update_password ? 'border-red-300' : 'border-slate-200'
                          }`}
                          placeholder="変更する場合のみ入力（6文字以上）"
                        />
                        {errors.update_password && (
                          <p className="text-red-600 text-sm mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            {errors.update_password.message}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        {...register('active_flag')}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-slate-700">アカウント有効</span>
                    </label>
                  </div>
                </>
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
