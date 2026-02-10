import { useState } from 'react';
import { apiRequest } from '../utils/api';
import { toast } from 'sonner@2.0.3';
import { ShieldCheck, Database } from 'lucide-react';

export function SystemMaintenancePage() {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any>(null);

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
      </div>
    </div>
  );
}
