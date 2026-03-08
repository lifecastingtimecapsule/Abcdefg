import { useState } from 'react';
import { publicAnonKey, functionsBaseUrl } from '../utils/supabase/info';
import { createClient } from '../utils/supabase/client';
import { prefetchCalendarData } from '../utils/api';
import { LogIn } from 'lucide-react';

interface LoginPageProps {
  onLogin: (user?: { user_id: string; name: string; login_id: string; role: string }) => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ウォームアップは App.tsx のモジュールレベルで1回だけ実行済み。
  // 重複呼び出しは不要なためここでは行わない。

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const t0 = Date.now();
    const trimmedLoginId = loginId.trim();

    try {
      const response = await fetch(`${functionsBaseUrl}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ login_id: trimmedLoginId, password }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || 'ログインに失敗しました');
        return;
      }

      if (data.access_token && data.user) {
        localStorage.setItem('access_token', data.access_token);

        // ── プリフェッチ開始 ──────────────────────────────────────
        // トークン取得直後にカレンダーデータ取得を開始。
        // CalendarPage のマウント・useEffect の発火を待たず、
        // React レンダリングと並走させることで直列遅延をなくす。
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        prefetchCalendarData(data.access_token, currentMonth);
        // ─────────────────────────────────────────────────────────

        // Supabase Auth セッションとして保存（自動トークン更新が有効になる）
        if (data.refresh_token) {
          try {
            await createClient().auth.setSession({
              access_token: data.access_token,
              refresh_token: data.refresh_token,
            });
          } catch (sessionErr) {
            console.log('[Login] setSession failed, using localStorage token:', sessionErr);
          }
        }

        onLogin(data.user as { user_id: string; name: string; login_id: string; role: string });
        console.log(`[LoginPerf] login totalMs=${Date.now() - t0} hasRefreshToken=${!!data.refresh_token}`);
      } else {
        setError('ログインに失敗しました');
      }
    } catch (err: unknown) {
      console.error('[Login] Network error:', err);
      setError('ネットワークエラーが発生しました');
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
      </div>
    </div>
  );
}
