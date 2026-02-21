import { useState, useEffect } from 'react';
import { Calendar, Clock, Save, MapPin, Plus, X, AlertCircle, Ban, Check } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { apiRequest } from '../utils/api';

interface Location {
  location_id: string;
  location_name: string;
}

interface LocationAvailability {
  location_id: string;
  regular_closed_days?: number[]; // 定休日 0=日曜, 1=月曜, ..., 6=土曜
  business_hours_start?: string; // デフォルト営業開始時間
  business_hours_end?: string; // デフォルト営業終了時間
  custom_hours?: { [day: number]: { start: string; end: string } }; // 曜日別営業時間
  closed_dates?: string[]; // 特定日の休業 (YYYY-MM-DD)
  special_dates?: { [date: string]: { start: string; end: string } }; // 特定日の営業時間
  max_reservations_per_day?: number;
  updated_at?: string;
}

export function LocationAvailabilityPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // 設定項目
  const [regularClosedDays, setRegularClosedDays] = useState<boolean[]>([false, false, false, false, false, false, false]); // 日～土
  const [businessHoursStart, setBusinessHoursStart] = useState('09:00');
  const [businessHoursEnd, setBusinessHoursEnd] = useState('18:00');
  const [useCustomHours, setUseCustomHours] = useState(false);
  const [customHours, setCustomHours] = useState<{ [day: number]: { start: string; end: string } }>({});
  const [closedDates, setClosedDates] = useState<string[]>([]);
  const [newClosedDate, setNewClosedDate] = useState('');
  const [specialDates, setSpecialDates] = useState<{ [date: string]: { start: string; end: string } }>({});
  const [newSpecialDate, setNewSpecialDate] = useState('');
  const [newSpecialStart, setNewSpecialStart] = useState('09:00');
  const [newSpecialEnd, setNewSpecialEnd] = useState('18:00');
  const [maxReservationsPerDay, setMaxReservationsPerDay] = useState(10);

  const dayLabels = ['日', '月', '火', '水', '木', '金', '土'];

  useEffect(() => {
    loadLocations();
  }, []);

  useEffect(() => {
    if (selectedLocationId) {
      loadLocationAvailability(selectedLocationId);
    }
  }, [selectedLocationId]);

  const loadLocations = async () => {
    try {
      const result = await apiRequest('/locations');
      setLocations(result.locations || []);
      if (result.locations.length > 0) {
        setSelectedLocationId(result.locations[0].location_id);
      }
    } catch (err: any) {
      console.error('店舗一覧の読み込みエラー:', err);
      toast.error('店舗一覧の読み込みに失敗しました');
    }
  };

  const loadLocationAvailability = async (locationId: string) => {
    try {
      setLoading(true);
      const response = await apiRequest(`/location-availability/${locationId}`);
      
      if (response.availability) {
        const avail = response.availability;
        
        // 定休日を配列に変換
        const closedDaysArr = [false, false, false, false, false, false, false];
        if (avail.regular_closed_days) {
          avail.regular_closed_days.forEach((day: number) => {
            closedDaysArr[day] = true;
          });
        }
        setRegularClosedDays(closedDaysArr);
        
        setBusinessHoursStart(avail.business_hours_start || '09:00');
        setBusinessHoursEnd(avail.business_hours_end || '18:00');
        
        if (avail.custom_hours && Object.keys(avail.custom_hours).length > 0) {
          setUseCustomHours(true);
          setCustomHours(avail.custom_hours);
        } else {
          setUseCustomHours(false);
          setCustomHours({});
        }
        
        setClosedDates(avail.closed_dates || []);
        setSpecialDates(avail.special_dates || {});
        setMaxReservationsPerDay(avail.max_reservations_per_day || 10);
      } else {
        // デフォルト値にリセット
        resetToDefault();
      }
    } catch (err: any) {
      console.error('設定の読み込みエラー:', err);
      toast.error('設定の読み込みに失敗しました');
      resetToDefault();
    } finally {
      setLoading(false);
    }
  };

  const resetToDefault = () => {
    setRegularClosedDays([false, false, false, false, false, false, false]);
    setBusinessHoursStart('09:00');
    setBusinessHoursEnd('18:00');
    setUseCustomHours(false);
    setCustomHours({});
    setClosedDates([]);
    setSpecialDates({});
    setMaxReservationsPerDay(10);
  };

  const handleSave = async () => {
    if (!selectedLocationId) {
      toast.error('店舗を選択してください');
      return;
    }

    try {
      setSaving(true);
      
      const regularClosedDayNumbers = regularClosedDays
        .map((closed, index) => (closed ? index : -1))
        .filter((day) => day !== -1);

      const availabilityData: LocationAvailability = {
        location_id: selectedLocationId,
        regular_closed_days: regularClosedDayNumbers,
        business_hours_start: businessHoursStart,
        business_hours_end: businessHoursEnd,
        custom_hours: useCustomHours ? customHours : undefined,
        closed_dates: closedDates,
        special_dates: Object.keys(specialDates).length > 0 ? specialDates : undefined,
        max_reservations_per_day: maxReservationsPerDay,
      };

      await apiRequest('/location-availability', {
        method: 'POST',
        body: JSON.stringify(availabilityData),
      });

      toast.success('設定を保存しました');
    } catch (err: any) {
      console.error('設定の保存エラー:', err);
      toast.error(err.message || '設定の保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const toggleRegularClosedDay = (dayIndex: number) => {
    const newClosedDays = [...regularClosedDays];
    newClosedDays[dayIndex] = !newClosedDays[dayIndex];
    setRegularClosedDays(newClosedDays);
  };

  const addClosedDate = () => {
    if (!newClosedDate) {
      toast.error('日付を選択してください');
      return;
    }
    if (closedDates.includes(newClosedDate)) {
      toast.error('既に登録されています');
      return;
    }
    setClosedDates([...closedDates, newClosedDate].sort());
    setNewClosedDate('');
  };

  const removeClosedDate = (date: string) => {
    setClosedDates(closedDates.filter(d => d !== date));
  };

  const addSpecialDate = () => {
    if (!newSpecialDate) {
      toast.error('日付を選択してください');
      return;
    }
    if (specialDates[newSpecialDate]) {
      toast.error('既に登録されています');
      return;
    }
    setSpecialDates({
      ...specialDates,
      [newSpecialDate]: { start: newSpecialStart, end: newSpecialEnd }
    });
    setNewSpecialDate('');
    setNewSpecialStart('09:00');
    setNewSpecialEnd('18:00');
  };

  const removeSpecialDate = (date: string) => {
    const newSpecial = { ...specialDates };
    delete newSpecial[date];
    setSpecialDates(newSpecial);
  };

  const setCustomHourForDay = (day: number, start: string, end: string) => {
    setCustomHours({
      ...customHours,
      [day]: { start, end }
    });
  };

  const removeCustomHourForDay = (day: number) => {
    const newCustom = { ...customHours };
    delete newCustom[day];
    setCustomHours(newCustom);
  };

  const selectedLocation = locations.find(l => l.location_id === selectedLocationId);

  return (
    <div className="flex flex-col md:flex-row gap-6 max-w-6xl mx-auto">
      {/* 左: 店舗リスト（クリックで切り替え） */}
      <div className="md:w-56 flex-shrink-0">
        <p className="text-xs text-slate-500 mb-2">店舗を選んで設定を編集</p>
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          {locations.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">店舗がありません</p>
          ) : (
            locations.map((loc) => (
              <button
                key={loc.location_id}
                type="button"
                onClick={() => setSelectedLocationId(loc.location_id)}
                className={`w-full text-left px-4 py-3 border-b border-slate-100 last:border-b-0 flex items-center gap-2 transition ${
                  selectedLocationId === loc.location_id
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <MapPin className="w-4 h-4 flex-shrink-0 text-slate-400" />
                <span className="truncate">{loc.location_name}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* 右: 選択した店舗の設定 */}
      <div className="flex-1 min-w-0">
      {!selectedLocationId ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500">
          左の一覧から店舗を選んでください
        </div>
      ) : !loading ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 md:p-8 space-y-6 pb-24">
            {/* 基本営業時間 */}
            <div>
              <h2 className="flex items-center gap-2 text-slate-900 mb-4">
                <Clock className="w-5 h-5" />
                基本営業時間
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    開始時間
                  </label>
                  <input
                    type="time"
                    value={businessHoursStart}
                    onChange={(e) => setBusinessHoursStart(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    終了時間
                  </label>
                  <input
                    type="time"
                    value={businessHoursEnd}
                    onChange={(e) => setBusinessHoursEnd(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* 定休日設定 */}
            <div>
              <h2 className="flex items-center gap-2 text-slate-900 mb-4">
                <Ban className="w-5 h-5" />
                定休日設定
              </h2>
              <p className="text-sm text-slate-600 mb-4">
                毎週定休日となる曜日を選択してください
              </p>
              <div className="grid grid-cols-7 gap-2">
                {dayLabels.map((label, index) => (
                  <button
                    key={index}
                    onClick={() => toggleRegularClosedDay(index)}
                    className={`
                      px-4 py-3 rounded-xl border-2 transition-all
                      ${regularClosedDays[index]
                        ? 'bg-red-100 border-red-400 text-red-800'
                        : 'bg-white border-slate-300 text-slate-700 hover:border-slate-400'
                      }
                    `}
                  >
                    <div className="text-center">
                      <div className="text-sm">{label}</div>
                      {regularClosedDays[index] && (
                        <div className="text-xs mt-1">休業</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 曜日別営業時間 */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="flex items-center gap-2 text-slate-900">
                  <Clock className="w-5 h-5" />
                  曜日別営業時間
                </h2>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useCustomHours}
                    onChange={(e) => setUseCustomHours(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-700">曜日別に設定する</span>
                </label>
              </div>

              {useCustomHours && (
                <div className="space-y-3">
                  {dayLabels.map((label, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <div className="w-12 text-center">
                        <span className="text-sm font-medium text-slate-700">{label}</span>
                      </div>
                      {customHours[index] ? (
                        <>
                          <input
                            type="time"
                            value={customHours[index].start}
                            onChange={(e) => setCustomHourForDay(index, e.target.value, customHours[index].end)}
                            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <span className="text-slate-500">〜</span>
                          <input
                            type="time"
                            value={customHours[index].end}
                            onChange={(e) => setCustomHourForDay(index, customHours[index].start, e.target.value)}
                            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <button
                            onClick={() => removeCustomHourForDay(index)}
                            className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="flex-1 text-sm text-slate-500">基本営業時間を使用</div>
                          <button
                            onClick={() => setCustomHourForDay(index, businessHoursStart, businessHoursEnd)}
                            className="px-3 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors text-sm"
                          >
                            <Plus className="w-5 h-5" />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 特定日の休業設定 */}
            <div>
              <h2 className="flex items-center gap-2 text-slate-900 mb-4">
                <Calendar className="w-5 h-5" />
                特定日の休業設定
              </h2>
              <p className="text-sm text-slate-600 mb-4">
                臨時休業日や祝日などを設定してください
              </p>
              
              <div className="flex gap-3 mb-4">
                <input
                  type="date"
                  value={newClosedDate}
                  onChange={(e) => setNewClosedDate(e.target.value)}
                  className="flex-1 px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={addClosedDate}
                  className="px-6 py-3 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors flex items-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  追加
                </button>
              </div>

              {closedDates.length > 0 && (
                <div className="space-y-2">
                  {closedDates.sort().map((date) => (
                    <div
                      key={date}
                      className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-lg"
                    >
                      <span className="text-slate-900">
                        {new Date(date + 'T00:00:00').toLocaleDateString('ja-JP', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          weekday: 'short'
                        })}
                      </span>
                      <button
                        onClick={() => removeClosedDate(date)}
                        className="text-red-600 hover:bg-red-100 p-2 rounded-lg transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 特定日の営業時間設定 */}
            <div>
              <h2 className="flex items-center gap-2 text-slate-900 mb-4">
                <Clock className="w-5 h-5" />
                特定日の営業時間設定
              </h2>
              <p className="text-sm text-slate-600 mb-4">
                特定の日だけ営業時間を変更する場合に設定してください
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
                <input
                  type="date"
                  value={newSpecialDate}
                  onChange={(e) => setNewSpecialDate(e.target.value)}
                  className="px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="time"
                  value={newSpecialStart}
                  onChange={(e) => setNewSpecialStart(e.target.value)}
                  className="px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="time"
                  value={newSpecialEnd}
                  onChange={(e) => setNewSpecialEnd(e.target.value)}
                  className="px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={addSpecialDate}
                  className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  追加
                </button>
              </div>

              {Object.keys(specialDates).length > 0 && (
                <div className="space-y-2">
                  {Object.entries(specialDates).sort().map(([date, hours]) => (
                    <div
                      key={date}
                      className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg"
                    >
                      <div>
                        <span className="text-slate-900 font-medium">
                          {new Date(date + 'T00:00:00').toLocaleDateString('ja-JP', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            weekday: 'short'
                          })}
                        </span>
                        <span className="text-slate-600 ml-3">
                          {hours.start} 〜 {hours.end}
                        </span>
                      </div>
                      <button
                        onClick={() => removeSpecialDate(date)}
                        className="text-blue-600 hover:bg-blue-100 p-2 rounded-lg transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 1日の最大予約数 */}
            <div>
              <h2 className="flex items-center gap-2 text-slate-900 mb-4">
                <AlertCircle className="w-5 h-5" />
                1日の最大予約数
              </h2>
              <input
                type="number"
                min="1"
                max="100"
                value={maxReservationsPerDay}
                onChange={(e) => setMaxReservationsPerDay(parseInt(e.target.value) || 10)}
                className="w-full md:w-48 px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            </div>

            <div className="sticky bottom-0 left-0 right-0 border-t border-slate-200 bg-white/95 backdrop-blur-sm px-6 py-4 flex items-center justify-between gap-4">
              <p className="text-sm text-slate-500">{selectedLocation?.location_name} の設定</p>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 font-medium shadow-sm flex items-center gap-2"
              >
                <Save className="w-5 h-5" />
                {saving ? '保存中...' : '設定を保存'}
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="text-slate-600 mt-4">読み込み中...</p>
          </div>
        )}
      </div>
    </div>
  );
}
