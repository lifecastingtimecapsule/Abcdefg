import { useState } from 'react';
import { AlertTriangle, Lock } from 'lucide-react';
import { apiRequest } from '../utils/api';
import { User } from '../types';

interface MustChangePasswordModalProps {
  currentUser: User;
  onSuccess: (updatedUser: User) => void;
}

export function MustChangePasswordModal({ currentUser, onSuccess }: MustChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 6) {
      setError('新しいパスワードは6文字以上で設定してください');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('新しいパスワードと確認が一致しません');
      return;
    }
    setLoading(true);
    try {
      const data = await apiRequest<{ success: boolean; user: User }>('/me/change-password', {
        method: 'POST',
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      onSuccess(data.user);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'パスワードの変更に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* 警報バナー */}
        <div className="bg-amber-500 text-white px-6 py-4 flex items-center gap-3">
          <div className="flex-shrink-0 w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-lg font-bold">パスワードの変更が必要です</h2>
            <p className="text-sm text-amber-100 mt-0.5">
              初期パスワードでログインしています。セキュリティのため、必ずパスワードを変更してください。
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-slate-700 text-sm font-medium mb-1">現在のパスワード（初期パスワード）</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              placeholder="現在のパスワード"
              required
              autoComplete="current-password"
            />
          </div>
          <div>
            <label className="block text-slate-700 text-sm font-medium mb-1">新しいパスワード（6文字以上）</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              placeholder="新しいパスワード"
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="block text-slate-700 text-sm font-medium mb-1">新しいパスワード（確認）</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              placeholder="もう一度入力"
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-medium py-3 rounded-xl transition disabled:opacity-50"
          >
            <Lock className="w-5 h-5" />
            {loading ? '変更中...' : 'パスワードを変更する'}
          </button>
        </form>
      </div>
    </div>
  );
}
