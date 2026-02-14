-- 初期パスワードでログインした初回にパスワード変更を促すフラグ
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;
