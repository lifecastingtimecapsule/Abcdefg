
 # 予約・制作管理システム

 Figma Make で設計された「予約・制作管理システム」を、  
 **フロントエンド: Vercel（Vite + React + TypeScript）**  
 **バックエンド/DB: Supabase（Edge Functions + Postgres + KV Store）**  
 という構成で動かすためのリポジトリです。

 元デザイン（Figma）は以下にあります：
 `https://www.figma.com/design/g9YiknvkoMVaPK2MuensBY/%E4%BA%88%E7%B4%84%E3%83%BB%E5%88%B6%E4%BD%9C%E7%AE%A1%E7%90%86%E3%82%B7%E3%82%B9%E3%83%86%E3%83%A0`

 ---

 ## システム概要

 - **用途**: 予約管理 / 制作進行管理 / スタッフ勤務・インセンティブ管理
 - **フロントエンド**: Vite + React + TypeScript（`src/` 配下）
 - **バックエンド**: Supabase Edge Functions（`src/supabase/functions/server`）
 - **データベース**: Supabase Postgres（`app_users`・`reservations` 等）および KV Store（`kv_store_fe84bde0` 等）
 - **ホスティング**:
   - フロント: Vercel
   - API / DB: Supabase

 画面レベルの操作マニュアルは `src/SETUP.md` を参照してください。

 ---

 ## 最近の変更点

 - **カレンダー表示の高速化**
   - **Phase1**: カレンダー表示に必要な「予約一覧」と「場所」だけを先に取得し、すぐにカレンダーを表示するようにしました。
   - **Phase2**: メニュー・ユーザー・制作物はバックグラウンドで取得し、詳細モーダル用に保持。詳細を開いたときにまだ無い場合はその時点で取得（足りない分を補完）します。
 - **制作物自動作成の通信削減**
   - 以前は「GET 予約 → POST 制作物一括作成 → 再GET 予約」の 3 段階で待たされていました。
   - 現在は **GET `/reservations?month=YYYY-MM` 1 回**で、バックエンド側で「必要なら制作物を自動作成してから」最新の予約一覧を返す仕様に変更。通信は 1 回で完結します。
 - **カレンダー再描画の抑制**
   - Phase2 で `users` / `menuItems` / `workOrders` が更新されても、カレンダー本体（`react-big-calendar`）は `React.memo` でラップし、`events` と `date` が変わらない限り再描画しないようにしました。重い DOM の再描画によるカクつきを軽減しています。
 - **1 日あたりの表示件数**
   - 週/日ビュー向けに `allDayMaxRows` を設定し、残りは「+N 件」で表示するようにして DOM 負荷を抑えています。月ビューでは `popup` により同様に「+N 件」でまとめて表示されます。

 ---

 ## 必要なツール

 - Node.js 18 以上
 - npm（または pnpm / yarn）
 - Supabase アカウント
 - Vercel アカウント（本番公開する場合）

 ---

 ## 環境変数

 Supabase の情報は **ソースコードに直書きせず、環境変数から読み込む** 形に変更しています。  
 ルートにある `.env.example` を参考に、`.env.local` などを作成してください。

 必須の環境変数:

 - `VITE_SUPABASE_PROJECT_ID` … Supabase プロジェクトの **Reference ID**
 - `VITE_SUPABASE_ANON_KEY` … Supabase の **anon 公開キー**
 - （任意）`VITE_SUPABASE_URL` … ローカルで Edge Functions を別 URL に向ける場合（例: `http://127.0.0.1:54321`）。未設定時は `https://<project-id>.supabase.co` を使用します。

 ```bash
 # .env.local のイメージ
 VITE_SUPABASE_PROJECT_ID=xxxxxxxxxxxxxxxxxxxx
 VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 ```

 これらは、Vercel 側にも同じキー名で登録します（VITE_SUPABASE_URL は通常不要）。

 ---

 ## ローカル開発手順

 1. 依存関係のインストール

    ```bash
    npm install
    ```

 2. `.env.local` の作成  
    `.env.example` をコピーし、自分の Supabase プロジェクトの値を設定します。

 3. 開発サーバーの起動

    ```bash
    npm run dev
    ```

    ブラウザで `http://localhost:5173` を開きます。

 4. （任意）ログイン不具合の診断・パスワードリセット  
    - `npm run diagnose-login` … ログイン周りの診断（要 `.env.local`）
    - `npm run reset-admin-password` … 管理者パスワードのリセット用スクリプト

 ---

 ## Supabase 側の準備（概要）

 1. **Supabase プロジェクトを作成**
    - プロジェクト作成後、`Project Settings > API` から
      - `Project URL`（`https://xxxx.supabase.co`）
      - `anon public` キー
      を確認します。

 2. **Edge Functions のデプロイ**
    - バックエンド本体: `src/supabase/functions/server`（Figma Make 生成の Hono ベース）。
    - Supabase CLI でデプロイする場合のエントリポイント: `supabase/functions/make-server-fe84bde0/index.ts`（上記 server を import）。
    - プロジェクトルートで次のコマンドを実行します。  
      `npx supabase functions deploy make-server-fe84bde0`
    - ダッシュボードからデプロイする場合は、関数名 `make-server-fe84bde0` として登録します。
    - フロントエンドからは  
      `https://<project-id>.supabase.co/functions/v1/make-server-fe84bde0/...`  
      にリクエストが飛ぶ想定です。

 3. **API のベースURL・パスの確認**
    - Supabase ダッシュボード → **Project Settings**（左下の歯車）→ **API** を開く。
    - **Project URL**: `https://<project-id>.supabase.co` が表示されます。`<project-id>` が API で使うプロジェクトIDです。
    - **Edge Function のベースURL**（このプロジェクトで使用）:
      ```text
      https://<project-id>.supabase.co/functions/v1/make-server-fe84bde0
      ```
    - 例: プロジェクトID が `abcdefghij` なら（ベースURL: `https://abcdefghij.supabase.co/functions/v1/make-server-fe84bde0`）
      - ログイン: `POST <ベースURL>/login`
      - 予約一覧: `GET <ベースURL>/reservations`（月指定でカレンダー用: `?month=YYYY-MM`）
      - 公開予約作成: `POST <ベースURL>/public/reservations`
    - フロントの `.env.local` では `VITE_SUPABASE_PROJECT_ID` にこの `<project-id>` を入れます。

 4. **Edge Function の環境変数（シークレット）の追加方法**
    - ダッシュボードで追加する場合:
      1. 左メニュー **Edge Functions** をクリック。
      2. 上部または関数一覧の横にある **Secrets**（または **Manage secrets**）をクリック。  
         （表示名は「Secrets」「Environment Variables」などの場合があります。）
      3. **Add new secret** で「キー」と「値」を入力して保存。
    - 追加するキーと値の例:
      | キー | 値の取得元・内容 |
      |------|------------------|
      | `JWT_SECRET` | **Project Settings** → **API** → **JWT Secret** をコピー（ログイン高速化・password_hash 検証用）。※ `SUPABASE_`  prefix は使えないため `JWT_SECRET` で登録すること |
      | `GOOGLE_CALENDAR_ID` | Google カレンダー設定で「カレンダーID」（予約を反映したいカレンダー） |
      | `GOOGLE_SERVICE_ACCOUNT_JSON` | Google Cloud で作成したサービスアカウントの JSON キーを **1行の文字列** で貼り付け |
    - **注意**: `GOOGLE_SERVICE_ACCOUNT_JSON` は、JSON 全体をそのまま 1 つの文字列として貼り付けます（改行を含めても可。Edge Function 内で `JSON.parse` しています）。
    - すでに Supabase が注入しているため、通常は追加不要: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`。

 5. **既存ユーザーでログインできない場合**
    - ログインは Postgres の `app_users.login_id` でユーザーを参照します。既存データに `login_id` が無い場合は、管理者でログイン後、`POST .../admin/backfill-user-login` を 1 回実行すると全ユーザーにログイン用キーが設定されます。
    - パスワードは `app_users` または KV で検証されます。詳細は `docs/RESET-ALL-PASSWORDS.md` などを参照してください。

 ---

 ## Vercel へのデプロイ

 1. GitHub 上にこのリポジトリを公開
    - `.gitignore` により `node_modules` や `.env*` はコミットされません。

 2. Vercel ダッシュボードから「New Project」を作成し、このリポジトリを選択

 3. Framework / Build 設定
    - Framework Preset: **Vite**
    - Build Command: `npm run build`
    - Output Directory: `dist`

 4. Environment Variables に以下を追加
    - `VITE_SUPABASE_PROJECT_ID`
    - `VITE_SUPABASE_ANON_KEY`

 5. Deploy を実行すると、フロントエンドが Vercel で公開されます。

 ---

 ## 補足ドキュメント

 - `src/SETUP.md` … 管理画面・予約画面の初回セットアップと利用方法
 - `DEV_NOTES.md` … 開発者向けメモ（アーキテクチャ、今後の拡張方針など）
 - `docs/` … データ移行（`DATA-MIGRATION-NEXT-STEPS.md`）、パスワードリセット（`RESET-ALL-PASSWORDS.md`）、パフォーマンス分析（`DATABASE-PERFORMANCE-ANALYSIS.md`）など、追加の手順書があります。

 実装・仕様を変更した場合は、上記ドキュメントも合わせて更新してください。
  