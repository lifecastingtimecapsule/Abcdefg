-- app_users に loginpass（平文パスワード）を追加。
-- ここに設定した文字列とログイン時のパスワードが一致するとログインできます。
-- ※ セキュリティ上、本番では password_hash の利用を推奨します。
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS loginpass TEXT;
