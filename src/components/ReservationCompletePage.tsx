import { useEffect, useState } from 'react';
import { CheckCircle, Calendar, Clock, MapPin, User, Mail, Phone, FileText, Search } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';

export function ReservationCompletePage() {
  const [reservationData, setReservationData] = useState<any>(null);

  useEffect(() => {
    // URLパラメータから予約情報を取得
    const urlParams = new URLSearchParams(window.location.search);
    const data = urlParams.get('data');
    if (data) {
      try {
        const parsed = JSON.parse(decodeURIComponent(data));
        setReservationData(parsed);
      } catch (err) {
        console.error('予約データの解析に失敗:', err);
      }
    }
  }, []);

  if (!reservationData) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F8F6F3' }}>
        <div className="text-center">
          <p style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#999999' }}>予約情報が見つかりません</p>
          <button
            onClick={() => window.location.href = '/public/reservation'}
            className="mt-4 px-6 py-3 text-white rounded-lg transition-all duration-300"
            style={{
              backgroundColor: '#C4A962',
              fontFamily: "'Noto Sans JP', sans-serif",
              fontWeight: 600,
              letterSpacing: '0.05em'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#B39952'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#C4A962'}
          >
            予約ページへ戻る
          </button>
        </div>
      </div>
    );
  }

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

      {/* メインコンテンツ */}
      <main className="max-w-4xl mx-auto px-6 py-8 md:py-12">
        {/* 完了メッセージ */}
        <div className="bg-white rounded-lg shadow-sm border" style={{ borderColor: '#E5E0D8' }}>
          <div className="p-8 md:p-12 text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-6" style={{ backgroundColor: '#E8F5E9' }}>
              <CheckCircle className="w-12 h-12" style={{ color: '#2E7D32' }} />
            </div>
            <h2 className="mb-3" style={{ fontFamily: "'Noto Serif JP', serif", color: '#2C2C2C' }}>
              ご予約ありがとうございます
            </h2>
            <p className="mb-8" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#666666', lineHeight: '1.8' }}>
              予約が完了しました。<br />
              予約番号は大切に保管してください。
            </p>

            {/* 予約番号 */}
            <div className="inline-block px-8 py-6 rounded-lg border-2 mb-8" style={{ background: 'linear-gradient(135deg, #FFF9E6 0%, #F8F6F3 100%)', borderColor: '#C4A962' }}>
              <p className="text-sm mb-2" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#999999' }}>予約番号</p>
              <p className="font-mono tracking-wider" style={{ fontSize: '2rem', color: '#C4A962', fontWeight: 600 }}>
                {reservationData.reservation_number}
              </p>
            </div>
          </div>

          <div className="border-t px-8 md:px-12 py-8" style={{ borderColor: '#E5E0D8' }}>
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
                      {reservationData.parent_name_kana && (
                        <span className="text-sm ml-2" style={{ color: '#999999' }}>({reservationData.parent_name_kana})</span>
                      )}
                    </p>
                    <p style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#2C2C2C' }}>
                      お子様: {reservationData.child_name}
                      {reservationData.child_name_kana && (
                        <span className="text-sm ml-2" style={{ color: '#999999' }}>({reservationData.child_name_kana})</span>
                      )}
                    </p>
                    {(reservationData.child_age_years !== null || reservationData.child_age_months !== null) && (
                      <p className="text-sm" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#999999' }}>
                        年齢: {reservationData.child_age_years || 0}歳 {reservationData.child_age_months || 0}ヶ月
                      </p>
                    )}
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

              {/* 備考 */}
              {reservationData.notes_customer && (
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#FFF9E6' }}>
                    <FileText className="w-5 h-5" style={{ color: '#C4A962' }} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm mb-2" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#999999' }}>ご要望・備考</p>
                    <p className="whitespace-pre-wrap" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#2C2C2C' }}>{reservationData.notes_customer}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 注意事項 */}
          <div className="border-t px-8 md:px-12 py-8" style={{ borderColor: '#E5E0D8', backgroundColor: '#FFF9E6' }}>
            <h3 className="mb-3" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#2C2C2C', fontWeight: 600 }}>ご来店前のお願い</h3>
            <ul className="text-sm space-y-2 list-disc list-inside" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#666666', lineHeight: '1.8' }}>
              <li>予約時間の10分前までにご来店ください</li>
              <li>遅れる場合は必ずお電話にてご連絡ください</li>
              <li>キャンセルされる場合は、予約状況確認ページからお手続きください</li>
              <li>当日キャンセルの場合はキャンセル料が発生する場合がございます</li>
            </ul>
          </div>

          {/* アクションボタン */}
          <div className="px-8 md:px-12 py-8 space-y-3">
            <button
              onClick={() => window.location.href = `/my-reservation?number=${reservationData.reservation_number}&email=${encodeURIComponent(reservationData.email)}`}
              className="w-full px-6 py-4 text-white rounded-lg transition-all duration-300 flex items-center justify-center gap-2"
              style={{
                backgroundColor: '#C4A962',
                fontFamily: "'Noto Sans JP', sans-serif",
                fontWeight: 600,
                letterSpacing: '0.05em'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#B39952';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(196, 169, 98, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#C4A962';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <Search className="w-5 h-5" />
              予約状況を確認する
            </button>
            <button
              onClick={() => window.location.href = '/public/reservation'}
              className="w-full px-6 py-4 border-2 rounded-lg transition-all duration-300"
              style={{
                borderColor: '#E5E0D8',
                color: '#666666',
                fontFamily: "'Noto Sans JP', sans-serif",
                fontWeight: 600
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#F8F6F3';
                e.currentTarget.style.borderColor = '#C4A962';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.borderColor = '#E5E0D8';
              }}
            >
              トップページへ戻る
            </button>
          </div>
        </div>

        {/* 確認メールの案内 */}
        <div className="mt-6 text-center">
          <p className="text-sm flex items-center justify-center gap-2" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#999999' }}>
            <Mail className="w-4 h-4" />
            ご登録のメールアドレスに確認メールをお送りしました。
          </p>
        </div>
      </main>
    </div>
  );
}
