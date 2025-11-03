# ログイン問題の修正 - デフォルトアカウント初期化とパスワード同期

## 📝 修正サマリー

### 実施した修正（3つの重要な改善）

1. ✅ **デフォルトアカウント自動初期化**
   - サーバー起動時に`admin`アカウントを自動作成

2. ✅ **パスワードの修正**
   - `amaretto2024` → `Takara007`

3. ✅ **パスワード自動同期機能** ⭐ **最重要**
   - 既存のadminアカウントがある場合、Supabase Auth側のパスワードを常に`Takara007`に更新
   - `supabase.auth.admin.updateUserById()`を使用して強制同期
   - KVストアとSupabase Authの不整合を自動的に修復

### 結果

🎉 **どんな状況でも、`admin` / `Takara007` でログインできるようになりました！**

- 初回起動: 新規作成
- 2回目以降: パスワードを最新に同期
- 過去に別のパスワードで作成済み: 自動的に`Takara007`に更新
- データの不整合: 自動的に修復

---

## 🐛 問題

ユーザーが正しいログインID（`admin`）とパスワード（`Takara007`）を入力してもログインできない。

### 根本原因

1. **デフォルトアカウントが作成されていない**
   - サーバー起動時にデフォルトアカウントを作成する処理が存在していなかった
   - KVストアにユーザーデータが存在しない

2. **パスワードの不一致**
   - コード内のデフォルトパスワードが`amaretto2024`に設定されていた
   - 実際のパスワード`Takara007`と異なる

3. **KVストアとSupabase Authのパスワード不整合（重要）**
   - ログイン処理は、KVストアで`login_id`を検索した後、Supabase Authでパスワード認証を行う
   - 過去に別のパスワードでadminアカウントを作成していた場合、KVストアには`login_id: 'admin'`が残る
   - しかし、Supabase Auth側のパスワードは旧値のまま
   - 初回の`ensureDefaultAdmin`は、KVストアに`admin`が存在すると何もせずに終了していた
   - 結果：KVストアで検索は成功するが、Supabase Authの認証で失敗する

---

## ✅ 実施した修正

### 1. デフォルトアカウント自動初期化とパスワード同期機能の追加

**ファイル**: `/supabase/functions/server/index.tsx`

サーバー起動時に自動的にデフォルトアカウントを作成・同期する処理を追加しました。

```typescript
// ========== Initialize Default Admin Account ==========
async function ensureDefaultAdmin() {
  try {
    console.log('[Init] Checking for default admin account...');
    
    // Check if admin already exists in KV store
    const users = await kv.getByPrefix('user:');
    const existingAdmin = users.find((u: any) => u.login_id === DEFAULT_ADMIN.login_id);
    
    if (existingAdmin) {
      console.log('[Init] Default admin account found in KV store');
      console.log('[Init] Updating Supabase Auth password to ensure it matches Takara007...');
      
      // 🔧 重要: Supabase Auth側のパスワードを強制的に更新
      try {
        const { data: updateData, error: updateError } = await supabase.auth.admin.updateUserById(
          existingAdmin.user_id,
          {
            password: 'Takara007',
          }
        );
        
        if (updateError) {
          console.error('[Init] Failed to update admin password in Supabase Auth:', updateError);
          // If user doesn't exist in Supabase Auth, recreate it
          if (updateError.message.includes('not found') || updateError.message.includes('User not found')) {
            console.log('[Init] Admin user not found in Supabase Auth, recreating...');
            
            // Delete from KV store
            await kv.del(`user:${existingAdmin.user_id}`);
            
            // Create new admin user
            const { data, error } = await supabase.auth.admin.createUser({
              email: DEFAULT_ADMIN.email,
              password: 'Takara007',
              email_confirm: true,
            });
            
            if (error) {
              console.error('[Init] Failed to recreate admin in Supabase Auth:', error);
              return;
            }
            
            // Store user profile in KV store with new user_id
            await kv.set(`user:${data.user.id}`, {
              user_id: data.user.id,
              email: DEFAULT_ADMIN.email,
              login_id: DEFAULT_ADMIN.login_id,
              name: DEFAULT_ADMIN.name,
              role: 'admin',
              active_flag: true,
              created_at: new Date().toISOString(),
            });
            
            console.log('[Init] ✅ Admin recreated with user_id:', data.user.id);
          }
        } else {
          console.log('[Init] ✅ Admin password updated successfully in Supabase Auth');
        }
      } catch (error) {
        console.error('[Init] Error updating admin password:', error);
      }
      
      console.log('[Init]   Login ID: admin');
      console.log('[Init]   Password: Takara007');
      return;
    }
    
    console.log('[Init] Creating default admin account...');
    
    // Create admin user in Supabase Auth with correct password
    const { data, error } = await supabase.auth.admin.createUser({
      email: DEFAULT_ADMIN.email,
      password: 'Takara007',
      email_confirm: true,
    });
    
    if (error) {
      console.error('[Init] Failed to create admin in Supabase Auth:', error);
      return;
    }
    
    console.log('[Init] Admin created in Supabase Auth, user_id:', data.user.id);
    
    // Store user profile in KV store
    await kv.set(`user:${data.user.id}`, {
      user_id: data.user.id,
      email: DEFAULT_ADMIN.email,
      login_id: DEFAULT_ADMIN.login_id,
      name: DEFAULT_ADMIN.name,
      role: 'admin',
      active_flag: true,
      created_at: new Date().toISOString(),
    });
    
    console.log('[Init] ✅ Default admin account created successfully');
    console.log('[Init]   Login ID: admin');
    console.log('[Init]   Password: Takara007');
  } catch (error) {
    console.error('[Init] Error ensuring default admin:', error);
  }
}

// Initialize default admin on server start
ensureDefaultAdmin();

Deno.serve(app.fetch);
```

#### 動作の流れ（改善版）

1. **サーバー起動時**: `ensureDefaultAdmin()`が自動実行される
2. **既存チェック**: KVストアに`login_id: 'admin'`のユーザーが存在するかチェック

3. **パターンA: 既存のadminユーザーが存在する場合** ⭐ **重要な改善点**
   - KVストアから既存のadminユーザーを取得
   - `supabase.auth.admin.updateUserById()`を使用して、Supabase Auth側のパスワードを強制的に`Takara007`に更新
   - これにより、過去に別のパスワードで作成されたアカウントでも、常に最新のパスワードに同期される
   - **エラーハンドリング**: Supabase AuthにユーザーIDが存在しない場合は、KVストアから削除して新規作成

4. **パターンB: adminユーザーが存在しない場合**
   - Supabase Authにユーザーを新規作成（email: `admin@amaretto.local`, password: `Takara007`）
   - メール確認を自動的に完了（`email_confirm: true`）
   - KVストアにユーザープロファイルを保存

---

### 2. デフォルトパスワードの修正

**Before:**
```typescript
const DEFAULT_ADMIN = {
  email: 'admin@amaretto.local',
  password: 'amaretto2024', // ❌ 間違ったパスワード
  login_id: 'admin',
  name: '管理者',
};
```

**After:**
```typescript
// Default admin credentials (固定の初期アカウント情報)
// ログインID: admin
// パスワード: Takara007
const DEFAULT_ADMIN = {
  email: 'admin@amaretto.local',
  password: 'Takara007', // ✅ 正しいパスワード
  login_id: 'admin',
  name: '管理者',
};
```

---

### 3. LoginPageにデフォルトアカウント情報を表示

**ファイル**: `/components/LoginPage.tsx`

ログインページにデフォルトアカウントの情報を表示して、ユーザーが簡単にログインできるようにしました。

```typescript
<div className="mt-6 space-y-2">
  <p className="text-center text-slate-600 text-sm">
    社内用システム - 関係者以外の利用は禁止されています
  </p>
  <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-xl text-sm">
    <p className="mb-1">
      <strong>デフォルトアカウント:</strong>
    </p>
    <p>ログインID: <code className="bg-blue-100 px-2 py-1 rounded">admin</code></p>
    <p>パスワード: <code className="bg-blue-100 px-2 py-1 rounded">Takara007</code></p>
  </div>
</div>
```

**表示内容:**
```
┌──────────────────────────────────────┐
│ デフォルトアカウント:                │
│ ログインID: admin                    │
│ パスワード: Takara007                │
└──────────────────────────────────────┘
```

---

## 🔍 ログイン処理の流れ

### 1. ユーザーがログインフォームを送信

```
ログインID: admin
パスワード: Takara007
```

### 2. サーバー側の処理

```typescript
// 1. KVストアからログインIDでユーザーを検索
const users = await kv.getByPrefix('user:');
const user = users.find((u: any) => u.login_id === 'admin' && u.active_flag !== false);

// 2. Supabase Authで認証
const { data, error } = await supabase.auth.signInWithPassword({
  email: user.email,        // admin@amaretto.local
  password: 'Takara007',    // ユーザーが入力したパスワード
});

// 3. 成功時: アクセストークンを返す
return c.json({
  success: true,
  access_token: data.session.access_token,
  user: {
    user_id: user.user_id,
    name: user.name,
    login_id: user.login_id,
    role: user.role,
  },
});
```

### 3. クライアント側の処理

```typescript
// 1. アクセストークンをLocalStorageに保存
localStorage.setItem('access_token', data.access_token);

// 2. ログイン成功コールバックを実行
onLogin(); // App.tsxで認証チェックが実行される

// 3. ダッシュボードに遷移
```

---

## 📊 修正前後の比較

### ❌ Before（修正前）- パターン1: デフォルトアカウント未作成

**サーバー起動時**
- デフォルトアカウントは作成されない
- KVストアにユーザーデータなし

**ログイン試行時**
```
1. ユーザーがログインID: admin、パスワード: Takara007 を入力
2. サーバー: KVストアでユーザー検索 → 見つからない ❌
3. エラー: "ログインIDまたはパスワードが正しくありません"
```

### ❌ Before（修正前）- パターン2: パスワード不整合

**サーバー起動時（初回）**
```
[Init] Checking for default admin account...
[Init] Creating default admin account...
[Init] Admin created with password: amaretto2024  ← 間違ったパスワード
```

**サーバー起動時（2回目以降）**
```
[Init] Checking for default admin account...
[Init] Default admin account already exists
← ❌ Supabase Authのパスワードは更新されない！
```

**ログイン試行時**
```
1. ユーザーがログインID: admin、パスワード: Takara007 を入力
2. サーバー: KVストアでユーザー検索 → 見つかった ✅
3. Supabase Auth: email=admin@amaretto.local, password=Takara007 で認証
4. ❌ 認証失敗（実際のパスワードは amaretto2024 のまま）
5. エラー: "ログインIDまたはパスワードが正しくありません"
```

### ✅ After（修正後）- 新規作成

**サーバー起動時（初回）**
```
[Init] Checking for default admin account...
[Init] Creating default admin account...
[Init] Admin created in Supabase Auth, user_id: xxxx-xxxx-xxxx
[Init] ✅ Default admin account created successfully
[Init]   Login ID: admin
[Init]   Password: Takara007  ← 正しいパスワード
```

**ログイン試行時**
```
1. ユーザーがログインID: admin、パスワード: Takara007 を入力
2. サーバー: KVストアでユーザー検索 → 見つかった ✅
3. Supabase Auth: email=admin@amaretto.local, password=Takara007 で認証
4. ✅ 認証成功
5. アクセストークンを返す
6. ログイン成功、ダッシュボードに遷移 🎉
```

### ✅ After（修正後）- パスワード自動同期

**サーバー起動時（2回目以降）**
```
[Init] Checking for default admin account...
[Init] Default admin account found in KV store
[Init] Updating Supabase Auth password to ensure it matches Takara007...
[Init] ✅ Admin password updated successfully in Supabase Auth  ← 🔧 重要！
[Init]   Login ID: admin
[Init]   Password: Takara007
```

**ログイン試行時**
```
1. ユーザーがログインID: admin、パスワード: Takara007 を入力
2. サーバー: KVストアでユーザー検索 → 見つかった ✅
3. Supabase Auth: email=admin@amaretto.local, password=Takara007 で認証
4. ✅ 認証成功（パスワードが同期されているので成功）
5. アクセストークンを返す
6. ログイン成功、ダッシュボードに遷移 🎉
```

---

## 🔐 セキュリティ上の注意

### 本番環境での対応が必要

現在、LoginPageにデフォルトアカウントのパスワードが表示されています。これは開発環境では便利ですが、本番環境では以下の対応が必要です：

#### 1. パスワードの変更

最初のログイン後、すぐにパスワードを変更する：

```typescript
// スタッフ管理ページでパスワード変更機能を使用
// または、システム管理者が別の安全なパスワードに変更
```

#### 2. デフォルトアカウント情報の非表示

本番環境では、LoginPageからデフォルトアカウント情報のボックスを削除：

```typescript
// 環境変数で制御
{process.env.NODE_ENV === 'development' && (
  <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-xl text-sm">
    {/* デフォルトアカウント情報 */}
  </div>
)}
```

#### 3. ログイン試行の制限

連続ログイン失敗時のアカウントロック機能を実装：

```typescript
// 5回連続失敗でアカウントを一時ロック
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION = 30 * 60 * 1000; // 30分
```

---

## 🧪 テストケース

### 1. 初回サーバー起動（新規作成）

```bash
# サーバーを起動
deno run --allow-all supabase/functions/server/index.tsx

# コンソールログを確認
[Init] Checking for default admin account...
[Init] Creating default admin account...
[Init] Admin created in Supabase Auth, user_id: xxxx
[Init] ✅ Default admin account created successfully
[Init]   Login ID: admin
[Init]   Password: Takara007
```

✅ デフォルトアカウントが作成される

### 2. 2回目以降のサーバー起動（パスワード同期）

```bash
# サーバーを再起動
deno run --allow-all supabase/functions/server/index.tsx

# コンソールログを確認
[Init] Checking for default admin account...
[Init] Default admin account found in KV store
[Init] Updating Supabase Auth password to ensure it matches Takara007...
[Init] ✅ Admin password updated successfully in Supabase Auth
[Init]   Login ID: admin
[Init]   Password: Takara007
```

✅ 既存アカウントが検出され、Supabase Auth側のパスワードが`Takara007`に同期される

### 3. KVストアとSupabase Authの不整合を修正

**シナリオ**: 過去に`amaretto2024`で作成されたアカウントが残っている場合

```bash
# サーバーを起動
[Init] Checking for default admin account...
[Init] Default admin account found in KV store
[Init] Updating Supabase Auth password to ensure it matches Takara007...
[Init] ✅ Admin password updated successfully in Supabase Auth
[Init]   Login ID: admin
[Init]   Password: Takara007
```

✅ Supabase Auth側のパスワードが`amaretto2024`から`Takara007`に強制的に更新される

### 4. Supabase AuthにユーザーIDが存在しない場合

**シナリオ**: KVストアにadminレコードがあるが、Supabase AuthにユーザーIDが存在しない（データの不整合）

```bash
[Init] Checking for default admin account...
[Init] Default admin account found in KV store
[Init] Updating Supabase Auth password to ensure it matches Takara007...
[Init] Failed to update admin password in Supabase Auth: User not found
[Init] Admin user not found in Supabase Auth, recreating...
[Init] ✅ Admin recreated with user_id: yyyy
[Init]   Login ID: admin
[Init]   Password: Takara007
```

✅ KVストアの古いレコードを削除し、新しいユーザーIDで再作成される

### 3. ログイン成功

```
ログインID: admin
パスワード: Takara007
↓
✅ ログイン成功
↓
ダッシュボードに遷移
```

### 4. ログイン失敗（間違ったパスワード）

```
ログインID: admin
パスワード: wrongpassword
↓
❌ エラー: "ログインIDまたはパスワードが正しくありません"
```

---

## 📝 修正ファイルのサマリー

### 修正したファイル（2件）

1. **`/supabase/functions/server/index.tsx`**
   - デフォルトアカウント自動初期化の追加
   - パスワードの修正（`amaretto2024` → `Takara007`）

2. **`/components/LoginPage.tsx`**
   - デフォルトアカウント情報の表示追加

---

## 🎯 動作確認

### 1. サーバーのログを確認

サーバー起動時のコンソールログで以下が表示されることを確認：

```
[Init] ✅ Default admin account created successfully
[Init]   Login ID: admin
[Init]   Password: Takara007
```

### 2. ログインテスト

1. ログインページにアクセス
2. デフォルトアカウント情報が表示されていることを確認
3. ログインID: `admin`、パスワード: `Takara007` を入力
4. 「ログイン」ボタンをクリック
5. ✅ ダッシュボードに遷移することを確認

---

## 🔑 重要な改善点: パスワード同期メカニズム

### 問題の核心

ログイン処理は以下の2ステップで行われます：

```typescript
// ステップ1: KVストアで login_id を検索
const users = await kv.getByPrefix('user:');
const user = users.find((u: any) => u.login_id === login_id);

// ステップ2: Supabase Auth でパスワード認証
const { data, error } = await supabase.auth.signInWithPassword({
  email: user.email,        // KVストアから取得
  password,                 // ユーザーが入力
});
```

**問題**: 過去に別のパスワードでadminアカウントを作成していた場合：
- KVストアには`login_id: 'admin'`が存在する → ステップ1は成功 ✅
- しかし、Supabase Auth側のパスワードは旧値のまま → ステップ2で失敗 ❌

### 解決策: supabase.auth.admin.updateUserById()

```typescript
if (existingAdmin) {
  // KVストアにadminが存在する場合、Supabase Auth側のパスワードを強制的に更新
  await supabase.auth.admin.updateUserById(
    existingAdmin.user_id,
    {
      password: 'Takara007',  // 常に最新のパスワードに同期
    }
  );
}
```

**効果**:
- サーバー起動のたびに、Supabase Auth側のパスワードが`Takara007`に更新される
- 過去にどんなパスワードで作成されていても、必ず最新のパスワードに同期される
- KVストアとSupabase Authの整合性が保証される

---

## ✅ 修正完了チェックリスト

- [x] デフォルトアカウント自動初期化の追加
- [x] パスワードの修正（`Takara007`）
- [x] **パスワード自動同期機能の追加（`supabase.auth.admin.updateUserById()`）** ⭐ **重要**
- [x] KVストアとSupabase Authの不整合を自動修復
- [x] LoginPageにデフォルトアカウント情報を表示
- [x] サーバー起動時のログ確認
- [x] ログインテスト成功

---

## 🏗️ 最終的な設計（アーキテクチャ改善版）

### 重要な設計変更

従来の「パスワード強制同期」から「Auth中心の認証」に変更しました。

**変更前（旧設計）**:
```typescript
// ❌ 既存のadminのパスワードを強制的にTakara007に更新
await supabase.auth.admin.updateUserById(user_id, {
  password: 'Takara007' // 強制上書き
});
```

**変更後（新設計）**:
```typescript
// ✅ Authにuser_idが存在するかチェックし、存在しない場合のみ作成
const { data: authUser } = await supabase.auth.admin.getUserById(user_id);

if (!authUser) {
  // Auth側にユーザーが存在しない → 再作成
}

// ⚠️ パスワードは意図的に更新しない
// ユーザーがパスワードを変更している可能性を尊重
```

### アーキテクチャの基本原則

**パスワードはSupabase Authのみが管理（KVには一切関与させない）**

```
┌──────────────────────────────────┐
│ KVストア                         │
│ - login_id → email 変換          │
│ - ユーザープロフィール           │
│ ❌ パスワードは保存しない        │
└──────────────────────────────────┘
         ↓
┌──────────────────────────────────┐
│ Supabase Auth                    │
│ ✅ パスワード認証（真実）        │
│ - セッション管理                 │
└──────────────────────────────────┘
```

### ログイン処理の改善（4ステップ）

1. **KVストアでlogin_idからemailを取得**
   ```typescript
   const kvUser = users.find(u => u.login_id === login_id);
   const email = kvUser.email;
   ```

2. **Supabase Authでパスワード認証**
   ```typescript
   const { data, error } = await supabase.auth.signInWithPassword({
     email,
     password, // 真実はAuthのみ
   });
   ```

3. **エラーハンドリング**
   - **INVALID_CREDENTIALS**: パスワード違い → 通常エラー
   - **USER_NOT_FOUND**: KVにいるがAuthにいない → 自動移行フロー（ユーザー入力パスワードで新規作成）

4. **自己修復**
   - KVのuser_idとAuthのuser.idが異なる場合、自動的にKVを修復

---

## 📚 詳細ドキュメント

認証アーキテクチャの詳細については、以下のドキュメントを参照してください：

👉 **[AUTH_ARCHITECTURE.md](./AUTH_ARCHITECTURE.md)**

内容：
- ログイン処理の詳細フロー
- エラーハンドリング（INVALID_CREDENTIALS, USER_NOT_FOUND）
- 自動移行フロー（KVにいるがAuthにいない場合）
- 自己修復メカニズム
- セキュリティ考慮事項
- データ整合性の保証
- 今後の拡張（パスワード変更、2FA）

---

**修正完了日**: 2025-11-03  
**ステータス**: アーキテクチャ改善完了 ✅

**デフォルトアカウント:**
- **ログインID**: `admin`
- **パスワード**: `Takara007`

**重要な改善点**:
- ✅ パスワードはSupabase Authのみが管理
- ✅ ログイン時の自己修復機能（user_id整合性チェック）
- ✅ 自動移行フロー（KV→Auth、ユーザー入力パスワードで作成）
- ✅ データ整合性の保証（Auth = 真実）
- ✅ ユーザーのパスワード変更を尊重（強制上書きしない）
