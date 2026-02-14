-- KV に格納されていた password_hash を app_users に反映する（パスワードが Supabase Auth に無い場合のログイン用）
-- 実行順: 先に 20250214000001_add_app_users_password_hash.sql を実行してからこのファイルを実行
UPDATE app_users a
SET password_hash = NULLIF(TRIM(kv.value->>'password_hash'), '')
FROM kv_store_fe84bde0 kv
WHERE kv.key = 'user:' || a.user_id::text
  AND kv.value->>'password_hash' IS NOT NULL
  AND TRIM(kv.value->>'password_hash') != '';
