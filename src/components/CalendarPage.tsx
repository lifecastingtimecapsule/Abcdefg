import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { apiRequest, consumeCalendarPrefetch } from '../utils/api';
import { toast } from 'sonner@2.0.3';
import { Plus, ChevronLeft, ChevronRight, MapPin, Settings, Layers, X, Calendar } from 'lucide-react';
import { ReservationModal } from './ReservationModal';
import { WorkOrderModal } from './WorkOrderModal';
import { Reservation, Customer, Location, User, MenuItem, WorkOrder } from '../types';

const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];

function getMonthGrid(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startDow = first.getDay();
  const daysInMonth = last.getDate();
  const rows: (Date | null)[][] = [];
  let row: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) row.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    row.push(new Date(year, month, d));
    if (row.length === 7) { rows.push(row); row = []; }
  }
  if (row.length > 0) {
    while (row.length < 7) row.push(null);
    rows.push(row);
  }
  return rows;
}

function getStatusColor(status: string) {
  if (status === 'confirmed') return 'bg-blue-500 text-white';
  if (status === 'tentative') return 'bg-amber-400 text-slate-900';
  if (status === 'cancelled') return 'bg-red-400 text-white';
  if (status === 'completed') return 'bg-green-500 text-white';
  return 'bg-slate-400 text-white';
}

function fmt2(n: number) { return String(n).padStart(2, '0'); }

/** 営業時間からタイムスロット一覧を生成: h = start; h < end; h += intervalHours */
function buildTimeSlots(startHour: number, endHour: number, intervalHours: number = 2): string[] {
  const slots: string[] = [];
  for (let h = startHour; h < endHour; h += intervalHours) {
    const hInt = Math.floor(h);
    const hMin = Math.round((h - hInt) * 60);
    slots.push(`${fmt2(hInt)}:${fmt2(hMin)}`);
  }
  return slots;
}

/** special_dates を安全にパースしてオブジェクトで返す */
function parseSpecialDates(sd: any): Record<string, any> {
  if (!sd) return {};
  if (typeof sd === 'string') { try { return JSON.parse(sd); } catch { return {}; } }
  return sd as Record<string, any>;
}

/**
 * 特定日の開放スロット一覧を返す
 * - null  → 休業日
 * - [...] → 開放スロットのリスト（空配列 = スロットなし）
 */
function getSlotsForDate(
  dateKey: string,
  weekday: number,
  allSlots: string[],
  availability: any | null,
): string[] | null {
  if (!availability) return allSlots;

  const regularClosed: number[] = (availability.regular_closed_days || []).map(Number);
  if (regularClosed.includes(weekday)) return null;

  const closedDates: string[] = availability.closed_dates || [];
  if (closedDates.includes(dateKey)) return null;

  const specialDates = parseSpecialDates(availability.special_dates);
  const special = specialDates[dateKey];
  if (special) {
    if (special.closed) return null;
    if (Array.isArray(special.open_slots)) return special.open_slots as string[];
  }

  return allSlots;
}

// ────────────────────────────────────────────────────────────
// BulkSlotModal — 管理者用の一括スロット設定モーダル
// ────────────────────────────────────────────────────────────
interface BulkSlotModalProps {
  currentYear: number;
  currentMonth: number; // 0-indexed
  timeSlots: string[];
  availability: any;
  selectedLocationId: string | null;
  onSave: (updated: any) => void;
  onClose: () => void;
}

const WEEKDAYS_JP = ['日', '月', '火', '水', '木', '金', '土'];

function BulkSlotModal({
  currentYear, currentMonth, timeSlots, availability, selectedLocationId, onSave, onClose,
}: BulkSlotModalProps) {
  const [targetYear, setTargetYear] = useState(currentYear);
  const [targetMonth, setTargetMonth] = useState(currentMonth + 1); // 1-12
  // デフォルト: 月〜金
  const [selectedDows, setSelectedDows] = useState<boolean[]>([false, true, true, true, true, true, false]);
  const [mode, setMode] = useState<'open' | 'closed' | 'custom'>('open');
  const [customSlots, setCustomSlots] = useState<string[]>([...timeSlots]);
  const [saving, setSaving] = useState(false);

  // 対象日を算出
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

  const toggleDow = (i: number) =>
    setSelectedDows(prev => { const n = [...prev]; n[i] = !n[i]; return n; });

  const toggleCustomSlot = (slot: string) =>
    setCustomSlots(prev =>
      prev.includes(slot) ? prev.filter(s => s !== slot) : [...prev, slot].sort()
    );

  const handleApply = async () => {
    if (affectedDates.length === 0) { toast.error('対象日がありません'); return; }
    setSaving(true);
    try {
      const specialDates = parseSpecialDates(availability?.special_dates);
      const newSpecialDates = { ...specialDates };

      for (const dateKey of affectedDates) {
        if (mode === 'closed') {
          newSpecialDates[dateKey] = { closed: true };
        } else if (mode === 'open') {
          delete newSpecialDates[dateKey]; // デフォルトに戻す
        } else {
          // カスタム
          const isDefault =
            timeSlots.length === customSlots.length &&
            timeSlots.every(s => customSlots.includes(s));
          if (isDefault) {
            delete newSpecialDates[dateKey];
          } else {
            newSpecialDates[dateKey] = { open_slots: customSlots };
          }
        }
      }

      const updatedAvailability = {
        location_id: selectedLocationId,
        regular_closed_days: availability?.regular_closed_days || [],
        closed_dates: availability?.closed_dates || [],
        business_hours_start: availability?.business_hours_start ?? '09:00',
        business_hours_end: availability?.business_hours_end ?? '18:00',
        custom_hours: availability?.custom_hours ?? null,
        max_reservations_per_day: availability?.max_reservations_per_day ?? 5,
        special_dates: newSpecialDates,
      };

      await apiRequest('/location-availability', {
        method: 'PUT',
        body: JSON.stringify(updatedAvailability),
      });

      onSave(updatedAvailability);
      toast.success(`${affectedDates.length}日分の予約枠を更新しました`);
    } catch (err: any) {
      toast.error('保存に失敗しました: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const modeOptions = [
    { id: 'open' as const, label: '全枠開放', activeClass: 'bg-green-600 text-white border-green-600' },
    { id: 'closed' as const, label: '休業日', activeClass: 'bg-red-600 text-white border-red-600' },
    { id: 'custom' as const, label: 'カスタム', activeClass: 'bg-blue-600 text-white border-blue-600' },
  ];

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full p-6 overflow-y-auto"
        style={{ maxWidth: '28rem', maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-base font-bold text-slate-900 mb-4">予約枠 一括設定</h2>

        {/* 対象月 */}
        <div className="mb-4">
          <p className="text-xs font-medium text-slate-600 mb-1.5">対象月</p>
          <div className="flex items-center gap-1">
            <input
              type="number" value={targetYear} min={2024} max={2030}
              onChange={e => setTargetYear(Number(e.target.value))}
              className="w-20 px-2 py-1.5 border border-slate-200 rounded-lg text-sm text-center"
            />
            <span className="text-sm text-slate-600">年</span>
            <select
              value={targetMonth}
              onChange={e => setTargetMonth(Number(e.target.value))}
              className="flex-1 px-2 py-1.5 border border-slate-200 rounded-lg text-sm bg-white"
            >
              {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                <option key={m} value={m}>{m}月</option>
              ))}
            </select>
          </div>
        </div>

        {/* 曜日選択 */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-medium text-slate-600">対象曜日</p>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedDows([false, true, true, true, true, true, false])}
                className="text-xs text-blue-600 hover:text-blue-700"
              >平日</button>
              <button
                onClick={() => setSelectedDows([true, false, false, false, false, false, true])}
                className="text-xs text-blue-600 hover:text-blue-700"
              >土日</button>
              <button
                onClick={() => setSelectedDows([true, true, true, true, true, true, true])}
                className="text-xs text-blue-600 hover:text-blue-700"
              >全日</button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS_JP.map((d, i) => (
              <button
                key={i}
                onClick={() => toggleDow(i)}
                className={`py-2 rounded-lg text-sm font-medium border-2 transition ${
                  selectedDows[i]
                    ? i === 0 ? 'bg-red-500 text-white border-red-500'
                      : i === 6 ? 'bg-blue-500 text-white border-blue-500'
                      : 'bg-slate-700 text-white border-slate-700'
                    : 'bg-white border-slate-200 text-slate-400'
                }`}
              >{d}</button>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {affectedDates.length === 0 ? '曜日を選択してください' : `→ ${targetYear}年${targetMonth}月の対象: ${affectedDates.length}日`}
          </p>
        </div>

        {/* 設定内容 */}
        <div className="mb-4">
          <p className="text-xs font-medium text-slate-600 mb-1.5">設定内容</p>
          <div className="grid grid-cols-3 gap-2">
            {modeOptions.map(opt => (
              <button
                key={opt.id}
                onClick={() => setMode(opt.id)}
                className={`py-2 rounded-lg text-sm font-medium border-2 transition ${
                  mode === opt.id ? opt.activeClass : 'bg-white border-slate-200 text-slate-600'
                }`}
              >{opt.label}</button>
            ))}
          </div>
        </div>

        {/* カスタム時のスロット選択 */}
        {mode === 'custom' && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-medium text-slate-600">開放する時間帯</p>
              <button
                onClick={() => setCustomSlots(
                  customSlots.length === timeSlots.length ? [] : [...timeSlots]
                )}
                className="text-xs text-blue-600 hover:text-blue-700"
              >
                {customSlots.length === timeSlots.length ? '全解除' : '全選択'}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {timeSlots.map(slot => {
                const selected = customSlots.includes(slot);
                return (
                  <button
                    key={slot}
                    onClick={() => toggleCustomSlot(slot)}
                    className={`py-2 rounded-lg text-sm font-medium border-2 transition ${
                      selected
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >{slot}</button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex gap-2 mt-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-100 transition"
          >キャンセル</button>
          <button
            onClick={handleApply}
            disabled={saving || affectedDates.length === 0}
            className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition"
            style={(saving || affectedDates.length === 0) ? { opacity: 0.5 } : undefined}
          >
            {saving ? '適用中...' : `${affectedDates.length}日に適用`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// SlotManagementModal — 管理者用の予約枠管理モーダル
// ────────────────────────────────────────────────────────────
interface SlotManagementModalProps {
  dateKey: string;
  allSlots: string[];
  availability: any;
  selectedLocationId: string | null;
  onSave: (updated: any) => void;
  onClose: () => void;
}

function SlotManagementModal({
  dateKey, allSlots, availability, selectedLocationId, onSave, onClose,
}: SlotManagementModalProps) {
  const specialDates = parseSpecialDates(availability?.special_dates);
  const special = specialDates[dateKey];

  const [isClosed, setIsClosed] = useState<boolean>(special?.closed === true);
  const [openSlots, setOpenSlots] = useState<string[]>(
    special?.open_slots ? [...special.open_slots]
      : special?.closed ? []
      : [...allSlots]
  );
  const [saving, setSaving] = useState(false);

  const [y, m, d] = dateKey.split('-');
  const dateDisplay = `${y}年${parseInt(m)}月${parseInt(d)}日`;

  const toggleSlot = (slot: string) => {
    setOpenSlots(prev =>
      prev.includes(slot) ? prev.filter(s => s !== slot) : [...prev, slot].sort()
    );
  };

  const allSelected = allSlots.length > 0 && allSlots.every(s => openSlots.includes(s));
  const toggleAll = () => setOpenSlots(allSelected ? [] : [...allSlots]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const newSpecialDates = { ...specialDates };

      if (isClosed) {
        newSpecialDates[dateKey] = { closed: true };
      } else {
        const isDefault = allSlots.length === openSlots.length &&
          allSlots.every(s => openSlots.includes(s));
        if (isDefault) {
          delete newSpecialDates[dateKey]; // デフォルトに戻す
        } else {
          newSpecialDates[dateKey] = { open_slots: openSlots };
        }
      }

      const updatedAvailability = {
        location_id: selectedLocationId,
        regular_closed_days: availability?.regular_closed_days || [],
        closed_dates: availability?.closed_dates || [],
        business_hours_start: availability?.business_hours_start ?? 9,
        business_hours_end: availability?.business_hours_end ?? 18,
        custom_hours: availability?.custom_hours ?? null,
        max_reservations_per_day: availability?.max_reservations_per_day ?? 5,
        special_dates: newSpecialDates,
      };

      await apiRequest('/location-availability', {
        method: 'PUT',
        body: JSON.stringify(updatedAvailability),
      });

      onSave(updatedAvailability);
      toast.success('予約枠を保存しました');
    } catch (err: any) {
      toast.error('保存に失敗しました: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full p-6"
        style={{ maxWidth: '22rem' }}
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-base font-bold text-slate-900 mb-0.5">予約枠管理</h2>
        <p className="text-sm text-slate-500 mb-4">{dateDisplay}</p>

        {/* 休業日チェック */}
        <label className="flex items-center gap-2 mb-4 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isClosed}
            onChange={e => setIsClosed(e.target.checked)}
            className="w-4 h-4"
          />
          <span className="text-sm font-medium text-slate-700">この日を休業日にする</span>
        </label>

        {!isClosed && (
          <>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-slate-500">開放する時間帯を選択</p>
              <button
                onClick={toggleAll}
                className="text-xs text-blue-600 hover:text-blue-700 transition"
              >
                {allSelected ? '全解除' : '全選択'}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {allSlots.map(slot => {
                const selected = openSlots.includes(slot);
                return (
                  <button
                    key={slot}
                    onClick={() => toggleSlot(slot)}
                    className={`py-2 rounded-lg text-sm font-medium transition border-2 ${
                      selected
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {slot}
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-100 transition"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition"
            style={saving ? { opacity: 0.5 } : undefined}
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// DayDetailModal — 日付クリックで開く「その日の詳細」モーダル
// ────────────────────────────────────────────────────────────
const STATUS_LABEL: Record<string, string> = {
  confirmed: '確定',
  tentative: '仮予約',
  cancelled: 'キャンセル',
  completed: '完了',
};

interface DayDetailModalProps {
  dateKey: string; // "YYYY-MM-DD"
  events: any[];
  timeSlots: string[];
  availability: any;
  userRole: string;
  onSelectEvent: (ev: any) => void;
  onNewReservation: (dateKey: string) => void;
  onManageSlots: (dateKey: string) => void;
  onClose: () => void;
}

function DayDetailModal({
  dateKey, events, timeSlots, availability, userRole,
  onSelectEvent, onNewReservation, onManageSlots, onClose,
}: DayDetailModalProps) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  const dowLabel = ['日', '月', '火', '水', '木', '金', '土'][dow];
  const dowColor = dow === 0 ? 'text-red-600' : dow === 6 ? 'text-blue-600' : 'text-slate-700';

  const cellSlots = getSlotsForDate(dateKey, dow, timeSlots, availability);

  // スロットごとの予約状況
  const slotStatus = useMemo(() => {
    const map: Record<string, any[]> = {};
    (cellSlots || []).forEach(slot => { map[slot] = []; });
    events.forEach(ev => {
      const slotH = ev.start.getHours();
      const slotMin = ev.start.getMinutes();
      const slotKey = `${fmt2(slotH)}:${fmt2(slotMin)}`;
      if (map[slotKey] !== undefined) {
        map[slotKey].push(ev);
      } else {
        // 最も近いスロットに割り当て
        const closest = (cellSlots || []).find(s => parseInt(s) <= slotH) || (cellSlots || [])[0];
        if (closest) {
          if (!map[closest]) map[closest] = [];
          map[closest].push(ev);
        }
      }
    });
    return map;
  }, [cellSlots, events]);

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ maxWidth: '32rem', maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100 flex-shrink-0">
          <div>
            <p className={`text-3xl font-bold ${dowColor} tabular-nums`}>
              {m}月{d}日
              <span className="text-xl ml-2 font-semibold">（{dowLabel}）</span>
            </p>
            <p className="text-xs text-slate-400 mt-0.5">{y}年</p>
          </div>
          <div className="flex items-center gap-2">
            {userRole === 'admin' && (
              <button
                onClick={() => { onManageSlots(dateKey); onClose(); }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition text-xs font-medium"
              >
                <Settings className="w-3.5 h-3.5" />枠管理
              </button>
            )}
            <button
              onClick={() => onNewReservation(dateKey)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition text-xs font-medium"
            >
              <Plus className="w-3.5 h-3.5" />新規予約
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition text-slate-400 hover:text-slate-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* スロット状況バー */}
        {cellSlots === null ? (
          <div className="px-5 py-3 bg-red-50 border-b border-red-100 flex-shrink-0">
            <span className="text-sm font-medium text-red-600">🔴 休業日</span>
          </div>
        ) : cellSlots.length === 0 ? (
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex-shrink-0">
            <span className="text-sm text-slate-500">予約枠なし</span>
          </div>
        ) : (
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex-shrink-0">
            <p className="text-xs text-slate-500 mb-2">時間帯の空き状況</p>
            <div className="flex gap-2 flex-wrap">
              {cellSlots.map(slot => {
                const slotEvents = slotStatus[slot] || [];
                const filled = slotEvents.length > 0;
                return (
                  <div
                    key={slot}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-mono font-medium border ${
                      filled
                        ? 'bg-blue-100 border-blue-300 text-blue-700'
                        : 'bg-green-100 border-green-300 text-green-700'
                    }`}
                  >
                    {slot}
                    <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] ${
                      filled ? 'bg-blue-600 text-white' : 'bg-green-500 text-white'
                    }`}>
                      {filled ? slotEvents.length : '○'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 予約一覧 */}
        <div className="overflow-y-auto flex-1 min-h-0">
          {events.length === 0 ? (
            <div className="py-10 text-center text-slate-400">
              <Calendar className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">この日の予約はありません</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {[...events]
                .sort((a, b) => a.start.getTime() - b.start.getTime())
                .map(ev => {
                  const timeStr = `${fmt2(ev.start.getHours())}:${fmt2(ev.start.getMinutes())}`;
                  const statusLabel = STATUS_LABEL[ev.status] || ev.status;
                  return (
                    <button
                      key={ev.id}
                      onClick={() => { onSelectEvent(ev); onClose(); }}
                      className="w-full text-left px-5 py-4 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        {/* 時刻 */}
                        <div className="text-center flex-shrink-0 mt-0.5">
                          <p className="text-lg font-bold tabular-nums text-slate-700 leading-none">{timeStr}</p>
                        </div>
                        {/* 内容 */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-base font-bold text-slate-900 truncate">
                              {ev.title}
                            </span>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(ev.status)}`}>
                              {statusLabel}
                            </span>
                          </div>
                          {ev.menuName && (
                            <p className="text-sm text-slate-500 truncate">📋 {ev.menuName}</p>
                          )}
                          {ev.staffName && (
                            <p className="text-sm text-slate-500">👤 担当: {ev.staffName}</p>
                          )}
                          {ev.memo && (
                            <p className="text-xs text-slate-400 mt-1 bg-slate-50 rounded px-2 py-1 border border-slate-200 line-clamp-2">
                              📝 {ev.memo}
                            </p>
                          )}
                        </div>
                        {/* 矢印 */}
                        <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0 mt-2" />
                      </div>
                    </button>
                  );
                })}
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex-shrink-0">
          <p className="text-xs text-slate-400 text-center">
            {events.length}件の予約 {cellSlots !== null ? `/ ${cellSlots.length}スロット` : '/ 休業日'}
          </p>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// スケルトン UI（ロード中の骨格表示）
// ────────────────────────────────────────────────────────────
function CalendarSkeleton({ year, month }: { year: number; month: number }) {
  const grid = useMemo(() => getMonthGrid(year, month), [year, month]);
  const hasPlaceholder = (col: number, row: number) => (col + row * 3) % 5 === 0;

  return (
    <div className="cal-root animate-pulse">
      <div className="cal-header flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 bg-slate-200 rounded-lg" />
          <div className="h-8 w-14 bg-slate-200 rounded-lg" />
          <div className="h-8 w-8 bg-slate-200 rounded-lg" />
          <div className="h-7 w-28 bg-slate-200 rounded ml-2" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-28 bg-slate-200 rounded-lg" />
          <div className="h-9 w-24 bg-slate-200 rounded-lg" />
        </div>
      </div>
      <div className="cal-container bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="cal-weekdays grid grid-cols-7 border-b border-slate-200 bg-slate-50">
          {WEEKDAYS_JA.map((day, idx) => (
            <div key={day} className={`text-center py-2 text-xs font-semibold ${
              idx === 0 ? 'text-red-400' : idx === 6 ? 'text-blue-400' : 'text-slate-400'
            }`}>{day}</div>
          ))}
        </div>
        <div className="cal-grid">
          {grid.map((row, rowIdx) => (
            <div key={rowIdx} className="cal-row grid grid-cols-7 border-b border-slate-100 last:border-b-0">
              {row.map((cellDate, colIdx) => (
                <div
                  key={cellDate ? cellDate.toISOString().slice(0, 10) : `e-${rowIdx}-${colIdx}`}
                  className={`cal-cell p-1 border-r border-slate-100 last:border-r-0 ${!cellDate ? 'bg-slate-50' : ''}`}
                >
                  {cellDate && (
                    <>
                      <div className="h-4 w-5 bg-slate-200 rounded mb-1.5" />
                      {hasPlaceholder(colIdx, rowIdx) && <div className="h-5 w-full bg-slate-200 rounded mb-0.5" />}
                      {hasPlaceholder(colIdx + 1, rowIdx) && <div className="h-5 w-full bg-slate-200 rounded mb-0.5" />}
                    </>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// CalendarPage
// ────────────────────────────────────────────────────────────
interface CalendarPageProps {
  userRole: string;
  initialLocations?: Location[];
}

export function CalendarPage({ userRole, initialLocations = [] }: CalendarPageProps) {
  const [reservations, setReservations] = useState<any[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [customersForModal, setCustomersForModal] = useState<Customer[]>([]);
  const [locations, setLocations] = useState<Location[]>(initialLocations);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
    initialLocations[0]?.location_id ?? null
  );
  const [users, setUsers] = useState<User[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [availability, setAvailability] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [workOrderModalOpen, setWorkOrderModalOpen] = useState(false);
  const [editingReservation, setEditingReservation] = useState<Reservation | null>(null);
  const [editingWorkOrder, setEditingWorkOrder] = useState<WorkOrder | null>(null);
  const [reservationMode, setReservationMode] = useState<'view' | 'edit'>('edit');
  const [slotModalDate, setSlotModalDate] = useState<string | null>(null);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);

  const [date, setDate] = useState(new Date());

  const year = date.getFullYear();
  const month = date.getMonth();
  const monthParam = useMemo(
    () => `${year}-${String(month + 1).padStart(2, '0')}`,
    [year, month]
  );

  const selectedLocationIdRef = useRef<string | null>(selectedLocationId);
  useEffect(() => { selectedLocationIdRef.current = selectedLocationId; }, [selectedLocationId]);

  const applyCalendarData = useCallback((calData: any) => {
    setReservations(calData.reservations || []);
    setLocations(prev => calData.locations?.length ? calData.locations : prev);
    setMenuItems(calData.menu_items || []);
    setUsers(calData.users || []);
    setCustomers(calData.customers || []);
    if (calData.work_orders) setWorkOrders(calData.work_orders);
    if (calData.settings) setSettings(calData.settings);
    if (calData.availability !== undefined) setAvailability(calData.availability);
  }, []);

  const loadCalendarData = useCallback(async (locationIdOverride?: string | null) => {
    setLoading(true);
    try {
      // プリフェッチ結果を優先して使用
      const prefetched = consumeCalendarPrefetch(monthParam);
      if (prefetched) {
        console.log('[CalendarPage] プリフェッチ結果を使用');
        const result = await prefetched;
        if (result) {
          const { meData, calendarData } = result;
          const locs = (meData.locations as Location[]);
          if (locs?.length > 0) {
            setLocations(locs);
            if (!selectedLocationIdRef.current) {
              const firstLocId = locs[0]?.location_id ?? null;
              setSelectedLocationId(firstLocId);
              selectedLocationIdRef.current = firstLocId;
            }
          }
          applyCalendarData(calendarData);
          return;
        }
      }

      // 通常リクエスト
      let locId = locationIdOverride !== undefined ? locationIdOverride : selectedLocationIdRef.current;
      if (!locId && locations.length === 0) {
        console.log('[CalendarPage] /me でロケーション取得');
        try {
          const meData = await apiRequest<{ user: any; locations: Location[] }>('/me');
          const locs = meData.locations || [];
          setLocations(locs);
          locId = locs[0]?.location_id ?? null;
          setSelectedLocationId(locId);
          selectedLocationIdRef.current = locId;
        } catch (meErr) {
          console.warn('[CalendarPage] /me 失敗:', meErr);
        }
      }

      const locationParam = locId ? `&location_id=${locId}` : '';
      const calData = await apiRequest(`/calendar-data?month=${monthParam}${locationParam}`);
      applyCalendarData(calData);
    } catch (err: any) {
      console.error('[CalendarPage] データ読み込み失敗:', err);
      toast.error('データの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthParam, applyCalendarData]);

  // 月が変わったら再取得
  useEffect(() => {
    loadCalendarData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthParam]);

  // ロケーション切り替え時に再取得（初回マウントはスキップ）
  const isFirstMountRef = useRef(true);
  useEffect(() => {
    if (isFirstMountRef.current) { isFirstMountRef.current = false; return; }
    loadCalendarData(selectedLocationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLocationId]);

  const handleDelete = async (reservationId: string) => {
    try {
      await apiRequest(`/reservations/${reservationId}`, { method: 'DELETE' });
      toast.success('予約を削除しました');
      await loadCalendarData();
    } catch (err: any) {
      toast.error('削除に失敗しました: ' + err.message);
    }
  };

  const handleSave = async () => {
    setModalOpen(false);
    setEditingReservation(null);
    await loadCalendarData();
  };

  /** 営業時間設定からタイムスロット一覧を算出 */
  const timeSlots = useMemo(() => {
    // business_hours_start/end は "09:00" 形式または数値
    const parseHour = (v: any, def: number) => {
      if (v === undefined || v === null) return def;
      if (typeof v === 'number') return v;
      const parts = String(v).split(':');
      return parseInt(parts[0], 10) + (parseInt(parts[1] || '0', 10) / 60);
    };
    const startH = parseHour(settings?.business_hours_start ?? availability?.business_hours_start, 9);
    const endH   = parseHour(settings?.business_hours_end   ?? availability?.business_hours_end,   18);
    // スロット間隔: availability.custom_hours._slot_interval_hours から取得 (デフォルト 2時間)
    const customH = availability?.custom_hours;
    const intervalH = customH?._slot_interval_hours ? Number(customH._slot_interval_hours) : 2;
    return buildTimeSlots(startH, endH, intervalH);
  }, [settings, availability]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    const custMap = Object.fromEntries(customers.map((c: any) => [c.customer_id, c]));
    const menuMap = Object.fromEntries(menuItems.map((m: any) => [m.menu_item_id, m]));
    const userMap = Object.fromEntries(users.map((u: any) => [u.user_id, u]));
    reservations.forEach((r: any) => {
      const cust = custMap[r.customer_id];
      const customerName = cust?.child_name || cust?.parent_name || r.customer_name || '名称未設定';
      const menuName = menuMap[r.menu_item_id]?.name || '';
      const staffName = userMap[r.staff_id_main]?.name || '';
      const start = new Date(r.reservation_date_time);
      const key = start.toISOString().slice(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push({
        id: r.reservation_id,
        title: customerName,
        menuName,
        staffName,
        start,
        resource: r,
        status: r.status,
        memo: r.notes_staff || '',
      });
    });
    return map;
  }, [reservations, customers, menuItems, users]);

  const handleSelectEvent = useCallback(async (event: any) => {
    try {
      setDetailLoading(true);
      const data = await apiRequest(`/reservations/${event.resource.reservation_id}`) as any;
      setCustomersForModal(data.customer ? [data.customer] : []);
      setEditingReservation(data.reservation);
      setReservationMode('view');
      setUsers(prev => (prev.length > 0 ? prev : (data.users || [])));
      setModalOpen(true);
    } catch (err: any) {
      toast.error('詳細の取得に失敗しました');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const monthGrid = useMemo(() => getMonthGrid(year, month), [year, month]);

  const prevMonth = () => setDate(new Date(year, month - 1, 1));
  const nextMonth = () => setDate(new Date(year, month + 1, 1));
  const goToday  = () => setDate(new Date());

  // ── ロード中はスケルトン UI ────────────────────────────────
  if (loading) return <CalendarSkeleton year={year} month={month} />;

  return (
    <div className="cal-root">
      {/* ヘッダー */}
      <div className="cal-header flex items-center justify-between gap-3 mb-3">
        {/* 月ナビゲーション */}
        <div className="flex items-center gap-1">
          <button
            onClick={prevMonth}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition"
            aria-label="前月"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={goToday}
            className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition border border-slate-200"
          >
            今日
          </button>
          <button
            onClick={nextMonth}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition"
            aria-label="次月"
          >
            <ChevronRight size={20} />
          </button>
          <h1 className="text-xl font-bold text-slate-900 ml-2 tabular-nums">
            {year}年{month + 1}月
          </h1>
        </div>

        {/* ロケーション + 新規予約 */}
        <div className="flex items-center gap-2">
          {locations.length > 1 && (
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
              <MapPin size={14} className="text-slate-400 flex-shrink-0" />
              <select
                value={selectedLocationId ?? ''}
                onChange={(e) => setSelectedLocationId(e.target.value || null)}
                className="text-sm text-slate-700 bg-transparent focus:outline-none pr-1"
              >
                {userRole === 'admin' && <option value="">全店舗</option>}
                {locations.map(loc => (
                  <option key={loc.location_id} value={loc.location_id}>{loc.name}</option>
                ))}
              </select>
            </div>
          )}
          {locations.length === 1 && (
            <div className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-600">
              <MapPin size={14} className="text-slate-400" />
              {locations[0].name}
            </div>
          )}
          {userRole === 'admin' && (
            <button
              onClick={() => setBulkModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-100 transition text-sm font-medium"
              title="予約枠を一括設定"
            >
              <Layers size={15} />
              <span className="hidden sm:inline">一括設定</span>
            </button>
          )}
          <button
            onClick={() => {
              setEditingReservation(null);
              setCustomersForModal([]);
              setReservationMode('edit');
              setModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium shadow-sm"
          >
            <Plus size={16} />
            新規予約
          </button>
        </div>
      </div>

      {/* カレンダー本体 */}
      <div className="cal-container relative bg-white rounded-xl border border-slate-200 overflow-hidden">
        {detailLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/75 z-10">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent" />
          </div>
        )}

        {/* 曜日ヘッダー */}
        <div className="cal-weekdays grid grid-cols-7 border-b border-slate-200 bg-slate-50">
          {WEEKDAYS_JA.map((day, idx) => (
            <div key={day} className={`text-center py-2 text-xs font-semibold ${
              idx === 0 ? 'text-red-500' : idx === 6 ? 'text-blue-500' : 'text-slate-600'
            }`}>{day}</div>
          ))}
        </div>

        {/* 日付グリッド */}
        <div className="cal-grid">
          {monthGrid.map((row, rowIdx) => (
            <div key={rowIdx} className="cal-row grid grid-cols-7 border-b border-slate-100 last:border-b-0">
              {row.map((cellDate, colIdx) => {
                const key = cellDate
                  ? cellDate.toISOString().slice(0, 10)
                  : `empty-${rowIdx}-${colIdx}`;
                const events = cellDate ? (eventsByDate[key] || []) : [];
                const isToday = cellDate && new Date().toDateString() === cellDate.toDateString();
                const dow = cellDate?.getDay();

                // 当日の開放スロット（null = 休業日）
                const cellSlots = cellDate
                  ? getSlotsForDate(key, dow!, timeSlots, availability)
                  : null;

                return (
                  <div
                    key={key}
                    className={`cal-cell p-1 border-r border-slate-100 last:border-r-0 flex flex-col ${
                      !cellDate ? 'bg-slate-50/60' : 'bg-white hover:bg-blue-50/30 transition-colors cursor-pointer'
                    }`}
                    onClick={() => cellDate && setSelectedDayKey(key)}
                  >
                    {cellDate && (
                      <>
                        {/* 日付 + 歯車ボタン（管理者のみ） */}
                        <div className="flex items-center justify-between mb-0.5">
                          <span className={`text-xs font-bold inline-flex items-center justify-center w-6 h-6 rounded-full flex-shrink-0 ${
                            isToday        ? 'bg-blue-600 text-white'
                              : dow === 0  ? 'text-red-500'
                              : dow === 6  ? 'text-blue-500'
                              : 'text-slate-700'
                          }`}>
                            {cellDate.getDate()}
                          </span>
                          {userRole === 'admin' && (
                            <button
                              className="gear-btn"
                              onClick={(e) => { e.stopPropagation(); setSlotModalDate(key); }}
                              title="予約枠を管理"
                            >
                              <Settings className="w-3 h-3" />
                            </button>
                          )}
                        </div>

                        {/* 予約タグ一覧（メモ含む・自動伸縮） */}
                        <div className="cal-events">
                          {events.map((ev: any) => {
                            const timeStr = `${fmt2(ev.start.getHours())}:${fmt2(ev.start.getMinutes())}`;
                            return (
                              <button
                                key={ev.id}
                                onClick={(e) => { e.stopPropagation(); handleSelectEvent(ev); }}
                                className={`${getStatusColor(ev.status)} text-left px-1 py-0.5 rounded w-full hover:opacity-80 transition flex flex-col min-w-0`}
                                title={`${timeStr} ${ev.title}${ev.menuName ? ' / ' + ev.menuName : ''}${ev.staffName ? ' 担:' + ev.staffName : ''}`}
                              >
                                {/* 時刻 + 顧客名 */}
                                <div className="flex items-center gap-0.5 min-w-0">
                                  <span className="text-[10px] font-mono opacity-90 flex-shrink-0 leading-tight">{timeStr}</span>
                                  <span className="truncate text-[11px] font-semibold leading-tight">{ev.title}</span>
                                </div>
                                {/* メニュー + 担当者 */}
                                {(ev.menuName || ev.staffName) && (
                                  <div className="flex items-center gap-1 min-w-0 opacity-80">
                                    {ev.menuName && <span className="truncate text-[10px] leading-tight">{ev.menuName}</span>}
                                    {ev.staffName && <span className="text-[10px] leading-tight flex-shrink-0">担:{ev.staffName.charAt(0)}</span>}
                                  </div>
                                )}
                                {/* スタッフメモ（長い場合は自動展開） */}
                                {ev.memo && <div className="res-memo">{ev.memo}</div>}
                              </button>
                            );
                          })}
                        </div>

                        {/* タイムスロットバー */}
                        <div className="slot-bar">
                          {cellSlots === null ? (
                            /* 休業日 */
                            <span style={{ fontSize: '9px', color: '#94a3b8', width: '100%', textAlign: 'center', lineHeight: '14px' }}>
                              休
                            </span>
                          ) : cellSlots.length === 0 ? (
                            /* スロットなし（特殊設定） */
                            <span style={{ fontSize: '9px', color: '#94a3b8', width: '100%', textAlign: 'center', lineHeight: '14px' }}>
                              ―
                            </span>
                          ) : (
                            cellSlots.map(slot => {
                              const slotH = parseInt(slot.split(':')[0], 10);
                              const slotFilled = events.some(ev =>
                                ev.start.getHours() >= slotH && ev.start.getHours() < slotH + 2
                              );
                              return (
                                <div key={slot} className="slot-block">
                                  <div className={`slot-block-bar ${slotFilled ? 'slot-filled' : 'slot-open'}`} />
                                  <span className={`slot-block-label ${slotFilled ? 'slot-label-filled' : 'slot-label-open'}`}>
                                    {slot.slice(0, 2)}
                                  </span>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* 予約詳細モーダル */}
      {modalOpen && (
        <ReservationModal
          reservation={editingReservation}
          customers={customersForModal}
          locations={locations}
          users={users}
          menuItems={menuItems}
          mode={reservationMode}
          onSave={handleSave}
          onClose={() => { setModalOpen(false); setEditingReservation(null); }}
          onDelete={handleDelete}
        />
      )}

      {/* 作品モーダル */}
      {workOrderModalOpen && (
        <WorkOrderModal
          workOrder={editingWorkOrder}
          reservations={reservations}
          customers={customersForModal}
          menuItems={menuItems}
          onSave={() => {
            setWorkOrderModalOpen(false);
            setEditingWorkOrder(null);
            loadCalendarData();
          }}
          onClose={() => { setWorkOrderModalOpen(false); setEditingWorkOrder(null); }}
        />
      )}

      {/* 一括スロット設定モーダル（管理者のみ） */}
      {bulkModalOpen && (
        <BulkSlotModal
          currentYear={year}
          currentMonth={month}
          timeSlots={timeSlots}
          availability={availability}
          selectedLocationId={selectedLocationId}
          onSave={(updated) => { setAvailability(updated); setBulkModalOpen(false); }}
          onClose={() => setBulkModalOpen(false)}
        />
      )}

      {/* 個別スロット管理モーダル（管理者のみ） */}
      {slotModalDate && (
        <SlotManagementModal
          dateKey={slotModalDate}
          allSlots={timeSlots}
          availability={availability}
          selectedLocationId={selectedLocationId}
          onSave={(updated) => { setAvailability(updated); setSlotModalDate(null); }}
          onClose={() => setSlotModalDate(null)}
        />
      )}

      {/* 日付詳細モーダル（日付セルクリックで開く） */}
      {selectedDayKey && (
        <DayDetailModal
          dateKey={selectedDayKey}
          events={eventsByDate[selectedDayKey] || []}
          timeSlots={timeSlots}
          availability={availability}
          userRole={userRole}
          onSelectEvent={handleSelectEvent}
          onNewReservation={(dk) => {
            setSelectedDayKey(null);
            setEditingReservation(null);
            setCustomersForModal([]);
            setReservationMode('edit');
            setModalOpen(true);
          }}
          onManageSlots={(dk) => { setSlotModalDate(dk); }}
          onClose={() => setSelectedDayKey(null)}
        />
      )}
    </div>
  );
}
