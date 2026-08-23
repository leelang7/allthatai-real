# @allthathz 자동 업로드 데몬 — i2v 완료된 연주곡을 매일 채널 한도까지 올린다.
# YouTube 신규채널 일일 업로드 제한(uploadLimitExceeded)에 막히면 그날치만 올리고 대기,
# 6시간마다 재시도 → 리셋되면 다음 분량 자동 업로드. 전량 끝나면 종료.
import os
import subprocess
import sys
import time
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HERE = Path(__file__).parent
SLEEP = 6 * 3600  # 6시간마다 재시도(리셋 윈도우 포착)


def run_once():
    env = dict(os.environ, REQUIRE_I2V="1", MAX_PER_RUN="20", INSTRUMENTAL_ONLY="1",
               CLEAN_AFTER="1")  # 업로드 성공분 로컬 정리(용량)
    r = subprocess.run([sys.executable, "upload_queue.py"], cwd=str(HERE),
                       capture_output=True, text=True, encoding="utf-8", errors="replace", env=env)
    out = (r.stdout or "") + (r.stderr or "")
    # 남은 곡 수 파싱
    remain = None
    for line in out.splitlines():
        if "남은" in line and "RESULT" in line:
            print(line.strip())
        if line.startswith("RESULT"):
            print(line.strip())
    return out


def main():
    print("업로드 데몬 시작 — 6시간 간격, i2v 연주곡 전량까지.")
    while True:
        out = run_once()
        if "남은 0개" in out or "업로드 대기 없음" in out:
            print("전량 업로드 완료 — 데몬 종료.")
            return
        time.sleep(SLEEP)


if __name__ == "__main__":
    main()
