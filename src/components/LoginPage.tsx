import { useState } from 'react';
import { createClient } from '../utils/supabase/client';
import { publicAnonKey, functionsBaseUrl } from '../utils/supabase/info';
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

    const trimmedLoginId = loginId.trim();
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/2e45f4c9-d02b-4cda-a0a9-5ed9b86dc921',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'LoginPage.tsx:handleLogin',message:'login_attempt',data:{login_id:trimmedLoginId,hasPassword:!!password},timestamp:Date.now(),hypothesisId:'H0'})}).catch(()=>{});
    // #endregion

    try {
      const response = await fetch(`${functionsBaseUrl}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({
          login_id: trimmedLoginId,
          password,
        }),
      });

      let data: { error?: string; access_token?: string; user?: unknown; debug_code?: string } = {};
      const contentType = response.headers.get('content-type');
      try {
        if (contentType?.includes('application/json')) {
          data = await response.json();
        } else {
          const text = await response.text();
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/2e45f4c9-d02b-4cda-a0a9-5ed9b86dc921',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'LoginPage.tsx:non_json',message:'login_response',data:{status:response.status,contentType,textLen:text?.length,login_id:trimmedLoginId},timestamp:Date.now(),hypothesisId:'H-E'})}).catch(()=>{});
          // #endregion
          if (text) setError('サーバーエラーです。しばらく経ってからお試しください。');
          else setError('ログインに失敗しました。');
          return;
        }
      } catch (_) {
        setError('サーバーからの応答を読み取れませんでした。しばらく経ってからお試しください。');
        return;
      }

      if (!response.ok) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/2e45f4c9-d02b-4cda-a0a9-5ed9b86dc921',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'LoginPage.tsx:login_fail',message:'login_response',data:{status:response.status,errorMessage:data.error,debug_code:data.debug_code,login_id:trimmedLoginId},timestamp:Date.now(),hypothesisId:'H-A'})}).catch(()=>{});
        // #endregion
        setError(data.error || 'ログインに失敗しました');
        return;
      }

      if (data.access_token && data.user) {
        localStorage.setItem('access_token', data.access_token);
        onLogin(data.user as { user_id: string; name: string; login_id: string; role: string });
      } else {
        setError(data.error || 'アクセストークンが返されませんでした');
      }
    } catch (err: unknown) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/2e45f4c9-d02b-4cda-a0a9-5ed9b86dc921',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'LoginPage.tsx:catch',message:'login_exception',data:{errorName:err instanceof Error?err.name:'',errorMessage:err instanceof Error?err.message:String(err),login_id:trimmedLoginId},timestamp:Date.now(),hypothesisId:'H-E'})}).catch(()=>{});
      // #endregion
      console.error('Login error:', err);
      const errorMessage = err instanceof Error ? err.message : 'ログインに失敗しました';
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
