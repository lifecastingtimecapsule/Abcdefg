-- 全ユーザーに同じ初期パスワードを設定（ログイン不可時のリカバリ用）
-- パスワード: InitialPassword1!
-- 初回ログイン時にパスワード変更を促すフラグも設定

CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE app_users
SET
  password_hash = crypt('InitialPassword1!', gen_salt('bf', 10)),
  must_change_password = true,
  updated_at = now()
WHERE active_flag = true;
