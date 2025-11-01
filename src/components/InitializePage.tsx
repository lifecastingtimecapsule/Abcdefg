import { useState } from 'react';
import { Settings, Check, AlertCircle } from 'lucide-react';
import { projectId, publicAnonKey } from '../utils/supabase/info';

interface InitializePageProps {
  onComplete: () => void;
}

export function InitializePage({ onComplete }: InitializePageProps) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleInitialize = async () => {
    setError('');
    setLoading(true);

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-fe84bde0/initialize`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${publicAnonKey}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'システムの初期化に失敗しました');
      }

      setSuccess(true);
      setTimeout(() => {
        onComplete();
      }, 3000);
    } catch (err: any) {
      console.error('Initialize error:', err);
      setError(err.message || 'システムの初期化に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <div className="w-full max-w-2xl">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl mb-4">
              <Settings className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-slate-900 mb-2">システム初期化</h1>
            <p className="text-slate-600">アマレット管理システムへようこそ</p>
          </div>

          {!success ? (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
                <h3 className="text-slate-900 mb-4">初回セットアップ</h3>
                <p className="text-slate-700 mb-4">
                  システムを初めて使用する場合は、初期化が必要です。
                  <br />
                  初期化により、以下の管理者アカウントが作成されます：
                </p>
                <div className="bg-white rounded-lg p-4 border border-blue-200">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">ログインID:</span>
                      <span className="text-slate-900 font-mono">admin</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">パスワード:</span>
                      <span className="text-slate-900 font-mono">amaretto2024</span>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-slate-600 mt-4">
                  ⚠️ セキュリティのため、初回ログイン後に新しい管理者アカウントを作成し、
                  このデフォルトアカウントを無効化することをお勧めします。
                </p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-red-900 font-medium">エラー</p>
                    <p className="text-red-700 text-sm mt-1">{error}</p>
                  </div>
                </div>
              )}

              <button
                onClick={handleInitialize}
                disabled={loading}
                className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white py-3 rounded-xl hover:from-blue-600 hover:to-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? '初期化中...' : 'システムを初期化'}
              </button>

              <div className="text-center">
                <button
                  onClick={onComplete}
                  className="text-slate-600 hover:text-slate-900 text-sm underline"
                >
                  既に初期化済みの場合はログインへ
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-4">
                <Check className="w-10 h-10 text-green-600" />
              </div>
              <h2 className="text-slate-900 mb-2">初期化完了！</h2>
              <p className="text-slate-600 mb-6">
                管理者アカウントが作成されました。
                <br />
                ログインページに移動します...
              </p>
              <div className="animate-spin inline-block w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full"></div>
            </div>
          )}
        </div>

        <div className="text-center mt-6">
          <p className="text-slate-600 text-sm">
            詳細な手順は <span className="font-mono bg-white px-2 py-1 rounded">SETUP.md</span> を参照してください
          </p>
        </div>
      </div>
    </div>
  );
}
