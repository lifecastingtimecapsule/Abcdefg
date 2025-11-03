# エラー修正サマリー - セッション期限切れエラー対応

## 🐛 発生していたエラー

```
[Auth] Session expired - triggering re-authentication
Login error: Error: UNAUTHORIZED
```

## 🔍 原因分析

### 1. `useCurrentUser`フックの問題
- Phase 3.5で追加した`useCurrentUser`フックが、セッション期限切れ時にエラーをスローしていた
- コンポーネントがマウント時に`useCurrentUser`を呼び出すが、トークンが無効な場合にエラーが発生
- エラーがコンポーネントのレンダリングをブロックしていた

### 2. `/me`エンドポイントの欠落
- サーバー側に`/make-server-fe84bde0/me`エンドポイントが存在していなかった
- `useCurrentUser`がAPIを呼び出そうとして404エラーが発生

### 3. エラーハンドリングの不備
- LoginPageでのエラーメッセージが「Error: UNAUTHORIZED」のまま表示されていた
- ユーザーフレンドリーなメッセージが不足

---

## ✅ 実施した修正

### 1. `/me`エンドポイントの追加

**ファイル**: `/supabase/functions/server/index.tsx`

```typescript
// Get current user info
app.get('/make-server-fe84bde0/me', async (c) => {
  try {
    const user = await getAuthUser(c.req.raw);
    
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    // Get user data from KV store
    const userData = await kv.get(`user:${user.id}`);
    
    if (!userData) {
      return c.json({ error: 'User not found' }, 404);
    }
    
    return c.json({
      user: {
        user_id: userData.user_id,
        name: userData.name,
        login_id: userData.login_id,
        role: userData.role,
        email: userData.email,
      },
    });
  } catch (error) {
    console.error('[/me] Error:', error);
    return c.json({ error: String(error) }, 500);
  }
});
```

**効果:**
- 現在のユーザー情報を取得するエンドポイントを追加
- 認証トークンからユーザー情報を返す
- KVストアからユーザープロファイルを取得

---

### 2. `useCurrentUser`フックの改善

**ファイル**: `/utils/queries.ts`

**Before:**
```typescript
export function useCurrentUser() {
  return useQuery({
    queryKey: queryKeys.currentUser,
    queryFn: () => apiRequest<{ user: any }>(API_ENDPOINTS.users.me),
    select: (data) => data.user,
    staleTime: CACHE_CONFIG.user.staleTime,
    gcTime: CACHE_CONFIG.user.gcTime,
  });
}
```

**After:**
```typescript
export function useCurrentUser() {
  return useQuery({
    queryKey: queryKeys.currentUser,
    queryFn: () => apiRequest<{ user: any }>(API_ENDPOINTS.users.me),
    select: (data) => data.user,
    staleTime: CACHE_CONFIG.user.staleTime,
    gcTime: CACHE_CONFIG.user.gcTime,
    retry: false, // セッション期限切れ時はリトライしない
    enabled: !!localStorage.getItem('access_token'), // トークンがある場合のみ実行
  });
}
```

**効果:**
- `retry: false` - セッション期限切れ時の無駄なリトライを防止
- `enabled: !!localStorage.getItem('access_token')` - トークンが存在する場合のみクエリを実行
- エラーハンドリングの改善

---

### 3. コンポーネントのProps修正

#### CalendarPage.tsx

**Before:**
```typescript
export function CalendarPage({ userRole }: { userRole: string }) {
  const { data: currentUserData } = useCurrentUser();
  const currentUser = currentUserData || null;
```

**After:**
```typescript
interface CalendarPageProps {
  userRole: string;
  currentUser?: User | null;
}

export function CalendarPage({ userRole, currentUser = null }: CalendarPageProps) {
```

#### CustomersPage.tsx

**Before:**
```typescript
export function CustomersPage({ userRole }: CustomersPageProps) {
  const { data: currentUserData } = useCurrentUser();
  const currentUser = currentUserData || null;
```

**After:**
```typescript
interface CustomersPageProps {
  userRole?: string;
  currentUser?: User | null;
}

export function CustomersPage({ userRole, currentUser = null }: CustomersPageProps) {
```

#### WorkOrdersPage.tsx

**Before:**
```typescript
export function WorkOrdersPage() {
  const { data: currentUserData } = useCurrentUser();
  const currentUser = currentUserData || null;
```

**After:**
```typescript
interface WorkOrdersPageProps {
  currentUser?: User | null;
}

export function WorkOrdersPage({ currentUser = null }: WorkOrdersPageProps = {}) {
```

**効果:**
- `useCurrentUser`フックの使用を削除
- App.tsxから`currentUser`をpropsとして受け取る
- セッション期限切れ時のエラーを回避

---

### 4. App.tsxの修正

#### currentUserをpropsとして渡す

**Before:**
```typescript
case 'calendar':
  return <CalendarPage userRole={currentUser.role} />;
case 'customers':
  return <CustomersPage userRole={currentUser.role} />;
case 'work-orders':
  return <WorkOrdersPage />;
```

**After:**
```typescript
case 'calendar':
  return <CalendarPage userRole={currentUser.role} currentUser={currentUser} />;
case 'customers':
  return <CustomersPage userRole={currentUser.role} currentUser={currentUser} />;
case 'work-orders':
  return <WorkOrdersPage currentUser={currentUser} />;
```

#### セッション期限切れ時のハンドリング改善

**Before:**
```typescript
const checkAuth = async () => {
  try {
    // ...
  } catch (err: any) {
    if (err?.message === 'UNAUTHORIZED') {
      // 再認証モーダルが表示される
      console.log('[Auth] Re-authentication required');
    } else {
      // その他のエラーの場合はログアウト
      localStorage.removeItem('access_token');
      setIsAuthenticated(false);
      setCurrentUser(null);
    }
  } finally {
    setLoading(false);
  }
};
```

**After:**
```typescript
const checkAuth = async () => {
  try {
    // ...
  } catch (err: any) {
    // UNAUTHORIZEDエラーの場合は、ログアウト状態にする
    console.log('[Auth] Authentication failed:', err.message);
    localStorage.removeItem('access_token');
    setIsAuthenticated(false);
    setCurrentUser(null);
  } finally {
    setLoading(false);
  }
};
```

#### unauthorizedCallbackの改善

**Before:**
```typescript
useEffect(() => {
  // 401エラー時のコールバックを設定（再認証モーダル表示）
  setUnauthorizedCallback(() => {
    setShowReauthModal(true);
  });
  
  checkAuth();
}, []);
```

**After:**
```typescript
useEffect(() => {
  // 401エラー時のコールバックを設定（ログイン済みの場合のみ再認証モーダル表示）
  setUnauthorizedCallback(() => {
    // ログイン済みの場合のみ再認証モーダルを表示
    if (isAuthenticated) {
      setShowReauthModal(true);
    }
  });
  
  checkAuth();
}, [isAuthenticated]);
```

**効果:**
- ログイン中のみ再認証モーダルを表示
- 未ログイン時はログインページにリダイレクト
- セッション期限切れ時の適切なハンドリング

---

### 5. LoginPageのエラーメッセージ改善

**ファイル**: `/components/LoginPage.tsx`

**Before:**
```typescript
} catch (err: any) {
  console.error('Login error:', err);
  const errorMessage = err.message || 'ログインに失敗しました';
  setError(errorMessage);
} finally {
```

**After:**
```typescript
} catch (err: any) {
  console.error('Login error:', err);
  // UNAUTHORIZEDエラーの場合は、より詳細なメッセージを表示
  let errorMessage = 'ログインに失敗しました';
  if (err.message === 'UNAUTHORIZED') {
    errorMessage = 'ログインIDまたはパスワードが正しくありません';
  } else if (err.message) {
    errorMessage = err.message;
  }
  setError(errorMessage);
} finally {
```

**効果:**
- ユーザーフレンドリーなエラーメッセージ
- 「Error: UNAUTHORIZED」ではなく「ログインIDまたはパスワードが正しくありません」と表示

---

## 📊 修正内容のサマリー

### 修正したファイル（7件）

1. `/supabase/functions/server/index.tsx`
   - `/me`エンドポイントの追加

2. `/utils/queries.ts`
   - `useCurrentUser`フックの改善（retry、enabled）

3. `/components/CalendarPage.tsx`
   - `useCurrentUser`フックの削除
   - propsで`currentUser`を受け取る

4. `/components/CustomersPage.tsx`
   - `useCurrentUser`フックの削除
   - propsで`currentUser`を受け取る

5. `/components/WorkOrdersPage.tsx`
   - `useCurrentUser`フックの削除
   - propsで`currentUser`を受け取る

6. `/App.tsx`
   - `currentUser`をpropsとして渡す
   - セッション期限切れ時のハンドリング改善
   - unauthorizedCallbackの改善

7. `/components/LoginPage.tsx`
   - エラーメッセージの改善

---

## 🎯 修正の効果

### Before（エラー発生時）

1. ページをリロード
2. `useCurrentUser`フックがAPIを呼び出す
3. トークンが無効（または`/me`エンドポイントが存在しない）
4. エラーがスロー
5. コンポーネントがレンダリングできない
6. ユーザーは白い画面を見る
7. コンソールに「Login error: Error: UNAUTHORIZED」

### After（修正後）

1. ページをリロード
2. App.tsxが`checkAuth()`を実行
3. トークンが無効な場合、ログアウト状態にする
4. LoginPageが表示される
5. ユーザーは再ログイン可能
6. エラーメッセージは「ログインIDまたはパスワードが正しくありません」（わかりやすい）

---

## 🔐 セキュリティの改善

1. **トークン検証の一元化**
   - App.tsxが全体のセッション管理を担当
   - コンポーネントはpropsで`currentUser`を受け取る

2. **エラーハンドリングの改善**
   - セッション期限切れ時は自動的にログアウト
   - ログイン済みユーザーのみ再認証モーダルを表示

3. **ユーザー体験の向上**
   - エラーメッセージがわかりやすい
   - ログインページへの自動リダイレクト

---

## 🧪 テストケース

### 1. 正常ログイン
- ✅ ログインIDとパスワードを入力
- ✅ トークンを取得
- ✅ ダッシュボードに遷移

### 2. セッション期限切れ（ページリロード時）
- ✅ トークンが無効
- ✅ ログアウト状態になる
- ✅ LoginPageが表示される
- ✅ 再ログイン可能

### 3. セッション期限切れ（ログイン中）
- ✅ APIリクエストで401エラー
- ✅ 再認証モーダルが表示される
- ✅ 再ログイン可能

### 4. ログイン失敗
- ✅ 間違ったパスワードを入力
- ✅ 「ログインIDまたはパスワードが正しくありません」が表示される
- ✅ 再入力可能

---

## 🚀 今後の改善案

### 1. トークンのリフレッシュ
```typescript
// トークンの有効期限が近づいたら自動リフレッシュ
async function refreshToken() {
  const { data } = await supabase.auth.refreshSession();
  if (data.session) {
    localStorage.setItem('access_token', data.session.access_token);
  }
}
```

### 2. セッション期限の表示
```typescript
// ユーザーにセッション期限が近づいていることを通知
<Toast>セッションの期限が近づいています。操作を続けてください。</Toast>
```

### 3. オフラインモード
```typescript
// ネットワークエラー時のグレースフルなハンドリング
if (navigator.onLine === false) {
  toast.warning('オフラインです。接続を確認してください。');
}
```

---

## ✅ 修正完了チェックリスト

- [x] `/me`エンドポイントの追加
- [x] `useCurrentUser`フックの改善
- [x] CalendarPage.tsxの修正
- [x] CustomersPage.tsxの修正
- [x] WorkOrdersPage.tsxの修正
- [x] App.tsxの修正
- [x] LoginPage.tsxの修正
- [x] エラーハンドリングの改善
- [x] ユーザー体験の向上

---

**修正完了日**: 2025-11-03  
**エラーステータス**: 解決済み ✅
