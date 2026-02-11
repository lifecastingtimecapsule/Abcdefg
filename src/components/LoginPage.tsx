import { useState } from 'react';
import { createClient } from '../utils/supabase/client';
import { projectId, publicAnonKey } from '../utils/supabase/info';
import { LogIn } from 'lucide-react';

interface LoginPageProps {
  onLogin: (user?: { user_id: string; name: string; login_id: string; role: string }) => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fe84bde0/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({
          login_id: loginId,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'ログインに失敗しました');
      }
      
      if (data.access_token) {
        localStorage.setItem('access_token', data.access_token);
        onLogin(data.user);
      } else {
        throw new Error('アクセストークンが返されませんでした');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      const errorMessage = err.message || 'ログインに失敗しました';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl mb-4">
              <LogIn className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-slate-900 mb-2">アマレット管理システム</h1>
            <p className="text-slate-600">ライフキャスティング専門店</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-slate-700 mb-2">ログインID</label>
              <input
                type="text"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder="ログインID"
                required
              />
            </div>

            <div>
              <label className="block text-slate-700 mb-2">パスワード</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white py-3 rounded-xl hover:from-blue-600 hover:to-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed text-center"
            >
              {loading ? 'ログイン中...' : 'ログイン'}
            </button>
          </form>
        </div>

        <p className="text-center text-slate-600 mt-6 text-sm">
          スタッフ専用ログイン - 関係者以外の利用は禁止されています
        </p>
        <p className="text-center text-slate-500 mt-2 text-xs">
          お客様の予約は <a href="/reservation" className="text-blue-500 hover:underline">こちら</a> から
        </p>
      </div>
    </div>
  );
}
