# Docker を使ったログインデバッグ手順

ログイン失敗の原因を特定するため、Edge Function をローカルで実行し、ターミナルに出力されるログを確認します。

## 前提

- Docker が起動していること
- Supabase CLI がインストール済み（`supabase --version` で確認）
- 事前に `npm run reset-admin-password` で admin のパスワードを再設定済み

---

## 1. クラウドプロジェクトにリンク

```bash
supabase link --project-ref qldrqryxwmdnbrqzcvbf
```

（プロンプトでデータベースパスワードを聞かれた場合は入力）

---

## 2. JWT_SECRET を Edge Function に設定

Supabase Dashboard → **Project Settings** → **API** → **JWT Secret** をコピーし、次を実行：

```bash
supabase secrets set JWT_SECRET="ここにJWT_Secretの値を貼り付け"
```

※ 既に Dashboard の Edge Functions > Secrets で設定済みの場合は不要

---

## 3. Edge Function をローカルで起動

プロジェクトルートで：

```bash
supabase functions serve make-server-fe84bde0
```

ターミナルに `[LOGIN]` で始まるログが出力されるようになります。**このターミナルは開いたまま**にしてください。

---

## 4. フロントエンドをローカル API に接続

`.env.local` に以下を追加（既にあれば上書き）：

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
```

---

## 5. フロントエンドを起動

別のターミナルで：

```bash
npm run dev
```

---

## 6. ログインを試す

1. ブラウザでログイン画面を開く
2. ログインID: `admin`、パスワード: `InitialPassword1!` でログイン
3. **Edge Function を起動しているターミナル**のログを確認

### ログの見方

| ログ | 意味 |
|------|------|
| `[LOGIN] USER_NOT_FOUND` | admin が app_users に存在しない |
| `[LOGIN] hasPasswordHash: false` | password_hash が未設定 |
| `[LOGIN] hasJwtSecret: false` | JWT_SECRET が未設定 |
| `[LOGIN] bcrypt.compare result { ok: false }` | パスワード不一致（PASSWORD_MISMATCH） |
| `[LOGIN] SUPABASE_AUTH_FAILED` | Supabase Auth へのフォールバックが失敗 |
| `[LOGIN] JWT_SECRET_MISSING` | JWT_SECRET 未設定 |

---

## 7. デバッグ後の設定を戻す

ログイン問題が解消したら、`.env.local` から `VITE_SUPABASE_URL` の行を削除するかコメントアウトし、クラウドの Edge Function に戻します。
