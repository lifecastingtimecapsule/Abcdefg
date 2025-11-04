# 権限とUI改善

## 📋 実施した修正

### 1. スタッフ用メニュー表示の改善 ✅

**問題**: スタッフに「売上・インセンティブ」と表示されていたが、売上は見られない

**修正内容**:
- スタッフには「**インセンティブ**」と表示
- adminには「**売上・インセンティブ**」と表示

**変更ファイル**: `/components/Layout.tsx`

```typescript
// Before
{ id: 'sales-incentives', label: '売上・インセンティブ', icon: TrendingUp, roles: ['admin', 'staff'] }

// After
{ id: 'sales-incentives', label: userRole === 'admin' ? '売上・インセンティブ' : 'インセンティブ', icon: TrendingUp, roles: ['admin', 'staff'] }
```

---

### 2. スタッフページでタブ非表示 ✅

**問題**: スタッフがインセンティブページを開いた際、「売上分析」タブが見えていた

**修正内容**:
- スタッフには**タブを表示しない**（直接インセンティブページが表示される）
- adminには**タブを表示**（売上分析 / インセンティブの切り替え）

**変更ファイル**: `/components/SalesIncentivesPage.tsx`

```typescript
// Before
<div className="border-b border-slate-200 bg-white rounded-t-2xl">
  {/* タブが常に表示されていた */}
</div>

// After
{userRole === 'admin' && (
  <div className="border-b border-slate-200 bg-white rounded-t-2xl">
    {/* adminのみタブを表示 */}
  </div>
)}
```

---

### 3. 権限エラートーストの削除 ✅

**問題**: メニューを切り替えるたびに「あなたにはその権限がありません」と表示される

**修正内容**:
- **403エラー（権限エラー）時のトースト表示を削除**
- コンソールには警告を残す（デバッグ用）

**変更ファイル**: `/utils/api.ts`

```typescript
// Before
else if (response.status === 403) {
  console.error('Permission denied:', error);
  toast.error('この操作を実行する権限がありません'); // ← 削除
}

// After
else if (response.status === 403) {
  console.warn('[Permission] Access denied:', error); // ← トーストなし
}
```

---

### 4. 権限のないページへのアクセス処理改善 ✅

**問題**: 権限のないページにアクセスしようとすると、エラーが表示される前に一瞬ページが表示される

**修正内容**:
- 権限チェックを追加
- 権限がない場合は**静かにダッシュボードにリダイレクト**
- エラーメッセージを表示しない

**変更ファイル**: `/App.tsx`

```typescript
const renderPage = () => {
  if (!currentUser) return <Dashboard onNavigate={setCurrentPage} />;
  
  // 権限チェック
  const hasAccess = () => {
    if (currentPage === 'operations' && currentUser.role !== 'admin') {
      return false;
    }
    return true;
  };

  // 権限がない場合は静かにダッシュボードへリダイレクト
  if (!hasAccess()) {
    setTimeout(() => setCurrentPage('dashboard'), 0);
    return <Dashboard onNavigate={setCurrentPage} />;
  }
  
  // ...
};
```

---

## 🎯 権限マトリックス（修正後）

### メニュー表示

| メニュー項目 | Admin | Staff | 表示名（Admin） | 表示名（Staff） |
|-------------|-------|-------|----------------|----------------|
| ダッシュボード | ✅ | ✅ | ダッシュボード | ダッシュボード |
| カレンダー | ✅ | ✅ | カレンダー | カレンダー |
| 顧客管理 | ✅ | ✅ | 顧客管理 | 顧客管理 |
| 作品管理 | ✅ | ✅ | 作品管理 | 作品管理 |
| **売上・インセンティブ** | ✅ | ✅ | **売上・インセンティブ** | **インセンティブ** |
| 運営管理 | ✅ | ❌ | 運営管理 | （非表示） |

### ページアクセス

| ページ | Admin | Staff | 備考 |
|--------|-------|-------|------|
| 売上分析 | ✅ | ❌ | Staffは非表示 |
| インセンティブ | ✅ | ✅ | Staffは自分のデータのみ |
| 運営管理 | ✅ | ❌ | Staffはアク��ス不可 |

---

## 🧪 テスト項目

### Admin ユーザー

- [x] メニューに「売上・インセンティブ」と表示される
- [x] 売上・インセンティブページで「売上分析」「インセンティブ」の2つのタブが表示される
- [x] 売上分析タブで全スタッフの売上データが見られる
- [x] インセンティブタブで全スタッフのインセンティブが見られる
- [x] 運営管理ページにアクセスできる

### Staff ユーザー

- [x] メニューに「インセンティブ」と表示される
- [x] インセンティブページでタブが表示されない（直接インセンティブ画面）
- [x] 自分のインセンティブデータのみが表示される
- [x] 運営管理ページが表示されない
- [x] 権限がないページにアクセスしようとしても、エラートーストが表示されない
- [x] 自動的にダッシュボードにリダイレクトされる

### 共通

- [x] ページ切り替え時に不要なエラーメッセージが表示されない
- [x] 403エラー時にトーストが表示されない（コンソールには記録される）
- [x] スムーズなUX（エラーが見えない）

---

## 📊 ユーザー体験の改善

### Before（改善前）

```
スタッフがメニューをクリック
  ↓
「売上・インセ���ティブ」をクリック
  ↓
「売上分析」「インセンティブ」の2つのタブが表示
  ↓
「売上分析」をクリック
  ↓
❌ 「あなたにはその権限がありません」と表示
  ↓
混乱する 😕
```

### After（改善後）

```
スタッフがメニューをクリック
  ↓
「インセンティブ」をクリック
  ↓
✅ インセンティブページが直接表示される
  ↓
自分のデータが見られる 😊
```

---

## 🚀 今後の改善案

### 1. より細かい権限制御

現在は `admin` / `staff` の2ロールのみですが、将来的には：

```typescript
roles: ['admin', 'manager', 'staff', 'readonly']

permissions: [
  'view_dashboard',
  'view_sales',      // 売上閲覧
  'view_incentives', // インセンティブ閲覧
  'edit_customers',  // 顧客編集
  'edit_work_orders',// 作品編集
  'manage_users',    // ユーザー管理
]
```

### 2. ページレベルの権限ガード

```typescript
// components/PermissionGuard.tsx
export function PermissionGuard({ 
  children, 
  requiredRole, 
  fallback 
}: PermissionGuardProps) {
  const { user } = useAuth();
  
  if (!user || !requiredRole.includes(user.role)) {
    return fallback || <Navigate to="/dashboard" />;
  }
  
  return <>{children}</>;
}

// 使用例
<PermissionGuard requiredRole={['admin']}>
  <SalesAnalyticsPage />
</PermissionGuard>
```

### 3. 機能レベルの権限チェック

```typescript
// hooks/usePermission.ts
export function usePermission() {
  const { user } = useAuth();
  
  return {
    canViewSales: user?.role === 'admin',
    canEditCustomers: ['admin', 'staff'].includes(user?.role),
    canManageUsers: user?.role === 'admin',
    canLockIncentives: user?.role === 'admin',
  };
}

// 使用例
const { canViewSales, canLockIncentives } = usePermission();

{canViewSales && <SalesChart />}
{canLockIncentives && <LockButton />}
```

---

## ✅ 完了チェックリスト

- [x] スタッフ用メニュー表示を「インセンティブ」に変更
- [x] スタッフページでタブを非表示
- [x] 403エラー時のトースト削除
- [x] 権限のないページへのアクセス時のリダイレクト
- [x] ドキュメント作成

---

**実装完了日**: 2025-11-03  
**ステータス**: 完了 ✅

**修正内容まとめ**:
1. ✅ スタッフには売上が見えない（メニュー名変更）
2. ✅ タブも表示されない（UI改善）
3. ✅ 権限エラートーストが出ない（UX改善）
4. ✅ スムーズなページ遷移（自動リダイレクト）
