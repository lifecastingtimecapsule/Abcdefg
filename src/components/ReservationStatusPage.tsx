import { useState, useEffect } from 'react';
import { Search, Calendar, Clock, MapPin, User, Mail, Phone, FileText, AlertCircle, CheckCircle, XCircle, Loader } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { toast } from 'sonner@2.0.3';
import { projectId } from '../utils/supabase/info';

export function ReservationStatusPage() {
  const [reservationNumber, setReservationNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [reservationData, setReservationData] = useState<any>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const number = urlParams.get('number');
    if (number) {
      setReservationNumber(number);
      searchReservation(number);
    }
  }, []);

  const searchReservation = async (number?: string) => {
    const searchNumber = number || reservationNumber;
    if (!searchNumber || searchNumber.trim() === '') {
      toast.error('予約番号を入力してください');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-fe84bde0/public/reservation-status?reservation_number=${encodeURIComponent(searchNumber)}`
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '予約が見つかりませんでした');
      }

      const data = await response.json();
      setReservationData(data.reservation);
    } catch (err: any) {
      console.error('予約検索エラー:', err);
      toast.error(err.message || '予約の検索に失敗しました');
      setReservationData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelReservation = async () => {
    if (!reservationData) return;

    try {
      setCancelling(true);
      const response = await fetch(
        `https://ztphakyyhrcwqrdqqbxx.supabase.co/functions/v1/make-server-fe84bde0/public/cancel-reservation`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            reservation_number: reservationData.reservation_number,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'キャンセルに失敗しました');
      }

      toast.success('予約をキャンセルしました');
      setShowCancelConfirm(false);
      // 再度検索して最新状態を取得
      await searchReservation(reservationData.reservation_number);
    } catch (err: any) {
      console.error('キャンセルエラー:', err);
      toast.error(err.message || 'キャンセルに失敗しました');
    } finally {
      setCancelling(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    });
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return (
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-100 text-green-800 rounded-full">
            <CheckCircle className="w-5 h-5" />
            <span className="font-medium">予約確定</span>
          </div>
        );
      case 'cancelled':
        return (
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-red-100 text-red-800 rounded-full">
            <XCircle className="w-5 h-5" />
            <span className="font-medium">キャンセル済み</span>
          </div>
        );
      case 'completed':
        return (
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-800 rounded-full">
            <CheckCircle className="w-5 h-5" />
            <span className="font-medium">完了</span>
          </div>
        );
      default:
        return (
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-800 rounded-full">
            <AlertCircle className="w-5 h-5" />
            <span className="font-medium">{status}</span>
          </div>
        );
    }
  };

  const canCancel = () => {
    if (!reservationData) return false;
    if (reservationData.status === 'cancelled' || reservationData.status === 'completed') return false;
    
    // 予約日時の24時間前まではキャンセル可能
    const reservationDate = new Date(reservationData.reservation_date_time);
    const now = new Date();
    const hoursDiff = (reservationDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    
    return hoursDiff > 24;
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FAFAF8' }}>
      {/* ヘッダー */}
      <header className="border-b" style={{ borderColor: '#E5E0D8', backgroundColor: '#FFFFFF' }}>
        <div className="max-w-4xl mx-auto px-6 py-6 md:py-8">
          <div className="flex items-center justify-between">
            <button
              onClick={() => window.location.href = '/public/reservation'}
              className="text-slate-600 hover:text-slate-900 transition-colors"
            >
              ← 戻る
            </button>
            <ImageWithFallback
              src="https://images.unsplash.com/photo-1476900543704-4312b78632f8?w=200&h=60&fit=crop"
              alt="アマレット"
              className="h-12 object-contain"
            />
            <div className="w-12"></div>
          </div>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="max-w-4xl mx-auto px-6 py-8 md:py-12">
        <div className="text-center mb-8">
          <h1 className="text-slate-900 mb-3">予約状況の確認</h1>
          <p className="text-slate-600">
            予約番号を入力して、ご予約の状況を確認できます
          </p>
        </div>

        {/* 検索フォーム */}
        <div className="bg-white rounded-2xl shadow-sm border p-6 md:p-8 mb-8" style={{ borderColor: '#E5E0D8' }}>
          <label className="block text-sm font-medium text-slate-700 mb-3">
            予約番号
          </label>
          <div className="flex gap-3">
            <input
              type="text"
              value={reservationNumber}
              onChange={(e) => setReservationNumber(e.target.value.toLowerCase())}
              onKeyPress={(e) => e.key === 'Enter' && searchReservation()}
              placeholder="例: abc12"
              maxLength={5}
              className="flex-1 px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-lg"
              disabled={loading}
            />
            <button
              onClick={() => searchReservation()}
              disabled={loading}
              className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <Loader className="w-5 h-5 animate-spin" />
              ) : (
                <Search className="w-5 h-5" />
              )}
              検索
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            ※ 予約完了時にお知らせした予約番号を入力してください
          </p>
        </div>

        {/* 予約情報表示 */}
        {reservationData && (
          <div className="bg-white rounded-2xl shadow-sm border" style={{ borderColor: '#E5E0D8' }}>
            {/* ステータス */}
            <div className="p-6 md:p-8 text-center border-b" style={{ borderColor: '#E5E0D8' }}>
              {getStatusBadge(reservationData.status)}
              <p className="text-lg font-medium text-slate-900 mt-4 mb-2">
                予約番号: {reservationData.reservation_number}
              </p>
              {reservationData.customer_code && (
                <p className="text-sm text-slate-600">
                  顧客番号: {reservationData.customer_code}
                </p>
              )}
            </div>

            {/* 予約詳細 */}
            <div className="p-6 md:p-8">
              <h2 className="text-lg font-medium text-slate-900 mb-6">予約内容</h2>
              
              <div className="space-y-4">
                {/* 日時 */}
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-slate-600">日時</p>
                    <p className="text-slate-900 mt-1">
                      {formatDate(reservationData.reservation_date_time)}
                    </p>
                    <p className="text-slate-900">
                      {formatTime(reservationData.reservation_date_time)}〜
                    </p>
                  </div>
                </div>

                {/* メニュー */}
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center">
                    <FileText className="w-5 h-5 text-purple-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-slate-600">メニュー</p>
                    <p className="text-slate-900 mt-1">{reservationData.menu_name}</p>
                    {reservationData.duration_minutes && (
                      <div className="flex items-center gap-2 mt-1 text-sm text-slate-600">
                        <Clock className="w-4 h-4" />
                        <span>所要時間: {reservationData.duration_minutes}分</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 店舗 */}
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-green-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-slate-600">店舗</p>
                    <p className="text-slate-900 mt-1">{reservationData.location_name}</p>
                    {reservationData.location_address && (
                      <p className="text-sm text-slate-600 mt-1">{reservationData.location_address}</p>
                    )}
                  </div>
                </div>

                {/* お客様情報 */}
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center">
                    <User className="w-5 h-5 text-orange-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-slate-600">お客様情報</p>
                    <div className="mt-2 space-y-2">
                      <p className="text-slate-900">
                        保護者様: {reservationData.parent_name}
                      </p>
                      <p className="text-slate-900">
                        お子様: {reservationData.child_name}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 連絡先 */}
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-10 h-10 bg-teal-50 rounded-lg flex items-center justify-center">
                    <Phone className="w-5 h-5 text-teal-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-slate-600">連絡先</p>
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-slate-400" />
                        <p className="text-slate-900">{reservationData.phone}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-slate-400" />
                        <p className="text-slate-900">{reservationData.email}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* キャンセルボタン */}
            {canCancel() && (
              <div className="border-t p-6 md:p-8" style={{ borderColor: '#E5E0D8' }}>
                {!showCancelConfirm ? (
                  <>
                    <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-sm text-amber-800">
                        <AlertCircle className="w-4 h-4 inline mr-1" />
                        予約日時の24時間前までキャンセル可能です
                      </p>
                    </div>
                    <button
                      onClick={() => setShowCancelConfirm(true)}
                      className="w-full px-6 py-3 border-2 border-red-300 text-red-700 rounded-xl hover:bg-red-50 transition-colors"
                    >
                      この予約をキャンセルする
                    </button>
                  </>
                ) : (
                  <div className="space-y-4">
                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-sm text-red-800 font-medium mb-2">
                        本当にキャンセルしますか？
                      </p>
                      <p className="text-sm text-red-700">
                        この操作は取り消すことができません。
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setShowCancelConfirm(false)}
                        disabled={cancelling}
                        className="px-6 py-3 border-2 border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
                      >
                        戻る
                      </button>
                      <button
                        onClick={handleCancelReservation}
                        disabled={cancelling}
                        className="px-6 py-3 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {cancelling ? (
                          <>
                            <Loader className="w-5 h-5 animate-spin" />
                            キャンセル中...
                          </>
                        ) : (
                          'キャンセル確定'
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {reservationData.status === 'cancelled' && (
              <div className="border-t p-6 md:p-8 bg-red-50" style={{ borderColor: '#E5E0D8' }}>
                <p className="text-sm text-red-800 text-center">
                  この予約はキャンセルされています
                </p>
              </div>
            )}
          </div>
        )}

        {/* 検索結果なし */}
        {!loading && reservationData === null && reservationNumber && (
          <div className="bg-white rounded-2xl shadow-sm border p-8 text-center" style={{ borderColor: '#E5E0D8' }}>
            <AlertCircle className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600 mb-2">予約が見つかりませんでした</p>
            <p className="text-sm text-slate-500">
              予約番号を確認して、再度お試しください
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
