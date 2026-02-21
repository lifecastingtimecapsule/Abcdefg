import { useState, useEffect } from 'react';
import { Calendar, Clock, Save, Settings, Plus, X, AlertCircle, Users, Ban } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { apiRequest } from '../utils/api';

interface ReservationSettings {
  reservation_settings_id: string;
  allowed_days: number[]; // 0=日曜, 1=月曜, ..., 6=土曜
  business_hours_start: string; // "09:00"
  business_hours_end: string; // "18:00"
  advance_reservation_days: number; // 何日前から予約可能か
  max_reservation_days: number; // 何日先まで予約可能か
  max_reservations_per_day?: number; // 1日の最大予約数
  concurrent_reservations?: number; // 同時予約可能数
  closed_dates?: string[]; // 休業日 (YYYY-MM-DD)
  custom_hours?: { [key: number]: { start: string; end: string } }; // 曜日ごとの営業時間
  updated_at: string;
}

export function ReservationSettingsPage() {
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<ReservationSettings | null>(null);
  const [allowedDays, setAllowedDays] = useState<boolean[]>([true, true, true, true, true, true, true]); // 日～土
  const [businessHoursStart, setBusinessHoursStart] = useState('09:00');
  const [businessHoursEnd, setBusinessHoursEnd] = useState('18:00');
  const [advanceReservationDays, setAdvanceReservationDays] = useState(3);
  const [maxReservationDays, setMaxReservationDays] = useState(90);
  
  // 新機能の状態
  const [maxReservationsPerDay, setMaxReservationsPerDay] = useState(10);
  const [concurrentReservations, setConcurrentReservations] = useState(1);
  const [closedDates, setClosedDates] = useState<string[]>([]);
  const [newClosedDate, setNewClosedDate] = useState('');
  const [useCustomHours, setUseCustomHours] = useState(false);
  const [customHours, setCustomHours] = useState<{ [key: number]: { start: string; end: string } }>({});

  const dayLabels = ['日', '月', '火', '水', '木', '金', '土'];

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const response = await apiRequest('/reservation-settings');
      if (response.settings) {
        setSettings(response.settings);
        
        // 曜日設定を配列に変換
        const days = [false, false, false, false, false, false, false];
        response.settings.allowed_days.forEach((day: number) => {
          days[day] = true;
        });
        setAllowedDays(days);
        
        setBusinessHoursStart(response.settings.business_hours_start || '09:00');
        setBusinessHoursEnd(response.settings.business_hours_end || '18:00');
        setAdvanceReservationDays(response.settings.advance_reservation_days ?? 3);
        setMaxReservationDays(response.settings.max_reservation_days || 90);
        
        // 新機能の値を読み込み
        setMaxReservationsPerDay(response.settings.max_reservations_per_day || 10);
        setConcurrentReservations(response.settings.concurrent_reservations || 1);
        setClosedDates(response.settings.closed_dates || []);
        
        if (response.settings.custom_hours && Object.keys(response.settings.custom_hours).length > 0) {
          setUseCustomHours(true);
          setCustomHours(response.settings.custom_hours);
        }
      }
    } catch (err: any) {
      console.error('設定の読み込みに失敗:', err);
      toast.error('設定の読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      
      // 曜日の配列を数値配列に変換
      const allowedDayNumbers = allowedDays
        .map((allowed, index) => (allowed ? index : -1))
        .filter((day) => day !== -1);

      if (allowedDayNumbers.length === 0) {
        toast.error('最低1つの曜日を選択してください');
        return;
      }

      const settingsData = {
        allowed_days: allowedDayNumbers,
        business_hours_start: businessHoursStart,
        business_hours_end: businessHoursEnd,
        advance_reservation_days: advanceReservationDays,
        max_reservation_days: maxReservationDays,
        max_reservations_per_day: maxReservationsPerDay,
        concurrent_reservations: concurrentReservations,
        closed_dates: closedDates,
        custom_hours: useCustomHours ? customHours : {},
      };

      await apiRequest('/reservation-settings', {
        method: 'PUT',
        body: JSON.stringify(settingsData),
      });

      toast.success('予約設定を保存しました');
      loadSettings();
    } catch (err: any) {
      console.error('設定の保存に失敗:', err);
      toast.error(err.message || '設定の保存に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleDayToggle = (index: number) => {
    const newDays = [...allowedDays];
    newDays[index] = !newDays[index];
    setAllowedDays(newDays);
  };

  const addClosedDate = () => {
    if (!newClosedDate) {
      toast.error('休業日を選択してください');
      return;
    }
    if (closedDates.includes(newClosedDate)) {
      toast.error('この日付は既に追加されています');
      return;
    }
    setClosedDates([...closedDates, newClosedDate].sort());
    setNewClosedDate('');
    toast.success('休業日を追加しました');
  };

  const removeClosedDate = (date: string) => {
    setClosedDates(closedDates.filter(d => d !== date));
    toast.success('休業日を削除しました');
  };

  const formatDateJP = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  };

  const updateCustomHours = (dayIndex: number, field: 'start' | 'end', value: string) => {
    setCustomHours({
      ...customHours,
      [dayIndex]: {
        ...customHours[dayIndex],
        start: field === 'start' ? value : customHours[dayIndex]?.start || businessHoursStart,
        end: field === 'end' ? value : customHours[dayIndex]?.end || businessHoursEnd,
      }
    });
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 md:p-8 space-y-8 pb-24">
        {/* 予約可能曜日 */}
        <section className="rounded-xl border border-slate-200 p-5 bg-slate-50/50">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800 mb-3">
            <Calendar className="w-4 h-4 text-blue-600" />
            予約可能曜日
          </h2>
          <p className="text-xs text-slate-500 mb-4">予約を受け付ける曜日を選んでください</p>
          <div className="grid grid-cols-7 gap-2">
            {dayLabels.map((day, index) => (
              <button
                key={index}
                onClick={() => handleDayToggle(index)}
                className={`py-3 px-2 rounded-lg border-2 transition-all ${
                  allowedDays[index]
                    ? 'bg-blue-50 border-blue-500 text-blue-700'
                    : 'bg-slate-50 border-slate-300 text-slate-400'
                }`}
              >
                {day}
              </button>
            ))}
          </div>
        </section>

        {/* 営業時間 */}
        <section className="rounded-xl border border-slate-200 p-5 bg-slate-50/50">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800 mb-1">
            <Clock className="w-4 h-4 text-blue-600" />
            基本営業時間
          </h2>
          <p className="text-xs text-slate-500 mb-4">共通の営業開始・終了時刻</p>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
                <Clock className="w-4 h-4" />
                営業開始時刻
              </label>
              <input
                type="time"
                value={businessHoursStart}
                onChange={(e) => setBusinessHoursStart(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
                <Clock className="w-4 h-4" />
                営業終了時刻
              </label>
              <input
                type="time"
                value={businessHoursEnd}
                onChange={(e) => setBusinessHoursEnd(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

        {/* 曜日ごとの営業時間 */}
        <div className="border-t border-slate-200 pt-6 mt-6">
          <div className="flex items-center justify-between mb-4">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <Calendar className="w-4 h-4" />
              曜日ごとの営業時間設定
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useCustomHours}
                onChange={(e) => setUseCustomHours(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-600">個別設定を有効化</span>
            </label>
          </div>
          
          {useCustomHours && (
            <div className="space-y-3 bg-slate-50 p-4 rounded-lg">
              {dayLabels.map((day, index) => (
                allowedDays[index] && (
                  <div key={index} className="grid grid-cols-3 gap-3 items-center">
                    <span className="text-sm font-medium text-slate-700">{day}曜日</span>
                    <input
                      type="time"
                      value={customHours[index]?.start || businessHoursStart}
                      onChange={(e) => updateCustomHours(index, 'start', e.target.value)}
                      className="px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="time"
                      value={customHours[index]?.end || businessHoursEnd}
                      onChange={(e) => updateCustomHours(index, 'end', e.target.value)}
                      className="px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )
              ))}
            </div>
          )}
        </div>
        </section>

        {/* 予約受付期間 */}
        <section className="rounded-xl border border-slate-200 p-5 bg-slate-50/50">
          <h2 className="text-sm font-semibold text-slate-800 mb-1">予約受付期間</h2>
          <p className="text-xs text-slate-500 mb-4">何日先から・何日先まで予約可能にするか</p>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">
              何日前まで予約不可
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="30"
                value={advanceReservationDays}
                onChange={(e) => setAdvanceReservationDays(parseInt(e.target.value) || 0)}
                className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-600">日前</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {advanceReservationDays === 0 ? (
                <span className="text-green-600">※ 当日から予約可能です</span>
              ) : advanceReservationDays === 1 ? (
                <span>※ 明日以降の予約が可能です（当日予約不可）</span>
              ) : (
                <span>※ {advanceReservationDays}日後以降の予約が可能です</span>
              )}
            </p>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">
              予約受付最大日数
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="7"
                max="365"
                value={maxReservationDays}
                onChange={(e) => setMaxReservationDays(parseInt(e.target.value) || 90)}
                className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-600">日先まで</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              ※ {maxReservationDays}日先までの予約を受け付けます
            </p>
          </div>
        </div>
        </section>

        {/* 予約制限 */}
        <section className="rounded-xl border border-slate-200 p-5 bg-slate-50/50">
          <h2 className="text-sm font-semibold text-slate-800 mb-1 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-blue-600" />
            予約数の制限
          </h2>
          <p className="text-xs text-slate-500 mb-4">1日あたり・同時刻あたりの上限</p>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">
                1日の最大予約数
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={maxReservationsPerDay}
                  onChange={(e) => setMaxReservationsPerDay(parseInt(e.target.value) || 10)}
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-600">件</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                ※ 1日に受け付ける予約の上限
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block flex items-center gap-2">
                <Users className="w-4 h-4" />
                同時予約可能数
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={concurrentReservations}
                  onChange={(e) => setConcurrentReservations(parseInt(e.target.value) || 1)}
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-600">組</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                ※ 同じ時間帯に予約可能な組数
            </p>
          </div>
        </div>
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs text-blue-800">
              <strong>予約時間枠について：</strong>時間枠は30分間隔で自動生成されます。各メニューの所要時間により予約可能な枠が調整されます。
            </p>
          </div>
        </section>

        {/* 休業日設定 */}
        <section className="rounded-xl border border-slate-200 p-5 bg-slate-50/50">
          <h2 className="text-sm font-semibold text-slate-800 mb-1 flex items-center gap-2">
            <Ban className="w-4 h-4 text-blue-600" />
            休業日の設定
          </h2>
          <p className="text-xs text-slate-500 mb-4">臨時休業日を追加（祝日など）</p>
          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                type="date"
                value={newClosedDate}
                onChange={(e) => setNewClosedDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={addClosedDate}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                追加
              </button>
            </div>
            
            {closedDates.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-slate-600">登録済み休業日（{closedDates.length}件）</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                  {closedDates.map((date) => (
                    <div
                      key={date}
                      className="flex items-center justify-between px-3 py-2 bg-red-50 border border-red-200 rounded-lg"
                    >
                      <span className="text-sm text-slate-700">{formatDateJP(date)}</span>
                      <button
                        onClick={() => removeClosedDate(date)}
                        className="text-red-600 hover:text-red-800 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500 py-4 text-center bg-slate-50 rounded-lg">
                休業日は設定されていません
              </p>
            )}
          </div>
        </section>
        </div>

        {/* 固定保存バー */}
        <div className="sticky bottom-0 left-0 right-0 border-t border-slate-200 bg-white/95 backdrop-blur-sm px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-slate-500">変更後は必ず保存してください</p>
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 font-medium shadow-sm flex items-center gap-2"
          >
            <Save className="w-5 h-5" />
            {loading ? '保存中...' : '設定を保存'}
          </button>
        </div>
      </div>

      {/* 設定の説明 */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h3 className="text-sm font-medium text-blue-900 mb-2 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          設定のヒント
        </h3>
        <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside">
          <li>曜日ごとの営業時間を設定すると、基本営業時間より優先されます</li>
          <li>同時予約可能数を2以上にすると、同じ時間帯に複数のスタッフで対応できます</li>
          <li>1日の最大予約数に達すると、その日は予約不可となります</li>
          <li>休業日は公開予約ページのカレンダーで選択できなくなります</li>
          <li>時間枠は30分間隔で表示され、メニューの所要時間により自動調整されます</li>
        </ul>
      </div>
    </div>
  );
}
