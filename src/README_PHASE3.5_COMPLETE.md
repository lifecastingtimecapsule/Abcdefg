# Phase 3.5 完了 - RBACとワークフロー機能の既存コンポーネント統合

## ✅ 完了した作業

Phase 3で実装したRBACとワークフロー機能を、既存のコンポーネントに統合しました。

---

## 統合したコンポーネント

### 1. **CalendarPage.tsx**

#### 追加機能
- ✅ `useCurrentUser` フックで現在のユーザー情報を取得
- ✅ 新規予約ボタンに `PermissionGate` を適用
  - 権限: `Permission.CREATE_RESERVATION`
  - 権限がないユーザーには表示されない

#### 実装コード
```typescript
import { PermissionGate } from './rbac/PermissionGate';
import { Permission } from '../utils/rbac/permissions';
import { useCurrentUser } from '../utils/queries';

// コンポーネント内
const { data: currentUserData } = useCurrentUser();
const currentUser = currentUserData || null;

// UIに適用
<PermissionGate user={currentUser} permission={Permission.CREATE_RESERVATION}>
  <button onClick={...}>新規予約</button>
</PermissionGate>
```

---

### 2. **CustomersPage.tsx**

#### 追加機能
- ✅ `useCurrentUser` フックで現在のユーザー情報を取得
- ✅ 新規顧客ボタンに `PermissionGate` を適用
  - 権限: `Permission.CREATE_CUSTOMER`
- ✅ 年齢データ補完ボタンに `PermissionGate` を適用
  - 権限: `Permission.EDIT_SYSTEM_SETTINGS`（管理者のみ）

#### 実装コード
```typescript
// 新規顧客ボタン（スタッフも可能）
<PermissionGate user={currentUser} permission={Permission.CREATE_CUSTOMER}>
  <button>新規顧客</button>
</PermissionGate>

// 年齢データ補完ボタン（管理者のみ）
<PermissionGate user={currentUser} permission={Permission.EDIT_SYSTEM_SETTINGS}>
  <button>年齢データ補完</button>
</PermissionGate>
```

**Before:**
```typescript
{userRole === 'admin' && (
  <button>年齢データ補完</button>
)}
```

**After:**
```typescript
<PermissionGate user={currentUser} permission={Permission.EDIT_SYSTEM_SETTINGS}>
  <button>年齢データ補完</button>
</PermissionGate>
```

---

### 3. **WorkOrdersPage.tsx**

#### 追加機能
- ✅ `useCurrentUser` フックで現在のユーザー情報を取得
- ✅ ワークフロー機能の統合
  - `getOverdueWorkOrders()` - 期限切れ検出
  - `getUpcomingDueWorkOrders()` - 期限接近検出（7日以内）
- ✅ アラート自動生成
  - 期限切れアラート (`createOverdueAlert`)
  - 期限接近アラート (`createUpcomingDueAlert`)
  - LocalStorageに自動保存 (`saveAlert`)
- ✅ 制作物追加ボタンに `PermissionGate` を適用
  - 権限: `Permission.CREATE_WORK_ORDER`
- ✅ 並び順保存ボタンに `PermissionGate` を適用
  - 権限: `Permission.EDIT_WORK_ORDER`
- ✅ 一括生成ボタンに `PermissionGate` を適用
  - 権限: `Permission.CREATE_WORK_ORDER`

#### 実装コード
```typescript
import { getOverdueWorkOrders, getUpcomingDueWorkOrders } from '../utils/workflow/reservationWorkflow';
import { createOverdueAlert, createUpcomingDueAlert, saveAlert } from '../utils/notifications/alerts';

// 期限アラートチェック（workOrdersが変更されるたびに実行）
useEffect(() => {
  if (workOrders.length === 0) return;

  // 期限切れをチェック
  const overdueWorkOrders = getOverdueWorkOrders(workOrders);
  overdueWorkOrders.forEach(wo => {
    const alert = createOverdueAlert(wo);
    saveAlert(alert);
  });

  // 期限接近（7日以内）をチェック
  const upcomingWorkOrders = getUpcomingDueWorkOrders(workOrders, 7);
  upcomingWorkOrders.forEach(wo => {
    const alert = createUpcomingDueAlert(wo);
    saveAlert(alert);
  });
}, [workOrders]);

// UIに適用
<PermissionGate user={currentUser} permission={Permission.CREATE_WORK_ORDER}>
  <button>制作物追加</button>
</PermissionGate>
```

**効果:**
- 制作物一覧を読み込むたびに、自動的に期限アラートをチェック
- 期限切れ・期限接近の制作物があれば、通知センターにアラートを保存
- ユーザーは通知センター（ベルアイコン）で確認可能

---

### 4. **Dashboard.tsx**

#### 追加機能
- ✅ ワークフロー機能の統合
  - `getOverdueWorkOrders()` - 期限切れ統計
  - `getUpcomingDueWorkOrders()` - 期限接近統計（7日以内）
- ✅ 期限アラートの統計表示
  - `overdueCount` - 期限切れ件数
  - `upcomingCount` - 期限接近件数（7日以内）

#### 実装コード
```typescript
import { getOverdueWorkOrders, getUpcomingDueWorkOrders } from '../utils/workflow/reservationWorkflow';

// 期限アラート統計（useMemoでメモ化）
const overdueCount = useMemo(() => {
  if (!dashboard.data?.top_work_orders) return 0;
  return getOverdueWorkOrders(dashboard.data.top_work_orders).length;
}, [dashboard.data]);

const upcomingCount = useMemo(() => {
  if (!dashboard.data?.top_work_orders) return 0;
  return getUpcomingDueWorkOrders(dashboard.data.top_work_orders, 7).length;
}, [dashboard.data]);
```

**今後の拡張:**
ダッシュボードに期限アラートカードを追加可能
```typescript
<div className="bg-white rounded-2xl p-6 shadow-sm border border-amber-200">
  <div className="flex items-center justify-between mb-2">
    <div className="text-sm text-slate-600">期限接近（7日以内）</div>
    <Clock className="w-5 h-5 text-amber-500" />
  </div>
  <div className="text-3xl text-slate-900">{upcomingCount}</div>
</div>
```

---

## 統合内容のサマリー

### 権限チェックの統合

| コンポーネント | ボタン/機能 | 権限 | 対象ユーザー |
|--------------|------------|------|-------------|
| CalendarPage | 新規予約 | CREATE_RESERVATION | admin, staff |
| CustomersPage | 新規顧客 | CREATE_CUSTOMER | admin, staff |
| CustomersPage | 年齢データ補完 | EDIT_SYSTEM_SETTINGS | admin のみ |
| WorkOrdersPage | 制作物追加 | CREATE_WORK_ORDER | admin のみ |
| WorkOrdersPage | 並び順保存 | EDIT_WORK_ORDER | admin, staff（自分の制作物のみ） |
| WorkOrdersPage | 一括生成 | CREATE_WORK_ORDER | admin のみ |

### ワークフロー機能の統合

| コンポーネント | 機能 | 説明 |
|--------------|------|------|
| WorkOrdersPage | 期限切れ検出 | `getOverdueWorkOrders()` で期限切れを自動検出 |
| WorkOrdersPage | 期限接近検出 | `getUpcomingDueWorkOrders(7)` で7日以内の期限接近を検出 |
| WorkOrdersPage | アラート自動生成 | 期限切れ・期限接近アラートを自動的にLocalStorageに保存 |
| Dashboard | 期限統計 | 期限切れ・期限接近の件数を統計表示 |

---

## セキュリティ強化の効果

### Before（Phase 2まで）
```typescript
// ロールベースのチェック（ハードコーディング）
{userRole === 'admin' && <button>管理者機能</button>}

// 問題点:
// - ロールの追加・変更時に全コンポーネントを修正する必要がある
// - 細かい権限制御ができない
// - テストが難しい
```

### After（Phase 3.5）
```typescript
// 権限ベースのチェック（宣言的）
<PermissionGate user={currentUser} permission={Permission.EDIT_SYSTEM_SETTINGS}>
  <button>管理者機能</button>
</PermissionGate>

// メリット:
// - 権限の追加・変更は /utils/rbac/permissions.ts のみ修正
// - 細かい権限制御が可能（CREATE, EDIT, DELETE など）
// - テストが容易（permissionsをモック）
// - 可読性が高い
```

---

## 業務効率の向上

### 自動アラート生成

**Before:**
- 制作物の期限切れを手動でチェック
- 担当者が毎日カレンダーを確認
- 期限接近の制作物を見落とす可能性

**After:**
- 制作物ページを開くたびに自動チェック
- 期限切れ・期限接近を自動検出
- 通知センター（ベルアイコン）にアラート表示
- 見落としリスクの削減

### アラート例

```
⚠️ 納期超過
田中様（太郎ちゃん）のライフキャスティングが納期を3日超過しています

📅 納期接近
佐藤様（花子ちゃん）のライフキャスティングの納期まであと5日です
```

---

## パフォーマンス最適化

### useMemo による最適化

```typescript
// Dashboard.tsx
const overdueCount = useMemo(() => {
  if (!dashboard.data?.top_work_orders) return 0;
  return getOverdueWorkOrders(dashboard.data.top_work_orders).length;
}, [dashboard.data]);
```

**効果:**
- `dashboard.data` が変更されない限り再計算しない
- レンダリングパフォーマンスの向上

### useEffect による適切なタイミング

```typescript
// WorkOrdersPage.tsx
useEffect(() => {
  if (workOrders.length === 0) return;
  
  // アラートチェック・生成
  // ...
}, [workOrders]);
```

**効果:**
- 制作物データが変更されたときのみアラートをチェック
- 不要な処理を削減

---

## コード品質の向上

### 変更前のコード例
```typescript
// Before: ロールをハードコーディング
{userRole === 'admin' && (
  <button onClick={handleAdminAction}>
    管理者機能
  </button>
)}
```

**問題点:**
- ロールが複数箇所に散在
- 権限の変更時に全ファイルを修正
- テストが困難

### 変更後のコード例
```typescript
// After: 権限を宣言的に定義
<PermissionGate user={currentUser} permission={Permission.EDIT_SYSTEM_SETTINGS}>
  <button onClick={handleAdminAction}>
    管理者機能
  </button>
</PermissionGate>
```

**メリット:**
- 権限定義が一元管理される（`/utils/rbac/permissions.ts`）
- コンポーネントは権限を「宣言」するだけ
- テストが容易（userをモック）

---

## 今後の拡張

### 1. ダッシュボードに期限アラートカードを追加

```typescript
{/* 期限接近カード */}
<div 
  onClick={() => onNavigate?.('work-orders')}
  className="bg-white rounded-2xl p-6 shadow-sm border border-amber-200 cursor-pointer hover:border-amber-300 hover:shadow-md transition"
>
  <div className="flex items-center justify-between mb-2">
    <div className="text-sm text-slate-600">期限接近（7日以内）</div>
    <Clock className="w-5 h-5 text-amber-500" />
  </div>
  <div className="text-3xl text-slate-900">{upcomingCount}</div>
  <div className="text-xs text-slate-500 mt-2">クリックして制作物リストへ</div>
</div>
```

### 2. WorkOrderModalにワークフロー機能を統合

```typescript
import { updateWorkOrderStatus } from '../utils/workflow/reservationWorkflow';
import { createWorkOrderStatusChangedAlert, saveAlert, showAlertToast } from '../utils/notifications/alerts';

// ステータス変更時
const handleStatusChange = async (newStatus) => {
  const { workOrder } = await updateWorkOrderStatus(
    workOrderId,
    currentStatus,
    newStatus,
    {
      createIncentive: newStatus === '引渡し済',
      incentiveAmount: 5000,
    }
  );

  // アラート生成
  const alert = createWorkOrderStatusChangedAlert(workOrder, currentStatus, newStatus);
  saveAlert(alert);
  showAlertToast(alert);
};
```

### 3. ReservationModalにワークフロー機能を統合

```typescript
import { createReservationWithWorkflow } from '../utils/workflow/reservationWorkflow';
import { createReservationCreatedAlert, saveAlert, showAlertToast } from '../utils/notifications/alerts';

// 予約作成時
const handleCreate = async (data) => {
  const { reservation, workOrder } = await createReservationWithWorkflow({
    ...data,
    createWorkOrder: true,      // 制作物も自動生成
    assignedStaffId: staffId,
  });

  // アラート生成
  const alert = createReservationCreatedAlert(reservation);
  saveAlert(alert);
  showAlertToast(alert);
};
```

---

## 📊 変更の影響範囲

### 修正したファイル（4件）

1. `/components/CalendarPage.tsx`
   - useCurrentUser 追加
   - PermissionGate 統合

2. `/components/CustomersPage.tsx`
   - useCurrentUser 追加
   - PermissionGate 統合（2箇所）

3. `/components/WorkOrdersPage.tsx`
   - useCurrentUser 追加
   - ワークフロー機能統合（期限アラート）
   - PermissionGate 統合（3箇所）

4. `/components/Dashboard.tsx`
   - ワークフロー機能統合（期限統計）

### 破壊的変更

**なし** - すべての変更は後方互換性を維持

---

## 🎯 達成した目標

✅ **権限ベースのUI制御** - PermissionGateで宣言的に権限を管理  
✅ **自動アラート生成** - 期限切れ・期限接近を自動検出  
✅ **業務効率の向上** - 手動チェックが不要に  
✅ **セキュリティ強化** - 権限のないユーザーには機能を非表示  
✅ **コード品質の向上** - 宣言的で保守しやすいコード  

---

**Phase 3.5 完了日**: 2025-11-03  
**次のステップ**: モーダルへのワークフロー統合、サーバーサイド権限検証
