-- パフォーマンス改善: GET /locations, GET /work-orders の ORDER BY 用インデックス
-- 既存マイグレーションで created_at のインデックスが無いため追加

CREATE INDEX IF NOT EXISTS idx_locations_created_at ON locations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_orders_created_at ON work_orders(created_at DESC);
