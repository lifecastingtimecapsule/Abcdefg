-- user_location_access: スタッフが閲覧できる店舗の紐付けテーブル
-- admin ユーザーはコードレベルで全ロケーションにアクセス可（このテーブルは不要）
-- staff ユーザーはこのテーブルに行が存在するロケーションのみ閲覧可
CREATE TABLE IF NOT EXISTS user_location_access (
  user_id     UUID NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(location_id) ON DELETE CASCADE,
  granted_by  UUID REFERENCES app_users(user_id) ON DELETE SET NULL,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, location_id)
);
CREATE INDEX IF NOT EXISTS idx_ula_user ON user_location_access(user_id);
CREATE INDEX IF NOT EXISTS idx_ula_location ON user_location_access(location_id);
