# ワークツリーを main に統合する手順

複数のワークツリーで分散していた変更を、すべて **main** ブランチにまとめます。

## 実行前の状態

- **main**: 現在のベース（8e5dee0）
- **ui-update**: vercel.json の更新（1 コミット）
- **push-wyc**: vercel.json / package-lock.json の除外設定（1 コミット）
- 上記以外のワークツリー（dxh, ewm, jvn, nas, pwx, sse, utt, wyc, xcu, yyx）は Cursor の作業用

## 手順（プロジェクトフォルダで実行）

1. **このリポジトリのフォルダ**（`Abcdefg`）を開いた状態で PowerShell またはターミナルを開く  
   - 例: エクスプローラーでフォルダを開き、アドレス欄に `powershell` と入力して Enter  
   - または Cursor でこのプロジェクトを開き、**ターミナル**（`` Ctrl+` ``）を開く（多くの場合、すでにプロジェクトフォルダがカレントになっています）

2. 次のコマンドを実行する:

   ```powershell
   .\merge-to-main.ps1
   ```

3. 実行後、リモートに反映する場合:

   ```bash
   git push origin main
   ```

## スクリプトの内容

- `ui-update` を main にマージ
- `push-wyc` を main にマージ
- 上記以外のワークツリー（Cursor の作業用）を削除
- マージ済みのブランチ `ui-update` と `push-wyc` を削除

実行後は **このフォルダだけ** が残り、main にすべての変更が入った状態になります。
