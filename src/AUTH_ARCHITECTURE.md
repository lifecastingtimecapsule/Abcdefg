# 認証アーキテクチャ設計書

## 🏗️ 基本原則

### パスワード管理の真実は Supabase Auth のみ

**重要**: パスワードはKVストアに一切関与させない。すべてのパスワード認証はSupabase Authが管理する。

```
┌─────────────────────────────────────────────────────────┐
│ KVストア                                                │
│ - user_id (Supabase AuthのIDと一致)                    │
│ - login_id (社内ID/ログインID)                         │
│ - email                                                 │
│ - name, role, active_flag など                         │
│ ❌ パスワードは保存しない                               │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Supabase Auth                                           │
│ - user.id (プライマリキー)                              │
│ - email                                                 │
│ ✅ パスワードハッシュ（真実）                           │
│ - セッション管理                                        │
└─────────────────────────────────────────────────────────┘
```

---

## 🔐 ログイン処理フロー

### Step 1: KVストアでlogin_idからemailを取得

```typescript
const users = await kv.getByPrefix('user:');
const kvUser = users.find((u: any) => u.login_id === login_id && u.active_flag !== false);

if (!kvUser) {
  // KVストアにlogin_idが存在しない
  return { error: 'ログインIDまたはパスワードが正しくありません' };
}

// emailを取得
const email = kvUser.email;
```

**目的**: 
- login_idからemailへの変換（Supabase Authはemailベースの認証のため）
- ユーザーのactive_flagをチェック

**注意**: この段階ではパスワードは一切見ない

---

### Step 2: Supabase Authでパスワード認証

```typescript
const { data, error } = await supabase.auth.signInWithPassword({
  email: kvUser.email,
  password, // ユーザーが入力したパスワード
});
```

**目的**:
- パスワード認証（Authのみが真実）
- セッショントークンの取得

**結果**:
- 成功: `data.session.access_token` を取得
- 失敗: エラーハンドリングへ

---

### Step 3: エラーハンドリング

#### パターンA: INVALID_CREDENTIALS（パスワード違い）

```typescript
if (error.message.includes('Invalid login credentials')) {
  console.log(`[Login] Invalid credentials for ${kvUser.email}`);
  return { error: 'ログインIDまたはパスワードが正しくありません' };
}
```

**原因**: ユーザーが間違ったパスワードを入力
**対応**: 通常のログイン失敗エラーを返す

---

#### パターンB: USER_NOT_FOUND（KVにいるのにAuthにいない）

```typescript
if (error.message.includes('User not found')) {
  console.log(`[Login] User exists in KV but not in Auth, creating Auth user...`);
  
  // 🔧 自動移行/作成フロー
  const { data: createData, error: createError } = await supabase.auth.admin.createUser({
    email: kvUser.email,
    password, // ユーザーが入力したパスワードで作成
    email_confirm: true,
    user_metadata: {
      migrated: true,
      migrated_at: new Date().toISOString(),
    }
  });
  
  // KVストアのuser_idを更新（自己修復）
  await kv.del(`user:${kvUser.user_id}`); // 古いIDを削除
  await kv.set(`user:${createData.user.id}`, {
    ...kvUser,
    user_id: createData.user.id, // Auth側のIDに更新
  });
  
  // 再度ログイン試行
  const { data: retryData } = await supabase.auth.signInWithPassword({
    email: kvUser.email,
    password,
  });
  
  return { success: true, access_token: retryData.session.access_token };
}
```

**原因**: KVストアにユーザーレコードがあるが、Supabase Authにユーザーが存在しない
**対応**: 
1. Authに新しいユーザーを作成（ユーザーが入力したパスワードで）
2. KVストアのuser_idをAuth側のIDに更新（自己修復）
3. 再度ログイン試行

**ユースケース**:
- データ移行時
- Auth側でユーザーが削除されたが、KV側に残っている場合

---

### Step 4: 自己修復 - KVのuser_idとAuthのIDの整合性チェック

```typescript
if (kvUser.user_id !== data.user.id) {
  console.log(`[Login] Self-repair: KV user_id (${kvUser.user_id}) != Auth user_id (${data.user.id}), updating...`);
  
  // 古いKVレコードを削除
  await kv.del(`user:${kvUser.user_id}`);
  
  // 新しいuser_idでKVレコードを作成
  const repairedUser = {
    ...kvUser,
    user_id: data.user.id,
    last_login_at: new Date().toISOString(),
  };
  await kv.set(`user:${data.user.id}`, repairedUser);
  
  console.log(`[Login] Self-repair completed`);
}
```

**目的**: KVストアのuser_idとSupabase AuthのIDが一致することを保証
**タイミング**: ログイン成功時に毎回チェック
**効果**: データの不整合を自動的に修復

---

### Step 5: セッション確立

```typescript
return {
  success: true,
  access_token: data.session.access_token,
  user: {
    user_id: data.user.id, // Authから取得したID（真実）
    name: kvUser.name,
    login_id: kvUser.login_id,
    role: kvUser.role,
  },
};
```

**クライアント側の処理**:
```typescript
// アクセストークンをLocalStorageに保存
localStorage.setItem('access_token', data.access_token);

// 以降のAPIリクエストでAuthorizationヘッダーに付与
Authorization: `Bearer ${access_token}`
```

---

## 🔧 デフォルトアカウント初期化フロー

### ensureDefaultAdmin() の動作

```typescript
async function ensureDefaultAdmin() {
  // Step 1: KVストアでadminアカウントを検索
  const kvAdmin = users.find((u: any) => u.login_id === 'admin');
  
  if (kvAdmin) {
    // Step 2: Supabase Authにuser_idが存在するかチェック
    const { data: authUser, error } = await supabase.auth.admin.getUserById(kvAdmin.user_id);
    
    if (!authUser) {
      // Auth側にユーザーが存在しない → 再作成
      await kv.del(`user:${kvAdmin.user_id}`);
      
      const { data: newUser } = await supabase.auth.admin.createUser({
        email: 'admin@amaretto.local',
        password: 'Takara007',
        email_confirm: true,
      });
      
      await kv.set(`user:${newUser.user.id}`, {
        user_id: newUser.user.id,
        email: 'admin@amaretto.local',
        login_id: 'admin',
        name: '管理者',
        role: 'admin',
        active_flag: true,
      });
    } else {
      // Auth側にユーザーが存在する → OK
      // ⚠️ パスワードは意図的に更新しない
      // ユーザーがパスワードを変更している可能性があるため
    }
  } else {
    // Step 3: 新規作成
    const { data: newUser } = await supabase.auth.admin.createUser({
      email: 'admin@amaretto.local',
      password: 'Takara007',
      email_confirm: true,
    });
    
    await kv.set(`user:${newUser.user.id}`, {
      user_id: newUser.user.id,
      email: 'admin@amaretto.local',
      login_id: 'admin',
      name: '管理者',
      role: 'admin',
      active_flag: true,
    });
  }
}
```

### 重要な設計判断

**Q: 既存のadminアカウントのパスワードを強制的にTakara007に更新すべきか？**

**A: ❌ NO**

**理由**:
1. ユーザーがパスワードを変更している可能性がある
2. パスワード更新は管理者の意図的な操作として扱うべき
3. ログイン時の自己修復機能で十分

**例外**: 
- デフォルトアカウントのパスワードをリセットしたい場合は、管理者が手動でSupabase Dashboardから更新
- または、専用の「パスワードリセット」エンドポイントを用意

---

## 📊 データフロー図

### ログイン成功時

```
User Input
  ↓
  login_id: "admin"
  password: "Takara007"
  ↓
┌─────────────────────────────────────┐
│ Step 1: KVストアで検索              │
│ login_id → email 変換               │
│ "admin" → "admin@amaretto.local"    │
└─────────────────────────────────────┘
  ↓
┌─────────────────────────────────────┐
│ Step 2: Supabase Auth認証           │
│ email: admin@amaretto.local         │
│ password: Takara007                 │
│ ✅ 認証成功                         │
└─────────────────────────────────────┘
  ↓
┌─────────────────────────────────────┐
│ Step 3: 自己修復チェック            │
│ KV user_id == Auth user.id ?       │
│ ✅ 一致 or 自動修復完了             │
└─────────────────────────────────────┘
  ↓
┌─────────────────────────────────────┐
│ Step 4: セッション確立              │
│ access_token 発行                   │
│ クライアントへ返却                  │
└─────────────────────────────────────┘
```

### KVにいるがAuthにいない場合（自動移行）

```
User Input
  ↓
  login_id: "staff001"
  password: "NewPass123"
  ↓
┌─────────────────────────────────────┐
│ Step 1: KVストアで検索              │
│ ✅ 見つかった                       │
│ email: staff001@amaretto.local      │
└─────────────────────────────────────┘
  ↓
┌─────────────────────────────────────┐
│ Step 2: Supabase Auth認証           │
│ ❌ User not found                   │
└─────────────────────────────────────┘
  ↓
┌─────────────────────────────────────┐
│ Step 3: 自動移行フロー              │
│ 1. Authに新規ユーザー作成           │
│    email: staff001@amaretto.local   │
│    password: NewPass123 (入力値)    │
│ 2. KVのuser_idを更新（自己修復）    │
│ 3. 再度ログイン試行                 │
│ ✅ 認証成功                         │
└─────────────────────────────────────┘
  ↓
セッション確立
```

---

## 🛡️ セキュリティ考慮事項

### 1. パスワードはKVストアに保存しない

❌ **絶対にやってはいけないこと**:
```typescript
// ❌ BAD: パスワードをKVに保存
await kv.set(`user:${userId}`, {
  user_id: userId,
  password: password, // ❌ 絶対にダメ！
});
```

✅ **正しい方法**:
```typescript
// ✅ GOOD: パスワードはSupabase Authのみが管理
await supabase.auth.admin.createUser({
  email: email,
  password: password, // Authが暗号化して保存
});

// KVにはパスワード以外の情報のみ
await kv.set(`user:${userId}`, {
  user_id: userId,
  email: email,
  login_id: login_id,
  role: role,
  // パスワードは含まない
});
```

---

### 2. エラーメッセージの出し分けに注意

**セキュリティリスク**: エラーメッセージからユーザーの存在を推測できる

❌ **BAD**:
```typescript
if (!kvUser) {
  return { error: 'ログインIDが存在しません' }; // ❌ login_idの存在が分かる
}

if (authError) {
  return { error: 'パスワードが間違っています' }; // ❌ login_idは正しいと分かる
}
```

✅ **GOOD**:
```typescript
// どちらの場合も同じエラーメッセージ
return { error: 'ログインIDまたはパスワードが正しくありません' };
```

---

### 3. ログ出力は慎重に

❌ **BAD**:
```typescript
console.log(`Login failed: Password incorrect for ${email}`); // ❌ emailが分かる
console.log(`Password: ${password}`); // ❌ 絶対にダメ！
```

✅ **GOOD**:
```typescript
console.log(`[Login] Authentication failed`); // ✅ 詳細は出さない
console.log(`[Login] User found in KV: ${kvUser.email}`); // ✅ サーバー側のログなのでOK
```

---

### 4. レート制限（将来の実装）

連続ログイン失敗時のアカウントロック:

```typescript
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION = 30 * 60 * 1000; // 30分

// KVストアに試行回数を記録
const loginAttempts = await kv.get(`login_attempts:${login_id}`);

if (loginAttempts && loginAttempts.count >= MAX_LOGIN_ATTEMPTS) {
  const timeSinceLastAttempt = Date.now() - loginAttempts.lastAttempt;
  
  if (timeSinceLastAttempt < LOCK_DURATION) {
    return { error: 'アカウントがロックされています。30分後に再試行してください。' };
  }
}

// ログイン失敗時に試行回数を増やす
await kv.set(`login_attempts:${login_id}`, {
  count: (loginAttempts?.count || 0) + 1,
  lastAttempt: Date.now(),
});
```

---

## 🔄 データ整合性の保証

### 原則: Supabase Auth が常に真実

```
Truth Source Priority:
1. Supabase Auth (パスワード、セッション、user.id)
2. KVストア (プロフィール、権限、業務データ)
```

### 自己修復メカニズム

**トリガー**: ログイン成功時
**チェック項目**:
1. KVのuser_idとAuthのuser.idが一致するか
2. 一致しない場合、Authのuser.idを正とする
3. KVレコードを更新（古いIDを削除、新しいIDで作成）

**効果**:
- データ移行後の不整合を自動修復
- 手動でのデータ修正が不要
- ユーザーはログインするだけで修復される

---

## 📝 実装チェックリスト

### ログイン処理

- [x] KVストアでlogin_idからemailを取得
- [x] Supabase Authでパスワード認証
- [x] エラーハンドリング（INVALID_CREDENTIALS, USER_NOT_FOUND）
- [x] 自動移行フロー（KVにいるがAuthにいない場合）
- [x] 自己修復（user_idの整合性チェック）
- [x] セキュアなエラーメッセージ
- [x] ログ出力（開発用）

### デフォルトアカウント初期化

- [x] KVストアでadminアカウントを検索
- [x] Supabase Authにuser_idが存在するかチェック
- [x] 存在しない場合のみ再作成
- [x] パスワードは意図的に更新しない（ユーザーの変更を尊重）

### セキュリティ

- [x] パスワードをKVストアに保存しない
- [x] エラーメッセージの出し分けに注意
- [x] ログ出力は慎重に
- [ ] レート制限（将来の実装）
- [ ] 2FA対応（将来の実装）

---

## 🚀 今後の拡張

### 1. パスワード変更機能

```typescript
app.post('/make-server-fe84bde0/change-password', async (c) => {
  const user = await getAuthUser(c.req.raw);
  const { current_password, new_password } = await c.req.json();
  
  // 現在のパスワードを確認
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: current_password,
  });
  
  if (verifyError) {
    return c.json({ error: '現在のパスワードが正しくありません' }, 401);
  }
  
  // パスワードを更新（Authのみ）
  const { error: updateError } = await supabase.auth.admin.updateUserById(
    user.id,
    { password: new_password }
  );
  
  if (updateError) {
    return c.json({ error: 'パスワードの更新に失敗しました' }, 500);
  }
  
  return c.json({ success: true });
});
```

### 2. パスワードリセット（メール送信）

```typescript
app.post('/make-server-fe84bde0/reset-password', async (c) => {
  const { email } = await c.req.json();
  
  // Supabase Authのパスワードリセット機能を使用
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: 'https://amaretto.example.com/reset-password',
  });
  
  if (error) {
    // セキュリティ上、メールアドレスの存在は明かさない
    console.log(`Password reset error: ${error.message}`);
  }
  
  // 常に成功を返す（メールアドレスの存在を推測させない）
  return c.json({ 
    success: true,
    message: 'パスワードリセットメールを送信しました（該当するアカウントが存在する場合）'
  });
});
```

### 3. 2FA（二要素認証）

```typescript
// Supabase Authの2FA機能を使用
const { data, error } = await supabase.auth.mfa.enroll({
  factorType: 'totp',
});

// QRコードを表示してユーザーに登録してもらう
const qrCode = data.totp.qr_code;
```

---

**更新日**: 2025-11-03  
**ステータス**: 実装完了 ✅
