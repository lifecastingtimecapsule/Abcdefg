import { useState } from 'react';
import { apiRequest } from '../utils/api';
import { toast } from 'sonner@2.0.3';
import { ShieldCheck, Database, KeyRound, Copy, Check } from 'lucide-react';

export function SystemMaintenancePage() {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [issuePasswordLoading, setIssuePasswordLoading] = useState(false);
  const [issuePasswordResult, setIssuePasswordResult] = useState<{ updated: number; initial_password: string } | null>(null);
  const [confirmIssue, setConfirmIssue] = useState(false);
  const [copied, setCopied] = useState(false);

  const issueInitialPasswords = async () => {
    try {
      setIssuePasswordLoading(true);
      setIssuePasswordResult(null);
      setConfirmIssue(false);
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

  const copyPassword = async () => {
    if (!issuePasswordResult?.initial_password) return;
    try {
      await navigator.clipboard.writeText(issuePasswordResult.initial_password);
      setCopied(true);
      toast.success('パスワードをコピーしました');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('コピーに失敗しました');
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
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Database className="w-5 h-5 text-slate-600" />
            データ整合性チェック
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            予約・制作物・顧客データの整合性を確認します
          </p>
        </div>
        <div className="p-6">
          <button
            onClick={runIntegrityCheck}
            disabled={loading}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition disabled:opacity-50 font-medium"
          >
            {loading ? 'チェック中...' : 'チェックを実行'}
          </button>
          {report && (
            <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <p className="text-sm font-medium text-slate-700 mb-2">実行結果</p>
              {report.issues.length === 0 ? (
                <p className="text-sm text-green-700">問題は見つかりませんでした</p>
              ) : (
                <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
                  {report.issues.map((issue: string, i: number) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-amber-600" />
            初期パスワード一括発行
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            パスワード未設定のユーザー全員に同じ初期パスワードを設定します。初回ログイン時に変更が求められます。
          </p>
        </div>
        <div className="p-6">
          {!confirmIssue ? (
            <button
              onClick={() => setConfirmIssue(true)}
              disabled={issuePasswordLoading}
              className="px-5 py-2.5 bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition disabled:opacity-50 font-medium"
            >
              初期パスワードを発行する
            </button>
          ) : (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-4">
              <p className="text-sm text-slate-800">
                パスワードが未設定の全ユーザーに、同じ初期パスワードを設定します。よろしいですか？
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => setConfirmIssue(false)}
                  className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50"
                >
                  キャンセル
                </button>
                <button
                  onClick={issueInitialPasswords}
                  disabled={issuePasswordLoading}
                  className="px-5 py-2.5 bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition disabled:opacity-50 font-medium"
                >
                  {issuePasswordLoading ? '発行中...' : '発行する'}
                </button>
              </div>
            </div>
          )}

          {issuePasswordResult && (
            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-xl space-y-3">
              <p className="text-sm text-slate-800">
                <strong>{issuePasswordResult.updated}</strong> 件のユーザーに初期パスワードを設定しました。
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-slate-600">初期パスワード:</span>
                <code className="bg-white px-3 py-1.5 rounded-lg font-mono text-sm border border-slate-200">
                  {issuePasswordResult.initial_password}
                </code>
                <button
                  type="button"
                  onClick={copyPassword}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition"
                >
                  {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'コピーしました' : 'コピー'}
                </button>
              </div>
              <p className="text-xs text-slate-500">
                スタッフに伝え、ログイン後すぐにパスワードを変更してもらってください。
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
