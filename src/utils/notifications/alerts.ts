/**
 * 通知・アラートシステム
 * 期限アラート、ステータス変更通知など
 */

import { toast } from 'sonner@2.0.3';

// ============================================
// アラート種別
// ============================================

export enum AlertType {
  OVERDUE_WORK_ORDER = 'overdue_work_order',
  UPCOMING_DUE_WORK_ORDER = 'upcoming_due_work_order',
  RESERVATION_CREATED = 'reservation_created',
  WORK_ORDER_STATUS_CHANGED = 'work_order_status_changed',
  INCENTIVE_LOCKED = 'incentive_locked',
  STAFF_ASSIGNMENT = 'staff_assignment',
}

export interface Alert {
  id: string;
  type: AlertType;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'error' | 'success';
  timestamp: Date;
  read: boolean;
  data?: any; // アラートに関連するデータ
}

// ============================================
// アラート生成関数
// ============================================

/**
 * 期限切れ制作物のアラート
 */
export function createOverdueAlert(workOrder: {
  work_order_id: string;
  product_type: string;
  due_date: string;
  customer?: { parent_name: string; child_name: string };
}): Alert {
  const daysOverdue = Math.floor(
    (Date.now() - new Date(workOrder.due_date).getTime()) / (1000 * 60 * 60 * 24)
  );

  const customerName = workOrder.customer
    ? `${workOrder.customer.parent_name}様（${workOrder.customer.child_name}ちゃん）`
    : '不明';

  return {
    id: `overdue-${workOrder.work_order_id}`,
    type: AlertType.OVERDUE_WORK_ORDER,
    title: '⚠️ 納期超過',
    message: `${customerName}の${workOrder.product_type}が納期を${daysOverdue}日超過しています`,
    severity: 'error',
    timestamp: new Date(),
    read: false,
    data: { workOrder },
  };
}

/**
 * 期限が近い制作物のアラート
 */
export function createUpcomingDueAlert(workOrder: {
  work_order_id: string;
  product_type: string;
  due_date: string;
  customer?: { parent_name: string; child_name: string };
}): Alert {
  const daysUntilDue = Math.ceil(
    (new Date(workOrder.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  const customerName = workOrder.customer
    ? `${workOrder.customer.parent_name}様（${workOrder.customer.child_name}ちゃん）`
    : '不明';

  return {
    id: `upcoming-${workOrder.work_order_id}`,
    type: AlertType.UPCOMING_DUE_WORK_ORDER,
    title: '📅 納期接近',
    message: `${customerName}の${workOrder.product_type}の納期まであと${daysUntilDue}日です`,
    severity: 'warning',
    timestamp: new Date(),
    read: false,
    data: { workOrder },
  };
}

/**
 * 予約作成のアラート
 */
export function createReservationCreatedAlert(reservation: {
  reservation_id: string;
  reservation_date: string;
  customer?: { parent_name: string; child_name: string };
}): Alert {
  const customerName = reservation.customer
    ? `${reservation.customer.parent_name}様（${reservation.customer.child_name}ちゃん）`
    : '不明';

  return {
    id: `reservation-${reservation.reservation_id}`,
    type: AlertType.RESERVATION_CREATED,
    title: '✅ 予約が作成されました',
    message: `${customerName}の予約が${reservation.reservation_date}に作成されました`,
    severity: 'success',
    timestamp: new Date(),
    read: false,
    data: { reservation },
  };
}

/**
 * 制作物ステータス変更のアラート
 */
export function createWorkOrderStatusChangedAlert(
  workOrder: {
    work_order_id: string;
    product_type: string;
    customer?: { parent_name: string; child_name: string };
  },
  oldStatus: string,
  newStatus: string
): Alert {
  const customerName = workOrder.customer
    ? `${workOrder.customer.parent_name}様（${workOrder.customer.child_name}ちゃん）`
    : '不明';

  return {
    id: `status-${workOrder.work_order_id}-${Date.now()}`,
    type: AlertType.WORK_ORDER_STATUS_CHANGED,
    title: '🔄 ステータス変更',
    message: `${customerName}の${workOrder.product_type}が「${oldStatus}」→「${newStatus}」に変更されました`,
    severity: 'info',
    timestamp: new Date(),
    read: false,
    data: { workOrder, oldStatus, newStatus },
  };
}

/**
 * スタッフ割り当てのアラート
 */
export function createStaffAssignmentAlert(
  workOrder: {
    work_order_id: string;
    product_type: string;
    customer?: { parent_name: string; child_name: string };
  },
  staffName: string
): Alert {
  const customerName = workOrder.customer
    ? `${workOrder.customer.parent_name}様（${workOrder.customer.child_name}ちゃん）`
    : '不明';

  return {
    id: `assignment-${workOrder.work_order_id}-${Date.now()}`,
    type: AlertType.STAFF_ASSIGNMENT,
    title: '👤 担当割り当て',
    message: `${staffName}さんが${customerName}の${workOrder.product_type}の担当に割り当てられました`,
    severity: 'info',
    timestamp: new Date(),
    read: false,
    data: { workOrder, staffName },
  };
}

// ============================================
// トースト通知
// ============================================

/**
 * アラートをトースト通知として表示
 */
export function showAlertToast(alert: Alert) {
  const toastOptions: any = {
    description: alert.message,
  };

  switch (alert.severity) {
    case 'error':
      toast.error(alert.title, toastOptions);
      break;
    case 'warning':
      toast.warning(alert.title, toastOptions);
      break;
    case 'success':
      toast.success(alert.title, toastOptions);
      break;
    case 'info':
    default:
      toast.info(alert.title, toastOptions);
      break;
  }
}

/**
 * 複数のアラートをトースト通知として表示
 */
export function showAlertsToast(alerts: Alert[]) {
  alerts.forEach(alert => showAlertToast(alert));
}

// ============================================
// アラート管理（ローカルストレージ）
// ============================================

const ALERTS_STORAGE_KEY = 'amaretto_alerts';

/**
 * アラートをローカルストレージに保存
 */
export function saveAlert(alert: Alert) {
  const alerts = getStoredAlerts();
  alerts.push(alert);
  
  // 最大100件まで保持
  const recentAlerts = alerts.slice(-100);
  
  localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(recentAlerts));
}

/**
 * 保存されているアラートを取得
 */
export function getStoredAlerts(): Alert[] {
  const stored = localStorage.getItem(ALERTS_STORAGE_KEY);
  if (!stored) return [];
  
  try {
    const alerts = JSON.parse(stored);
    return alerts.map((a: any) => ({
      ...a,
      timestamp: new Date(a.timestamp),
    }));
  } catch {
    return [];
  }
}

/**
 * 未読アラートを取得
 */
export function getUnreadAlerts(): Alert[] {
  return getStoredAlerts().filter(alert => !alert.read);
}

/**
 * アラートを既読にする
 */
export function markAlertAsRead(alertId: string) {
  const alerts = getStoredAlerts();
  const updatedAlerts = alerts.map(alert =>
    alert.id === alertId ? { ...alert, read: true } : alert
  );
  
  localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(updatedAlerts));
}

/**
 * すべてのアラートを既読にする
 */
export function markAllAlertsAsRead() {
  const alerts = getStoredAlerts();
  const updatedAlerts = alerts.map(alert => ({ ...alert, read: true }));
  
  localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(updatedAlerts));
}

/**
 * アラートをクリア
 */
export function clearAlerts() {
  localStorage.removeItem(ALERTS_STORAGE_KEY);
}
