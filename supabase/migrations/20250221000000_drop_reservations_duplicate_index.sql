-- reservations の重複インデックス削除
-- idx_reservations_date は 20250213000000 で定義済み。idx_reservations_datetime は冗長なため削除。
DROP INDEX IF EXISTS public.idx_reservations_datetime;
