/**
 * 予約ワークフロー管理
 * 予約 → 制作物 → インセンティブの業務フローを管理
 */

import { toast } from 'sonner@2.0.3';
import { post, put } from '../api/client';
import { API_ENDPOINTS } from '../api/endpoints';

// ============================================
// ワークフロー定義
// ============================================

/**
 * 予約ステータスの遷移ルール
 */
export const RESERVATION_STATUS_FLOW = {
  confirmed: ['cancelled', 'completed'],
  cancelled: [], // キャンセル後は変更不可
  completed: [], // 完了後は変更不可
} as const;

/**
 * 制作物ステータスの遷移ルール
 */
export const WORK_ORDER_STATUS_FLOW = {
  '制作中': ['お渡し待ち'],
  'お渡し待ち': ['引渡し済'],
  '引渡し済': [], // 引渡し済み後は変更不可
} as const;

/**
 * ステータス遷移が可能かチェック
 */
export function canTransitionStatus<T extends string>(
  currentStatus: T,
  nextStatus: T,
  flow: Record<T, readonly T[]>
): boolean {
  const allowedTransitions = flow[currentStatus];
  return allowedTransitions?.includes(nextStatus) ?? false;
}

// ============================================
// 予約関連ワークフロー
// ============================================

/**
 * 予約作成時の自動処理
 * - 予約作成
 * - （オプション）制作物の自動生成
 */
export async function createReservationWithWorkflow(data: {
  customer_id: string;
  reservation_date: string;
  reservation_time: string;
  location_id: string;
  menu_item_id: string;
  additional_units: number;
  notes?: string;
  createWorkOrder?: boolean; // 制作物を自動生成するか
  assignedStaffId?: string; // 制作物の担当スタッフ
}): Promise<{ reservation: any; workOrder?: any }> {
  try {
    // 1. 予約を作成
    const reservationResponse = await post(API_ENDPOINTS.reservations.create, {
      customer_id: data.customer_id,
      reservation_date: data.reservation_date,
      reservation_time: data.reservation_time,
      location_id: data.location_id,
      menu_item_id: data.menu_item_id,
      additional_units: data.additional_units,
      notes: data.notes,
      status: 'confirmed',
    });

    const reservation = reservationResponse.reservation;
    let workOrder;

    // 2. 制作物を自動生成（オプション）
    if (data.createWorkOrder) {
      // 納期を計算（予約日 + 28日）
      const dueDate = new Date(data.reservation_date);
      dueDate.setDate(dueDate.getDate() + 28);
      const dueDateStr = dueDate.toISOString().split('T')[0];

      const workOrderResponse = await post(API_ENDPOINTS.workOrders.create, {
        customer_id: data.customer_id,
        reservation_id: reservation.reservation_id,
        product_type: 'ライフキャスティング', // デフォルト
        status: '制作中',
        due_date: dueDateStr,
        assigned_staff_id: data.assignedStaffId,
        notes: `予約ID: ${reservation.reservation_id} から自動生成`,
      });

      workOrder = workOrderResponse.work_order;

      toast.success('予約と制作物を作成しました');
    } else {
      toast.success('予約を作成しました');
    }

    return { reservation, workOrder };
  } catch (error: any) {
    console.error('[Workflow] createReservationWithWorkflow error:', error);
    toast.error(`予約の作成に失敗しました: ${error.message}`);
    throw error;
  }
}

/**
 * 予約ステータス更新
 * - ステータス遷移のバリデーション
 * - 関連制作物への影響チェック
 */
export async function updateReservationStatus(
  reservationId: string,
  currentStatus: 'confirmed' | 'cancelled' | 'completed',
  nextStatus: 'confirmed' | 'cancelled' | 'completed',
  options?: {
    cancelWorkOrders?: boolean; // 関連制作物もキャンセルするか
  }
): Promise<void> {
  try {
    // ステータス遷移の妥当性チェック
    if (!canTransitionStatus(currentStatus, nextStatus, RESERVATION_STATUS_FLOW)) {
      throw new Error(`予約ステータスを「${currentStatus}」から「${nextStatus}」に変更できません`);
    }

    // 予約ステータスを更新
    await put(API_ENDPOINTS.reservations.update(reservationId), {
      status: nextStatus,
    });

    // キャンセル時の追加処理
    if (nextStatus === 'cancelled' && options?.cancelWorkOrders) {
      // TODO: 関連制作物の処理（必要に応じて実装）
      console.log(`[Workflow] Cancelling work orders for reservation ${reservationId}`);
    }

    toast.success(`予約ステータスを「${nextStatus}」に更新しました`);
  } catch (error: any) {
    console.error('[Workflow] updateReservationStatus error:', error);
    toast.error(error.message || '予約ステータスの更新に失敗しました');
    throw error;
  }
}

// ============================================
// 制作物関連ワークフロー
// ============================================

/**
 * 制作物ステータス更新
 * - ステータス遷移のバリデーション
 * - インセンティブの自動生成（引渡し済み時）
 */
export async function updateWorkOrderStatus(
  workOrderId: string,
  currentStatus: '制作中' | 'お渡し待ち' | '引渡し済',
  nextStatus: '制作中' | 'お渡し待ち' | '引渡し済',
  options?: {
    assignedStaffId?: string;
    createIncentive?: boolean; // インセンティブを自動生成するか
    incentiveAmount?: number; // インセンティブ金額
  }
): Promise<{ workOrder: any; incentive?: any }> {
  try {
    // ステータス遷移の妥当性チェック
    if (!canTransitionStatus(currentStatus, nextStatus, WORK_ORDER_STATUS_FLOW)) {
      throw new Error(`制作物ステータスを「${currentStatus}」から「${nextStatus}」に変更できません`);
    }

    // 制作物ステータスを更新
    const updateData: any = {
      status: nextStatus,
    };

    // 引渡し済みの場合、引渡し日を記録
    if (nextStatus === '引渡し済') {
      updateData.delivery_date = new Date().toISOString().split('T')[0];
    }

    const workOrderResponse = await put(API_ENDPOINTS.workOrders.update(workOrderId), updateData);
    const workOrder = workOrderResponse.work_order;

    let incentive;

    // 引渡し済み時にインセンティブを自動生成
    if (nextStatus === '引渡し済' && options?.createIncentive && options?.assignedStaffId) {
      try {
        // TODO: インセンティブAPIエンドポイントの実装が必要
        // const incentiveResponse = await post(API_ENDPOINTS.incentives.create, {
        //   staff_id: options.assignedStaffId,
        //   work_order_id: workOrderId,
        //   amount: options.incentiveAmount || 0,
        //   paid: false,
        // });
        // incentive = incentiveResponse.incentive;
        
        console.log(`[Workflow] Would create incentive for staff ${options.assignedStaffId}`);
      } catch (incentiveError) {
        console.error('[Workflow] Failed to create incentive:', incentiveError);
        // インセンティブ生成失敗はワークフロー全体を失敗させない
        toast.warning('制作物は更新されましたが、インセンティブの生成に失敗しました');
      }
    }

    toast.success(`制作物ステータスを「${nextStatus}」に更新しました`);

    return { workOrder, incentive };
  } catch (error: any) {
    console.error('[Workflow] updateWorkOrderStatus error:', error);
    toast.error(error.message || '制作物ステータスの更新に失敗しました');
    throw error;
  }
}

/**
 * 制作物の割り当て変更
 */
export async function assignWorkOrder(
  workOrderId: string,
  staffId: string
): Promise<void> {
  try {
    await put(API_ENDPOINTS.workOrders.update(workOrderId), {
      assigned_staff_id: staffId,
    });

    toast.success('担当スタッフを割り当てました');
  } catch (error: any) {
    console.error('[Workflow] assignWorkOrder error:', error);
    toast.error('担当スタッフの割り当てに失敗しました');
    throw error;
  }
}

// ============================================
// バッチ処理
// ============================================

/**
 * 期限切れ制作物の検出
 */
export function getOverdueWorkOrders(workOrders: any[]): any[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return workOrders.filter(wo => {
    // 引渡し済みは除外
    if (wo.status === '引渡し済') return false;

    const dueDate = new Date(wo.due_date);
    dueDate.setHours(0, 0, 0, 0);

    return dueDate < today;
  });
}

/**
 * 期限が近い制作物の検出（指定日数以内）
 */
export function getUpcomingDueWorkOrders(workOrders: any[], days: number = 7): any[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const futureDate = new Date(today);
  futureDate.setDate(futureDate.getDate() + days);

  return workOrders.filter(wo => {
    // 引渡し済みは除外
    if (wo.status === '引渡し済') return false;

    const dueDate = new Date(wo.due_date);
    dueDate.setHours(0, 0, 0, 0);

    return dueDate >= today && dueDate <= futureDate;
  });
}
