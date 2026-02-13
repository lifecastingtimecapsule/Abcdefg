# リレーショナルDBへの移行手順

KV ストア（1 テーブル）から、一般的なリレーショナルテーブル構成へ移行する手順です。

## 概要

- **マイグレーション 1**: 新テーブル作成（`supabase/migrations/20250213000000_create_relational_tables.sql`）
- **マイグレーション 2**: 既存 KV データの移行（`supabase/migrations/20250213000001_migrate_kv_to_relational.sql`）
- **コード**: Edge Function（`index.tsx`）はすでに `db.ts` 経由で新テーブルを参照するように変更済みです。

## 手順

### 1. マイグレーションの適用

Supabase ダッシュボードで **SQL Editor** を開き、次の順で実行します。

1. **テーブル作成**  
   `supabase/migrations/20250213000000_create_relational_tables.sql` の内容をコピーして実行する。

2. **データ移行（既存データがある場合）**  
   `supabase/migrations/20250213000001_migrate_kv_to_relational.sql` の内容をコピーして実行する。

または、Supabase CLI を使う場合:

```bash
supabase db push
```

（プロジェクトで `supabase link` 済みであること）

### 2. app_users と auth.users の対応

現在、ユーザーは **Supabase Auth**（`auth.users`）と **アプリ用プロフィール**（`app_users`）の 2 つで管理されています。

- 新規作成時: サインアップ／初期化で `auth.users` にレコードができ、同時に `app_users` に同じ `user_id` で 1 件挿入されます。
- 移行後: 移行スクリプトで KV の `user:*` から `app_users` に投入されます。`user_id` は Auth のユーザー ID と同じなので、既存ログインはそのまま使えます。

### 3. 動作確認

1. ダッシュボードにログインし、予約・顧客・メニュー・店舗が表示されること。
2. 予約作成・編集・削除ができること。
3. 公開予約ページでメニュー・店舗・予約枠が取得できること。

### 4. ロールバック（問題があった場合）

- コードを KV に戻す: `index.tsx` の `import * as db from './db.ts'` を `import * as kv from './kv_store.tsx'` に戻し、各 `db.xxx` を元の `kv.xxx` の呼び方に戻す。
- 新テーブルを残したままにしておけば、修正後に再度データ移行だけやり直すこともできます。

## 新テーブル一覧

| テーブル | 説明 |
|----------|------|
| app_users | ユーザープロフィール（login_id, role など） |
| locations | 店舗 |
| customers | 顧客 |
| menu_items | メニュー |
| location_menus | 店舗×メニューの有効/無効 |
| reservations | 予約 |
| work_orders | 制作物（ワークオーダー） |
| reservation_settings | 予約全体設定（1 レコード） |
| location_availability | 店舗別営業・休業設定 |
| incentive_monthly | インセンティブ月次調整 |
| incentives | 予約紐付けインセンティブ |
| audit_logs | 監査ログ |
| shifts | シフト |

## パフォーマンス面の変化

- **予約一覧**: `getReservations()` で 1 クエリ。日付絞りは `getReservationsByDate(date, locationId)` でインデックス利用。
- **ログイン**: `getAppUserByLoginId(login_id)` で 1 件取得（全件スキャンなし）。
- **公開 booked-slots**: 指定日の予約だけ `getReservationsByDate` で取得するため、全予約読み込みを廃止。

これにより、データ量が増えても遅くなりにくい構成になっています。
