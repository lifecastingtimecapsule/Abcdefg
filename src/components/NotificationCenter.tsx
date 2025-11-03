/**
 * NotificationCenter - 通知センターコンポーネント
 * アラートの一覧表示と管理
 */

import { useState, useEffect } from 'react';
import { Bell, X, Check, CheckCheck, Trash2 } from 'lucide-react';
import {
  Alert,
  getStoredAlerts,
  getUnreadAlerts,
  markAlertAsRead,
  markAllAlertsAsRead,
  clearAlerts,
} from '../utils/notifications/alerts';

interface NotificationCenterProps {
  onAlertClick?: (alert: Alert) => void;
}

export function NotificationCenter({ onAlertClick }: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // アラートを読み込み
  useEffect(() => {
    loadAlerts();
    
    // 定期的にアラートを更新（10秒ごと）
    const interval = setInterval(loadAlerts, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadAlerts = () => {
    const storedAlerts = getStoredAlerts();
    const unreadAlerts = getUnreadAlerts();
    
    setAlerts(storedAlerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()));
    setUnreadCount(unreadAlerts.length);
  };

  const handleAlertClick = (alert: Alert) => {
    // 既読にする
    markAlertAsRead(alert.id);
    loadAlerts();
    
    // コールバック実行
    if (onAlertClick) {
      onAlertClick(alert);
    }
  };

  const handleMarkAllAsRead = () => {
    markAllAlertsAsRead();
    loadAlerts();
  };

  const handleClearAll = () => {
    if (confirm('すべての通知を削除しますか？')) {
      clearAlerts();
      loadAlerts();
    }
  };

  const getSeverityColor = (severity: Alert['severity']) => {
    switch (severity) {
      case 'error':
        return 'bg-red-50 border-red-200 text-red-900';
      case 'warning':
        return 'bg-amber-50 border-amber-200 text-amber-900';
      case 'success':
        return 'bg-green-50 border-green-200 text-green-900';
      case 'info':
      default:
        return 'bg-blue-50 border-blue-200 text-blue-900';
    }
  };

  const formatTimestamp = (timestamp: Date) => {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'たった今';
    if (minutes < 60) return `${minutes}分前`;
    if (hours < 24) return `${hours}時間前`;
    if (days < 7) return `${days}日前`;
    
    return timestamp.toLocaleDateString('ja-JP', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="relative">
      {/* 通知ベルアイコン */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg hover:bg-slate-100 transition-colors"
        aria-label="通知"
      >
        <Bell className="w-5 h-5 text-slate-600" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* 通知パネル */}
      {isOpen && (
        <>
          {/* 背景オーバーレイ */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* 通知リスト */}
          <div className="absolute right-0 top-12 z-50 w-96 max-h-[600px] bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
            {/* ヘッダー */}
            <div className="p-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-slate-900">通知</h3>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 rounded hover:bg-slate-200 transition-colors"
                  aria-label="閉じる"
                >
                  <X className="w-4 h-4 text-slate-600" />
                </button>
              </div>

              {/* アクションボタン */}
              {alerts.length > 0 && (
                <div className="flex gap-2">
                  <button
                    onClick={handleMarkAllAsRead}
                    className="flex items-center gap-1 px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    <CheckCheck className="w-4 h-4" />
                    すべて既読
                  </button>
                  <button
                    onClick={handleClearAll}
                    className="flex items-center gap-1 px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    すべて削除
                  </button>
                </div>
              )}
            </div>

            {/* 通知リスト */}
            <div className="overflow-y-auto max-h-[500px]">
              {alerts.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  <Bell className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                  <p>通知はありません</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {alerts.map(alert => (
                    <div
                      key={alert.id}
                      className={`p-4 cursor-pointer transition-colors ${
                        alert.read ? 'bg-white hover:bg-slate-50' : 'bg-blue-50 hover:bg-blue-100'
                      }`}
                      onClick={() => handleAlertClick(alert)}
                    >
                      <div className="flex items-start gap-3">
                        {/* 未読インジケーター */}
                        {!alert.read && (
                          <div className="w-2 h-2 bg-blue-500 rounded-full mt-2" />
                        )}

                        <div className="flex-1 min-w-0">
                          {/* タイトル */}
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-slate-900">{alert.title}</p>
                          </div>

                          {/* メッセージ */}
                          <p className="text-sm text-slate-600 mb-2">{alert.message}</p>

                          {/* タイムスタンプ */}
                          <p className="text-xs text-slate-400">{formatTimestamp(alert.timestamp)}</p>
                        </div>

                        {/* 既読ボタン */}
                        {!alert.read && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              markAlertAsRead(alert.id);
                              loadAlerts();
                            }}
                            className="p-1 rounded hover:bg-blue-200 transition-colors"
                            aria-label="既読にする"
                          >
                            <Check className="w-4 h-4 text-blue-600" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
