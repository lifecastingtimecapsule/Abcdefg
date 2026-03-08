import { useState } from 'react';
import { publicAnonKey, functionsBaseUrl } from '../utils/supabase/info';
import { createClient } from '../utils/supabase/client';
import { startPrefetchChain } from '../utils/api';
import { LogIn } from 'lucide-react';
import { User, Location } from '../types';

// Supabase Auth のメール形式: loginId + このサフィックス
const AUTH_EMAIL_SUFFIX = '@app.local';

interface LoginPageProps {
  onLogin: (data?: { user: User; locations: Location[] }) => void;
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
      // ── Step 1: Supabase Auth で直接ログイン ─────────────────────
      // bcrypt + カスタム JWT から Supabase Auth（JWKS）への移行。
      // signInWithPassword は Edge Function を経由せず直接 Supabase に認証する。
      // これにより bcrypt の ~300ms オーバーヘッドが解消される。
      const supabase = createClient();
      const authEmail = `${trimmedLoginId}${AUTH_EMAIL_SUFFIX}`;
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password,
      });

      if (authError || !authData?.session?.access_token) {
        setError(authError?.message || 'ログインIDまたはパスワードが正しくありません');
        return;
      }

      const token = authData.session.access_token;

      // ── Step 2: login-notify を fire-and-forget で送信 ────────────
      // last_login_at 更新。失敗しても認証には影響しない。
      fetch(`${functionsBaseUrl}/login-notify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      }).catch(() => {});

      // ── Step 3: プリフェッチチェーン開始 & ユーザー情報取得 ───────
      // /me（user + locations）と /calendar-data を連鎖的に先行取得する。
      // startPrefetchChain は /me の Promise を返す → await して即座にユーザー情報取得。
      // その間に /calendar-data のフェッチも裏で進んでいる。
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const meData = await startPrefetchChain(token, currentMonth);

      if (!meData?.user) {
        setError('ユーザー情報の取得に失敗しました。もう一度お試しください。');
        return;
      }

      console.log(`[LoginPerf] login totalMs=${Date.now() - t0}`);
      onLogin({ user: meData.user as unknown as User, locations: (meData.locations || []) as unknown as Location[] });

    } catch (err: unknown) {
      console.error('[Login] Error:', err);
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
