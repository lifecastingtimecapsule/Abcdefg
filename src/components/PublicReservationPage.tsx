import { useState, useEffect } from 'react';
import { Calendar, Clock, Mail, Phone, MapPin, User, Baby, ChevronLeft, ChevronRight, Heart, Tag } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { projectId, publicAnonKey } from '../utils/supabase/info';

interface MenuItem {
  menu_item_id: string;
  name: string;
  base_price: number;
  additional_unit_price: number;
  description?: string;
  is_active: boolean;
  duration_minutes?: number;
  discount_type?: 'none' | 'percentage' | 'fixed';
  discount_value?: number;
  discount_end_date?: string;
  apply_discount_to_additional?: boolean;
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
  const [bookedSlots, setBookedSlots] = useState<Array<{time: string, duration: number}>>([]);
  const [bookedLocationIds, setBookedLocationIds] = useState<string[]>([]);
  const [reservationSettings, setReservationSettings] = useState<any>(null);
  const [locationAvailability, setLocationAvailability] = useState<any>(null);
  
  // フォームデータ
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [selectedMenuId, setSelectedMenuId] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [parentName, setParentName] = useState('');
  const [parentNameKana, setParentNameKana] = useState('');
  const [childName, setChildName] = useState('');
  const [childNameKana, setChildNameKana] = useState('');
  const [childAgeYears, setChildAgeYears] = useState('');
  const [childAgeMonths, setChildAgeMonths] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');

  // カレンダー表示用の状態
  const [currentMonth, setCurrentMonth] = useState(new Date());

  useEffect(() => {
    loadPublicData();
  }, []);

  // Load booked slots when date changes
  useEffect(() => {
    if (selectedDate) {
      // 日付が選択されたら、まず全店舗の予約を取得して店舗間制限をチェック
      loadBookedSlots(selectedDate, '');
    } else {
      setBookedSlots([]);
      setBookedLocationIds([]);
    }
  }, [selectedDate]);

  // Load booked slots for specific location when location is selected
  useEffect(() => {
    if (selectedDate && selectedLocationId) {
      // 店舗が選択されたら、その店舗の予約のみを取得
      loadBookedSlots(selectedDate, selectedLocationId);
    }
  }, [selectedLocationId]);

  // Load location availability and menus when location is selected
  useEffect(() => {
    if (selectedLocationId) {
      loadLocationAvailability(selectedLocationId);
      loadMenuItemsForLocation(selectedLocationId);
      // 店舗変更時に、選択済みの日付が新しい店舗で利用可能かチェックして、不可能ならクリア
      if (selectedDate) {
        // 日付を再検証するためにわずかに遅延
        setTimeout(() => {
          const date = new Date(selectedDate + 'T00:00:00');
          if (!isDateAvailableForReservation(date)) {
            setSelectedDate('');
            setSelectedTime('');
          }
        }, 100);
      }
    } else {
      setLocationAvailability(null);
      // 店舗未選択時は全メニューを表示
      loadPublicData();
    }
  }, [selectedLocationId]);

  const loadPublicData = async () => {
    try {
      const apiUrl = `https://${projectId}.supabase.co/functions/v1/make-server-fe84bde0`;
      console.log('[公開予約ページ] API URL:', apiUrl);
      console.log('[公開予約ページ] projectId:', projectId);
      
      // Supabase Edge Functionsはanon keyが必要
      const headers = {
        'Authorization': `Bearer ${publicAnonKey}`,
        'Content-Type': 'application/json',
      };
      
      // Health check
      try {
        const healthRes = await fetch(`${apiUrl}/public/health`, { headers });
        console.log('[公開予約ページ] Health check status:', healthRes.status);
        if (healthRes.ok) {
          const healthData = await healthRes.json();
          console.log('[公開予約ページ] Health check:', healthData);
        }
      } catch (healthErr) {
        console.error('[公開予約ページ] Health check failed:', healthErr);
      }
      
      const menuUrl = `${apiUrl}/public/menu-items`;
      console.log('[公開予約ページ] メニューURL:', menuUrl);
      
      const menuRes = await fetch(menuUrl, { headers });
      console.log('[公開予約ページ] メニューレスポンス status:', menuRes.status);
      
      if (menuRes.ok) {
        const menuData = await menuRes.json();
        console.log('[公開予約ページ] 読み込まれたメニュー:', menuData.menu_items);
        setMenuItems(menuData.menu_items || []);
      } else {
        const errorText = await menuRes.text();
        console.error('[公開予約ページ] メニューの読み込みに失敗:', menuRes.status, errorText);
      }

      const locRes = await fetch(`${apiUrl}/public/locations`, { headers });
      if (locRes.ok) {
        const locData = await locRes.json();
        setLocations(locData.locations || []);
      }

      // Load reservation settings
      const settingsRes = await fetch(`${apiUrl}/public/reservation-settings`, { headers });
      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        console.log('[公開予約ページ] 予約設定:', settingsData.settings);
        setReservationSettings(settingsData.settings);
      }
    } catch (err) {
      console.error('Failed to load public data:', err);
    }
  };

  // Load menu items for specific location
  const loadMenuItemsForLocation = async (locationId: string) => {
    try {
      const apiUrl = `https://${projectId}.supabase.co/functions/v1/make-server-fe84bde0`;
      const headers = {
        'Authorization': `Bearer ${publicAnonKey}`,
        'Content-Type': 'application/json',
      };
      
      const menuUrl = `${apiUrl}/public/menu-items?location_id=${locationId}`;
      console.log('[公開予約ページ] 店舗別メニューURL:', menuUrl);
      
      const menuRes = await fetch(menuUrl, { headers });
      if (menuRes.ok) {
        const menuData = await menuRes.json();
        console.log(`[公開予約ページ] 店舗 ${locationId} のメニュー:`, menuData.menu_items);
        setMenuItems(menuData.menu_items || []);
      } else {
        console.error('[公開予約ページ] 店舗別メニューの読み込みに失敗:', menuRes.status);
      }
    } catch (err) {
      console.error('Failed to load menu items for location:', err);
    }
  };

  // Load location availability settings
  const loadLocationAvailability = async (locationId: string) => {
    try {
      const apiUrl = `https://${projectId}.supabase.co/functions/v1/make-server-fe84bde0`;
      const headers = {
        'Authorization': `Bearer ${publicAnonKey}`,
        'Content-Type': 'application/json',
      };
      
      const response = await fetch(`${apiUrl}/public/location-availability/${locationId}`, { headers });
      
      if (response.ok) {
        const data = await response.json();
        console.log('[店舗可用性取得] データ:', data);
        setLocationAvailability(data.availability || null);
      } else {
        console.error('[店舗可用性取得] エラー:', response.status);
        setLocationAvailability(null);
      }
    } catch (err) {
      console.error('Failed to load location availability:', err);
      setLocationAvailability(null);
    }
  };

  // Load booked slots when date or location changes
  const loadBookedSlots = async (date: string, locationId: string) => {
    if (!date) {
      setBookedSlots([]);
      setBookedLocationIds([]);
      return;
    }

    try {
      const apiUrl = `https://${projectId}.supabase.co/functions/v1/make-server-fe84bde0`;
      const headers = {
        'Authorization': `Bearer ${publicAnonKey}`,
        'Content-Type': 'application/json',
      };
      
      // 店舗IDがある場合はその店舗のみ、ない場合は全店舗の予約を取得
      const url = locationId 
        ? `${apiUrl}/public/booked-slots?date=${date}&location_id=${locationId}`
        : `${apiUrl}/public/booked-slots?date=${date}`;
      
      console.log('[予約スロット取得] URL:', url);
      const response = await fetch(url, { headers });
      
      if (response.ok) {
        const data = await response.json();
        console.log('[予約スロット取得] データ:', data);
        setBookedSlots(data.booked_slots || []);
        setBookedLocationIds(data.booked_location_ids || []);
      } else {
        console.error('[予約スロット取得] エラー:', response.status);
      }
    } catch (err) {
      console.error('Failed to load booked slots:', err);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const apiUrl = `https://${projectId}.supabase.co/functions/v1/make-server-fe84bde0`;

      const reservationDateTime = `${selectedDate}T${selectedTime}`;

      console.log('[予約フォーム送信] データ送信中:', {
        email,
        parent_name: parentName,
        child_name: childName,
      });

      const response = await fetch(`${apiUrl}/public/reservations`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${publicAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reservation_date_time: reservationDateTime,
          menu_item_id: selectedMenuId,
          location_id: selectedLocationId,
          parent_name: parentName,
          parent_name_kana: parentNameKana,
          child_name: childName,
          child_name_kana: childNameKana,
          child_age_years: childAgeYears ? parseInt(childAgeYears) : null,
          child_age_months: childAgeMonths ? parseInt(childAgeMonths) : null,
          phone,
          email,
          notes_customer: notes,
        }),
      });

      console.log('[予約フォーム送信] レスポンスステータス:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('[予約フォーム送信] エラー:', errorData);
        if (response.status === 409) {
          // Conflict - time slot already booked
          toast.error('この日時は既に予約が入っています。別の時間をお選びください。');
          // Reload booked slots
          await loadBookedSlots(selectedDate, selectedLocationId);
          throw new Error(errorData.error || '予約に失敗しました');
        }
        throw new Error(errorData.error || '予約に失敗しました');
      }

      const responseData = await response.json();
      console.log('[予約フォーム送信] ✅ 予約成功:', responseData);

      toast.success('予約を受け付けました！');
      
      // 予約完了ページへ遷移
      const reservationDataForUrl = encodeURIComponent(JSON.stringify(responseData.reservation));
      window.location.href = `/public/reservation/complete?data=${reservationDataForUrl}`;
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

  // 日付が予約可能かどうかをチェック
  const isDateAvailableForReservation = (date: Date) => {
    if (!reservationSettings) {
      return true; // 設定がない場合はすべて選択可能
    }
    
    // 過去の日付は選択不可
    if (isPastDate(date)) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);
    
    const diffTime = checkDate.getTime() - today.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    // 予約受付開始日より前は選択不可（N日前まで不可 = N日後以降から可能）
    // 例: advance_reservation_days = 3 の場合、diffDays < 3 は選択不可（0,1,2日後）、diffDays >= 3 から可能（3日後以降）
    if (diffDays < reservationSettings.advance_reservation_days) {
      return false;
    }
    
    // 予約受付終了日より後は選択不可
    if (diffDays > reservationSettings.max_reservation_days) {
      return false;
    }
    
    // グローバル設定の曜日チェック
    const dayOfWeek = date.getDay();
    if (!reservationSettings.allowed_days.includes(dayOfWeek)) {
      return false;
    }
    
    // グローバル設定の休業日チェック
    const dateStr = formatDateForInput(date);
    if (reservationSettings.closed_dates && reservationSettings.closed_dates.includes(dateStr)) {
      return false;
    }

    // 店舗別の設定チェック（店舗が選択されている場合）
    if (selectedLocationId && locationAvailability) {
      // 店舗別の定休日チェック
      if (locationAvailability.regular_closed_days && locationAvailability.regular_closed_days.includes(dayOfWeek)) {
        return false;
      }
      
      // 店舗別の休業日チェック
      if (locationAvailability.closed_dates && locationAvailability.closed_dates.includes(dateStr)) {
        return false;
      }
    }
    
    return true;
  };

  const calendarDays = getDaysInMonth(currentMonth);
  const weekDays = ['日', '月', '火', '水', '木', '金', '土'];

  // 時間スロットを生成（30分間隔固定）
  const generateTimeSlots = () => {
    if (!reservationSettings) {
      // デフォルト: 9:00-18:00, 30分間隔
      const slots = [];
      for (let hour = 9; hour <= 18; hour++) {
        slots.push(`${hour.toString().padStart(2, '0')}:00`);
        if (hour < 18) {
          slots.push(`${hour.toString().padStart(2, '0')}:30`);
        }
      }
      return slots;
    }

    // 曜日ごとの営業時間をチェック
    let startTime = reservationSettings.business_hours_start;
    let endTime = reservationSettings.business_hours_end;
    
    if (selectedDate && reservationSettings.custom_hours) {
      const date = new Date(selectedDate + 'T00:00:00');
      const dayOfWeek = date.getDay();
      if (reservationSettings.custom_hours[dayOfWeek]) {
        startTime = reservationSettings.custom_hours[dayOfWeek].start;
        endTime = reservationSettings.custom_hours[dayOfWeek].end;
      }
    }

    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);
    
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;
    
    const slots = [];
    
    // 30分間隔でスロットを生成（固定）
    for (let minutes = startMinutes; minutes < endMinutes; minutes += 30) {
      const hour = Math.floor(minutes / 60);
      const minute = minutes % 60;
      slots.push(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
    }
    
    return slots;
  };

  const timeSlots = generateTimeSlots();

  // 選択されたメニューの所要時間を取得
  const getSelectedMenuDuration = () => {
    if (!selectedMenuId) return 60;
    const menu = menuItems.find(m => m.menu_item_id === selectedMenuId);
    return menu?.duration_minutes || 60;
  };

  // 時間をミリ秒に変換
  const timeToMinutes = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  };

  // 時間スロットの重複チェック
  const isTimeSlotAvailable = (timeSlot: string) => {
    // メニューが選択されている場合は、そのメニューの所要時間を使用
    // 選択されていない場合は、デフォルトの60分を使用して予約済みスロットをチェック
    const menuDuration = selectedMenuId ? getSelectedMenuDuration() : 60;
    const slotStart = timeToMinutes(timeSlot);
    const slotEnd = slotStart + menuDuration;

    // 同時予約可能数を取得（デフォルト1）
    const maxConcurrent = reservationSettings?.concurrent_reservations || 1;
    
    // この時間帯に重複する予約数をカウント
    let overlappingCount = 0;
    
    for (const booked of bookedSlots) {
      const bookedStart = timeToMinutes(booked.time);
      const bookedEnd = bookedStart + booked.duration;
      
      // 時間帯が重複するかチェック
      if (
        (slotStart >= bookedStart && slotStart < bookedEnd) ||
        (slotEnd > bookedStart && slotEnd <= bookedEnd) ||
        (slotStart <= bookedStart && slotEnd >= bookedEnd)
      ) {
        overlappingCount++;
      }
    }
    
    // 重複予約数が同時予約可能数を超えている場合は予約不可
    if (overlappingCount >= maxConcurrent) {
      return false;
    }
    
    return true;
  };

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
            <div className="flex-1"></div>
            <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center">
              <h1 
                style={{ 
                  fontFamily: "'Noto Serif JP', serif", 
                  color: '#2C2C2C',
                  fontSize: '1.75rem',
                  letterSpacing: '0.15em',
                  fontWeight: '400'
                }}
              >
                amoré​tto
              </h1>
            </div>
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
          <div className="flex items-center justify-center gap-2 md:gap-4 mt-2" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#666666', fontSize: '0.875rem' }}>
            <div className="flex items-center">
              <span className="w-8 md:w-10 text-center whitespace-nowrap">日時選択</span>
            </div>
            <div className="w-12 md:w-20 h-0.5 mx-1 md:mx-2"></div>
            <div className="flex items-center">
              <span className="w-8 md:w-10 text-center whitespace-nowrap">お客様情報</span>
            </div>
            <div className="w-12 md:w-20 h-0.5 mx-1 md:mx-2"></div>
            <div className="flex items-center">
              <span className="w-8 md:w-10 text-center whitespace-nowrap">確認</span>
            </div>
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
                  {/* カレンダーヘッダー */}
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-4">
                      {/* カレンダーナビゲーション */}
                      <button
                        onClick={previousMonth}
                        className="p-2 rounded-lg transition-all duration-300 hover:bg-[#C4A962] hover:bg-opacity-10 hover:scale-110"
                        style={{ color: '#C4A962' }}
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <h4 style={{ fontFamily: "'Noto Serif JP', serif", color: '#2C2C2C' }}>
                        {currentMonth.getFullYear()}年 {currentMonth.getMonth() + 1}月
                      </h4>
                      
                      {/* 店舗選択ドロップダウン（右上） */}
                      <div className="flex items-center gap-2">
                        <label className="hidden md:flex items-center gap-1.5 text-sm" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#666666' }}>
                          <MapPin className="w-3.5 h-3.5" style={{ color: '#C4A962' }} />
                          店舗
                        </label>
                        <select
                          value={selectedLocationId}
                          onChange={(e) => setSelectedLocationId(e.target.value)}
                          className="px-3 py-1.5 md:px-4 md:py-2 border rounded-lg transition-all duration-300 focus:outline-none focus:border-[#C4A962] focus:ring-1 focus:ring-[#C4A962] text-sm md:text-base"
                          style={{
                            backgroundColor: '#FFFFFF',
                            borderColor: selectedLocationId ? '#C4A962' : '#E5E0D8',
                            fontFamily: "'Noto Sans JP', sans-serif",
                            color: '#2C2C2C',
                            minWidth: '120px'
                          }}
                        >
                          <option value="">店舗を選択</option>
                          {locations.map((location) => {
                            // 他の店舗に予約がある場合、その店舗以外は選択不可
                            const hasOtherLocationBooking = bookedLocationIds.length > 0 && !bookedLocationIds.includes(location.location_id);
                            const isLocationAvailable = !hasOtherLocationBooking;
                            
                            return (
                              <option 
                                key={location.location_id} 
                                value={location.location_id}
                                disabled={!isLocationAvailable}
                              >
                                {location.location_name}{!isLocationAvailable ? ' (選択不可)' : ''}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                      
                      <button
                        onClick={nextMonth}
                        className="p-2 rounded-lg transition-all duration-300 hover:bg-[#C4A962] hover:bg-opacity-10 hover:scale-110"
                        style={{ color: '#C4A962' }}
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>
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
                            onClick={() => isDateAvailableForReservation(date) && setSelectedDate(formatDateForInput(date))}
                            disabled={!isDateAvailableForReservation(date)}
                            className={`w-full aspect-square flex items-center justify-center text-sm rounded-lg transition-all duration-300 ${
                              selectedDate === formatDateForInput(date)
                                ? 'text-white scale-105 shadow-md'
                                : !isDateAvailableForReservation(date)
                                ? 'opacity-30 cursor-not-allowed'
                                : 'hover:bg-[#C4A962] hover:bg-opacity-10 hover:scale-105 hover:shadow-sm'
                            }`}
                            style={{
                              fontFamily: "'Noto Sans JP', sans-serif",
                              backgroundColor: selectedDate === formatDateForInput(date) ? '#C4A962' : isToday(date) ? '#F8F6F3' : 'transparent',
                              color: selectedDate === formatDateForInput(date) ? '#FFFFFF' : '#2C2C2C'
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
                      {bookedSlots.length > 0 && (
                        <span className="ml-3 text-xs" style={{ color: '#999999' }}>
                          （×印は予約不可）
                        </span>
                      )}
                    </label>
                    <div className="grid grid-cols-3 md:grid-cols-5 gap-2 md:gap-3">
                      {timeSlots.map((time) => {
                        const isAvailable = isTimeSlotAvailable(time);
                        return (
                          <button
                            key={time}
                            onClick={() => isAvailable && setSelectedTime(time)}
                            disabled={!isAvailable}
                            className={`py-2.5 md:py-3 rounded-md transition-all duration-300 ${
                              !isAvailable
                                ? 'opacity-40 cursor-not-allowed'
                                : selectedTime === time 
                                ? 'text-white shadow-md scale-105' 
                                : 'border hover:border-[#C4A962] hover:bg-[#C4A962] hover:bg-opacity-5 hover:scale-105'
                            }`}
                            style={{
                              fontFamily: "'Noto Sans JP', sans-serif",
                              backgroundColor: !isAvailable ? '#E5E5E5' : selectedTime === time ? '#C4A962' : 'transparent',
                              color: !isAvailable ? '#999999' : selectedTime === time ? '#FFFFFF' : '#2C2C2C',
                              borderColor: '#E5E0D8',
                              letterSpacing: '0.05em'
                            }}
                          >
                            {time}
                            {!isAvailable && (
                              <span className="block text-xs mt-0.5">×</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* フォーム入力 */}
              <div>
                <h3 className="mb-6" style={{ fontFamily: "'Noto Serif JP', serif", color: '#2C2C2C', borderBottom: '1px solid #E5E0D8', paddingBottom: '0.75rem' }}>
                  日時を直接入力
                </h3>
                <div className="p-5 rounded-lg" style={{ backgroundColor: '#F8F6F3' }}>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block mb-2 flex items-center gap-2" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#2C2C2C' }}>
                        <Calendar className="w-4 h-4" style={{ color: '#C4A962' }} />
                        日付
                      </label>
                      <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                        className="w-full px-4 py-3 border rounded-md transition-all duration-300 focus:outline-none focus:border-[#C4A962]"
                        style={{
                          backgroundColor: '#FFFFFF',
                          borderColor: '#E5E0D8',
                          fontFamily: "'Noto Sans JP', sans-serif",
                          color: '#2C2C2C'
                        }}
                      />
                    </div>
                    <div>
                      <label className="block mb-2 flex items-center gap-2" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#2C2C2C' }}>
                        <Clock className="w-4 h-4" style={{ color: '#C4A962' }} />
                        時間
                      </label>
                      <select
                        value={selectedTime}
                        onChange={(e) => setSelectedTime(e.target.value)}
                        className="w-full px-4 py-3 border rounded-md transition-all duration-300 focus:outline-none focus:border-[#C4A962]"
                        style={{
                          backgroundColor: '#FFFFFF',
                          borderColor: '#E5E0D8',
                          fontFamily: "'Noto Sans JP', sans-serif",
                          color: '#2C2C2C'
                        }}
                      >
                        <option value="">時間を選択</option>
                        {timeSlots.map((time) => {
                          const isAvailable = isTimeSlotAvailable(time);
                          return (
                            <option key={time} value={time} disabled={!isAvailable}>
                              {time} {!isAvailable ? '(×)' : ''}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* メニュー選択 */}
              <div>
                <h3 className="mb-6" style={{ fontFamily: "'Noto Serif JP', serif", color: '#2C2C2C', borderBottom: '1px solid #E5E0D8', paddingBottom: '0.75rem' }}>
                  メニューをお選びください
                  {selectedLocationId && (
                    <span className="ml-3 text-sm" style={{ color: '#666666', fontFamily: "'Noto Sans JP', sans-serif", fontWeight: 'normal' }}>
                      （{locations.find(l => l.location_id === selectedLocationId)?.location_name}のメニュー）
                    </span>
                  )}
                </h3>
                <div className="grid md:grid-cols-2 gap-4 md:gap-5">
                  {menuItems.length === 0 ? (
                    <div className="md:col-span-2 p-8 text-center rounded-lg" style={{ backgroundColor: '#F8F6F3', color: '#666666', fontFamily: "'Noto Sans JP', sans-serif" }}>
                      <div className="mb-2">メニューが登録されていません</div>
                      {selectedLocationId && (
                        <div className="text-sm" style={{ color: '#999999' }}>
                          この店舗ではご利用いただけるメニューがありません
                        </div>
                      )}
                    </div>
                  ) : (
                    menuItems.map((menu) => {
                      const hasActiveDiscount = menu.discount_type && menu.discount_type !== 'none' && 
                        (!menu.discount_end_date || new Date(menu.discount_end_date) >= new Date());
                      
                      const calculateDiscountedPrice = (price: number) => {
                        if (!hasActiveDiscount) return price;
                        if (menu.discount_type === 'percentage') {
                          return Math.floor(price * (1 - menu.discount_value / 100));
                        } else if (menu.discount_type === 'fixed') {
                          return Math.max(0, price - menu.discount_value);
                        }
                        return price;
                      };

                      const discountedBasePrice = calculateDiscountedPrice(menu.base_price);

                      return (
                        <button
                          key={menu.menu_item_id}
                          onClick={() => setSelectedMenuId(menu.menu_item_id)}
                          className={`p-4 md:p-5 text-left rounded-lg transition-all duration-300 border ${
                            selectedMenuId === menu.menu_item_id
                              ? 'border-[#C4A962] shadow-lg scale-[1.02] ring-2 ring-[#C4A962] ring-opacity-20'
                              : 'border-[#E5E0D8] hover:border-[#C4A962] hover:shadow-md hover:scale-[1.01]'
                          }`}
                          style={{
                            backgroundColor: selectedMenuId === menu.menu_item_id ? '#FAFAF8' : '#FFFFFF',
                            position: 'relative'
                          }}
                        >
                          {/* 選択チェックマーク */}
                          {selectedMenuId === menu.menu_item_id && (
                            <div 
                              className="absolute -top-2 -right-2 w-7 h-7 rounded-full flex items-center justify-center shadow-md"
                              style={{ backgroundColor: '#C4A962', color: '#FFFFFF' }}
                            >
                              <Heart className="w-4 h-4" style={{ fill: '#FFFFFF' }} />
                            </div>
                          )}
                          
                          {/* 割引バッジ */}
                          {hasActiveDiscount && (
                            <div 
                              className="absolute -top-2 -left-2 px-2.5 py-1 rounded-full shadow-md flex items-center gap-1"
                              style={{ backgroundColor: '#DC2626', color: '#FFFFFF', fontFamily: "'Noto Sans JP', sans-serif" }}
                            >
                              <Tag className="w-3 h-3" />
                              <span className="text-xs">
                                {menu.discount_type === 'percentage' 
                                  ? `${menu.discount_value}% OFF`
                                  : `¥${menu.discount_value.toLocaleString()} OFF`
                                }
                              </span>
                            </div>
                          )}
                          
                          <div className="space-y-3">
                            {/* メニュー名 */}
                            <div style={{ fontFamily: "'Noto Serif JP', serif", color: '#2C2C2C', fontSize: '1.1rem' }}>
                              {menu.name}
                            </div>
                            
                            {/* 説明文 */}
                            {menu.description && (
                              <div className="text-sm" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#666666', lineHeight: '1.7' }}>
                                {menu.description}
                              </div>
                            )}
                            
                            {/* 所要時間 */}
                            <div className="flex items-center gap-1.5 text-sm" style={{ color: '#C4A962', fontFamily: "'Noto Sans JP', sans-serif" }}>
                              <Clock className="w-3.5 h-3.5" />
                              <span>約{menu.duration_minutes || 60}分</span>
                            </div>
                            
                            {/* 価格 */}
                            <div className="pt-2 border-t" style={{ borderColor: '#E5E0D8' }}>
                              {hasActiveDiscount ? (
                                <div className="space-y-1">
                                  <div className="flex items-baseline gap-2">
                                    <div style={{ fontFamily: "'Noto Serif JP', serif", color: '#DC2626', fontSize: '1.75rem', lineHeight: '1' }}>
                                      ¥{discountedBasePrice.toLocaleString()}
                                    </div>
                                    <span style={{ fontSize: '0.875rem', color: '#666666' }}>+税</span>
                                  </div>
                                  <div style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#999999', fontSize: '0.875rem', textDecoration: 'line-through' }}>
                                    通常価格 ¥{menu.base_price.toLocaleString()}
                                  </div>
                                  {menu.discount_end_date && (
                                    <div className="text-xs" style={{ color: '#DC2626', fontFamily: "'Noto Sans JP', sans-serif" }}>
                                      {new Date(menu.discount_end_date).toLocaleDateString('ja-JP')}まで
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="flex items-baseline gap-2">
                                  <div style={{ fontFamily: "'Noto Serif JP', serif", color: '#C4A962', fontSize: '1.75rem', lineHeight: '1' }}>
                                    ¥{menu.base_price.toLocaleString()}
                                  </div>
                                  <span style={{ fontSize: '0.875rem', color: '#666666' }}>+税</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
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
                  className="px-10 md:px-12 py-3.5 md:py-4 rounded-md transition-all duration-300 hover:shadow-lg hover:scale-105"
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

              {/* 保護者名フリガナ */}
              <div>
                <label className="block mb-2" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#2C2C2C' }}>
                  保護者様のお名前（フリガナ） <span style={{ color: '#C4A962' }}>*</span>
                </label>
                <input
                  type="text"
                  value={parentNameKana}
                  onChange={(e) => setParentNameKana(e.target.value)}
                  placeholder="ヤマダ ハナコ"
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

              {/* お子様名フリガナ */}
              <div>
                <label className="block mb-2" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#2C2C2C' }}>
                  お子様のお名前（フリガナ） <span style={{ color: '#C4A962' }}>*</span>
                </label>
                <input
                  type="text"
                  value={childNameKana}
                  onChange={(e) => setChildNameKana(e.target.value)}
                  placeholder="ヤマダ タロウ"
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
                <div className={childAgeYears === '0' ? "grid grid-cols-2 gap-3" : ""}>
                  <div>
                    <input
                      type="number"
                      min="0"
                      max="20"
                      value={childAgeYears}
                      onChange={(e) => {
                        setChildAgeYears(e.target.value);
                        // 0歳以外になったらカ月をリセット
                        if (e.target.value !== '0') {
                          setChildAgeMonths('');
                        }
                      }}
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
                  {childAgeYears === '0' && (
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
                  )}
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
                  className="flex-1 py-3.5 md:py-4 border rounded-md transition-all duration-300 hover:shadow-md hover:scale-105 text-center"
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
                    if (!parentName || !parentNameKana || !childName || !childNameKana || !phone || !email) {
                      toast.error('必須項目を入力してください');
                      return;
                    }
                    setStep(3);
                  }}
                  className="flex-1 py-3.5 md:py-4 rounded-md transition-all duration-300 hover:shadow-lg hover:scale-105 text-center"
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
                        {(() => {
                          const selectedMenu = menuItems.find(m => m.menu_item_id === selectedMenuId);
                          if (!selectedMenu) return '-';
                          
                          const hasActiveDiscount = selectedMenu.discount_type && selectedMenu.discount_type !== 'none' && 
                            (!selectedMenu.discount_end_date || new Date(selectedMenu.discount_end_date) >= new Date());
                          
                          const calculateDiscountedPrice = (price: number) => {
                            if (!hasActiveDiscount) return price;
                            if (selectedMenu.discount_type === 'percentage') {
                              return Math.floor(price * (1 - selectedMenu.discount_value / 100));
                            } else if (selectedMenu.discount_type === 'fixed') {
                              return Math.max(0, price - selectedMenu.discount_value);
                            }
                            return price;
                          };

                          const discountedBasePrice = calculateDiscountedPrice(selectedMenu.base_price);

                          return (
                            <>
                              <div>{selectedMenu.name}</div>
                              <div className="flex items-center gap-3 mt-2 flex-wrap">
                                {hasActiveDiscount ? (
                                  <>
                                    <span style={{ color: '#999999', textDecoration: 'line-through', fontSize: '0.875rem' }}>
                                      ¥{selectedMenu.base_price.toLocaleString()}
                                      <span style={{ fontSize: '0.7rem', marginLeft: '0.25rem' }}>+TAX</span>
                                    </span>
                                    <span style={{ color: '#DC2626' }}>
                                      ¥{discountedBasePrice.toLocaleString()}
                                      <span style={{ fontSize: '0.8rem', marginLeft: '0.25rem' }}>+TAX</span>
                                    </span>
                                    <span 
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                                      style={{ backgroundColor: '#DC2626', color: '#FFFFFF' }}
                                    >
                                      <Tag className="w-3 h-3" />
                                      {selectedMenu.discount_type === 'percentage' 
                                        ? `${selectedMenu.discount_value}% OFF`
                                        : `¥${selectedMenu.discount_value.toLocaleString()} OFF`
                                      }
                                    </span>
                                    {selectedMenu.apply_discount_to_additional && (
                                      <span 
                                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs"
                                        style={{ backgroundColor: '#DBEAFE', color: '#1E40AF' }}
                                      >
                                        追加の型取にも適用
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <span style={{ color: '#C4A962' }}>
                                    ¥{selectedMenu.base_price.toLocaleString()}
                                    <span style={{ fontSize: '0.8rem', marginLeft: '0.25rem' }}>+TAX</span>
                                  </span>
                                )}
                              </div>
                            </>
                          );
                        })()}
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
                      <div className="text-sm mt-1" style={{ color: '#666666' }}>（{parentNameKana}）</div>
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
                      <div className="text-sm mt-1" style={{ color: '#666666' }}>（{childNameKana}）</div>
                    </div>

                    <div>
                      <div className="text-sm mb-1" style={{ color: '#666666' }}>ご連絡先</div>
                      <div style={{ color: '#2C2C2C' }}>{phone}</div>
                      <div style={{ color: '#2C2C2C' }}>{email}</div>
                    </div>



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
                  className="flex-1 py-3.5 md:py-4 border rounded-md transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-md hover:scale-105 disabled:hover:shadow-none disabled:hover:scale-100 text-center"
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
                  className="flex-1 py-3.5 md:py-4 rounded-md transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:scale-105 disabled:hover:shadow-none disabled:hover:scale-100 text-center"
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
          <div className="mb-4 flex flex-col items-center">
            <h2 
              className="mb-3"
              style={{ 
                fontFamily: "'Noto Serif JP', serif", 
                color: '#2C2C2C',
                fontSize: '1.5rem',
                letterSpacing: '0.15em',
                fontWeight: '400'
              }}
            >
              amoré​tto
            </h2>
            <p className="text-sm" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: '#666666' }}>
              LifeCasting™studio
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
