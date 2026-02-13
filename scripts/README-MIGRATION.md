# KV → リレーショナルDB 移行スクリプト

DB 外で動かす移行プログラムです。時間はかかってもよいので、データの**抽出**と**新テーブルへの反映**を自動で行います。

## 前提

1. **新テーブルが作成済みであること**  
   `supabase/migrations/20250213000000_create_relational_tables.sql` を Supabase の SQL Editor で実行済みであること。

2. **Supabase のサービスロールキーが使えること**  
   移行はサーバー側で全テーブルに書き込むため、**Service Role Key** が必要です。

## 準備

### 1. Service Role Key の設定

Supabase ダッシュボード → **Project Settings** → **API** で **service_role** のキーをコピーし、`.env.local` に追加します。

```env
# 既存
VITE_SUPABASE_PROJECT_ID=xxxxx
VITE_SUPABASE_ANON_KEY=xxxxx

# 移行用（追加。このキーは絶対に公開リポジトリにコミットしないでください）
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....
```

- **SUPABASE_URL** は未設定でも構いません。`VITE_SUPABASE_PROJECT_ID` があれば `https://${プロジェクトID}.supabase.co` として使います。
- 本番用プロジェクトの場合は、一時的にだけ `.env.local` に設定し、移行後に削除する運用を推奨します。

### 2. 実行

プロジェクトのルートで:

```bash
node scripts/migrate-kv-to-relational.mjs
```

- 初回は KV の件数によっては 1〜数分かかることがあります。
- コンソールに「app_users: N 件」「reservations: N 件」のように進捗が表示されます。

## スクリプトの挙動

- **KV テーブル**（`kv_store_fe84bde0`）から `key` / `value` を全件取得します（ページングで 1000 件ずつ）。
- キーのプレフィックス（`user:`, `location:`, `customer:` など）で種類を判別し、それぞれ新テーブル用の行に変換します。
- **空文字・null** は適宜 NULL やデフォルト値にし、**UUID・日付の不正値**はその行だけスキップするか NULL にします。
- **外部キー**（予約の menu_item_id など）は、参照先テーブルに存在する ID だけを設定し、存在しない場合は NULL にします（行は挿入されます）。
- **reservation_number** が無い予約には `MIG-{reservation_id}` 形式の番号を付与します。
- **customer_code** の重複には `-2`, `-3` を付与して一意にします。
- 挿入順は **参照先 → 参照元**（例: locations → reservations）を守り、`upsert` で既存行は更新します。

## 注意

- **冪等**です。同じスクリプトを複数回実行しても、同じデータなら結果は上書きされるだけです。
- **audit_logs** は `insert` のみのため、2 回実行すると監査ログが重複します。必要なら 2 回目実行前に `audit_logs` を truncate してください。
- 移行後、Table Editor で各テーブルの件数や、予約の「メニュー」「店舗」などが想定どおりか確認することを推奨します。
