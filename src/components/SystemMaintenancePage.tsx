import { useState } from 'react';
import { apiRequest } from '../utils/api';
import { toast } from 'sonner@2.0.3';
import { ShieldCheck, Database, KeyRound } from 'lucide-react';

export function SystemMaintenancePage() {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [issuePasswordLoading, setIssuePasswordLoading] = useState(false);
  const [issuePasswordResult, setIssuePasswordResult] = useState<{ updated: number; initial_password: string } | null>(null);

  const issueInitialPasswords = async () => {
    if (!confirm('パスワードが未設定の全ユーザーに初期パスワードを発行します。ログイン後、各ユーザーは必ずパスワード変更画面が表示されます。続行しますか？')) return;
    try {
      setIssuePasswordLoading(true);
      setIssuePasswordResult(null);
      const data = await apiRequest<{ updated: number; total: number; initial_password: string; message: string }>(
        '/admin/issue-initial-passwords',
        { method: 'POST', body: JSON.stringify({}) }
      );
      setIssuePasswordResult({ updated: data.updated, initial_password: data.initial_password });
      toast.success(data.message);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '初期パスワードの発行に失敗しました');
    } finally {
      setIssuePasswordLoading(false);
    }
  };

  const runIntegrityCheck = async () => {
    try {
      setLoading(true);
      const data = await apiRequest('/integrity-check', { method: 'POST' });
      setReport(data.report);
      if (data.report.issues.length === 0) {
        toast.success('データ整合性に問題はありません');
      } else {
        toast.warning(`${data.report.issues.length}件の問題が見つかりました`);
      }
    } catch (error) {
      console.error('Check failed:', error);
      toast.error('チェックに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
      <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
        <Database className="w-6 h-6 text-slate-600" />
        システムメンテナンス
      </h2>

      <div className="space-y-6">
        <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-blue-100 rounded-lg text-blue-600">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-slate-800 mb-1">データ整合性チェック</h3>
              <p className="text-sm text-slate-600 mb-4">
                データベース内の予約データ、制作物データ、顧客データの整合性をチェックします。
                不整合が見つかった場合はレポートを表示します。
              </p>
              <button
                onClick={runIntegrityCheck}
                disabled={loading}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
              >
                {loading ? 'チェック中...' : 'チェックを実行'}
              </button>
            </div>
          </div>

          {report && (
            <div className="mt-4 bg-white border border-slate-200 rounded-lg p-4">
              <h4 className="font-bold text-sm mb-2">実行結果:</h4>
              {report.issues.length === 0 ? (
                <div className="text-green-600 text-sm">問題は見つかりませんでした</div>
              ) : (
                <ul className="list-disc list-inside text-sm text-red-600 space-y-1">
                  {report.issues.map((issue: string, i: number) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="border border-amber-200 rounded-xl p-4 bg-amber-50">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-amber-100 rounded-lg text-amber-700">
              <KeyRound className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-slate-800 mb-1">初期パスワード一括発行</h3>
              <p className="text-sm text-slate-600 mb-4">
                パスワードが未設定のユーザー全員に、同じ初期パスワードを設定します。発行後、各ユーザーはそのパスワードでログインでき、初回ログイン時に必ずパスワード変更が求められます。
              </p>
              <button
                onClick={issueInitialPasswords}
                disabled={issuePasswordLoading}
                className="bg-amber-500 text-white px-4 py-2 rounded-lg hover:bg-amber-600 transition disabled:opacity-50"
              >
                {issuePasswordLoading ? '発行中...' : '初期パスワードを発行する'}
              </button>
              {issuePasswordResult && (
                <div className="mt-4 bg-white border border-amber-200 rounded-lg p-4">
                  <p className="text-sm text-slate-700 mb-2">
                    <strong>{issuePasswordResult.updated}</strong> 件のユーザーに初期パスワードを設定しました。
                  </p>
                  <p className="text-sm text-slate-600">
                    初期パスワード: <code className="bg-slate-100 px-2 py-1 rounded font-mono">{issuePasswordResult.initial_password}</code>
                    （スタッフに伝え、ログイン後すぐにパスワードを変更してもらってください）
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
