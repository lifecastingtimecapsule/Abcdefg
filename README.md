
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
 - **データベース**: Supabase Postgres + KV Store（`kv_store_fe84bde0` テーブルなど）
 - **ホスティング**:
   - フロント: Vercel
   - API / DB: Supabase

 画面レベルの操作マニュアルは `src/SETUP.md` を参照してください。

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

 ```bash
 # .env.local のイメージ
 VITE_SUPABASE_PROJECT_ID=xxxxxxxxxxxxxxxxxxxx
 VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 ```

 これらは、Vercel 側にも同じキー名で登録します。

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

 ---

 ## Supabase 側の準備（概要）

 1. **Supabase プロジェクトを作成**
    - プロジェクト作成後、`Project Settings > API` から
      - `Project URL`（`https://xxxx.supabase.co`）
      - `anon public` キー
      を確認します。

 2. **Edge Functions のデプロイ**
    - このリポジトリの `src/supabase/functions/server` は  
      Figma Make が生成したバックエンド（Hono ベース）のコードです。
    - Supabase ダッシュボードまたは `supabase` CLI を利用し、  
      関数名 `make-server-fe84bde0` の Edge Function としてデプロイします。
    - フロントエンドからは
      `https://<project-id>.supabase.co/functions/v1/make-server-fe84bde0/...`
      にリクエストが飛ぶ想定です。

 3. **環境変数（サービスロールキー、Google カレンダー連携など）**
    - `src/supabase/functions/server/kv_store.tsx` などでは
      `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` を利用します。
    - `google_calendar.tsx` では
      - `GOOGLE_CALENDAR_ID`
      - `GOOGLE_SERVICE_ACCOUNT_JSON`
      を利用します。
    - これらは Supabase プロジェクトの「環境変数」画面で設定してください。

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

 実装・仕様を変更した場合は、上記ドキュメントも合わせて更新してください。
  