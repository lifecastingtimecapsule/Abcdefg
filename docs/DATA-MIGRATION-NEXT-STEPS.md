# データ移行：今からやること

リレーショナルテーブル作成済み・API（db レイヤー）をローカルに追加済みの場合の手順です。

---

## 1. テーブルが存在するか確認（未実施なら作成）

Supabase ダッシュボード → **Table Editor** で次のテーブルがあるか確認してください。

- `app_users`, `locations`, `customers`, `menu_items`, `location_menus`
- `reservations`, `work_orders`, `reservation_settings`, `location_availability`
- `incentive_monthly`, `incentives`, `audit_logs`, `shifts`

**ない場合**  
**SQL Editor** で `supabase/migrations/20250213000000_create_relational_tables.sql` の内容をコピーして実行してください。

---

## 2. データ移行スクリプトの実行

既存の KV データ（`kv_store_fe84bde0`）を新テーブルに流し込みます。

### 前提

- `.env.local` に **SUPABASE_SERVICE_ROLE_KEY** が設定されていること（すでに設定済みならそのままでOK）
- **VITE_SUPABASE_PROJECT_ID** があれば URL は自動で `https://{プロジェクトID}.supabase.co` になります

### 実行コマンド

プロジェクトルートで:

```bash
node scripts/migrate-kv-to-relational.mjs
```

- 初回は KV の件数に応じて 1〜数分かかることがあります
- コンソールに「app_users: N 件」「reservations: N 件」のように進捗が出ます
- 冪等なので、同じデータで再実行しても上書きされるだけです（`audit_logs` だけ重複するので、2 回目以降は必要なら truncate）

---

## 3. 移行結果の確認

1. **Table Editor** で各テーブルの件数が想定どおりか確認
2. 予約の「メニュー」「店舗」などリレーションが正しく入っているか、数件開いて確認
3. ローカルでアプリを起動し、**ダッシュボード・予約一覧・顧客・メニュー**が表示されるか確認
4. **公開予約ページ**でメニュー・店舗・予約枠が取得できるか確認

---

## 4. 本番（Vercel / Supabase Edge）に反映する場合

- **Edge Function** をデプロイすると、本番も新テーブル（db レイヤー）を参照します  
  - 例: `supabase functions deploy make-server-fe84bde0`
- 本番用 Supabase プロジェクトでも、上記 1〜3（テーブル作成 → 移行スクリプト実行 → 確認）を同じ手順で行ってください

---

## まとめ

| やること | 状態になったら |
|---------|----------------|
| 1. 新テーブル存在確認 | Table Editor で一覧が見える |
| 2. `node scripts/migrate-kv-to-relational.mjs` | コンソールで全件数が表示され、エラーなし |
| 3. 画面・データ確認 | ダッシュボード・予約・顧客が問題なく表示される |
| 4. （任意）本番デプロイ | Edge Function と本番 DB も同様に移行・確認 |

SQL のマイグレーション 2（`20250213000001_migrate_kv_to_relational.sql`）は使わず、**Node スクリプトで移行**する運用で問題ありません。
