## 開発者向けメモ（DEV_NOTES）

このファイルは、Figma Make から生成されたコードをベースに、
実運用向けにカスタマイズしていくための開発メモです。

---

## 1. 全体アーキテクチャ

- フロントエンド: Vite + React + TypeScript（`src/`）
  - エントリポイント: `src/main.tsx` → `src/App.tsx`
  - ルーティング: `App.tsx` 内で `window.location.pathname` を参照し、  
    公開予約画面（`/reservation` / `/public/reservation` など）と  
    管理画面（ログイン後のダッシュボード）を出し分け
- バックエンド: Supabase Edge Function `make-server-fe84bde0`
  - エンドポイント: `https://<project-id>.supabase.co/functions/v1/make-server-fe84bde0/...`
  - コード: `src/supabase/functions/server`
  - データ永続化: Supabase Postgres / KV Store

---

## 2. Supabase 連携

- フロント側の Supabase クライアント
  - 実装: `src/utils/supabase/client.ts`
  - 設定値: `src/utils/supabase/info.tsx` から `projectId` / `publicAnonKey` を読み込み
  - `info.tsx` は **環境変数 (`import.meta.env`) ベース** に変更済み
- API 通信
  - 実装: `src/utils/api.ts`
  - ベースURL: `BASE_URL = https://${projectId}.supabase.co/functions/v1/make-server-fe84bde0`
  - ローカルストレージに保存された `access_token` を `Authorization: Bearer` で付与
  - 401 エラー時:
    - `onUnauthorizedCallback` を通じて再認証モーダル（`ReauthModal`）を表示
    - フォールバックとしてトースト表示＋リロード

---

## 3. 認証・初期化フロー

- 初回アクセス時（トークンなし）
  - `App.tsx` 内の `checkAuth` でローカルストレージを確認
  - トークンがなければ `tryInitializeSystem` を実行し、  
    Supabase Edge Function 経由でシステム初期化を試行
- 初期化 API
  - エンドポイント例:  
    `https://${projectId}.supabase.co/functions/v1/make-server-fe84bde0/initialize`
  - `publicAnonKey` を Bearer トークンとして使用
  - 既に初期化済みの場合は「既に初期化されています」等のメッセージでスキップ
- 認証後
  - `/me` エンドポイントでユーザー情報を取得（`apiRequest<MeResponse>('/me')`）
  - `currentUser` / `isAuthenticated` をステートに保持
  - ロール（`admin` / `staff`）に応じてメニューのアクセス制御を実施

---

## 4. 画面構成（主要コンポーネント）

- ログイン系
  - `LoginPage.tsx` … スタッフ/管理者向けログイン
  - `ReauthModal.tsx` … セッション切れ時の再認証モーダル
- 公開予約
  - `PublicReservationPage.tsx` … 顧客向け予約フォーム
  - `ReservationCompletePage.tsx` … 予約完了画面
- 管理画面
  - `Layout.tsx` … サイドバー・ヘッダーなど共通レイアウト
  - `Dashboard.tsx` … ダッシュボード（※ `components` 直下に存在）
  - `CalendarPage.tsx` … 予約カレンダー
  - `ShiftManagementPage.tsx` … シフト管理
  - `CustomersPage.tsx` … 顧客管理
  - `WorkOrdersPage.tsx` / `WorkOrderModal.tsx` … 制作進行・作業指示
  - `SalesIncentivesPage.tsx` … インセンティブ管理
  - `OperationsPage.tsx` … システム運用系（メンテナンス等）

UI コンポーネントは `src/components/ui` 以下にまとめられており、  
主に Radix UI + Tailwind 風のユーティリティを用いて構成されています。

---

## 5. 今後の拡張メモ（例）

- 認証
  - 現在はカスタムトークンベースの実装。  
    将来的に Supabase Auth（email / OTP など）への移行を検討してもよい。
- 予約公開ページ
  - 現状でも予約〜完了画面は存在するが、  
    SEO 対応や OG タグ、モバイル最適化などを追加する余地あり。
- Google カレンダー連携
  - `src/supabase/functions/server/google_calendar.tsx` を利用。
  - 本番運用前に、サービスアカウントとカレンダーIDの整理、  
    エラー時リトライ戦略などを検討。

---

## 6. 開発の基本ルール（提案）

- 機能追加時は
  - フロント側コンポーネント
  - Edge Function 側 API
  - 型定義（`src/types`）
  の 3 点セットを意識して変更する。
- 大きな仕様変更を行う場合は
  - `README.md`
  - `DEV_NOTES.md`
  - 必要に応じて `src/SETUP.md`
  も合わせて更新し、将来の自分（や他の開発者）が迷わないようにする。

