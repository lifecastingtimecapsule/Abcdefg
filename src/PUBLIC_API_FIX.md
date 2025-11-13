# 公開予約ページの401エラー修正

## 🔴 問題の概要
公開予約ページでメニューと店舗情報の読み込みに失敗し、**401 Unauthorized** エラーが発生していました。

```
[公開予約ページ] メニューの読み込みに失敗: 401
```

## 🔍 原因の深い分析

### Supabase Edge Functionsの仕様
Supabase Edge Functionsは、**デフォルトで全てのリクエストに認証を要求します**。

以下のいずれかの方法で認証が必要です：
1. **Anon Key** (公開APIとして使用)
2. **Service Role Key** (サーバー側の管理操作)
3. **User Access Token** (ログイン済みユーザー)

### 間違った実装（修正前）
公開予約ページでは、認証ヘッダーなしでリクエストを送信していました：

```typescript
// ❌ 認証ヘッダーなし
const menuRes = await fetch(`${apiUrl}/public/menu-items`);
```

Supabase Edge Functionsは、認証ヘッダーがないリクエストを拒否し、**401 Unauthorized**を返します。

### サーバー側の実装は正しかった
サーバー側（`/supabase/functions/server/index.tsx`）では、公開エンドポイントとして正しく実装されていました：

```typescript
// ✅ 認証チェックなし
app.get('/make-server-fe84bde0/public/menu-items', async (c) => {
  try {
    const menuItems = await kv.getByPrefix('menu_item:');
    const activeMenuItems = menuItems.filter((m: any) => m.is_active === true);
    return c.json({ menu_items: activeMenuItems });
  } catch (error) {
    console.log(`Get public menu items error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});
```

**問題は、Supabase Edge Functionsのゲートウェイレベルで認証が要求されていたこと**です。

## ✅ 修正内容

### 1. Anon Keyのインポート
公開予約ページで`publicAnonKey`をインポート：

```typescript
import { projectId, publicAnonKey } from '../utils/supabase/info';
```

### 2. 全てのリクエストにAuthorizationヘッダーを追加

#### メニュー・店舗情報の読み込み
```typescript
const headers = {
  'Authorization': `Bearer ${publicAnonKey}`,
  'Content-Type': 'application/json',
};

const menuRes = await fetch(`${apiUrl}/public/menu-items`, { headers });
const locRes = await fetch(`${apiUrl}/public/locations`, { headers });
```

#### 予約済み時間枠の読み込み
```typescript
const headers = {
  'Authorization': `Bearer ${publicAnonKey}`,
  'Content-Type': 'application/json',
};
const response = await fetch(`${apiUrl}/public/booked-slots?date=${date}&location_id=${locationId}`, { headers });
```

#### 予約フォームの送信
```typescript
const response = await fetch(`${apiUrl}/public/reservations`, {
  method: 'POST',
  headers: { 
    'Authorization': `Bearer ${publicAnonKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ /* ... */ }),
});
```

### 3. ヘルスチェックエンドポイントの追加
デバッグ用にヘルスチェックエンドポイントを追加：

```typescript
app.get('/make-server-fe84bde0/public/health', async (c) => {
  return c.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    message: 'Public API is working'
  });
});
```

### 4. 詳細なデバッグログの追加
問題を特定しやすくするため、以下のログを追加：

```typescript
console.log('[公開予約ページ] API URL:', apiUrl);
console.log('[公開予約ページ] projectId:', projectId);
console.log('[公開予約ページ] Health check status:', healthRes.status);
console.log('[公開予約ページ] メニューレスポンス status:', menuRes.status);
```

## 🎯 修正後の動作

### 成功時のログ出力
```
[公開予約ページ] API URL: https://qldrqryxwmdnbrqzcvbf.supabase.co/functions/v1/make-server-fe84bde0
[公開予約ページ] projectId: qldrqryxwmdnbrqzcvbf
[公開予約ページ] Health check status: 200
[公開予約ページ] Health check: { status: 'ok', timestamp: '2025-01-13T...', message: 'Public API is working' }
[公開予約ページ] メニューURL: https://qldrqryxwmdnbrqzcvbf.supabase.co/functions/v1/make-server-fe84bde0/public/menu-items
[公開予約ページ] メニューレスポンス status: 200
[公開予約ページ] 読み込まれたメニュー: [{ menu_item_id: '...', name: '...', ... }]
[Public Menu] Total: 3, Active: 3
```

## 📊 Supabase Edge Functions認証の仕組み

### 認証レベル

```
リクエスト
  ↓
Supabase Edge Functions Gateway (認証チェック)
  ↓
  ├─ Authorizationヘッダーなし → ❌ 401 Unauthorized
  ├─ Bearer {anon-key} → ✅ 通過（公開アクセス）
  ├─ Bearer {service-role-key} → ✅ 通過（管理者アクセス）
  └─ Bearer {user-token} → ✅ 通過（ユーザーアクセス）
  ↓
アプリケーションコード (index.tsx)
  ↓
エンドポイントの処理
```

### Anon Keyの役割
- **公開アクセス**を許可するための認証キー
- セキュリティ上安全（Row Level Security と組み合わせて使用）
- フロントエンドに埋め込んでも問題なし
- 読み取り専用操作に適している

### Service Role Keyとの違い
| 項目 | Anon Key | Service Role Key |
|------|----------|------------------|
| **用途** | 公開API、フロントエンド | サーバー側管理操作 |
| **権限** | 制限付き | 全権限 |
| **公開** | OK | ❌ 絶対NG |
| **RLS** | 適用される | バイパス可能 |

## 🔧 デバッグ方法

### ブラウザコンソールで確認
1. 公開予約ページを開く
2. `F12`でデベロッパーツールを開く
3. Consoleタブで以下を確認：
   - API URLが正しいか
   - Health checkが200を返すか
   - メニューが正しく読み込まれているか

### ネットワークタブで確認
1. Networkタブを開く
2. ページをリロード
3. `public/menu-items`のリクエストを確認
4. **Request Headers**に`Authorization: Bearer ...`が含まれているか確認
5. **Response**が200 OKか確認

### Supabase Functionsログで確認
Supabaseダッシュボードで：
1. Functions → make-server-fe84bde0 → Logs
2. リアルタイムログで以下を確認：
   ```
   [Public Menu] Total: X, Active: Y
   ```

## 🎯 重要なポイント

### ✅ DO（推奨）
- **公開APIでもAnon Keyを使用する**
- Authorizationヘッダーを全てのSupabase Edge Functionsリクエストに含める
- エラーレスポンスを詳細にログ出力する
- Health checkエンドポイントでAPI接続を確認する

### ❌ DON'T（非推奨）
- Service Role Keyをフロントエンドに埋め込む
- Authorizationヘッダーなしでリクエストを送る
- エラーを無視する
- 本番環境でconsole.logを大量に残す（適切に管理）

## 📝 関連ファイル

- `/components/PublicReservationPage.tsx` - 公開予約ページ（修正済み）
- `/supabase/functions/server/index.tsx` - サーバー側エンドポイント
- `/utils/supabase/info.tsx` - Supabase設定（projectId, publicAnonKey）

## 🚀 今後の改善案

1. **エラーハンドリングの強化**
   - ユーザーフレンドリーなエラーメッセージ
   - リトライ機能の実装

2. **キャッシュの実装**
   - メニュー情報をLocalStorageにキャッシュ
   - ネットワークリクエストを削減

3. **パフォーマンス最適化**
   - 並列リクエストの活用
   - 不要なリクエストの削減

4. **セキュリティ強化**
   - Rate limiting の実装
   - 不正なリクエストの検出

## まとめ

**根本原因**: Supabase Edge Functionsは全てのリクエストに認証を要求するため、公開APIでもAnon Keyが必要

**解決策**: 全てのfetchリクエストに`Authorization: Bearer ${publicAnonKey}`ヘッダーを追加

**結果**: 公開予約ページが正常にメニューと店舗情報を読み込めるようになり、お客様が予約できるようになりました！✨
