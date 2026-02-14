-- 移行後に app_users.login_id が空の行を、KV の user_login / login_id または email の@前で補完する
-- 実行: Supabase SQL Editor でこのファイルの内容を実行
UPDATE app_users a
SET login_id = COALESCE(
  NULLIF(TRIM(kv.value->>'user_login'), ''),
  NULLIF(TRIM(kv.value->>'login_id'), ''),
  NULLIF(TRIM(SPLIT_PART(a.email, '@', 1)), '')
)
FROM kv_store_fe84bde0 kv
WHERE kv.key = 'user:' || a.user_id::text
  AND (a.login_id IS NULL OR TRIM(a.login_id) = '');
