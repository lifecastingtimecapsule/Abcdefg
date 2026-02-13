# すべてのブランチを main に統合し、追加のワークツリーを削除するスクリプト
# 実行方法: プロジェクトフォルダで PowerShell を開き .\merge-to-main.ps1 を実行

$ErrorActionPreference = "Stop"
# プロジェクトルートで実行されている場合はそのまま、そうでなければスクリプトの場所へ
$repoRoot = if (Test-Path ".git") { (Get-Location).Path } else { $PSScriptRoot }
if (-not (Test-Path ".git")) { Set-Location $repoRoot }

Write-Host "Repository: $repoRoot" -ForegroundColor Cyan
Write-Host ""

# 1. main に ui-update をマージ
Write-Host "[1/4] Merging ui-update into main..." -ForegroundColor Yellow
git merge ui-update -m "Merge branch 'ui-update' into main"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "  Done." -ForegroundColor Green
Write-Host ""

# 2. main に push-wyc をマージ
Write-Host "[2/4] Merging push-wyc into main..." -ForegroundColor Yellow
git merge push-wyc -m "Merge branch 'push-wyc' into main"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "  Done." -ForegroundColor Green
Write-Host ""

# 3. 追加のワークツリーを削除（メインのパスは残す）
$mainPathNorm = (Resolve-Path $repoRoot).Path.TrimEnd('\').Replace('\', '/').ToLowerInvariant()
$lines = git worktree list --porcelain
$toRemove = @()
foreach ($line in $lines) {
    if ($line -match '^worktree (.+)$') {
        $wtNorm = $matches[1].TrimEnd('\').Replace('\', '/').ToLowerInvariant()
        if ($wtNorm -ne $mainPathNorm) { $toRemove += $matches[1] }
    }
}
foreach ($wt in $toRemove) {
    Write-Host "[3/4] Removing worktree: $wt" -ForegroundColor Yellow
    git worktree remove $wt --force
}
Write-Host "  Worktrees removed." -ForegroundColor Green
Write-Host ""

# 4. 統合済みのブランチを削除（オプション）
Write-Host "[4/4] Deleting merged branches (ui-update, push-wyc)..." -ForegroundColor Yellow
git branch -d ui-update 2>$null
git branch -d push-wyc 2>$null
Write-Host "  Done." -ForegroundColor Green
Write-Host ""

Write-Host "All set. Main branch now contains everything. Push with: git push origin main" -ForegroundColor Green
