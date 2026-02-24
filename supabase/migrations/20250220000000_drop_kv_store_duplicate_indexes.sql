-- 重複インデックス削除: kv_store_fe84bde0 の key_idx / key_idx1 / key_idx2 ... のみ対象
-- PRIMARY KEY 用インデックス（pkey）は触らない
DO $$
DECLARE
  idx RECORD;
BEGIN
  FOR idx IN
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'kv_store_fe84bde0'
      AND indexname ~ '^kv_store_fe84bde0_key_idx[0-9]*$'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', idx.indexname);
  END LOOP;
END$$;
