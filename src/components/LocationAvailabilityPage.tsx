import { useState, useEffect, useMemo } from 'react';
import { Clock, Save, MapPin, Plus, X, AlertCircle, Ban, Layers, Calendar } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { apiRequest } from '../utils/api';

// ─── types ─────────────────────────────────────────────────────────────────

interface Location {
  location_id: string;
  location_name?: string;
  name?: string;
}

interface LocationAvailability {
  location_id: string;
  regular_closed_days?: number[];
  business_hours_start?: string;
  business_hours_end?: string;
  custom_hours?: Record<string, any>;
  closed_dates?: string[];
  special_dates?: Record<string, any>;
  max_reservations_per_day?: number;
}

// ─── helpers ────────────────────────────────────────────────────────────────

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

function fmt2(n: number) { return String(Math.floor(n)).padStart(2, '0'); }

function parseSpecialDates(sd: any): Record<string, any> {
  if (!sd) return {};
  if (typeof sd === 'string') { try { return JSON.parse(sd); } catch { return {}; } }
  return sd;
}

function buildTimeSlots(startH: number, endH: number, intervalH: number): string[] {
  const slots: string[] = [];
  for (let h = startH; h < endH; h += intervalH) {
    const hInt = Math.floor(h);
    const hMin = Math.round((h - hInt) * 60);
    slots.push(`${fmt2(hInt)}:${fmt2(hMin)}`);
  }
  return slots;
}

function parseHour(v: any, def: number): number {
  if (v === undefined || v === null) return def;
  if (typeof v === 'number') return v;
  const p = String(v).split(':');
  return parseInt(p[0], 10) + (parseInt(p[1] || '0', 10) / 60);
}

function formatDateJP(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
}

// ─── BasicSettingsTab ────────────────────────────────────────────────────────

interface BasicSettingsTabProps {
  availability: LocationAvailability | null;
  onSaved: (updated: LocationAvailability) => void;
}

function BasicSettingsTab({ availability, onSaved }: BasicSettingsTabProps) {
  const [regularClosedDays, setRegularClosedDays] = useState<boolean[]>(Array(7).fill(false));
  const [businessHoursStart, setBusinessHoursStart] = useState('09:00');
  const [businessHoursEnd, setBusinessHoursEnd] = useState('18:00');
  const [slotIntervalHours, setSlotIntervalHours] = useState<number>(2);
  const [useCustomHours, setUseCustomHours] = useState(false);
  const [customHours, setCustomHours] = useState<Record<number, { start: string; end: string }>>({});
  const [closedDates, setClosedDates] = useState<string[]>([]);
  const [newClosedDate, setNewClosedDate] = useState('');
  const [maxPerDay, setMaxPerDay] = useState(5);
  const [saving, setSaving] = useState(false);

  // avail → state
  useEffect(() => {
    if (!availability) {
      setRegularClosedDays(Array(7).fill(false));
      setBusinessHoursStart('09:00');
      setBusinessHoursEnd('18:00');
      setSlotIntervalHours(2);
      setUseCustomHours(false);
      setCustomHours({});
      setClosedDates([]);
      setMaxPerDay(5);
      return;
    }
    const closed = Array(7).fill(false);
    (availability.regular_closed_days || []).forEach(d => { closed[d] = true; });
    setRegularClosedDays(closed);
    setBusinessHoursStart(availability.business_hours_start || '09:00');
    setBusinessHoursEnd(availability.business_hours_end || '18:00');
    const ch = availability.custom_hours || {};
    setSlotIntervalHours(Number(ch._slot_interval_hours ?? 2));
    const dayHours: Record<number, { start: string; end: string }> = {};
    for (const k of Object.keys(ch)) {
      const idx = parseInt(k, 10);
      if (!isNaN(idx) && ch[k]?.start) dayHours[idx] = ch[k];
    }
    setCustomHours(dayHours);
    setUseCustomHours(Object.keys(dayHours).length > 0);
    setClosedDates(availability.closed_dates || []);
    setMaxPerDay(availability.max_reservations_per_day ?? 5);
  }, [availability]);

  // 保存用 custom_hours: 曜日別設定 + _slot_interval_hours
  const buildCustomHours = () => {
    const ch: Record<string, any> = {};
    if (useCustomHours) {
      for (const [k, v] of Object.entries(customHours)) {
        ch[k] = v;
      }
    }
    ch._slot_interval_hours = slotIntervalHours;
    return ch;
  };

  const handleSave = async () => {
    if (!availability?.location_id) return;
    setSaving(true);
    try {
      const data: LocationAvailability = {
        location_id: availability.location_id,
        regular_closed_days: regularClosedDays.map((c, i) => c ? i : -1).filter(d => d !== -1),
        business_hours_start: businessHoursStart,
        business_hours_end: businessHoursEnd,
        custom_hours: buildCustomHours(),
        closed_dates: closedDates,
        special_dates: parseSpecialDates(availability.special_dates),
        max_reservations_per_day: maxPerDay,
      };
      await apiRequest('/location-availability', { method: 'PUT', body: JSON.stringify(data) });
      onSaved(data as any);
      toast.success('基本設定を保存しました');
    } catch (err: any) {
      toast.error(err.message || '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const addClosedDate = () => {
    if (!newClosedDate) { toast.error('日付を選択してください'); return; }
    if (closedDates.includes(newClosedDate)) { toast.error('既に登録されています'); return; }
    setClosedDates([...closedDates, newClosedDate].sort());
    setNewClosedDate('');
  };

  // preview slots
  const previewSlots = useMemo(() => {
    const sh = parseHour(businessHoursStart, 9);
    const eh = parseHour(businessHoursEnd, 18);
    return buildTimeSlots(sh, eh, slotIntervalHours);
  }, [businessHoursStart, businessHoursEnd, slotIntervalHours]);

  return (
    <div className="space-y-6">
      {/* 基本営業時間 + スロット間隔 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-600" />
          基本営業時間・予約枠設定
        </h3>
        <div className="grid grid-cols-1 gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">開始時間</label>
            <input
              type="time" value={businessHoursStart}
              onChange={e => setBusinessHoursStart(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">終了時間</label>
            <input
              type="time" value={businessHoursEnd}
              onChange={e => setBusinessHoursEnd(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">予約枠の時間単位</label>
            <select
              value={slotIntervalHours}
              onChange={e => setSlotIntervalHours(Number(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={1}>1時間</option>
              <option value={1.5}>1時間30分</option>
              <option value={2}>2時間</option>
              <option value={2.5}>2時間30分</option>
              <option value={3}>3時間</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">1日の最大予約数</label>
            <input
              type="number" min={1} max={50} value={maxPerDay}
              onChange={e => setMaxPerDay(parseInt(e.target.value) || 5)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* スロットプレビュー */}
        {previewSlots.length > 0 && (
          <div className="mt-4 p-3 bg-slate-50 rounded-lg">
            <p className="text-xs font-medium text-slate-600 mb-2">生成される予約枠（{previewSlots.length}枠）</p>
            <div className="flex flex-wrap gap-1.5">
              {previewSlots.map(s => (
                <span key={s} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-mono">{s}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 定休日 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Ban className="w-4 h-4 text-red-500" />
          定休日（毎週）
        </h3>
        <div className="grid grid-cols-7 gap-2">
          {DAY_LABELS.map((label, i) => (
            <button
              key={i}
              onClick={() => setRegularClosedDays(prev => { const n = [...prev]; n[i] = !n[i]; return n; })}
              className={`py-3 rounded-xl border-2 transition text-center ${
                regularClosedDays[i]
                  ? 'bg-red-100 border-red-400 text-red-800'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-400'
              }`}
            >
              <div className="text-sm font-medium">{label}</div>
              {regularClosedDays[i] && <div className="text-xs mt-0.5">休</div>}
            </button>
          ))}
        </div>
      </div>

      {/* 曜日別営業時間 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-600" />
            曜日別営業時間（オプション）
          </h3>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox" checked={useCustomHours}
              onChange={e => setUseCustomHours(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-xs text-slate-600">有効</span>
          </label>
        </div>
        {useCustomHours && (
          <div className="space-y-2">
            {DAY_LABELS.map((label, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="w-8 text-center text-sm font-medium text-slate-700">{label}</span>
                {customHours[i] ? (
                  <>
                    <input
                      type="time" value={customHours[i].start}
                      onChange={e => setCustomHours(p => ({ ...p, [i]: { ...p[i], start: e.target.value } }))}
                      className="flex-1 px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-slate-400 text-sm">〜</span>
                    <input
                      type="time" value={customHours[i].end}
                      onChange={e => setCustomHours(p => ({ ...p, [i]: { ...p[i], end: e.target.value } }))}
                      className="flex-1 px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => setCustomHours(p => { const n = { ...p }; delete n[i]; return n; })}
                      className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition"
                    ><X className="w-4 h-4" /></button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-xs text-slate-400">基本営業時間を使用</span>
                    <button
                      onClick={() => setCustomHours(p => ({ ...p, [i]: { start: businessHoursStart, end: businessHoursEnd } }))}
                      className="text-blue-600 hover:bg-blue-50 p-1.5 rounded-lg transition"
                    ><Plus className="w-4 h-4" /></button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 特定日の休業 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-red-500" />
          特定日の休業（臨時）
        </h3>
        <div className="flex gap-2 mb-3">
          <input
            type="date" value={newClosedDate}
            onChange={e => setNewClosedDate(e.target.value)}
            className="flex-1 px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={addClosedDate}
            className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm hover:bg-red-700 transition flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />追加
          </button>
        </div>
        {closedDates.length > 0 ? (
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {closedDates.sort().map(date => (
              <div key={date} className="flex items-center justify-between p-2.5 bg-red-50 border border-red-100 rounded-lg">
                <span className="text-sm text-slate-700">{formatDateJP(date)}</span>
                <button
                  onClick={() => setClosedDates(prev => prev.filter(d => d !== date))}
                  className="text-red-500 hover:bg-red-100 p-1 rounded transition"
                ><X className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400 text-center py-4">臨時休業日は設定されていません</p>
        )}
      </div>

      {/* 保存ボタン */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 transition flex items-center justify-center gap-2"
        style={saving ? { opacity: 0.6 } : undefined}
      >
        <Save className="w-4 h-4" />
        {saving ? '保存中...' : '基本設定を保存'}
      </button>
    </div>
  );
}

// ─── BulkSlotTab ─────────────────────────────────────────────────────────────

interface BulkSlotTabProps {
  availability: LocationAvailability | null;
  onSaved: (updated: LocationAvailability) => void;
}

function BulkSlotTab({ availability, onSaved }: BulkSlotTabProps) {
  const now = new Date();
  const [targetYear, setTargetYear] = useState(now.getFullYear());
  const [targetMonth, setTargetMonth] = useState(now.getMonth() + 1); // 1-12
  const [selectedDows, setSelectedDows] = useState<boolean[]>([false, true, true, true, true, true, false]);
  const [mode, setMode] = useState<'open' | 'closed' | 'custom'>('open');
  const [customSlots, setCustomSlots] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // 現在のスロット設定からデフォルトスロットを計算
  const defaultSlots = useMemo(() => {
    const ch = availability?.custom_hours || {};
    const sh = parseHour(availability?.business_hours_start, 9);
    const eh = parseHour(availability?.business_hours_end, 18);
    const ih = Number(ch._slot_interval_hours ?? 2);
    return buildTimeSlots(sh, eh, ih);
  }, [availability]);

  // モード変更時にカスタムスロットを初期化
  useEffect(() => {
    if (mode === 'custom') setCustomSlots([...defaultSlots]);
  }, [mode, defaultSlots]);

  // 対象日
  const affectedDates = useMemo(() => {
    const dates: string[] = [];
    const daysInMonth = new Date(targetYear, targetMonth, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(targetYear, targetMonth - 1, d);
      if (selectedDows[dt.getDay()]) {
        dates.push(`${targetYear}-${fmt2(targetMonth)}-${fmt2(d)}`);
      }
    }
    return dates;
  }, [targetYear, targetMonth, selectedDows]);

  // 現在の special_dates 状況
  const specialDates = parseSpecialDates(availability?.special_dates);
  const specialCount = Object.keys(specialDates).filter(k => !k.startsWith('_')).length;

  const toggleDow = (i: number) =>
    setSelectedDows(prev => { const n = [...prev]; n[i] = !n[i]; return n; });

  const toggleCustomSlot = (slot: string) =>
    setCustomSlots(prev =>
      prev.includes(slot) ? prev.filter(s => s !== slot) : [...prev, slot].sort()
    );

  const handleApply = async () => {
    if (!availability?.location_id) { toast.error('店舗が選択されていません'); return; }
    if (affectedDates.length === 0) { toast.error('対象日がありません'); return; }
    setSaving(true);
    try {
      const newSpecialDates = { ...specialDates };
      for (const dateKey of affectedDates) {
        if (mode === 'closed') {
          newSpecialDates[dateKey] = { closed: true };
        } else if (mode === 'open') {
          delete newSpecialDates[dateKey];
        } else {
          const isDefault =
            defaultSlots.length === customSlots.length &&
            defaultSlots.every(s => customSlots.includes(s));
          if (isDefault) {
            delete newSpecialDates[dateKey];
          } else {
            newSpecialDates[dateKey] = { open_slots: customSlots };
          }
        }
      }
      const updated = {
        ...availability,
        special_dates: newSpecialDates,
      };
      await apiRequest('/location-availability', { method: 'PUT', body: JSON.stringify(updated) });
      onSaved(updated as any);
      toast.success(`${affectedDates.length}日分の予約枠を更新しました`);
    } catch (err: any) {
      toast.error(err.message || '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  // 設定のリセット（特定月のspecial_datesを全削除）
  const handleResetMonth = async () => {
    if (!availability?.location_id) return;
    const monthPrefix = `${targetYear}-${fmt2(targetMonth)}-`;
    const newSpecialDates = { ...specialDates };
    Object.keys(newSpecialDates).forEach(k => {
      if (k.startsWith(monthPrefix)) delete newSpecialDates[k];
    });
    const count = Object.keys(specialDates).filter(k => k.startsWith(monthPrefix)).length;
    if (count === 0) { toast('この月にカスタム設定はありません'); return; }
    setSaving(true);
    try {
      const updated = { ...availability, special_dates: newSpecialDates };
      await apiRequest('/location-availability', { method: 'PUT', body: JSON.stringify(updated) });
      onSaved(updated as any);
      toast.success(`${targetYear}年${targetMonth}月の個別設定を${count}日分リセットしました`);
    } catch (err: any) {
      toast.error(err.message || 'リセットに失敗しました');
    } finally {
      setSaving(false);
    }
  };

  // 今月のspecial_dates一覧
  const monthPrefix = `${targetYear}-${fmt2(targetMonth)}-`;
  const monthSpecial = Object.entries(specialDates)
    .filter(([k]) => k.startsWith(monthPrefix))
    .sort(([a], [b]) => a.localeCompare(b));

  const modeOptions = [
    { id: 'open' as const, label: '🟢 全枠開放', activeClass: 'bg-green-600 text-white border-green-600' },
    { id: 'closed' as const, label: '🔴 休業日', activeClass: 'bg-red-600 text-white border-red-600' },
    { id: 'custom' as const, label: '🔵 カスタム', activeClass: 'bg-blue-600 text-white border-blue-600' },
  ];

  if (!availability) {
    return <div className="p-8 text-center text-slate-400">店舗を選択してください</div>;
  }

  return (
    <div className="space-y-6">
      {/* 設定フォーム */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Layers className="w-4 h-4 text-blue-600" />
          一括スロット設定
        </h3>

        {/* 対象月 */}
        <div className="mb-5">
          <p className="text-xs font-medium text-slate-600 mb-2">① 対象月</p>
          <div className="flex items-center gap-2">
            <input
              type="number" value={targetYear} min={2024} max={2030}
              onChange={e => setTargetYear(Number(e.target.value))}
              className="w-20 px-2 py-2 border border-slate-200 rounded-lg text-sm text-center"
            />
            <span className="text-sm text-slate-500">年</span>
            <select
              value={targetMonth}
              onChange={e => setTargetMonth(Number(e.target.value))}
              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>{i + 1}月</option>
              ))}
            </select>
          </div>
        </div>

        {/* 曜日選択 */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-slate-600">② 対象曜日</p>
            <div className="flex gap-3">
              <button onClick={() => setSelectedDows([false, true, true, true, true, true, false])}
                className="text-xs text-blue-600 hover:text-blue-700">平日</button>
              <button onClick={() => setSelectedDows([true, false, false, false, false, false, true])}
                className="text-xs text-blue-600 hover:text-blue-700">土日</button>
              <button onClick={() => setSelectedDows(Array(7).fill(true))}
                className="text-xs text-blue-600 hover:text-blue-700">全日</button>
              <button onClick={() => setSelectedDows(Array(7).fill(false))}
                className="text-xs text-slate-400 hover:text-slate-600">解除</button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {DAY_LABELS.map((d, i) => (
              <button
                key={i}
                onClick={() => toggleDow(i)}
                className={`py-2.5 rounded-xl text-sm font-medium border-2 transition ${
                  selectedDows[i]
                    ? i === 0 ? 'bg-red-500 text-white border-red-500'
                      : i === 6 ? 'bg-blue-500 text-white border-blue-500'
                      : 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white border-slate-200 text-slate-400 hover:border-slate-400'
                }`}
              >{d}</button>
            ))}
          </div>
          {affectedDates.length > 0 ? (
            <p className="text-xs text-slate-500 mt-1.5">
              → {targetYear}年{targetMonth}月の対象：<strong>{affectedDates.length}日</strong>
              （{affectedDates.slice(0, 3).map(d => parseInt(d.split('-')[2], 10)).join('日・')}日{affectedDates.length > 3 ? `…ほか` : ''}）
            </p>
          ) : (
            <p className="text-xs text-slate-400 mt-1.5">曜日を選択してください</p>
          )}
        </div>

        {/* 設定内容 */}
        <div className="mb-5">
          <p className="text-xs font-medium text-slate-600 mb-2">③ 設定内容</p>
          <div className="grid grid-cols-3 gap-2">
            {modeOptions.map(opt => (
              <button
                key={opt.id}
                onClick={() => setMode(opt.id)}
                className={`py-2.5 rounded-xl text-sm font-medium border-2 transition ${
                  mode === opt.id ? opt.activeClass : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >{opt.label}</button>
            ))}
          </div>
          {mode === 'open' && (
            <p className="text-xs text-slate-500 mt-1.5">
              デフォルトの予約枠（{defaultSlots.join('・')}）をすべて開放します
            </p>
          )}
          {mode === 'closed' && (
            <p className="text-xs text-red-500 mt-1.5">
              選択した日をすべて休業日として設定します
            </p>
          )}
        </div>

        {/* カスタムスロット選択 */}
        {mode === 'custom' && (
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-slate-600">④ 開放する時間帯</p>
              <button
                onClick={() => setCustomSlots(
                  customSlots.length === defaultSlots.length ? [] : [...defaultSlots]
                )}
                className="text-xs text-blue-600 hover:text-blue-700"
              >
                {customSlots.length === defaultSlots.length ? '全解除' : '全選択'}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {defaultSlots.map(slot => {
                const sel = customSlots.includes(slot);
                return (
                  <button
                    key={slot}
                    onClick={() => toggleCustomSlot(slot)}
                    className={`py-2.5 rounded-xl text-sm font-medium border-2 transition ${
                      sel
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >{slot}</button>
                );
              })}
            </div>
            {customSlots.length === 0 && (
              <p className="text-xs text-orange-500 mt-1.5">
                ※ スロットが0件の場合、休業日として扱われます
              </p>
            )}
          </div>
        )}

        {/* 適用ボタン */}
        <button
          onClick={handleApply}
          disabled={saving || affectedDates.length === 0}
          className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition flex items-center justify-center gap-2"
          style={(saving || affectedDates.length === 0) ? { opacity: 0.5 } : undefined}
        >
          <Layers className="w-4 h-4" />
          {saving ? '適用中...' : `${affectedDates.length}日に一括適用`}
        </button>
      </div>

      {/* 今月の個別設定状況 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-900">
            {targetYear}年{targetMonth}月 個別設定一覧
            {monthSpecial.length > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">{monthSpecial.length}件</span>
            )}
          </h3>
          {monthSpecial.length > 0 && (
            <button
              onClick={handleResetMonth}
              disabled={saving}
              className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2.5 py-1 rounded-lg transition"
            >
              この月をリセット
            </button>
          )}
        </div>

        {monthSpecial.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm text-slate-400">この月に個別設定はありません</p>
            <p className="text-xs text-slate-400 mt-1">（全日デフォルトの予約枠が適用されます）</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {monthSpecial.map(([dateKey, val]) => {
              const d = new Date(dateKey + 'T00:00:00');
              const weekLabel = DAY_LABELS[d.getDay()];
              const dayNum = parseInt(dateKey.split('-')[2], 10);
              const isClosed = val.closed === true;
              const openSlots: string[] = Array.isArray(val.open_slots) ? val.open_slots : [];
              return (
                <div
                  key={dateKey}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    isClosed
                      ? 'bg-red-50 border-red-100'
                      : 'bg-blue-50 border-blue-100'
                  }`}
                >
                  <div>
                    <span className="text-sm font-medium text-slate-800">
                      {targetMonth}/{dayNum}（{weekLabel}）
                    </span>
                    {isClosed ? (
                      <span className="ml-2 text-xs text-red-600 font-medium">休業</span>
                    ) : (
                      <span className="ml-2 text-xs text-blue-600">
                        {openSlots.length > 0
                          ? openSlots.join(' / ')
                          : 'カスタム設定'}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={async () => {
                      const newSD = { ...specialDates };
                      delete newSD[dateKey];
                      const updated = { ...availability, special_dates: newSD };
                      try {
                        await apiRequest('/location-availability', { method: 'PUT', body: JSON.stringify(updated) });
                        onSaved(updated as any);
                        toast.success('設定を削除しました');
                      } catch (err: any) {
                        toast.error(err.message || '削除に失敗しました');
                      }
                    }}
                    className="text-slate-400 hover:text-red-500 p-1 rounded transition"
                  ><X className="w-4 h-4" /></button>
                </div>
              );
            })}
          </div>
        )}

        {/* 全体の個別設定件数 */}
        {specialCount > 0 && (
          <p className="text-xs text-slate-400 mt-3 text-right">
            全期間の個別設定: {specialCount}件
          </p>
        )}
      </div>
    </div>
  );
}

// ─── LocationAvailabilityPage (main) ────────────────────────────────────────

export function LocationAvailabilityPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [availability, setAvailability] = useState<LocationAvailability | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'basic' | 'bulk'>('basic');

  useEffect(() => {
    loadLocations();
  }, []);

  useEffect(() => {
    if (selectedLocationId) loadLocationAvailability(selectedLocationId);
  }, [selectedLocationId]);

  const loadLocations = async () => {
    try {
      const result = await apiRequest('/locations');
      const locs: Location[] = result.locations || [];
      setLocations(locs);
      if (locs.length > 0) setSelectedLocationId(locs[0].location_id);
    } catch {
      toast.error('店舗一覧の読み込みに失敗しました');
    }
  };

  const loadLocationAvailability = async (locationId: string) => {
    setLoading(true);
    try {
      const res = await apiRequest(`/location-availability/${locationId}`);
      setAvailability(res.availability || { location_id: locationId });
    } catch {
      setAvailability({ location_id: locationId });
    } finally {
      setLoading(false);
    }
  };

  const handleSaved = (updated: LocationAvailability) => {
    setAvailability(updated);
  };

  const tabs = [
    { id: 'basic' as const, label: '基本設定', icon: AlertCircle },
    { id: 'bulk' as const, label: '一括スロット設定', icon: Layers },
  ];

  const locationName = locations.find(l => l.location_id === selectedLocationId)?.name
    || locations.find(l => l.location_id === selectedLocationId)?.location_name
    || '';

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-slate-900 font-bold mb-1">店舗別予約可能日設定</h1>
        <p className="text-sm text-slate-500">営業時間・定休日・予約枠を管理します</p>
      </div>

      {/* 店舗選択 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-4">
        <label className="flex items-center gap-2 text-xs font-medium text-slate-600 mb-2">
          <MapPin className="w-3.5 h-3.5" />
          店舗
        </label>
        <select
          value={selectedLocationId}
          onChange={e => setSelectedLocationId(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">店舗を選択してください</option>
          {locations.map(loc => (
            <option key={loc.location_id} value={loc.location_id}>
              {loc.name || loc.location_name}
            </option>
          ))}
        </select>
      </div>

      {selectedLocationId && (
        <>
          {/* タブ */}
          <div className="border-b border-slate-200 bg-white rounded-t-2xl mb-0">
            <div className="flex gap-1 px-4">
              {tabs.map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 px-5 py-3 text-sm transition relative whitespace-nowrap ${
                      activeTab === tab.id
                        ? 'text-blue-600 font-medium'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.label}
                    {activeTab === tab.id && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* タブコンテンツ */}
          {loading ? (
            <div className="bg-white rounded-b-2xl border border-t-0 border-slate-200 p-12 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              <p className="text-slate-500 mt-4 text-sm">読み込み中...</p>
            </div>
          ) : (
            <div className="bg-slate-50 rounded-b-2xl border border-t-0 border-slate-200 p-6">
              {activeTab === 'basic' && (
                <BasicSettingsTab availability={availability} onSaved={handleSaved} />
              )}
              {activeTab === 'bulk' && (
                <BulkSlotTab availability={availability} onSaved={handleSaved} />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
