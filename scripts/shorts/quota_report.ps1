# 오늘 쿼터가 어떻게 됐는지 사용자에게 **먼저** 알린다.
#
# 왜 필요한가
# -----------
# 발행이 됐는지 안 됐는지를 사용자가 매번 물어봐야 알 수 있었다. 그건 자동화가
# 아니라 그냥 숙제다. 결과는 묻기 전에 와야 한다.
#
# 하는 일
#   1) 오늘 미발행이 남았으면 스위퍼를 한 번 더 돌린다(자가 치유)
#   2) 결과를 Windows 알림으로 띄운다 — 성공이든 실패든
#   3) 요약을 quota_status.txt 에 남긴다(알림을 놓쳐도 볼 수 있게)

$ErrorActionPreference = 'Continue'
$here = 'C:\Users\leesc\Documents\allthatai-real\scripts\shorts'
Set-Location $here
$env:PYTHONIOENCODING = 'utf-8'
$env:HF_HOME = 'D:/hf_cache'
$py = 'E:\venvs\sd\Scripts\python.exe'

function Get-Pending {
    # 순서가 중요하다. '미발행 0개' 도 '미발행 \d+개' 에 걸리므로 '전부 올라갔다' 를
    # 먼저 본다. 예전엔 순서가 반대여서 12편을 다 올린 날에도 실패로 읽었다.
    $out = & $py publish_pending.py --dry 2>&1 | Out-String
    if ($out -match '전부 올라갔다') { return 0 }
    if ($out -match '미발행\s+(\d+)개') { return [int]$Matches[1] }
    return -1   # 판정 불가(생성 자체가 안 됐거나 오류)
}

# 오늘 채널에 실제로 몇 편 올라갔는지. JSON 이 사라졌거나 이름이 바뀌어도
# 이것만은 거짓말하지 않는다 — '올라갔는가' 의 최종 근거는 채널이다.
function Get-PublishedToday {
    $today = Get-Date -Format 'yyyy-MM-dd'
    $log = Join-Path $here 'publish_pending.log'
    if (-not (Test-Path $log)) { return 0 }
    return @(Select-String -Path $log -Pattern "^\[$today.*OK https://youtu\.be/" -AllMatches).Count
}

$pending = Get-Pending

# 남았으면 스위퍼를 한 번 더 — 12:30 실행이 실패했을 수도 있다.
if ($pending -gt 0) {
    & $py publish_pending.py 2>&1 | Out-File -FilePath 'publish_pending.log' -Append -Encoding utf8
    $pending = Get-Pending
}

$today = Get-Date -Format 'yyyy-MM-dd'
$published = Get-PublishedToday
if ($pending -eq 0) {
    $title = "쿼터 완료 ($today)"
    $body  = "오늘 $published 편 발행됐습니다."
} elseif ($pending -lt 0) {
    # JSON 이 없다고 곧장 실패라고 하지 마라. 이미 12편을 올리고 정리된 날도
    # JSON 이 안 보일 수 있다 — 채널에 올라간 수를 먼저 본다.
    if ($published -ge 12) {
        $title = "쿼터 완료 ($today)"
        $body  = "오늘 $published 편 발행됐습니다."
    } else {
        $title = "쿼터 확인 필요 ($today)"
        $body  = "오늘 주제 JSON이 없고 발행도 $published 편입니다. 생성 단계가 안 돌았어요."
    }
} else {
    $title = "쿼터 미완 ($today)"
    $body  = "$pending 편이 아직 안 올라갔습니다. 스위퍼를 돌렸는데도 남았어요."
}

"[$((Get-Date).ToString('yyyy-MM-dd HH:mm'))] $title — $body" |
    Out-File -FilePath 'quota_status.txt' -Encoding utf8

# Windows 알림. 모듈 설치 없이 되는 풍선 알림을 쓴다.
# 알림을 못 띄워도 스크립트는 실패로 끝내지 않는다 — 발행은 이미 끝났고,
# 상태 파일에도 남아 있다.
try {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $icon = New-Object System.Windows.Forms.NotifyIcon
    $icon.Icon = [System.Drawing.SystemIcons]::Information
    $icon.BalloonTipTitle = $title
    $icon.BalloonTipText = $body
    $icon.BalloonTipIcon = if ($pending -eq 0) {
        [System.Windows.Forms.ToolTipIcon]::Info
    } else {
        [System.Windows.Forms.ToolTipIcon]::Warning
    }
    $icon.Visible = $true
    $icon.ShowBalloonTip(20000)
    Start-Sleep -Seconds 12
    $icon.Dispose()
} catch {
    # 알림 실패는 무시 — quota_status.txt 가 남는다
}
