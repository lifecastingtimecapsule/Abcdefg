# データベース取得の遅延要因分析

サーバーが遅く感じる原因を、フロント・API・DB の流れで整理しました。

---

## 1. 全体の流れ

- **フロント** → `apiRequest('/reservations')` などで **Supabase Edge Function**（`make-server-fe84bde0`）を呼ぶ
- **Edge Function** 内で
  - 毎回 **Supabase Auth** でトークン検証
  - データは **1 テーブル** `kv_store_fe84bde0`（key-value）を `getByPrefix('reservation:')` のように **プレフィックス検索** で取得

遅くなりうる要因は「認証の回数」「HTTP の回数」「DB の呼び方」「Edge のコールドスタート」です。

---

## 2. 原因になりうるポイント

### 2.1 リクエストごとに認証（Auth 往復）

**場所:** `src/supabase/functions/server/index.tsx` の各ルート

```ts
const user = await getAuthUser(c.req.raw);  // 毎回実行
```

- `getAuthUser` 内で **`supabase.auth.getUser(accessToken)`** を呼んでいる
- **認証が必要な API は 1 リクエスト = 1 回の Supabase Auth 往復**
- ダッシュボードで 5 本並列 → 認証も 5 回並列で発生

**影響:** 認証のレイテンシ（数十〜百 ms 程度）が、すべての API に乗る。

---

### 2.2 フロントで API を多数呼んでいる

**場所:** `Dashboard.tsx`, `CalendarPage.tsx`, `CustomersPage.tsx` など

例（ダッシュボード）:

```ts
const results = await Promise.allSettled([
  apiRequest('/reservations'),
  apiRequest('/customers'),
  apiRequest('/locations'),
  apiRequest('/users'),
  apiRequest('/menu-items'),
]);
```

- 1 画面で **5〜6 本の HTTP リクエスト** が発生
- それぞれが「認証 + KV 取得」
- 並列なので「一番遅い 1 本」が体感を決めるが、**Edge や DB が重いと全体が遅く感じる**

**影響:** リクエスト数が多いほど、どこか 1 本が遅いと「サーバーが遅い」と感じやすい。

---

### 2.3 KV の「プレフィックス取得」= ほぼ全件スキャン

**場所:** `src/supabase/functions/server/kv_store.tsx`

```ts
// getByPrefix の実装
const { data } = await supabase
  .from("kv_store_fe84bde0")
  .select("key, value")
  .like("key", prefix + "%");  // 例: reservation:%
```

- データは **1 テーブル** に `reservation:xxx`, `customer:xxx`, `work_order:xxx` のように格納
- `getByPrefix('reservation:')` は **該当プレフィックスの行をほぼ全件取得**
- 予約・顧客・作業指示が増えるほど、**1 回の取得コストとペイロードが増える**

**主な使用箇所:**

| エンドポイント | 呼び方 | 備考 |
|----------------|--------|------|
| GET /reservations | `getByPrefix('reservation:')` | 全予約取得、件数多で遅くなりやすい |
| GET /customers | `getByPrefix('customer:')` | 全顧客→メモリで検索・ページング |
| GET /work-orders | `getByPrefix('work_order:')` | 全作業指示 |
| GET /locations | `getByPrefix('location:')` | 通常は件数少 |
| GET /menu-items | `getByPrefix('menu_item:')` | 同上 |
| POST /reservations | `getByPrefix('reservation:')` + `getByPrefix('work_order:')` | 予約番号生成・重複チェックで都度フルスキャン |
| POST /work-orders | `getByPrefix('work_order:')` | 重複チェックでフルスキャン |
| ログイン | リレーショナル `app_users` | `login_id` で 1 件のみ取得（KV 不使用、改善済み） |

**影響:** データ量に比例して、**DB の応答時間と転送量が増える**。特に予約・顧客・作業指示が多いと効きやすい。

---

### 2.4 公開予約ページの「直列」リクエスト

**場所:** `src/components/PublicReservationPage.tsx` の `loadPublicData`

```ts
// 1. Health
const healthRes = await fetch(`${apiUrl}/public/health`, ...);
// 2. メニュー
const menuRes = await fetch(menuUrl, ...);
// 3. 店舗
const locRes = await fetch(`${apiUrl}/public/locations`, ...);
// 4. 予約設定
const settingsRes = await fetch(`${apiUrl}/public/reservation-settings`, ...);
```

- **直列** のため、**4 回分の往復時間がそのまま足し算**になる
- Health は開発用なら本番では省略可能

**影響:** 1 本 200ms なら 4 本で 800ms など、体感が悪くなりやすい。

---

### 2.5 公開 API の booked-slots で 3 回の getByPrefix

**場所:** `index.tsx` の `GET /public/booked-slots`

```ts
const reservations = await kv.getByPrefix('reservation:');
const menuItems = await kv.getByPrefix('menu_item:');
const locations = await kv.getByPrefix('location:');
```

- 日付・店舗で絞りたいのに、**いったん全予約・全メニュー・全店舗を取得**してからメモリでフィルタ
- 予約が増えると **reservation** の取得が特に重くなる

**影響:** 公開予約で日付を選ぶたびに、重い処理が走る可能性がある。

---

### 2.6 ログイン（login_id で直接取得・改善済み）

**場所:** `index.tsx` の `POST /login`、`src/supabase/functions/server/db.ts` の `getAppUserByLoginId`

```ts
// ログイン時: login_id で 1 件だけ取得
const user = await db.getAppUserByLoginId(login_id);
// db.ts: .from('app_users').select('*').eq('login_id', loginId).eq('active_flag', true).maybeSingle()
```

- リレーショナルテーブル **`app_users`** を **`login_id` で 1 行だけ**取得（KV の `getByPrefix('user:')` は使用していない）
- ユーザー数が増えてもログインの取得コストは一定

**影響:** ログインの遅延要因としては軽微。体感が遅い場合はコールドスタートや認証処理を疑う。

---

### 2.7 Edge Function のコールドスタート

- Supabase Edge Functions（Deno）は、**しばらくアクセスがないとインスタンスが止まる**
- 次の 1 リクエスト目は **コールドスタート** で数百 ms〜秒単位遅くなることがある

**影響:** 「たまにすごく遅い」という体感の一因になりうる。

---

## 3. 原因の優先度（推測）

| 優先度 | 要因 | 理由 |
|--------|------|------|
| 高 | 2.3 KV の全件取得（getByPrefix） | データ増加で線形に遅くなる。予約・顧客・作業指示で効く |
| 高 | 2.2 フロントの多数リクエスト | 5〜6 本のうち 1 本でも遅いと体感が悪い |
| 中 | 2.1 リクエストごとの認証 | 全 API に認証コストが乗る |
| 中 | 2.4 公開ページの直列 fetch | 4 本直列でレイテンシが積み上がる |
| 中 | 2.5 booked-slots の 3 本 getByPrefix | 公開予約の操作のたびに重い |
| — | 2.6 ログイン | 改善済み（login_id で 1 件取得のため要因としてはほぼなし） |
| 低 | 2.7 コールドスタート | 初回・長時間放置後の 1 発だけ遅い |

---

## 4. 改善の方向性（概要）

1. **ダッシュボード系**
   - 複数 API を **1 本にまとめる**（例: `/dashboard` で reservations, customers, locations, menu_items, users を一括返す）
   - 認証は **1 回だけ** にして、同じリクエスト内で KV を並列取得

2. **KV の使い方**
   - 日付・店舗で絞る場合は、**キー設計**（例: `reservation:YYYY-MM-DD:...`）や **別テーブル/インデックス** で「必要な範囲だけ」取れるようにする
   - 予約番号生成・重複チェックは、可能なら **インデックスや RPC** で DB 側に寄せる

3. **認証**
   - トークンの **キャッシュ・検証の軽量化**（可能なら Edge 内で JWT 検証のみにするなど）で、Auth API 往復を減らす

4. **公開ページ**
   - `loadPublicData` の **health / menu / locations / settings を並列**（`Promise.all`）にする
   - 必要なら **1 本の「公開用 bootstrap」API** でまとめて返す

5. **計測**
   - どの API が何 ms か、**Edge のログやブラウザの Network** で計測すると、「何が原因か」を特定しやすい

---

## 5. 次のステップ

- **「どの画面で・何をしたときに遅いか」**（ログイン、ダッシュボード表示、カレンダー、公開予約の日付選択など）を教えてもらえれば、上記のどれを最優先で手を入れるか提案できます。
- 可能なら **reservations / customers / work_orders の件数** も分かると、2.3 の影響度を判断しやすいです。
