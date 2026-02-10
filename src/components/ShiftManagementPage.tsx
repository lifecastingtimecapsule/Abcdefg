import { useState, useEffect } from 'react';
import { apiRequest } from '../utils/api';
import { User, Shift } from '../types';
import { toast } from 'sonner@2.0.3';
import { ChevronLeft, ChevronRight, Clock, Calendar as CalendarIcon, Save, X } from 'lucide-react';
import moment from 'moment';
import 'moment/locale/ja';

// Japanese holidays calculation or fixed list could be added here
// For now, we just rely on moment for weekdays

export function ShiftManagementPage() {
  const [currentMonth, setCurrentMonth] = useState(moment());
  const [users, setUsers] = useState<User[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal state
  const [selectedShift, setSelectedShift] = useState<{staffId: string, date: string} | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  
  // Edit form state
  const [editType, setEditType] = useState<'work' | 'holiday' | 'off' | 'training'>('work');
  const [editStartTime, setEditStartTime] = useState('10:00');
  const [editEndTime, setEditEndTime] = useState('19:00');
  const [editNotes, setEditNotes] = useState('');

  useEffect(() => {
    loadData();
  }, [currentMonth]);

  const loadData = async () => {
    try {
      setLoading(true);
      const yearMonth = currentMonth.format('YYYY-MM');
      
      const [usersData, shiftsData] = await Promise.all([
        apiRequest('/users'),
        apiRequest(`/shifts?year_month=${yearMonth}`)
      ]);
      
      // Filter active staff
      // Note: API returns { users: [] } and { shifts: [] }
      setUsers(usersData.users.filter((u: any) => u.active_flag !== false));
      setShifts(shiftsData.shifts || []);
      
    } catch (error) {
      console.error('Failed to load shift data:', error);
      toast.error('データの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const daysInMonth = currentMonth.daysInMonth();
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const getShift = (staffId: string, day: number) => {
    const dateStr = currentMonth.clone().date(day).format('YYYY-MM-DD');
    return shifts.find(s => s.staff_id === staffId && s.date === dateStr);
  };

  const handleCellClick = (staffId: string, day: number) => {
    const dateStr = currentMonth.clone().date(day).format('YYYY-MM-DD');
    const shift = getShift(staffId, day);
    
    setSelectedShift({ staffId, date: dateStr });
    
    if (shift) {
      setEditType(shift.shift_type);
      setEditStartTime(shift.start_time || '10:00');
      setEditEndTime(shift.end_time || '19:00');
      setEditNotes(shift.notes || '');
    } else {
      setEditType('work');
      setEditStartTime('10:00');
      setEditEndTime('19:00');
      setEditNotes('');
    }
    
    setModalOpen(true);
  };

  const handleSaveShift = async () => {
    if (!selectedShift) return;

    try {
      const payload = {
        staff_id: selectedShift.staffId,
        date: selectedShift.date,
        shift_type: editType,
        start_time: editType === 'work' ? editStartTime : null,
        end_time: editType === 'work' ? editEndTime : null,
        notes: editNotes
      };

      await apiRequest('/shifts', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      toast.success('シフトを保存しました');
      setModalOpen(false);
      loadData(); // Reload to reflect changes
    } catch (error) {
      console.error('Save shift error:', error);
      toast.error('保存に失敗しました');
    }
  };

  const handleDeleteShift = async () => {
    if (!selectedShift) return;
    
    if (!confirm('このシフトを削除してもよろしいですか？')) return;

    try {
      // DELETE expects query params for staff_id and date as per backend implementation
      await apiRequest(`/shifts?staff_id=${selectedShift.staffId}&date=${selectedShift.date}`, {
        method: 'DELETE'
      });

      toast.success('シフトを削除しました');
      setModalOpen(false);
      loadData();
    } catch (error) {
      console.error('Delete shift error:', error);
      toast.error('削除に失敗しました');
    }
  };

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">シフト管理</h1>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setCurrentMonth(currentMonth.clone().subtract(1, 'month'))}
            className="p-2 hover:bg-slate-100 rounded-full transition"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-lg font-semibold min-w-[120px] text-center">
            {currentMonth.format('YYYY年 M月')}
          </span>
          <button 
            onClick={() => setCurrentMonth(currentMonth.clone().add(1, 'month'))}
            className="p-2 hover:bg-slate-100 rounded-full transition"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 bg-white rounded-2xl shadow-sm overflow-hidden border border-slate-200 flex flex-col">
        {/* Scrollable container */}
        <div className="overflow-auto flex-1">
          <table className="w-full border-collapse">
            <thead className="bg-slate-50 sticky top-0 z-10">
              <tr>
                <th className="p-3 text-left font-medium text-slate-600 border-b border-r border-slate-200 min-w-[150px] sticky left-0 bg-slate-50 z-20">
                  スタッフ
                </th>
                {daysArray.map(day => {
                  const date = currentMonth.clone().date(day);
                  const isWeekend = date.day() === 0 || date.day() === 6;
                  const isSunday = date.day() === 0;
                  const isSaturday = date.day() === 6;
                  
                  return (
                    <th 
                      key={day} 
                      className={`p-2 text-center border-b border-slate-200 min-w-[60px] ${
                        isSunday ? 'text-red-500 bg-red-50' : isSaturday ? 'text-blue-500 bg-blue-50' : 'text-slate-600'
                      }`}
                    >
                      <div className="text-xs">{day}</div>
                      <div className="text-xs font-normal">{date.format('dd')}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={daysInMonth + 1} className="p-8 text-center">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
                  </td>
                </tr>
              ) : (
                users.map(user => (
                  <tr key={user.user_id} className="hover:bg-slate-50">
                    <td className="p-3 text-sm font-medium text-slate-900 border-b border-r border-slate-200 sticky left-0 bg-white z-10">
                      {user.name}
                    </td>
                    {daysArray.map(day => {
                      const shift = getShift(user.user_id, day);
                      const date = currentMonth.clone().date(day);
                      const isSunday = date.day() === 0;
                      const isSaturday = date.day() === 6;
                      
                      let cellClass = "";
                      let content = "";
                      
                      if (shift) {
                        if (shift.shift_type === 'work') {
                          cellClass = "bg-blue-50 text-blue-700 border-blue-100";
                          content = `${shift.start_time}\n~\n${shift.end_time}`;
                        } else if (shift.shift_type === 'off') {
                          cellClass = "bg-slate-100 text-slate-400";
                          content = "休";
                        } else if (shift.shift_type === 'holiday') {
                          cellClass = "bg-red-50 text-red-600";
                          content = "公休";
                        } else if (shift.shift_type === 'training') {
                          cellClass = "bg-green-50 text-green-700";
                          content = "研修";
                        }
                      } else {
                        // Empty state styling based on weekend
                        if (isSunday) cellClass = "bg-red-50/30";
                        else if (isSaturday) cellClass = "bg-blue-50/30";
                      }

                      return (
                        <td 
                          key={day}
                          onClick={() => handleCellClick(user.user_id, day)}
                          className={`p-1 text-center border-b border-slate-100 cursor-pointer transition-colors hover:brightness-95 h-16 text-xs whitespace-pre-line leading-tight ${cellClass}`}
                        >
                          {content}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {modalOpen && selectedShift && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-blue-600" />
                シフト編集
              </h3>
              <button 
                onClick={() => setModalOpen(false)}
                className="p-1 hover:bg-slate-200 rounded-full transition"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between text-sm text-slate-600 mb-2">
                <span>日付: {moment(selectedShift.date).format('YYYY年M月D日 (dd)')}</span>
                <span>スタッフ: {users.find(u => u.user_id === selectedShift.staffId)?.name}</span>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {(['work', 'off', 'holiday', 'training'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setEditType(type)}
                    className={`p-2 rounded-lg text-sm font-medium transition ${
                      editType === type
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {type === 'work' ? '出勤' : 
                     type === 'off' ? '休み' : 
                     type === 'holiday' ? '公休' : '研修'}
                  </button>
                ))}
              </div>

              {editType === 'work' && (
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-slate-500 mb-1">開始</label>
                    <div className="relative">
                      <Clock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="time"
                        value={editStartTime}
                        onChange={(e) => setEditStartTime(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <span className="text-slate-400 mt-5">~</span>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-slate-500 mb-1">終了</label>
                    <div className="relative">
                      <Clock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="time"
                        value={editEndTime}
                        onChange={(e) => setEditEndTime(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">備考</label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px]"
                  placeholder="備考があれば入力してください"
                />
              </div>

              <div className="flex gap-3 mt-6 pt-4 border-t border-slate-100">
                <button
                  onClick={handleDeleteShift}
                  className="px-4 py-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition text-sm font-medium"
                >
                  削除
                </button>
                <div className="flex-1"></div>
                <button
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl transition text-sm font-medium"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleSaveShift}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition shadow-sm text-sm font-medium flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
