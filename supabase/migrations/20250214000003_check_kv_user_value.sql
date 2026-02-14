-- 【確認用】KV の user データに password_hash が入っているか確認する
-- SQL Editor で実行し、結果の value に password_hash のキーがあるか見る
SELECT key, jsonb_pretty(value) AS value_preview
FROM kv_store_fe84bde0
WHERE key LIKE 'user:%' AND key != 'user:'
LIMIT 5;
