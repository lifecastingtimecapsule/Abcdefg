import { useState, useEffect } from 'react';
import {
  Calendar, Clock, Save, Settings, Plus, X, AlertCircle,
  Users, Ban, Check,
} from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { apiRequest } from '../utils/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Location {
  location_id: string;
  name: string;
}

type ConfirmationMode = 'auto' | 'manual';

interface ReservationSettings {
  reservation_settings_id: string;
  allowed_days: number[];
  business_hours_start: string;
  business_hours_end: string;
  advance_reservation_days: number;
  max_reservation_days: number;
  max_reservations_per_day?: number;
  concurrent_reservations?: number;
  closed_dates?: string[];
  custom_hours?: Record<string, unknown>;
  updated_at: string;
}

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

function formatDateJP(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
  });
}

// ─── Booking-window preview ───────────────────────────────────────────────────

function BookingWindowPreview({ advance, max }: { advance: number; max: number }) {
  const today = new Date();
  const openFrom = new Date(today); openFrom.setDate(today.getDate() + advance);
  const openTo   = new Date(today); openTo.setDate(today.getDate() + max);
  const fmt = (d: Date) => d.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
  const closedPct = Math.min(100, max > 0 ? (advance / max) * 100 : 0);

  return (
    <div className="mt-4 p-4 bg-slate-50 rounded-lg">
      <p className="text-xs font-medium text-slate-600 mb-3">予約ウィンドウのプレビュー</p>
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500 whitespace-nowrap">今日</span>
        <div className="flex-1 relative h-5 rounded overflow-hidden bg-slate-200">
          {advance > 0 && (
            <div
              className="absolute inset-y-0 left-0 bg-red-300 flex items-center justify-center"
              style={{ width: `${closedPct}%` }}
            >
              {closedPct > 15 && <span className="text-red-800 text-xs leading-none">受付不可</span>}
            </div>
          )}
          <div
            className="absolute inset-y-0 bg-green-400 flex items-center justify-center"
            style={{ left: `${closedPct}%`, right: '0' }}
          >
            <span className="text-green-900 text-xs leading-none">予約可能</span>
          </div>
        </div>
        <span className="text-xs text-slate-500 whitespace-nowrap">{max}日後</span>
      </div>
      <div className="flex justify-between mt-2 text-xs">
        {advance > 0
          ? <span className="text-red-600">〜{fmt(openFrom)}は予約不可</span>
          : <span className="text-green-600">当日から予約可</span>
        }
        <span className="text-green-600">{fmt(openFrom)}〜{fmt(openTo)} 受付中</span>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ReservationSettingsPage() {
  const [loading, setLoading] = useState(false);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>('default');
  const [settings, setSettings] = useState<ReservationSettings | null>(null);

  // Basic settings
  const [allowedDays, setAllowedDays] = useState<boolean[]>([true,true,true,true,true,true,true]);
  const [businessHoursStart, setBusinessHoursStart] = useState('09:00');
  const [businessHoursEnd, setBusinessHoursEnd] = useState('18:00');
  const [advanceReservationDays, setAdvanceReservationDays] = useState(3);
  const [maxReservationDays, setMaxReservationDays] = useState(90);
  const [maxReservationsPerDay, setMaxReservationsPerDay] = useState(10);
  const [concurrentReservations, setConcurrentReservations] = useState(1);
  const [closedDates, setClosedDates] = useState<string[]>([]);
  const [newClosedDate, setNewClosedDate] = useState('');
  const [useCustomHours, setUseCustomHours] = useState(false);
  const [customHours, setCustomHours] = useState<{ [k: number]: { start: string; end: string } }>({});

  // Policy settings (stored as underscore keys inside custom_hours JSON)
  const [confirmationMode, setConfirmationMode] = useState<ConfirmationMode>('auto');
  const [cancelAllowed, setCancelAllowed] = useState(true);
  const [cancelDays, setCancelDays] = useState(3);
  const [minPeople, setMinPeople] = useState(1);
  const [maxPeople, setMaxPeople] = useState(5);
  const [requireNote, setRequireNote] = useState(false);

  // ─── Load ───────────────────────────────────────────────────────────────────

  useEffect(() => { loadLocations(); }, []);
  useEffect(() => { loadSettings(selectedLocationId); }, [selectedLocationId]);

  const loadLocations = async () => {
    try {
      const res = await apiRequest('/locations');
      const locs: Location[] = res.locations || [];
      setLocations(locs);
      if (locs.length === 1) setSelectedLocationId(locs[0].location_id);
    } catch { /* ignore */ }
  };

  const loadSettings = async (locationId: string) => {
    try {
      setLoading(true);
      const qs = locationId !== 'default' ? `?location_id=${locationId}` : '';
      const response = await apiRequest(`/reservation-settings${qs}`);
      if (response.settings) applySettings(response.settings);
    } catch (err: any) {
      toast.error('設定の読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const applySettings = (s: ReservationSettings) => {
    setSettings(s);

    const days = [false,false,false,false,false,false,false];
    (s.allowed_days || []).forEach((d: number) => { days[d] = true; });
    setAllowedDays(days);

    setBusinessHoursStart(s.business_hours_start || '09:00');
    setBusinessHoursEnd(s.business_hours_end || '18:00');
    setAdvanceReservationDays(s.advance_reservation_days ?? 3);
    setMaxReservationDays(s.max_reservation_days || 90);
    setMaxReservationsPerDay(s.max_reservations_per_day || 10);
    setConcurrentReservations(s.concurrent_reservations || 1);
    setClosedDates(s.closed_dates || []);

    const ch = (s.custom_hours || {}) as Record<string, unknown>;

    // Policy
    const mode = ch._confirmation_mode as string | undefined;
    if (mode === 'manual') setConfirmationMode('manual');
    else setConfirmationMode('auto');

    const cd = ch._cancel_days as number | undefined;
    if (cd === -1) { setCancelAllowed(false); setCancelDays(3); }
    else if (cd !== undefined) { setCancelAllowed(true); setCancelDays(cd); }
    else { setCancelAllowed(true); setCancelDays(3); }

    setMinPeople((ch._min_people as number) ?? 1);
    setMaxPeople((ch._max_people as number) ?? 5);
    setRequireNote(Boolean(ch._require_note));

    // Per-day hours (numeric keys only)
    const dayHours: { [k: number]: { start: string; end: string } } = {};
    let hasCustom = false;
    for (const k of Object.keys(ch)) {
      const n = parseInt(k);
      if (!isNaN(n) && n >= 0 && n <= 6) {
        dayHours[n] = ch[k] as { start: string; end: string };
        hasCustom = true;
      }
    }
    setCustomHours(dayHours);
    setUseCustomHours(hasCustom);
  };

  // ─── Save ───────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    const allowedDayNumbers = allowedDays.map((ok, i) => ok ? i : -1).filter(d => d !== -1);
    if (allowedDayNumbers.length === 0) {
      toast.error('最低1つの曜日を選択してください');
      return;
    }

    // Build custom_hours: per-day hours + policy underscore keys
    const chOut: Record<string, unknown> = useCustomHours ? { ...customHours } : {};
    chOut._confirmation_mode = confirmationMode;
    chOut._cancel_days = cancelAllowed ? cancelDays : -1;
    chOut._min_people = minPeople;
    chOut._max_people = maxPeople;
    chOut._require_note = requireNote;

    const body: Record<string, unknown> = {
      reservation_settings_id: selectedLocationId,
      allowed_days: allowedDayNumbers,
      business_hours_start: businessHoursStart,
      business_hours_end: businessHoursEnd,
      advance_reservation_days: advanceReservationDays,
      max_reservation_days: maxReservationDays,
      max_reservations_per_day: maxReservationsPerDay,
      concurrent_reservations: concurrentReservations,
      closed_dates: closedDates,
      custom_hours: chOut,
    };

    try {
      setLoading(true);
      await apiRequest('/reservation-settings', {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      toast.success('予約設定を保存しました');
      await loadSettings(selectedLocationId);
    } catch (err: any) {
      toast.error(err.message || '設定の保存に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const setQuickDays = (preset: 'weekday' | 'weekend' | 'all') => {
    if (preset === 'weekday') setAllowedDays([false,true,true,true,true,true,false]);
    else if (preset === 'weekend') setAllowedDays([true,false,false,false,false,false,true]);
    else setAllowedDays([true,true,true,true,true,true,true]);
  };

  const updateCustomHours = (i: number, field: 'start' | 'end', val: string) => {
    setCustomHours({
      ...customHours,
      [i]: {
        start: field === 'start' ? val : (customHours[i]?.start || businessHoursStart),
        end:   field === 'end'   ? val : (customHours[i]?.end   || businessHoursEnd),
      }
    });
  };

  const addClosedDate = () => {
    if (!newClosedDate) { toast.error('休業日を選択してください'); return; }
    if (closedDates.includes(newClosedDate)) { toast.error('この日付は既に追加されています'); return; }
    setClosedDates([...closedDates, newClosedDate].sort());
    setNewClosedDate('');
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto p-6">

      {/* ── Page header ── */}
      <div className="flex items-center gap-3 mb-6">
        <Settings className="w-8 h-8 text-blue-600" />
        <div>
          <h1 className="text-slate-900">予約受付設定</h1>
          <p className="text-sm text-slate-500">予約システムの動作ルールをまとめて管理します</p>
        </div>
      </div>

      {/* ── Location selector ── */}
      {locations.length > 0 && (
        <div className="mb-6 p-4 bg-white rounded-lg border border-slate-200">
          <p className="text-sm font-medium text-slate-700 mb-2">設定対象</p>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setSelectedLocationId('default')}
              className={`px-3 py-1.5 rounded-lg text-sm border transition-all ${
                selectedLocationId === 'default'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-700 border-slate-300 hover:border-blue-400'
              }`}
            >
              デフォルト（全店共通）
            </button>
            {locations.map(loc => (
              <button
                key={loc.location_id}
                onClick={() => setSelectedLocationId(loc.location_id)}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-all ${
                  selectedLocationId === loc.location_id
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-700 border-slate-300 hover:border-blue-400'
                }`}
              >
                {loc.name}
              </button>
            ))}
          </div>
          {selectedLocationId !== 'default' && (
            <p className="text-xs text-blue-600 mt-2">
              ※ 店舗固有の設定です。未設定の項目はデフォルト設定が適用されます。
            </p>
          )}
        </div>
      )}

      <div className="space-y-5">

        {/* ── Section 1: Days ── */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-600" />
              予約受付曜日
            </h2>
            {/* Quick presets */}
            <div className="flex gap-1">
              {([['平日', 'weekday'], ['土日', 'weekend'], ['全日', 'all']] as const).map(([label, preset]) => (
                <button
                  key={preset}
                  onClick={() => setQuickDays(preset)}
                  className="px-2.5 py-1 text-xs rounded border border-slate-300 text-slate-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2">
            {DAY_LABELS.map((day, i) => (
              <button
                key={i}
                onClick={() => { const n=[...allowedDays]; n[i]=!n[i]; setAllowedDays(n); }}
                className={`py-3 rounded-lg border-2 font-medium text-sm transition-all ${
                  allowedDays[i]
                    ? i === 0 ? 'bg-red-50 border-red-400 text-red-700'
                    : i === 6 ? 'bg-blue-50 border-blue-400 text-blue-700'
                    : 'bg-green-50 border-green-400 text-green-700'
                    : 'bg-slate-50 border-slate-200 text-slate-400'
                }`}
              >
                {day}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            受付: {DAY_LABELS.filter((_, i) => allowedDays[i]).join('・') || '—'} （{allowedDays.filter(Boolean).length}日間）
          </p>
        </div>

        {/* ── Section 2: Hours ── */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-blue-600" />
            営業時間
          </h2>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-slate-600 mb-1 block">開始時刻</label>
              <input
                type="time" value={businessHoursStart}
                onChange={e => setBusinessHoursStart(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-sm text-slate-600 mb-1 block">終了時刻</label>
              <input
                type="time" value={businessHoursEnd}
                onChange={e => setBusinessHoursEnd(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Per-day custom hours */}
          <div className="mt-4 pt-4 border-t">
            <label className="flex items-center gap-2 cursor-pointer w-fit">
              <input
                type="checkbox" checked={useCustomHours}
                onChange={e => setUseCustomHours(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-slate-700">曜日ごとに異なる営業時間を設定する</span>
            </label>

            {useCustomHours && (
              <div className="mt-3 space-y-2 bg-slate-50 p-4 rounded-lg">
                {DAY_LABELS.map((day, i) => allowedDays[i] && (
                  <div key={i} className="flex items-center gap-3">
                    <span className={`text-sm font-medium w-6 text-center shrink-0 ${i===0?'text-red-600':i===6?'text-blue-600':'text-slate-700'}`}>
                      {day}
                    </span>
                    <input
                      type="time"
                      value={customHours[i]?.start || businessHoursStart}
                      onChange={e => updateCustomHours(i, 'start', e.target.value)}
                      className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                    <span className="text-slate-400 shrink-0">〜</span>
                    <input
                      type="time"
                      value={customHours[i]?.end || businessHoursEnd}
                      onChange={e => updateCustomHours(i, 'end', e.target.value)}
                      className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Section 3: Booking window ── */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2 mb-4">
            <Calendar className="w-4 h-4 text-blue-600" />
            予約受付期間
          </h2>

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">直近の予約不可日数</label>
              <div className="flex items-center gap-2">
                <input
                  type="number" min="0" max="30" value={advanceReservationDays}
                  onChange={e => setAdvanceReservationDays(parseInt(e.target.value) || 0)}
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-600 whitespace-nowrap">日前から</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {advanceReservationDays === 0
                  ? '当日から予約可能'
                  : `${advanceReservationDays}日後以降に予約可能`}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">最大予約受付日数</label>
              <div className="flex items-center gap-2">
                <input
                  type="number" min="7" max="365" value={maxReservationDays}
                  onChange={e => setMaxReservationDays(parseInt(e.target.value) || 90)}
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-600 whitespace-nowrap">日先まで</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">{maxReservationDays}日先まで受付</p>
            </div>
          </div>

          <BookingWindowPreview advance={advanceReservationDays} max={maxReservationDays} />
        </div>

        {/* ── Section 4: Capacity ── */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-blue-600" />
            予約数・人数の制限
          </h2>

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">1日の最大予約数</label>
              <div className="flex items-center gap-2">
                <input
                  type="number" min="1" max="200" value={maxReservationsPerDay}
                  onChange={e => setMaxReservationsPerDay(parseInt(e.target.value) || 10)}
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-600">件</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">上限に達するとその日は予約不可</p>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">同時間帯の最大受付組数</label>
              <div className="flex items-center gap-2">
                <input
                  type="number" min="1" max="20" value={concurrentReservations}
                  onChange={e => setConcurrentReservations(parseInt(e.target.value) || 1)}
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-600">組</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">複数スタッフ対応時は2以上に設定</p>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">1予約あたりの最小人数</label>
              <div className="flex items-center gap-2">
                <input
                  type="number" min="1" max="20" value={minPeople}
                  onChange={e => setMinPeople(parseInt(e.target.value) || 1)}
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-600">人</span>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">1予約あたりの最大人数</label>
              <div className="flex items-center gap-2">
                <input
                  type="number" min="1" max="50" value={maxPeople}
                  onChange={e => setMaxPeople(parseInt(e.target.value) || 5)}
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-600">人</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Section 5: Policy ── */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2 mb-5">
            <AlertCircle className="w-4 h-4 text-blue-600" />
            予約ポリシー
          </h2>

          <div className="space-y-6">

            {/* Confirmation mode */}
            <div>
              <p className="text-sm font-medium text-slate-700 mb-3">予約確定方式</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setConfirmationMode('auto')}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    confirmationMode === 'auto'
                      ? 'bg-green-50 border-green-500'
                      : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Check className={`w-4 h-4 ${confirmationMode==='auto'?'text-green-600':'text-slate-400'}`} />
                    <span className={`text-sm font-medium ${confirmationMode==='auto'?'text-green-700':'text-slate-600'}`}>
                      自動確定
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">送信と同時に予約が確定します</p>
                </button>
                <button
                  onClick={() => setConfirmationMode('manual')}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    confirmationMode === 'manual'
                      ? 'bg-amber-50 border-amber-500'
                      : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <AlertCircle className={`w-4 h-4 ${confirmationMode==='manual'?'text-amber-600':'text-slate-400'}`} />
                    <span className={`text-sm font-medium ${confirmationMode==='manual'?'text-amber-700':'text-slate-600'}`}>
                      要承認
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">管理者が承認後に確定します</p>
                </button>
              </div>
            </div>

            {/* Cancel policy */}
            <div className="pt-4 border-t">
              <p className="text-sm font-medium text-slate-700 mb-3">キャンセルポリシー</p>
              <label className="flex items-center gap-2 mb-3 cursor-pointer">
                <input
                  type="checkbox" checked={cancelAllowed}
                  onChange={e => setCancelAllowed(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-700">キャンセルを受け付ける</span>
              </label>
              {cancelAllowed ? (
                <div className="flex items-center gap-3 ml-6">
                  <span className="text-sm text-slate-600 whitespace-nowrap">予約日の</span>
                  <input
                    type="number" min="0" max="30" value={cancelDays}
                    onChange={e => setCancelDays(parseInt(e.target.value) || 0)}
                    className="w-20 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                  <span className="text-sm text-slate-600 whitespace-nowrap">
                    日前まで受付
                    <span className="text-slate-400 ml-1 text-xs">
                      ({cancelDays === 0 ? '当日まで可' : `${cancelDays}日前まで`})
                    </span>
                  </span>
                </div>
              ) : (
                <div className="ml-6 flex items-center gap-2 text-sm text-red-600">
                  <Ban className="w-4 h-4" />
                  キャンセル不可（確定後は変更できません）
                </div>
              )}
            </div>

            {/* Require note */}
            <div className="pt-4 border-t">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox" checked={requireNote}
                  onChange={e => setRequireNote(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <p className="text-sm font-medium text-slate-700">予約メモを必須にする</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    顧客が予約フォームでメモ欄を必ず入力しなければ送信できなくなります
                  </p>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* ── Section 6: Closed dates ── */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2 mb-4">
            <Ban className="w-4 h-4 text-blue-600" />
            臨時休業日
          </h2>

          <div className="flex gap-2 mb-4">
            <input
              type="date" value={newClosedDate}
              onChange={e => setNewClosedDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={addClosedDate}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm shrink-0"
            >
              <Plus className="w-4 h-4" />追加
            </button>
          </div>

          {closedDates.length > 0 ? (
            <>
              <p className="text-xs text-slate-500 mb-2">登録済み {closedDates.length}件</p>
              <div className="grid md:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                {closedDates.map(date => (
                  <div key={date} className="flex items-center justify-between px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                    <span className="text-sm text-slate-700">{formatDateJP(date)}</span>
                    <button
                      onClick={() => setClosedDates(closedDates.filter(d => d !== date))}
                      className="text-red-500 hover:text-red-700 transition-colors ml-2 shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-400 py-4 text-center bg-slate-50 rounded-lg">
              臨時休業日は設定されていません
            </p>
          )}
        </div>

        {/* ── Save bar ── */}
        <div className="flex items-center justify-between py-2">
          {settings?.updated_at ? (
            <p className="text-xs text-slate-400">
              最終更新: {new Date(settings.updated_at).toLocaleString('ja-JP')}
            </p>
          ) : <span />}
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Save className="w-5 h-5" />
            {loading ? '保存中...' : '設定を保存'}
          </button>
        </div>

      </div>{/* /space-y-5 */}
    </div>
  );
}
