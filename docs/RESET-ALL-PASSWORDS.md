# 全ユーザーのパスワードを初期化する

パスワード紛失でログインできない場合に、全ユーザーに同じ初期パスワードを設定します。

## 初期パスワード

```
InitialPassword1!
```

全員同じパスワードです。初回ログイン後に必ず変更してください。

---

## 実行方法

### 方法1: Supabase Dashboard の SQL Editor で実行（推奨）

1. Supabase ダッシュボードを開く
2. 左メニューから **SQL Editor** を選択
3. 以下の SQL を貼り付けて実行

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE app_users
SET
  password_hash = crypt('InitialPassword1!', gen_salt('bf', 10)),
  must_change_password = true,
  updated_at = now()
WHERE active_flag = true;
```

4. 実行後、ログインID とパスワード `InitialPassword1!` でログインできるようになります

### 方法2: supabase db push でマイグレーションを適用

プロジェクトルートで以下を実行:

```bash
supabase db push
```

（マイグレーション `20250215000000_set_all_initial_passwords.sql` が含まれます）

---

## ログイン後の推奨

- 初回ログイン時にパスワード変更が求められます
- 各自で必ずパスワードを変更してください
