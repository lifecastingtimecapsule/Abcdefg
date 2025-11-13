import { useState, useEffect } from 'react';
import { Mail, Lock, Calendar, Clock, MapPin, User, Phone, FileText, AlertCircle, CheckCircle, XCircle, Loader, Package, Edit, Send } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { toast } from 'sonner@2.0.3';
import { projectId } from '../utils/supabase/info';

export function MyReservationPage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [email, setEmail] = useState('');
  const [reservationNumber, setReservationNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [reservationData, setReservationData] = useState<any>(null);
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showChangeRequest, setShowChangeRequest] = useState(false);
  const [changeRequestText, setChangeRequestText] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [submittingRequest, setSubmittingRequest] = useState(false);

  useEffect(() => {
    console.log('[MyReservation] ページ読み込み');
    console.log('[MyReservation] 現在のURL:', window.location.href);
    console.log('[MyReservation] パス:', window.location.pathname);
    console.log('[MyReservation] 検索パラメータ:', window.location.search);
    
    // URLパラメータから予約番号とメールを取得（リンククリックの場合）
    const urlParams = new URLSearchParams(window.location.search);
    const number = urlParams.get('number');
    const emailParam = urlParams.get('email');
    
    console.log('[MyReservation] URLパラメータ:', { number, email: emailParam });
    
    if (number && emailParam) {
      setReservationNumber(number);
      setEmail(emailParam);
      // 自動ログイン
      console.log('[MyReservation] 自動ログイン開始');
      handleLogin(emailParam, number);
    }
  }, []);

  const handleLogin = async (emailValue?: string, numberValue?: string) => {
    const loginEmail = emailValue || email;
    const loginNumber = numberValue || reservationNumber;

    if (!loginEmail || !loginNumber) {
      toast.error('メールアドレスと予約番号を入力してください');
      return;
    }

    try {
      setLoading(true);
      console.log('[MyReservation] ログイン試行:', { email: loginEmail, reservation_number: loginNumber });
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-fe84bde0/public/my-reservation-login`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: loginEmail,
            reservation_number: loginNumber,
          }),
        }
      );

      console.log('[MyReservation] レスポンスステータス:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('[MyReservation] エラーレスポンス:', errorData);
        throw new Error(errorData.error || 'ログインに失敗しました');
      }

      const data = await response.json();
      console.log('[MyReservation] ログイン成功:', data);
      setReservationData(data.reservation);
      setWorkOrders(data.work_orders || []);
      setIsLoggedIn(true);
      toast.success('ログインしました');
    } catch (err: any) {
      console.error('[MyReservation] ログインエラー:', err);
      console.error('[MyReservation] エラー詳細:', { message: err.message, stack: err.stack });
      toast.error(err.message || 'ログインに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelReservation = async () => {
    if (!reservationData) return;

    try {
      setCancelling(true);
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-fe84bde0/public/cancel-reservation`,
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
      // データを再取得
      await handleLogin(email, reservationNumber);
    } catch (err: any) {
      console.error('キャンセルエラー:', err);
      toast.error(err.message || 'キャンセルに失敗しました');
    } finally {
      setCancelling(false);
    }
  };

  const handleSubmitChangeRequest = async () => {
    if (!changeRequestText.trim()) {
      toast.error('変更内容を入力してください');
      return;
    }

    try {
      setSubmittingRequest(true);
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-fe84bde0/public/request-change`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            reservation_number: reservationData.reservation_number,
            email,
            change_request: changeRequestText,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '変更リクエストの送信に失敗しました');
      }

      toast.success('変更リクエストを送信しました。スタッフから折り返しご連絡いたします。');
      setShowChangeRequest(false);
      setChangeRequestText('');
    } catch (err: any) {
      console.error('変更リクエストエラー:', err);
      toast.error(err.message || '変更リクエストの送信に失敗しました');
    } finally {
      setSubmittingRequest(false);
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
          <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full" style={{ backgroundColor: '#E8F5E9', color: '#2E7D32', fontFamily: "'Noto Sans JP', sans-serif", fontWeight: 600 }}>
            <CheckCircle className="w-5 h-5" />
            <span>予約確定</span>
          </div>
        );
      case 'cancelled':
        return (
          <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full" style={{ backgroundColor: '#FFEBEE', color: '#C62828', fontFamily: "'Noto Sans JP', sans-serif", fontWeight: 600 }}>
            <XCircle className="w-5 h-5" />
            <span>キャンセル済み</span>
          </div>
        );
      case 'completed':
        return (
          <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full" style={{ backgroundColor: '#E3F2FD', color: '#1565C0', fontFamily: "'Noto Sans JP', sans-serif", fontWeight: 600 }}>
            <CheckCircle className="w-5 h-5" />
            <span>完了</span>
          </div>
        );
      default:
        return (
          <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full" style={{ backgroundColor: '#FFF9E6', color: '#C4A962', fontFamily: "'Noto Sans JP', sans-serif", fontWeight: 600 }}>
            <AlertCircle className="w-5 h-5" />
            <span>{status}</span>
          </div>
        );
    }
  };

  const getWorkOrderStatusBadge = (status: string) => {
    switch (status) {
      case 'in_progress':
        return (
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
            <Package className="w-4 h-4" />
            <span>製作中</span>
          </div>
        );
      case 'completed':
        return (
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
            <CheckCircle className="w-4 h-4" />
            <span>完了</span>
          </div>
        );
      default:
        return null;
    }
  };

  const canCancel = () => {
    if (!reservationData) return false;
    if (reservationData.status === 'cancelled' || reservationData.status === 'completed') return false;
    
    const reservationDate = new Date(reservationData.reservation_date_time);
    const now = new Date();
    const hoursDiff = (reservationDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    
    return hoursDiff > 24;
  };

  const canRequestChange = () => {
    if (!reservationData) return false;
    return reservationData.status !== 'cancelled' && reservationData.status !== 'completed';
  };

  // ログインフォーム
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: '#F8F6F3' }}>
        {/* ヘッダー */}
        <header className="border-b" style={{ borderColor: '#E5E0D8', backgroundColor: '#FFFFFF' }}>
          <div className="max-w-4xl mx-auto px-6 py-6 md:py-8">
            <div className="flex items-center justify-center">
              <h1 style={{ fontFamily: "'Noto Serif JP', serif", color: '#C4A962', letterSpacing: '0.1em' }}>
                Amorétto
              </h1>
            </div>
          </div>
        </header>

        {/* ログインフォーム */}
        <main className="max-w-md mx-auto px-6 py-12">
          <div className="text-center mb-8">
            <h2 style={{ fontFamily: "'Noto Serif JP', serif", color: '#2C2C2C', marginBottom: '1rem' }}>
              予約管理
            </h2>
            <p style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#666666' }}>
              ご予約のメールアドレスと予約番号でログインしてください
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-sm border p-6 md:p-8" style={{ borderColor: '#E5E0D8' }}>
            <div className="space-y-6">
              <div>
                <label className="block text-sm mb-2" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#2C2C2C', fontWeight: 500 }}>
                  メールアドレス
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: '#C4A962' }} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="example@email.com"
                    className="w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none transition-all duration-300"
                    style={{
                      borderColor: '#E5E0D8',
                      fontFamily: "'Noto Sans JP', sans-serif",
                      color: '#2C2C2C'
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#C4A962';
                      e.target.style.boxShadow = '0 0 0 1px #C4A962';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#E5E0D8';
                      e.target.style.boxShadow = 'none';
                    }}
                    disabled={loading}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm mb-2" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#2C2C2C', fontWeight: 500 }}>
                  予約番号
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: '#C4A962' }} />
                  <input
                    type="text"
                    value={reservationNumber}
                    onChange={(e) => setReservationNumber(e.target.value.toLowerCase())}
                    onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                    placeholder="abc12"
                    maxLength={5}
                    className="w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none font-mono transition-all duration-300"
                    style={{
                      borderColor: '#E5E0D8',
                      fontFamily: "'Noto Sans JP', sans-serif",
                      color: '#2C2C2C'
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#C4A962';
                      e.target.style.boxShadow = '0 0 0 1px #C4A962';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#E5E0D8';
                      e.target.style.boxShadow = 'none';
                    }}
                    disabled={loading}
                  />
                </div>
              </div>

              <button
                onClick={() => handleLogin()}
                disabled={loading}
                className="w-full px-6 py-3 text-white rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 hover:shadow-md"
                style={{
                  backgroundColor: '#C4A962',
                  fontFamily: "'Noto Sans JP', sans-serif",
                  fontWeight: 600,
                  letterSpacing: '0.05em'
                }}
                onMouseEnter={(e) => !loading && (e.currentTarget.style.backgroundColor = '#B39952')}
                onMouseLeave={(e) => !loading && (e.currentTarget.style.backgroundColor = '#C4A962')}
              >
                {loading ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    ログイン中...
                  </>
                ) : (
                  'ログイン'
                )}
              </button>
            </div>
          </div>

          <div className="mt-6 text-center">
            <p className="text-sm" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#999999' }}>
              予約番号がわからない場合は、確認メールをご確認ください
            </p>
          </div>
        </main>
      </div>
    );
  }

  // 予約詳細表示
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F8F6F3' }}>
      {/* ヘッダー */}
      <header className="border-b" style={{ borderColor: '#E5E0D8', backgroundColor: '#FFFFFF' }}>
        <div className="max-w-4xl mx-auto px-6 py-6 md:py-8">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setIsLoggedIn(false)}
              className="transition-colors"
              style={{ color: '#666666', fontFamily: "'Noto Sans JP', sans-serif" }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#C4A962'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#666666'}
            >
              ← ログアウト
            </button>
            <h1 style={{ fontFamily: "'Noto Serif JP', serif", color: '#C4A962', letterSpacing: '0.1em' }}>
              Amorétto
            </h1>
            <div className="w-20"></div>
          </div>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="max-w-4xl mx-auto px-6 py-8 md:py-12">
        <div className="bg-white rounded-lg shadow-sm border" style={{ borderColor: '#E5E0D8' }}>
          {/* ステータス */}
          <div className="p-6 md:p-8 text-center border-b" style={{ borderColor: '#E5E0D8' }}>
            {getStatusBadge(reservationData.status)}
            <p className="mt-6 mb-2" style={{ fontFamily: "'Noto Serif JP', serif", color: '#2C2C2C', fontSize: '1.125rem', fontWeight: 500 }}>
              予約番号: {reservationData.reservation_number}
            </p>
            {reservationData.customer_code && (
              <p className="text-sm" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#999999' }}>
                顧客番号: {reservationData.customer_code}
              </p>
            )}
          </div>

          {/* 予約詳細 */}
          <div className="p-6 md:p-8">
            <h2 className="mb-6 pb-3 border-b" style={{ fontFamily: "'Noto Serif JP', serif", color: '#2C2C2C', borderColor: '#E5E0D8' }}>
              予約内容
            </h2>
            
            <div className="space-y-5">
              {/* 日時 */}
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#FFF9E6' }}>
                  <Calendar className="w-5 h-5" style={{ color: '#C4A962' }} />
                </div>
                <div className="flex-1">
                  <p className="text-sm mb-2" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#999999' }}>日時</p>
                  <p style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#2C2C2C', fontWeight: 500 }}>
                    {formatDate(reservationData.reservation_date_time)}
                  </p>
                  <p style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#2C2C2C', fontWeight: 500 }}>
                    {formatTime(reservationData.reservation_date_time)}〜
                  </p>
                </div>
              </div>

              {/* メニュー */}
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#FFF9E6' }}>
                  <FileText className="w-5 h-5" style={{ color: '#C4A962' }} />
                </div>
                <div className="flex-1">
                  <p className="text-sm mb-2" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#999999' }}>メニュー</p>
                  <p style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#2C2C2C', fontWeight: 500 }}>{reservationData.menu_name}</p>
                  {reservationData.duration_minutes && (
                    <div className="flex items-center gap-2 mt-1 text-sm" style={{ color: '#999999' }}>
                      <Clock className="w-4 h-4" />
                      <span>所要時間: {reservationData.duration_minutes}分</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 店舗 */}
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#FFF9E6' }}>
                  <MapPin className="w-5 h-5" style={{ color: '#C4A962' }} />
                </div>
                <div className="flex-1">
                  <p className="text-sm mb-2" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#999999' }}>店舗</p>
                  <p style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#2C2C2C', fontWeight: 500 }}>{reservationData.location_name}</p>
                  {reservationData.location_address && (
                    <p className="text-sm mt-1" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#999999' }}>{reservationData.location_address}</p>
                  )}
                </div>
              </div>

              {/* お客様情報 */}
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#FFF9E6' }}>
                  <User className="w-5 h-5" style={{ color: '#C4A962' }} />
                </div>
                <div className="flex-1">
                  <p className="text-sm mb-2" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#999999' }}>お客様情報</p>
                  <div className="space-y-2">
                    <p style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#2C2C2C' }}>
                      保護者様: {reservationData.parent_name}
                    </p>
                    <p style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#2C2C2C' }}>
                      お子様: {reservationData.child_name}
                    </p>
                  </div>
                </div>
              </div>

              {/* 連絡先 */}
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#FFF9E6' }}>
                  <Phone className="w-5 h-5" style={{ color: '#C4A962' }} />
                </div>
                <div className="flex-1">
                  <p className="text-sm mb-2" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#999999' }}>連絡先</p>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4" style={{ color: '#C4A962' }} />
                      <p style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#2C2C2C' }}>{reservationData.phone}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4" style={{ color: '#C4A962' }} />
                      <p style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#2C2C2C' }}>{reservationData.email}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 制作物ステータス */}
          {workOrders.length > 0 && (
            <div className="border-t p-6 md:p-8" style={{ borderColor: '#E5E0D8' }}>
              <h2 className="mb-4 pb-3 border-b" style={{ fontFamily: "'Noto Serif JP', serif", color: '#2C2C2C', borderColor: '#E5E0D8' }}>
                制作物の納期状況
              </h2>
              <div className="space-y-3">
                {workOrders.map((order) => (
                  <div key={order.work_order_id} className="flex items-center justify-between p-4 rounded-lg" style={{ backgroundColor: '#F8F6F3' }}>
                    <div className="flex-1">
                      <p style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#2C2C2C', fontWeight: 500 }}>{order.product_name}</p>
                      {order.scheduled_delivery_date && (
                        <p className="text-sm mt-1" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#999999' }}>
                          納期予定: {formatDate(order.scheduled_delivery_date)}
                        </p>
                      )}
                    </div>
                    {getWorkOrderStatusBadge(order.status)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* アクションボタン */}
          <div className="border-t p-6 md:p-8 space-y-3" style={{ borderColor: '#E5E0D8' }}>
            {/* 変更リクエスト */}
            {canRequestChange() && !showChangeRequest && (
              <button
                onClick={() => setShowChangeRequest(true)}
                className="w-full px-6 py-3 border-2 rounded-lg transition-all duration-300 flex items-center justify-center gap-2"
                style={{
                  borderColor: '#C4A962',
                  color: '#C4A962',
                  fontFamily: "'Noto Sans JP', sans-serif",
                  fontWeight: 600
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#FFF9E6';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <Edit className="w-5 h-5" />
                予約の変更をリクエストする
              </button>
            )}

            {/* 変更リクエストフォーム */}
            {showChangeRequest && (
              <div className="p-4 border rounded-lg space-y-4" style={{ backgroundColor: '#FFF9E6', borderColor: '#E5E0D8' }}>
                <div>
                  <label className="block text-sm mb-2" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#2C2C2C', fontWeight: 500 }}>
                    変更内容をご記入ください
                  </label>
                  <textarea
                    value={changeRequestText}
                    onChange={(e) => setChangeRequestText(e.target.value)}
                    placeholder="例: 予約日時を◯月◯日 ◯時に変更したい"
                    rows={4}
                    className="w-full px-4 py-3 border rounded-lg focus:outline-none transition-all duration-300"
                    style={{
                      borderColor: '#E5E0D8',
                      fontFamily: "'Noto Sans JP', sans-serif",
                      color: '#2C2C2C'
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#C4A962';
                      e.target.style.boxShadow = '0 0 0 1px #C4A962';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#E5E0D8';
                      e.target.style.boxShadow = 'none';
                    }}
                    disabled={submittingRequest}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => {
                      setShowChangeRequest(false);
                      setChangeRequestText('');
                    }}
                    disabled={submittingRequest}
                    className="px-4 py-2 border-2 rounded-lg transition-all duration-300 disabled:opacity-50"
                    style={{
                      borderColor: '#E5E0D8',
                      color: '#666666',
                      fontFamily: "'Noto Sans JP', sans-serif"
                    }}
                    onMouseEnter={(e) => !submittingRequest && (e.currentTarget.style.backgroundColor = '#F8F6F3')}
                    onMouseLeave={(e) => !submittingRequest && (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    キャンセル
                  </button>
                  <button
                    onClick={handleSubmitChangeRequest}
                    disabled={submittingRequest}
                    className="px-4 py-2 text-white rounded-lg transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-2"
                    style={{
                      backgroundColor: '#C4A962',
                      fontFamily: "'Noto Sans JP', sans-serif",
                      fontWeight: 600
                    }}
                    onMouseEnter={(e) => !submittingRequest && (e.currentTarget.style.backgroundColor = '#B39952')}
                    onMouseLeave={(e) => !submittingRequest && (e.currentTarget.style.backgroundColor = '#C4A962')}
                  >
                    {submittingRequest ? (
                      <>
                        <Loader className="w-4 h-4 animate-spin" />
                        送信中...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        送信
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* キャンセルボタン */}
            {canCancel() && !showCancelConfirm && (
              <button
                onClick={() => setShowCancelConfirm(true)}
                className="w-full px-6 py-3 border-2 rounded-lg transition-all duration-300"
                style={{
                  borderColor: '#E5E0D8',
                  color: '#C62828',
                  fontFamily: "'Noto Sans JP', sans-serif",
                  fontWeight: 600
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#FFEBEE';
                  e.currentTarget.style.borderColor = '#C62828';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.borderColor = '#E5E0D8';
                }}
              >
                この予約をキャンセルする
              </button>
            )}

            {/* キャンセル確認 */}
            {showCancelConfirm && (
              <div className="p-4 border rounded-lg space-y-4" style={{ backgroundColor: '#FFEBEE', borderColor: '#FFCDD2' }}>
                <div>
                  <p className="text-sm mb-2" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#C62828', fontWeight: 600 }}>
                    本当にキャンセルしますか？
                  </p>
                  <p className="text-sm" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#C62828' }}>
                    この操作は取り消すことができません。
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setShowCancelConfirm(false)}
                    disabled={cancelling}
                    className="px-4 py-2 border-2 rounded-lg transition-all duration-300 disabled:opacity-50"
                    style={{
                      borderColor: '#E5E0D8',
                      color: '#666666',
                      fontFamily: "'Noto Sans JP', sans-serif"
                    }}
                    onMouseEnter={(e) => !cancelling && (e.currentTarget.style.backgroundColor = '#F8F6F3')}
                    onMouseLeave={(e) => !cancelling && (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    戻る
                  </button>
                  <button
                    onClick={handleCancelReservation}
                    disabled={cancelling}
                    className="px-4 py-2 text-white rounded-lg transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-2"
                    style={{
                      backgroundColor: '#C62828',
                      fontFamily: "'Noto Sans JP', sans-serif",
                      fontWeight: 600
                    }}
                    onMouseEnter={(e) => !cancelling && (e.currentTarget.style.backgroundColor = '#B71C1C')}
                    onMouseLeave={(e) => !cancelling && (e.currentTarget.style.backgroundColor = '#C62828')}
                  >
                    {cancelling ? (
                      <>
                        <Loader className="w-4 h-4 animate-spin" />
                        キャンセル中...
                      </>
                    ) : (
                      'キャンセル確定'
                    )}
                  </button>
                </div>
              </div>
            )}

            {!canCancel() && reservationData.status === 'cancelled' && (
              <div className="p-4 border rounded-lg text-center" style={{ backgroundColor: '#FFEBEE', borderColor: '#FFCDD2' }}>
                <p className="text-sm" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#C62828' }}>
                  この予約はキャンセルされています
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
