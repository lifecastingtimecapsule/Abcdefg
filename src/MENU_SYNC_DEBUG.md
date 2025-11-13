# メニュー同期の問題分析とデバッグガイド

## 問題の概要
管理システムで設定したメニューが公開予約ページに正しく同期されない問題を調査・修正しました。

## システムの仕様

### 管理画面のメニュー管理
- **エンドポイント**: `/make-server-fe84bde0/menu-items` (認証必要)
- **権限**: Admin のみが作成・編集可能
- **フィールド**:
  - `menu_item_id`: メニューID (UUID)
  - `name`: メニュー名
  - `base_price`: 基本料金
  - `additional_unit_price`: 追加単価
  - `description`: 説明
  - `is_active`: 有効/無効フラグ (boolean)

### 公開予約ページ
- **エンドポイント**: `/make-server-fe84bde0/public/menu-items` (認証不要)
- **フィルタリング**: `is_active === true` のメニューのみ表示
- **表示内容**: 有効なメニューのみお客様に表示

## 修正内容

### 1. サーバー側のフィルタリング強化
**修正箇所**: `/supabase/functions/server/index.tsx` (line 2217-2226)

**変更前**:
```typescript
const activeMenuItems = menuItems.filter((m: any) => m.is_active !== false);
```

**変更後**:
```typescript
const activeMenuItems = menuItems.filter((m: any) => m.is_active === true);
console.log(`[Public Menu] Total: ${menuItems.length}, Active: ${activeMenuItems.length}`);
```

**理由**: 
- `is_active !== false` は、`undefined` や `null` も含めて表示してしまう
- `is_active === true` で明示的に有効なメニューのみをフィルタリング
- ログ出力で同期状態を監視可能

### 2. デバッグログの追加

#### 公開予約ページ
**修正箇所**: `/components/PublicReservationPage.tsx`
```typescript
console.log('[公開予約ページ] 読み込まれたメニュー:', menuData.menu_items);
```

#### 管理画面
**修正箇所**: `/components/MenuSettingsPage.tsx`
```typescript
console.log('[管理画面] 読み込まれたメニュー:', data.menu_items);
console.log('[管理画面] メニュー保存:', menuData);
```

## デバッグ手順

### ステップ1: ブラウザのコンソールを開く
1. Chrome/Edge: `F12` または `Ctrl+Shift+I`
2. Safari: `Cmd+Option+I`

### ステップ2: 管理画面でメニューを確認
1. 管理システムにログイン
2. 「運営管理」→「メニュー設定」を開く
3. コンソールに以下のログが表示されます:
   ```
   [管理画面] 読み込まれたメニュー: [...]
   ```
4. 各メニューの `is_active` フィールドを確認

### ステップ3: メニューを編集・保存
1. メニューの「編集」ボタンをクリック
2. 「有効にする」チェックボックスの状態を確認
3. 保存時にコンソールに以下のログが表示されます:
   ```
   [管理画面] メニュー保存: { is_active: true, ... }
   ```

### ステップ4: 公開予約ページで確認
1. `/` または公開予約ページを開く
2. コンソールに以下のログが表示されます:
   ```
   [公開予約ページ] 読み込まれたメニュー: [...]
   ```
3. サーバーログ (Supabase Functions) にも以下が表示されます:
   ```
   [Public Menu] Total: X, Active: Y
   ```

## トラブルシューティング

### 問題1: メニューが公開ページに表示されない
**確認事項**:
- 管理画面でメニューが「有効」になっているか
- `is_active: true` が設定されているか
- コンソールログで実際のデータを確認

**解決策**:
1. 管理画面でメニューを開く
2. 「編集」→「有効にする」をチェック→保存
3. ページをリロード

### 問題2: 古いメニューが表示されたまま
**原因**: ブラウザキャッシュ

**解決策**:
1. ハードリロード: `Ctrl+Shift+R` (Windows) / `Cmd+Shift+R` (Mac)
2. キャッシュクリア後にリロード

### 問題3: 管理画面とデータベースの不整合
**確認事項**:
- Supabase Functions のログを確認
- エラーメッセージがないか確認

**解決策**:
1. メニューを再度保存
2. それでも解決しない場合は、一度メニューを削除して再作成

## 技術的な詳細

### データフロー
```
管理画面 (MenuSettingsPage)
  ↓ POST /menu-items
KV Store (menu_item:xxx)
  ↓ GET /public/menu-items (is_active === true でフィルタ)
公開予約ページ (PublicReservationPage)
```

### is_active のデフォルト値
- 新規作成時: `true` (有効)
- 更新時: 既存の値を保持、または `true`
- サーバー側: `is_active ?? true` で null/undefined を自動的に true に変換

### 初期データ
システム初期化時（`/initialize` エンドポイント）に以下のメニューが自動作成されます:
1. お好きな部位一本+写真 (¥15,000)
2. お好きな部位二本+写真 (¥20,000)
3. ご家族全員の手+写真 (¥25,000)

すべて `is_active: true` で作成されます。

## 今後の改善提案

1. **リアルタイム同期**: WebSocketを使用してメニュー変更を即座に反映
2. **プレビュー機能**: 管理画面からお客様の見た目をプレビュー
3. **バージョン管理**: メニューの変更履歴を追跡
4. **A/Bテスト**: 複数のメニュー表示パターンをテスト

## まとめ

この修正により:
✅ 管理画面で「無効」にしたメニューが公開ページに表示されなくなる
✅ 「有効」にしたメニューのみがお客様に表示される
✅ デバッグログで同期状態を監視できる
✅ トラブル時の原因特定が容易になる
