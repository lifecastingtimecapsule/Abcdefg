-- app_users に password_hash を追加（KV にあったパスワードハッシュを格納し、ログイン時に bcrypt 検証するため）
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS password_hash TEXT;
