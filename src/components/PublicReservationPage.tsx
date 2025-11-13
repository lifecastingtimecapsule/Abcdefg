import { useState, useEffect } from 'react';
import { Calendar, Clock, Mail, Phone, MapPin, User, Baby, Home, ChevronLeft, ChevronRight, Heart } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { projectId } from '../utils/supabase/info';

interface MenuItem {
  menu_item_id: string;
  name: string;
  base_price: number;
  additional_unit_price: number;
  description?: string;
  is_active: boolean;
}

interface Location {
  location_id: string;
  location_name: string;
  address_text?: string;
  phone?: string;
}

export function PublicReservationPage() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  
  // フォームデータ
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [selectedMenuId, setSelectedMenuId] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [parentName, setParentName] = useState('');
  const [childName, setChildName] = useState('');
  const [childAgeYears, setChildAgeYears] = useState('');
  const [childAgeMonths, setChildAgeMonths] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');

  // カレンダー表示用の状態
  const [currentMonth, setCurrentMonth] = useState(new Date());

  useEffect(() => {
    loadPublicData();
  }, []);

  const loadPublicData = async () => {
    try {
      const apiUrl = `https://${projectId}.supabase.co/functions/v1/make-server-fe84bde0`;
      
      const menuRes = await fetch(`${apiUrl}/public/menu-items`);
      if (menuRes.ok) {
        const menuData = await menuRes.json();
        setMenuItems(menuData.menu_items || []);
      }

      const locRes = await fetch(`${apiUrl}/public/locations`);
      if (locRes.ok) {
        const locData = await locRes.json();
        setLocations(locData.locations || []);
      }
    } catch (err) {
      console.error('Failed to load public data:', err);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const apiUrl = `https://${projectId}.supabase.co/functions/v1/make-server-fe84bde0`;

      const reservationDateTime = `${selectedDate}T${selectedTime}`;

      const response = await fetch(`${apiUrl}/public/reservations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservation_date_time: reservationDateTime,
          menu_item_id: selectedMenuId,
          location_id: selectedLocationId,
          parent_name: parentName,
          child_name: childName,
          child_age_years: childAgeYears ? parseInt(childAgeYears) : null,
          child_age_months: childAgeMonths ? parseInt(childAgeMonths) : null,
          phone,
          email,
          postal_code: postalCode,
          address_text: address,
          notes_customer: notes,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '予約に失敗しました');
      }

      toast.success('予約を受け付けました！確認メールをお送りしました。');
      
      // フォームをリセット
      setStep(1);
      setSelectedDate('');
      setSelectedTime('');
      setSelectedMenuId('');
      setSelectedLocationId('');
      setParentName('');
      setChildName('');
      setChildAgeYears('');
      setChildAgeMonths('');
      setPostalCode('');
      setAddress('');
      setPhone('');
      setEmail('');
      setNotes('');
    } catch (err: any) {
      console.error('Reservation error:', err);
      toast.error(err.message || '予約に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // カレンダー関連の関数
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days: (Date | null)[] = [];

    // 前月の空白
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }

    // 当月の日付
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }

    return days;
  };

  const formatDateForInput = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const isPastDate = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const compareDate = new Date(date);
    compareDate.setHours(0, 0, 0, 0);
    return compareDate < today;
  };

  const calendarDays = getDaysInMonth(currentMonth);
  const weekDays = ['日', '月', '火', '水', '木', '金', '土'];

  const timeSlots = [
    '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
    '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
    '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00'
  ];

  const previousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FAFAF8' }}>
      {/* ヘッダー */}
      <header className="border-b" style={{ borderColor: '#E5E0D8', backgroundColor: '#FFFFFF' }}>
        <div className="max-w-6xl mx-auto px-6 py-6 md:py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="mb-1" style={{ fontFamily: "'Noto Serif JP', serif", color: '#2C2C2C' }}>
                Amoretto
              </h1>
              <p className="text-sm" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#666666' }}>
                ライフキャスティング専門店
              </p>
            </div>
            <Heart className="w-8 h-8 md:w-10 md:h-10" style={{ color: '#C4A962' }} />
          </div>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="max-w-4xl mx-auto px-6 py-12 md:py-24">
        {/* ヒーローセクション */}
        {step === 1 && (
          <div className="text-center mb-12 md:mb-20">
            <h2 className="mb-4" style={{ fontFamily: "'Noto Serif JP', serif", color: '#2C2C2C', fontSize: '2rem', lineHeight: '1.4' }}>
              大切な想い出を、<br className="md:hidden" />カタチに残す
            </h2>
            <p className="mb-2" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#666666', letterSpacing: '0.05em' }}>
              お子様の成長の一瞬を、美しいアートとして残しませんか。
            </p>
            <p style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#666666', letterSpacing: '0.05em' }}>
              手形・足形のライフキャスティングで、今この時を永遠に。
            </p>
          </div>
        )}

        {/* プログレスバー */}
        <div className="mb-8 md:mb-12">
          <div className="flex items-center justify-center gap-2 md:gap-4 mb-3">
            {[1, 2, 3].map((num) => (
              <div key={num} className="flex items-center">
                <div
                  className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                    step >= num ? 'text-white' : 'border-2 text-[#666666]'
                  }`}
                  style={{
                    backgroundColor: step >= num ? '#C4A962' : 'transparent',
                    borderColor: step >= num ? '#C4A962' : '#E5E0D8',
                    fontFamily: "'Noto Sans JP', sans-serif"
                  }}
                >
                  {num}
                </div>
                {num < 3 && (
                  <div
                    className="w-12 md:w-20 h-0.5 mx-1 md:mx-2"
                    style={{ backgroundColor: step > num ? '#C4A962' : '#E5E0D8' }}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between max-w-md mx-auto px-2" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#666666', fontSize: '0.875rem' }}>
            <span>日時選択</span>
            <span>お客様情報</span>
            <span>確認</span>
          </div>
        </div>

        {/* ステップコンテンツ */}
        <div className="rounded-none md:rounded-sm shadow-sm p-6 md:p-10" style={{ backgroundColor: '#FFFFFF' }}>
          {/* ステップ1: 日時とメニュー選択 */}
          {step === 1 && (
            <div className="space-y-8 md:space-y-12">
              <div>
                <h3 className="mb-6" style={{ fontFamily: "'Noto Serif JP', serif", color: '#2C2C2C', borderBottom: '1px solid #E5E0D8', paddingBottom: '0.75rem' }}>
                  ご希望の日時をお選びください
                </h3>

                {/* カレンダー */}
                <div className="mb-8">
                  <div className="flex items-center justify-between mb-6">
                    <button
                      onClick={previousMonth}
                      className="p-2 hover:opacity-70 transition-opacity"
                      style={{ color: '#C4A962' }}
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <h4 style={{ fontFamily: "'Noto Serif JP', serif", color: '#2C2C2C' }}>
                      {currentMonth.getFullYear()}年 {currentMonth.getMonth() + 1}月
                    </h4>
                    <button
                      onClick={nextMonth}
                      className="p-2 hover:opacity-70 transition-opacity"
                      style={{ color: '#C4A962' }}
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-7 gap-1 md:gap-2">
                    {weekDays.map((day, index) => (
                      <div
                        key={day}
                        className="text-center py-2 text-sm"
                        style={{
                          fontFamily: "'Noto Sans JP', sans-serif",
                          color: index === 0 ? '#C4A962' : index === 6 ? '#666666' : '#2C2C2C'
                        }}
                      >
                        {day}
                      </div>
                    ))}
                    {calendarDays.map((date, index) => (
                      <div key={index}>
                        {date ? (
                          <button
                            onClick={() => !isPastDate(date) && setSelectedDate(formatDateForInput(date))}
                            disabled={isPastDate(date)}
                            className={`w-full aspect-square flex items-center justify-center text-sm transition-all duration-300 ${
                              selectedDate === formatDateForInput(date)
                                ? 'text-white'
                                : isPastDate(date)
                                ? 'opacity-30 cursor-not-allowed'
                                : 'hover:border hover:opacity-80'
                            }`}
                            style={{
                              fontFamily: "'Noto Sans JP', sans-serif",
                              backgroundColor: selectedDate === formatDateForInput(date) ? '#C4A962' : isToday(date) ? '#F8F6F3' : 'transparent',
                              color: selectedDate === formatDateForInput(date) ? '#FFFFFF' : '#2C2C2C',
                              borderColor: '#E5E0D8'
                            }}
                          >
                            {date.getDate()}
                          </button>
                        ) : (
                          <div />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* 時間選択 */}
                {selectedDate && (
                  <div className="mb-8">
                    <label className="block mb-3" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#2C2C2C' }}>
                      ご希望の時間
                    </label>
                    <div className="grid grid-cols-3 md:grid-cols-5 gap-2 md:gap-3">
                      {timeSlots.map((time) => (
                        <button
                          key={time}
                          onClick={() => setSelectedTime(time)}
                          className={`py-2.5 md:py-3 transition-all duration-300 ${
                            selectedTime === time ? 'text-white' : 'border hover:opacity-80'
                          }`}
                          style={{
                            fontFamily: "'Noto Sans JP', sans-serif",
                            backgroundColor: selectedTime === time ? '#C4A962' : 'transparent',
                            color: selectedTime === time ? '#FFFFFF' : '#2C2C2C',
                            borderColor: '#E5E0D8',
                            letterSpacing: '0.05em'
                          }}
                        >
                          {time}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* メニュー選択 */}
              <div>
                <h3 className="mb-6" style={{ fontFamily: "'Noto Serif JP', serif", color: '#2C2C2C', borderBottom: '1px solid #E5E0D8', paddingBottom: '0.75rem' }}>
                  メニューをお選びください
                </h3>
                <div className="grid gap-4 md:gap-6">
                  {menuItems.length === 0 ? (
                    <div className="p-6 text-center" style={{ backgroundColor: '#F8F6F3', color: '#666666', fontFamily: "'Noto Sans JP', sans-serif" }}>
                      メニューが登録されていません
                    </div>
                  ) : (
                    menuItems.map((menu) => (
                      <button
                        key={menu.menu_item_id}
                        onClick={() => setSelectedMenuId(menu.menu_item_id)}
                        className={`p-5 md:p-6 text-left transition-all duration-300 border ${
                          selectedMenuId === menu.menu_item_id
                            ? 'border-[#C4A962]'
                            : 'border-[#E5E0D8] hover:border-[#C4A962] hover:shadow-sm'
                        }`}
                        style={{
                          backgroundColor: selectedMenuId === menu.menu_item_id ? '#FAFAF8' : '#FFFFFF'
                        }}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="mb-2" style={{ fontFamily: "'Noto Serif JP', serif", color: '#2C2C2C' }}>
                              {menu.name}
                            </div>
                            {menu.description && (
                              <div className="text-sm" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#666666', lineHeight: '1.6' }}>
                                {menu.description}
                              </div>
                            )}
                          </div>
                          <div style={{ fontFamily: "'Noto Serif JP', serif", color: '#C4A962', fontSize: '1.25rem' }}>
                            ¥{menu.base_price.toLocaleString()}
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* 店舗選択 */}
              <div>
                <h3 className="mb-6" style={{ fontFamily: "'Noto Serif JP', serif", color: '#2C2C2C', borderBottom: '1px solid #E5E0D8', paddingBottom: '0.75rem' }}>
                  店舗をお選びください
                </h3>
                <div className="grid gap-3 md:gap-4">
                  {locations.map((location) => (
                    <button
                      key={location.location_id}
                      onClick={() => setSelectedLocationId(location.location_id)}
                      className={`p-4 md:p-5 text-left transition-all duration-300 border ${
                        selectedLocationId === location.location_id
                          ? 'border-[#C4A962]'
                          : 'border-[#E5E0D8] hover:border-[#C4A962]'
                      }`}
                      style={{
                        backgroundColor: selectedLocationId === location.location_id ? '#FAFAF8' : '#FFFFFF',
                        fontFamily: "'Noto Sans JP', sans-serif",
                        color: '#2C2C2C'
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4" style={{ color: '#C4A962' }} />
                        <span>{location.location_name}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end pt-6" style={{ borderTop: '1px solid #E5E0D8' }}>
                <button
                  onClick={() => {
                    if (!selectedDate || !selectedTime || !selectedMenuId || !selectedLocationId) {
                      toast.error('すべての項目を選択してください');
                      return;
                    }
                    setStep(2);
                  }}
                  className="px-10 md:px-12 py-3.5 md:py-4 transition-all duration-300"
                  style={{
                    backgroundColor: '#C4A962',
                    color: '#FFFFFF',
                    fontFamily: "'Noto Sans JP', sans-serif",
                    letterSpacing: '0.1em'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#B39952'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#C4A962'}
                >
                  次へ進む
                </button>
              </div>
            </div>
          )}

          {/* ステップ2: 顧客情報入力 */}
          {step === 2 && (
            <div className="space-y-6 md:space-y-8">
              <h3 className="mb-6" style={{ fontFamily: "'Noto Serif JP', serif", color: '#2C2C2C', borderBottom: '1px solid #E5E0D8', paddingBottom: '0.75rem' }}>
                お客様情報をご入力ください
              </h3>

              {/* 保護者名 */}
              <div>
                <label className="block mb-2 flex items-center gap-2" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#2C2C2C' }}>
                  <User className="w-4 h-4" style={{ color: '#C4A962' }} />
                  保護者様のお名前 <span style={{ color: '#C4A962' }}>*</span>
                </label>
                <input
                  type="text"
                  value={parentName}
                  onChange={(e) => setParentName(e.target.value)}
                  placeholder="山田 花子"
                  className="w-full px-4 py-3 border transition-all duration-300 focus:outline-none focus:border-[#C4A962]"
                  style={{
                    backgroundColor: '#F8F6F3',
                    borderColor: '#E5E0D8',
                    fontFamily: "'Noto Sans JP', sans-serif",
                    color: '#2C2C2C'
                  }}
                  required
                />
              </div>

              {/* お子様名 */}
              <div>
                <label className="block mb-2 flex items-center gap-2" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#2C2C2C' }}>
                  <Baby className="w-4 h-4" style={{ color: '#C4A962' }} />
                  お子様のお名前 <span style={{ color: '#C4A962' }}>*</span>
                </label>
                <input
                  type="text"
                  value={childName}
                  onChange={(e) => setChildName(e.target.value)}
                  placeholder="山田 太郎"
                  className="w-full px-4 py-3 border transition-all duration-300 focus:outline-none focus:border-[#C4A962]"
                  style={{
                    backgroundColor: '#F8F6F3',
                    borderColor: '#E5E0D8',
                    fontFamily: "'Noto Sans JP', sans-serif",
                    color: '#2C2C2C'
                  }}
                  required
                />
              </div>

              {/* お子様の年齢 */}
              <div>
                <label className="block mb-2" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#2C2C2C' }}>
                  お子様の年齢
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <input
                      type="number"
                      min="0"
                      max="20"
                      value={childAgeYears}
                      onChange={(e) => setChildAgeYears(e.target.value)}
                      placeholder="0"
                      className="w-full px-4 py-3 border transition-all duration-300 focus:outline-none focus:border-[#C4A962]"
                      style={{
                        backgroundColor: '#F8F6F3',
                        borderColor: '#E5E0D8',
                        fontFamily: "'Noto Sans JP', sans-serif",
                        color: '#2C2C2C'
                      }}
                    />
                    <p className="text-sm mt-1" style={{ color: '#666666', fontFamily: "'Noto Sans JP', sans-serif" }}>歳</p>
                  </div>
                  <div>
                    <input
                      type="number"
                      min="0"
                      max="11"
                      value={childAgeMonths}
                      onChange={(e) => setChildAgeMonths(e.target.value)}
                      placeholder="0"
                      className="w-full px-4 py-3 border transition-all duration-300 focus:outline-none focus:border-[#C4A962]"
                      style={{
                        backgroundColor: '#F8F6F3',
                        borderColor: '#E5E0D8',
                        fontFamily: "'Noto Sans JP', sans-serif",
                        color: '#2C2C2C'
                      }}
                    />
                    <p className="text-sm mt-1" style={{ color: '#666666', fontFamily: "'Noto Sans JP', sans-serif" }}>ヶ月</p>
                  </div>
                </div>
              </div>

              {/* 電話番号 */}
              <div>
                <label className="block mb-2 flex items-center gap-2" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#2C2C2C' }}>
                  <Phone className="w-4 h-4" style={{ color: '#C4A962' }} />
                  お電話番号 <span style={{ color: '#C4A962' }}>*</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="090-1234-5678"
                  className="w-full px-4 py-3 border transition-all duration-300 focus:outline-none focus:border-[#C4A962]"
                  style={{
                    backgroundColor: '#F8F6F3',
                    borderColor: '#E5E0D8',
                    fontFamily: "'Noto Sans JP', sans-serif",
                    color: '#2C2C2C'
                  }}
                  required
                />
              </div>

              {/* メールアドレス */}
              <div>
                <label className="block mb-2 flex items-center gap-2" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#2C2C2C' }}>
                  <Mail className="w-4 h-4" style={{ color: '#C4A962' }} />
                  メールアドレス <span style={{ color: '#C4A962' }}>*</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@email.com"
                  className="w-full px-4 py-3 border transition-all duration-300 focus:outline-none focus:border-[#C4A962]"
                  style={{
                    backgroundColor: '#F8F6F3',
                    borderColor: '#E5E0D8',
                    fontFamily: "'Noto Sans JP', sans-serif",
                    color: '#2C2C2C'
                  }}
                  required
                />
              </div>

              {/* 郵便番号 */}
              <div>
                <label className="block mb-2" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#2C2C2C' }}>
                  郵便番号
                </label>
                <input
                  type="text"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  placeholder="123-4567"
                  className="w-full px-4 py-3 border transition-all duration-300 focus:outline-none focus:border-[#C4A962]"
                  style={{
                    backgroundColor: '#F8F6F3',
                    borderColor: '#E5E0D8',
                    fontFamily: "'Noto Sans JP', sans-serif",
                    color: '#2C2C2C'
                  }}
                />
              </div>

              {/* 住所 */}
              <div>
                <label className="block mb-2 flex items-center gap-2" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#2C2C2C' }}>
                  <Home className="w-4 h-4" style={{ color: '#C4A962' }} />
                  ご住所
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="東京都渋谷区..."
                  className="w-full px-4 py-3 border transition-all duration-300 focus:outline-none focus:border-[#C4A962]"
                  style={{
                    backgroundColor: '#F8F6F3',
                    borderColor: '#E5E0D8',
                    fontFamily: "'Noto Sans JP', sans-serif",
                    color: '#2C2C2C'
                  }}
                />
              </div>

              {/* 備考 */}
              <div>
                <label className="block mb-2" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#2C2C2C' }}>
                  ご質問・ご要望
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="ご質問やご要望がございましたらご記入ください"
                  rows={4}
                  className="w-full px-4 py-3 border transition-all duration-300 focus:outline-none focus:border-[#C4A962] resize-none"
                  style={{
                    backgroundColor: '#F8F6F3',
                    borderColor: '#E5E0D8',
                    fontFamily: "'Noto Sans JP', sans-serif",
                    color: '#2C2C2C'
                  }}
                />
              </div>

              <div className="flex gap-3 pt-6" style={{ borderTop: '1px solid #E5E0D8' }}>
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 py-3.5 md:py-4 border transition-all duration-300"
                  style={{
                    borderColor: '#C4A962',
                    color: '#C4A962',
                    fontFamily: "'Noto Sans JP', sans-serif",
                    letterSpacing: '0.1em'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#C4A962';
                    e.currentTarget.style.color = '#FFFFFF';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = '#C4A962';
                  }}
                >
                  戻る
                </button>
                <button
                  onClick={() => {
                    if (!parentName || !childName || !phone || !email) {
                      toast.error('必須項目を入力してください');
                      return;
                    }
                    setStep(3);
                  }}
                  className="flex-1 py-3.5 md:py-4 transition-all duration-300"
                  style={{
                    backgroundColor: '#C4A962',
                    color: '#FFFFFF',
                    fontFamily: "'Noto Sans JP', sans-serif",
                    letterSpacing: '0.1em'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#B39952'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#C4A962'}
                >
                  次へ進む
                </button>
              </div>
            </div>
          )}

          {/* ステップ3: 確認 */}
          {step === 3 && (
            <div className="space-y-8">
              <h3 className="mb-6" style={{ fontFamily: "'Noto Serif JP', serif", color: '#2C2C2C', borderBottom: '1px solid #E5E0D8', paddingBottom: '0.75rem' }}>
                ご予約内容の確認
              </h3>

              <div className="space-y-6" style={{ fontFamily: "'Noto Sans JP', sans-serif" }}>
                <div className="p-6" style={{ backgroundColor: '#F8F6F3' }}>
                  <div className="grid gap-4">
                    <div>
                      <div className="text-sm mb-1" style={{ color: '#666666' }}>ご予約日時</div>
                      <div style={{ color: '#2C2C2C' }}>
                        {new Date(selectedDate).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })} {selectedTime}
                      </div>
                    </div>

                    <div>
                      <div className="text-sm mb-1" style={{ color: '#666666' }}>メニュー</div>
                      <div style={{ color: '#2C2C2C' }}>
                        {menuItems.find(m => m.menu_item_id === selectedMenuId)?.name}
                      </div>
                    </div>

                    <div>
                      <div className="text-sm mb-1" style={{ color: '#666666' }}>店舗</div>
                      <div style={{ color: '#2C2C2C' }}>
                        {locations.find(l => l.location_id === selectedLocationId)?.location_name}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-6" style={{ backgroundColor: '#F8F6F3' }}>
                  <div className="grid gap-4">
                    <div>
                      <div className="text-sm mb-1" style={{ color: '#666666' }}>保護者様</div>
                      <div style={{ color: '#2C2C2C' }}>{parentName}</div>
                    </div>

                    <div>
                      <div className="text-sm mb-1" style={{ color: '#666666' }}>お子様</div>
                      <div style={{ color: '#2C2C2C' }}>
                        {childName}
                        {(childAgeYears || childAgeMonths) && (
                          <span style={{ color: '#666666' }} className="ml-2">
                            ({childAgeYears || 0}歳{childAgeMonths ? ` ${childAgeMonths}ヶ月` : ''})
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="text-sm mb-1" style={{ color: '#666666' }}>ご連絡先</div>
                      <div style={{ color: '#2C2C2C' }}>{phone}</div>
                      <div style={{ color: '#2C2C2C' }}>{email}</div>
                    </div>

                    {(postalCode || address) && (
                      <div>
                        <div className="text-sm mb-1" style={{ color: '#666666' }}>ご住所</div>
                        {postalCode && <div style={{ color: '#2C2C2C' }}>〒{postalCode}</div>}
                        {address && <div style={{ color: '#2C2C2C' }}>{address}</div>}
                      </div>
                    )}

                    {notes && (
                      <div>
                        <div className="text-sm mb-1" style={{ color: '#666666' }}>ご質問・ご要望</div>
                        <div style={{ color: '#2C2C2C', lineHeight: '1.7' }}>{notes}</div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-5 border" style={{ borderColor: '#C4A962', backgroundColor: '#FAFAF8' }}>
                  <p className="text-sm" style={{ color: '#2C2C2C', lineHeight: '1.8' }}>
                    <strong style={{ color: '#C4A962' }}>※ こちらは仮予約です</strong><br />
                    ご予約後、スタッフから確認のお電話をさせていただきます。<br />
                    お電話にて正式な予約確定となりますので、予めご了承ください。
                  </p>
                </div>
              </div>

              <div className="flex gap-3 pt-6" style={{ borderTop: '1px solid #E5E0D8' }}>
                <button
                  onClick={() => setStep(2)}
                  disabled={loading}
                  className="flex-1 py-3.5 md:py-4 border transition-all duration-300 disabled:opacity-50"
                  style={{
                    borderColor: '#C4A962',
                    color: '#C4A962',
                    fontFamily: "'Noto Sans JP', sans-serif",
                    letterSpacing: '0.1em'
                  }}
                  onMouseEnter={(e) => {
                    if (!loading) {
                      e.currentTarget.style.backgroundColor = '#C4A962';
                      e.currentTarget.style.color = '#FFFFFF';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = '#C4A962';
                  }}
                >
                  戻る
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex-1 py-3.5 md:py-4 transition-all duration-300 disabled:opacity-50"
                  style={{
                    backgroundColor: '#C4A962',
                    color: '#FFFFFF',
                    fontFamily: "'Noto Sans JP', sans-serif",
                    letterSpacing: '0.1em'
                  }}
                  onMouseEnter={(e) => !loading && (e.currentTarget.style.backgroundColor = '#B39952')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#C4A962')}
                >
                  {loading ? '送信中...' : '予約を確定する'}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* フッター */}
      <footer className="border-t py-12" style={{ borderColor: '#E5E0D8', backgroundColor: '#F5F3EF' }}>
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="mb-4">
            <h3 className="mb-2" style={{ fontFamily: "'Noto Serif JP', serif", color: '#2C2C2C' }}>
              Amoretto
            </h3>
            <p className="text-sm" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#666666' }}>
              ライフキャスティング専門店
            </p>
          </div>
          <p className="text-sm" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#666666', letterSpacing: '0.05em' }}>
            大切な想い出を、永遠のカタチに。
          </p>
        </div>
      </footer>
    </div>
  );
}
