# Phase 3: RBAC & ワークフロー実装 - 実装完了

## 概要

Phase 3では、RBAC（ロールベースアクセス制御）と業務ワークフロー管理を実装しました。これにより、セキュアな権限管理と効率的な業務フローが実現されました。

---

## 実装した機能

### 1. **RBAC（ロールベースアクセス制御）**

#### ✅ 権限定義システム (`/utils/rbac/permissions.ts`)

**ロール定義:**
- `admin`（管理者）：すべての操作が可能
- `staff`（スタッフ）：基本操作と閲覧のみ

**権限（Permission）:**
```typescript
export enum Permission {
  // ダッシュボード
  VIEW_DASHBOARD,
  
  // 顧客管理
  VIEW_CUSTOMERS,
  CREATE_CUSTOMER,
  EDIT_CUSTOMER,
  DELETE_CUSTOMER,
  
  // 予約管理
  VIEW_RESERVATIONS,
  CREATE_RESERVATION,
  EDIT_RESERVATION,
  DELETE_RESERVATION,
  CANCEL_RESERVATION,
  
  // 制作物管理
  VIEW_WORK_ORDERS,
  CREATE_WORK_ORDER,
  EDIT_WORK_ORDER,
  DELETE_WORK_ORDER,
  ASSIGN_WORK_ORDER,
  
  // インセンティブ管理
  VIEW_INCENTIVES,         // 全スタッフのインセンティブ（管理者のみ）
  VIEW_OWN_INCENTIVES,     // 自分のインセンティブ（スタッフも可）
  EDIT_INCENTIVES,
  LOCK_INCENTIVES,
  
  // 売上分析
  VIEW_SALES_ANALYTICS,
  EXPORT_SALES_DATA,
  
  // スタッフ管理
  VIEW_STAFF,
  CREATE_STAFF,
  EDIT_STAFF,
  DELETE_STAFF,
  MANAGE_STAFF_ROLES,
  
  // 設定管理
  VIEW_SETTINGS,
  EDIT_MENU_SETTINGS,
  EDIT_LOCATION_SETTINGS,
  EDIT_SYSTEM_SETTINGS,
  
  // カレンダー
  VIEW_CALENDAR,
}
```

**ロール別権限マッピング:**
```typescript
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    // すべての権限
    Permission.VIEW_DASHBOARD,
    Permission.VIEW_CUSTOMERS,
    Permission.CREATE_CUSTOMER,
    // ... すべて
  ],
  staff: [
    // スタッフの権限（閲覧と基本操作のみ）
    Permission.VIEW_DASHBOARD,
    Permission.VIEW_CUSTOMERS,
    Permission.CREATE_CUSTOMER,
    Permission.EDIT_CUSTOMER,
    Permission.VIEW_RESERVATIONS,
    Permission.CREATE_RESERVATION,
    Permission.EDIT_RESERVATION,
    Permission.CANCEL_RESERVATION,
    Permission.VIEW_WORK_ORDERS,
    Permission.EDIT_WORK_ORDER, // 自分に割り当てられた制作物のみ
    Permission.VIEW_OWN_INCENTIVES, // 自分のインセンティブのみ
    Permission.VIEW_CALENDAR,
  ],
};
```

**権限チェック関数:**
```typescript
// 単一権限チェック
hasPermission(user, Permission.CREATE_CUSTOMER)

// いずれかの権限チェック
hasAnyPermission(user, [Permission.VIEW_INCENTIVES, Permission.VIEW_OWN_INCENTIVES])

// すべての権限チェック
hasAllPermissions(user, [Permission.EDIT_CUSTOMER, Permission.DELETE_CUSTOMER])

// ロールチェック
isAdmin(user)
isStaff(user)

// 制作物編集権限（自分に割り当てられているか、または管理者か）
canEditWorkOrder(user, workOrder)

// インセンティブ閲覧権限（自分のものか、または管理者か）
canViewIncentive(user, incentive)
```

**ルート権限マッピング:**
```typescript
export const ROUTE_PERMISSIONS: Record<string, Permission[]> = {
  '/': [Permission.VIEW_DASHBOARD],
  '/dashboard': [Permission.VIEW_DASHBOARD],
  '/customers': [Permission.VIEW_CUSTOMERS],
  '/calendar': [Permission.VIEW_CALENDAR],
  '/work-orders': [Permission.VIEW_WORK_ORDERS],
  '/incentives': [Permission.VIEW_INCENTIVES, Permission.VIEW_OWN_INCENTIVES],
  '/sales-analytics': [Permission.VIEW_SALES_ANALYTICS],
  '/staff': [Permission.VIEW_STAFF],
  '/settings/menu': [Permission.VIEW_SETTINGS],
  '/settings/locations': [Permission.VIEW_SETTINGS],
  '/operations': [Permission.VIEW_DASHBOARD],
};
```

#### ✅ React Hooks (`/utils/rbac/hooks.ts`)

**usePermissions フック:**
```typescript
const { can, canAny, canAll, isAdmin, isStaff, canAccessRoute } = usePermissions(currentUser);

// 使用例
if (can(Permission.CREATE_CUSTOMER)) {
  // 顧客作成ボタンを表示
}

if (isAdmin()) {
  // 管理者専用機能を表示
}
```

**その他のフック:**
```typescript
const hasPermission = useHasPermission(user, Permission.CREATE_CUSTOMER);
const isAdmin = useIsAdmin(user);
const isStaff = useIsStaff(user);
```

#### ✅ コンポーネント (`/components/rbac/`)

**PermissionGate - 権限ベースの条件付きレンダリング:**
```typescript
<PermissionGate user={currentUser} permission={Permission.CREATE_CUSTOMER}>
  <button>顧客を追加</button>
</PermissionGate>

<PermissionGate 
  user={currentUser} 
  anyPermissions={[Permission.VIEW_INCENTIVES, Permission.VIEW_OWN_INCENTIVES]}
>
  <IncentivesTable />
</PermissionGate>

<PermissionGate 
  user={currentUser} 
  permission={Permission.DELETE_CUSTOMER}
  fallback={<span>権限がありません</span>}
>
  <DeleteButton />
</PermissionGate>
```

**RoleGate - ロールベースの条件付きレンダリング:**
```typescript
<RoleGate user={currentUser} allowedRoles={['admin']}>
  <AdminPanel />
</RoleGate>
```

**RouteGuard - ルートアクセス制御:**
```typescript
<RouteGuard 
  user={currentUser} 
  currentPath={currentPage}
  onNavigate={setCurrentPage}
>
  <CurrentPageComponent />
</RouteGuard>
```

**機能:**
- アクセス権限のないルートへの自動リダイレクト
- 権限エラーのトースト通知
- ログインページへの自動遷移

---

### 2. **業務ワークフロー管理**

#### ✅ 予約ワークフロー (`/utils/workflow/reservationWorkflow.ts`)

**ステータス遷移ルール:**
```typescript
// 予約ステータスの遷移
export const RESERVATION_STATUS_FLOW = {
  confirmed: ['cancelled', 'completed'],
  cancelled: [], // キャンセル後は変更不可
  completed: [], // 完了後は変更不可
} as const;

// 制作物ステータスの遷移
export const WORK_ORDER_STATUS_FLOW = {
  '制作中': ['お渡し待ち'],
  'お渡し待ち': ['引渡し済'],
  '引渡し済': [], // 引渡し済み後は変更不可
} as const;
```

**ステータス遷移バリデーション:**
```typescript
function canTransitionStatus<T extends string>(
  currentStatus: T,
  nextStatus: T,
  flow: Record<T, readonly T[]>
): boolean {
  const allowedTransitions = flow[currentStatus];
  return allowedTransitions?.includes(nextStatus) ?? false;
}
```

**予約作成ワークフロー:**
```typescript
// 予約作成 + 制作物の自動生成
const { reservation, workOrder } = await createReservationWithWorkflow({
  customer_id: '...',
  reservation_date: '2025-11-10',
  reservation_time: '14:00',
  location_id: '...',
  menu_item_id: '...',
  additional_units: 2,
  createWorkOrder: true,      // 制作物を自動生成
  assignedStaffId: '...',     // 担当スタッフ
});

// 処理内容:
// 1. 予約を作成（ステータス: confirmed）
// 2. 制作物を自動生成（納期 = 予約日 + 28日、ステータス: 制作中）
// 3. 成功トースト表示
```

**予約ステータス更新:**
```typescript
await updateReservationStatus(
  reservationId,
  'confirmed',      // 現在のステータス
  'cancelled',      // 新しいステータス
  {
    cancelWorkOrders: true,  // 関連制作物もキャンセル
  }
);

// ステータス遷移の妥当性をチェック
// 不正な遷移の場合はエラー
```

**制作物ステータス更新:**
```typescript
const { workOrder, incentive } = await updateWorkOrderStatus(
  workOrderId,
  '制作中',         // 現在のステータス
  'お渡し待ち',     // 新しいステータス
);

// 引渡し済みに変更時
await updateWorkOrderStatus(
  workOrderId,
  'お渡し待ち',
  '引渡し済',
  {
    assignedStaffId: '...',
    createIncentive: true,    // インセンティブ��自動生成
    incentiveAmount: 5000,    // インセンティブ金額
  }
);

// 処理内容:
// 1. ステータス更新
// 2. 引渡し日を記録
// 3. インセンティブを自動生成（オプション）
// 4. 成功トースト表示
```

**制作物割り当て:**
```typescript
await assignWorkOrder(workOrderId, staffId);
```

**期限管理:**
```typescript
// 期限切れ制作物の検出
const overdueWorkOrders = getOverdueWorkOrders(workOrders);

// 期限が近い制作物の検出（7日以内）
const upcomingDueWorkOrders = getUpcomingDueWorkOrders(workOrders, 7);
```

---

### 3. **通知・アラートシステム**

#### ✅ アラート管理 (`/utils/notifications/alerts.ts`)

**アラート種別:**
```typescript
export enum AlertType {
  OVERDUE_WORK_ORDER,           // 期限切れ
  UPCOMING_DUE_WORK_ORDER,      // 期限接近
  RESERVATION_CREATED,          // 予約作成
  WORK_ORDER_STATUS_CHANGED,    // ステータス変更
  INCENTIVE_LOCKED,             // インセンティブロック
  STAFF_ASSIGNMENT,             // スタッフ割り当て
}
```

**アラート生成:**
```typescript
// 期限切れアラート
const alert = createOverdueAlert(workOrder);
// ⚠️ 納期超過
// 田中様（太郎ちゃん）のライフキャスティングが納期を3日超過しています

// 期限接近アラート
const alert = createUpcomingDueAlert(workOrder);
// 📅 納期接近
// 田中様（太郎ちゃん）のライフキャスティングの納期まであと5日です

// 予約作成アラート
const alert = createReservationCreatedAlert(reservation);
// ✅ 予約が作成されました
// 田中様（太郎ちゃん）の予約が2025-11-10に作成されました

// ステータス変更アラート
const alert = createWorkOrderStatusChangedAlert(workOrder, '制作中', 'お渡し待ち');
// 🔄 ステータス変更
// 田中様（太郎ちゃん）のライフキャスティングが「制作中」→「お渡し待ち」に変更されました

// スタッフ割り当てアラート
const alert = createStaffAssignmentAlert(workOrder, '山田花子');
// 👤 担当割り当て
// 山田花子さんが田中様（太郎ちゃん）のライフキャスティングの担当に割り当てられました
```

**トースト通知:**
```typescript
// 単一アラートを表示
showAlertToast(alert);

// 複数アラートを表示
showAlertsToast(alerts);
```

**アラート管理（ローカルストレージ）:**
```typescript
// アラートを保存（最大100件）
saveAlert(alert);

// すべてのアラートを取得
const alerts = getStoredAlerts();

// 未読アラートを取得
const unreadAlerts = getUnreadAlerts();

// アラートを既読にする
markAlertAsRead(alertId);

// すべてのアラートを既読にする
markAllAlertsAsRead();

// アラートをクリア
clearAlerts();
```

#### ✅ 通知センターコンポーネント (`/components/NotificationCenter.tsx`)

**機能:**
- ベルアイコンに未読バッジ表示
- 通知パネル（ドロップダウン）
- アラート一覧表示（新しい順）
- 既読/未読の視覚的区別
- 個別既読、全既読、全削除機能
- アラートクリックでコールバック実行
- 10秒ごとの自動更新

**使用例:**
```typescript
<NotificationCenter 
  onAlertClick={(alert) => {
    // アラートに関連するページに遷移
    if (alert.type === AlertType.OVERDUE_WORK_ORDER) {
      navigate('/work-orders');
    }
  }}
/>
```

---

## アーキテクチャ

### RBAC層
```
Components
    ↓
PermissionGate / RoleGate / RouteGuard
    ↓
usePermissions / useHasPermission
    ↓
permissions.ts (権限定義・チェック)
    ↓
User Role (admin / staff)
```

### ワークフロー層
```
Components
    ↓
Workflow Functions
    ↓
Status Validation
    ↓
API Client
    ↓
Backend
```

### 通知層
```
Components
    ↓
NotificationCenter
    ↓
Alert Functions
    ↓
LocalStorage (永続化)
```

---

## 統合

### App.tsx への統合
```typescript
// RouteGuard の追加
<RouteGuard 
  user={currentUser} 
  currentPath={currentPath}
  onNavigate={setCurrentPage}
>
  {renderPage()}
</RouteGuard>
```

### Layout.tsx への統合
```typescript
// 通知センターの追加（モバイル・デスクトップ両対応）
<NotificationCenter />
```

---

## 使用例

### 1. 権限ベースのUI制御

```typescript
import { PermissionGate } from './components/rbac/PermissionGate';
import { Permission } from './utils/rbac/permissions';

function CustomerList({ user }) {
  return (
    <div>
      {/* 顧客作成ボタン（権限がある場合のみ表示） */}
      <PermissionGate user={user} permission={Permission.CREATE_CUSTOMER}>
        <button onClick={handleCreateCustomer}>
          顧客を追加
        </button>
      </PermissionGate>

      {/* 顧客リスト */}
      <CustomerTable />

      {/* 削除ボタン（管理者のみ） */}
      <RoleGate user={user} allowedRoles={['admin']}>
        <button onClick={handleDelete} className="text-red-600">
          削除
        </button>
      </RoleGate>
    </div>
  );
}
```

### 2. ワークフローの実装

```typescript
import { createReservationWithWorkflow, updateWorkOrderStatus } from './utils/workflow/reservationWorkflow';
import { createReservationCreatedAlert, createWorkOrderStatusChangedAlert, saveAlert, showAlertToast } from './utils/notifications/alerts';

// 予約作成（制作物も自動生成）
async function handleCreateReservation(data) {
  const { reservation, workOrder } = await createReservationWithWorkflow({
    ...data,
    createWorkOrder: true,
    assignedStaffId: selectedStaffId,
  });

  // アラート作成・保存
  const alert = createReservationCreatedAlert(reservation);
  saveAlert(alert);
  showAlertToast(alert);
}

// 制作物ステータス更新
async function handleUpdateWorkOrderStatus(workOrderId, currentStatus, nextStatus) {
  const { workOrder } = await updateWorkOrderStatus(
    workOrderId,
    currentStatus,
    nextStatus,
    {
      createIncentive: nextStatus === '引渡し済',
      incentiveAmount: 5000,
    }
  );

  // アラート作成・保存
  const alert = createWorkOrderStatusChangedAlert(workOrder, currentStatus, nextStatus);
  saveAlert(alert);
  showAlertToast(alert);
}
```

### 3. 期限アラートの生成

```typescript
import { getOverdueWorkOrders, getUpcomingDueWorkOrders } from './utils/workflow/reservationWorkflow';
import { createOverdueAlert, createUpcomingDueAlert, saveAlert } from './utils/notifications/alerts';

// ダッシュボードでアラートをチェック
useEffect(() => {
  if (!workOrders) return;

  // 期限切れをチェック
  const overdueWorkOrders = getOverdueWorkOrders(workOrders);
  overdueWorkOrders.forEach(wo => {
    const alert = createOverdueAlert(wo);
    saveAlert(alert);
  });

  // 期限接近をチェック（7日以内）
  const upcomingWorkOrders = getUpcomingDueWorkOrders(workOrders, 7);
  upcomingWorkOrders.forEach(wo => {
    const alert = createUpcomingDueAlert(wo);
    saveAlert(alert);
  });
}, [workOrders]);
```

---

## セキュリティの強化

### 1. ルートレベルの保護
- 権限のないルートへのアクセスをブロック
- 自動リダイレクト

### 2. コンポーネントレベルの保護
- UIの条件付きレンダリング
- ボタン・リンクの非表示化

### 3. データレベルの保護
- 制作物の編集権限（自分に割り当てられたもののみ）
- インセンティブの閲覧権限（自分のもののみ、または管理者）

---

## パフォーマンス

### 権限チェック
- `useMemo`による最適化
- 不要な再計算を防止

### アラート
- LocalStorageに永続化（��大100件）
- 10秒ごとの自動更新（ポーリング）

---

## 今後の拡張

### 1. サーバーサイド権限検証
現在はフロントエンドのみで権限チェックを実施していますが、サーバーサイドでも権限を検証する必要があります。

```typescript
// サーバー側（/supabase/functions/server/index.tsx）
app.delete('/make-server-fe84bde0/customers/:id', async (c) => {
  const user = await getAuthUser(c.req);
  const role = await getUserRole(user.id);
  
  // 権限チェック
  if (role !== 'admin') {
    return c.json({ error: '権限がありません' }, 403);
  }
  
  // 削除処理
});
```

### 2. リアルタイム通知
Supabase Realtimeを使用したプッシュ通知

```typescript
// Supabase Realtime で通知を受信
const channel = supabase.channel('alerts');
channel.on('broadcast', { event: 'new_alert' }, (payload) => {
  const alert = payload.alert;
  saveAlert(alert);
  showAlertToast(alert);
});
```

### 3. カスタム権限
ユーザーごとに細かい権限を設定

```typescript
interface CustomPermission {
  user_id: string;
  permissions: Permission[];
  resource_ids?: string[]; // 特定のリソースのみ
}
```

### 4. 監査ログ
権限の使用履歴を記録

```typescript
function logPermissionUsage(user: User, permission: Permission, resource?: any) {
  // ログを記録
}
```

---

## まとめ

Phase 3では、RBAC と業務ワークフローの実装により：

✅ **セキュリティ**: ロールベースのアクセス制御  
✅ **業務効率**: 予約 → 制作物 → インセンティブの自動化  
✅ **ユーザー体験**: ステータス遷移の妥当性チェック  
✅ **可視性**: 通知センターによるアラート管理  
✅ **保守性**: 権限定義の一元管理  

**ファイル構成:**
```
/utils
  /rbac
    ├── permissions.ts  (権限定義・チェック)
    └── hooks.ts        (React Hooks)
  /workflow
    └── reservationWorkflow.ts  (ワークフロー管理)
  /notifications
    └── alerts.ts       (通知・アラート)

/components
  /rbac
    ├── PermissionGate.tsx  (権限ベースレンダリング)
    └── RouteGuard.tsx      (ルートアクセス制御)
  └── NotificationCenter.tsx  (通知センター)
```

Phase 3の実装により、アマレットの管理システムは本格的な業務アプリケーションとして完成しました！
