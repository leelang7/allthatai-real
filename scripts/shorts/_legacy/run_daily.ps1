# Daily unattended shorts: generate N topics -> unlisted upload -> refresh review dashboard.
# Public stays manual (review.html approval). Run by Task Scheduler or by hand.
#   powershell -ExecutionPolicy Bypass -File run_daily.ps1 -N 3
param([int]$N = 3)

[Console]::OutputEncoding = [Text.Encoding]::UTF8
$OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Continue'

$repo = 'c:\Users\leesc\Documents\allthatai-real'
$keys = 'c:\Users\leesc\Documents\ThinkU\allthat_assistant'
Set-Location $repo

$env:HF_HOME = 'D:\hf'
$env:PYTHONUTF8 = '1'
$env:CEREBRAS_API_KEY = (Get-Content "$keys\.cerebras_key" -Raw).Trim()
$env:CEREBRAS_MODEL  = (Get-Content "$keys\.cerebras_model" -Raw).Trim()
if (Test-Path "$keys\.groq_key") { $env:GROQ_API_KEY = (Get-Content "$keys\.groq_key" -Raw).Trim() }
$env:YT_PRIVACY = 'unlisted'
Remove-Item Env:\BG_VIDEO -ErrorAction SilentlyContinue

$made = 0
for ($i = 1; $i -le $N; $i++) {
  Write-Output "=== [$i/$N] 화제 발굴 + 영상 생성 ==="
  $out = (npx tsx scripts/shorts/make-short.ts 2>&1) | Out-String
  $line = ($out -split "`r?`n" | Where-Object { $_ -match '^RESULT ' } | Select-Object -First 1)
  if (-not $line) { Write-Output "  스킵 (생성 실패 또는 새 화제 없음)"; continue }
  try { $r = ($line -replace '^RESULT ', '') | ConvertFrom-Json } catch { Write-Output "  RESULT 파싱 실패"; continue }
  if (-not (Test-Path $r.mp4)) { Write-Output "  mp4 없음"; continue }
  # 생성만 - 업로드(쿼터 소모)는 대시보드에서 검증 후 수동. 쓰레기로 쿼터 안 날림.
  Write-Output ("  생성됨(로컬): " + $r.title + "  [화제: " + $r.topic + "]")
  $made++
}

python scripts/shorts/build_review.py
Write-Output "=== 완료: $made 개 로컬 생성(쿼터 0). 대시보드(localhost:8800)에서 검증 후 업로드 누르세요. ==="
