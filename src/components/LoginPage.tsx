import { useState } from 'react';
import { post } from '../utils/api/client';
import { API_ENDPOINTS } from '../utils/api/endpoints';
import { LogIn } from 'lucide-react';

interface LoginPageProps {
  onLogin: () => void;
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
      const data = await post<{ access_token: string }>(
        API_ENDPOINTS.auth.login,
        { login_id: loginId, password },
        { skipAuth: true }
      );
      
      if (data.access_token) {
        localStorage.setItem('access_token', data.access_token);
        onLogin();
      } else {
        throw new Error('アクセストークンが返されませんでした');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      // UNAUTHORIZEDエラーの場合は、より詳細なメッセージを表示
      let errorMessage = 'ログインに失敗しました';
      if (err.message === 'UNAUTHORIZED') {
        errorMessage = 'ログインIDまたはパスワード���正しくありません';
      } else if (err.message) {
        errorMessage = err.message;
      }
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

        <div className="mt-6 space-y-2">
          <p className="text-center text-slate-600 text-sm">
            社内用���ステム - 関係者以外の利用は禁止されています
          </p>
          <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-xl text-sm">
            <p className="mb-1">
              <strong>デフォルトアカウント:</strong>
            </p>
            <p>ログインID: <code className="bg-blue-100 px-2 py-1 rounded">admin</code></p>
            <p>パスワード: <code className="bg-blue-100 px-2 py-1 rounded">Takara007</code></p>
          </div>
        </div>
      </div>
    </div>
  );
}
