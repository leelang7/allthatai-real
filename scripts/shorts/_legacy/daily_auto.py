# -*- coding: utf-8 -*-
"""
매일 GPU 유휴일 때 도는 '발굴' 러너. (발행은 하지 않는다 — 검증이 필요하기 때문)
  1) GPU 사용률 체크 → 바쁘면 종료(남의 작업 방해 안 하게)
  2) trend_scan.py로 AI 화제 후보 수집 → candidates.json + 로그
사람(또는 세션의 Claude)이 그 후보를 권위소스로 검증한 뒤 dual_publish.py로 발행한다.

발굴을 기억에 의존하지 않게 만드는 게 목적. 무인 자동발행은 오보 위험 때문에 일부러 뺐다.

사용: python daily_auto.py [--gpu-max 40]
"""
import os, sys, subprocess, argparse, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass

def gpu_util():
    try:
        r = subprocess.run(["nvidia-smi", "--query-gpu=utilization.gpu", "--format=csv,noheader,nounits"],
                           capture_output=True, text=True, timeout=30)
        return int(r.stdout.strip().splitlines()[0])
    except Exception:
        return 0  # nvidia-smi 없으면 게이트 통과

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gpu-max", type=int, default=40, help="이 사용률(%) 넘으면 건너뜀")
    a = ap.parse_args()

    ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    u = gpu_util()
    print(f"[{ts}] GPU {u}% (한계 {a.gpu_max}%)")
    if u > a.gpu_max:
        print("GPU 사용 중 → 건너뜀")
        return 0

    env = dict(os.environ, PYTHONIOENCODING="utf-8")
    out = os.path.join(HERE, "candidates.json")
    r = subprocess.run([sys.executable, os.path.join(HERE, "trend_scan.py"),
                        "--days", "3", "--top", "15", "--json", out],
                       cwd=HERE, env=env, text=True, encoding="utf-8",
                       errors="replace", capture_output=True, timeout=600)
    print(r.stdout or "")
    if r.returncode == 0:
        print(f"[{ts}] 후보 저장 → {out}")
    else:
        print(f"[{ts}] 스캔 실패: {(r.stderr or '')[-200:]}")
    return r.returncode

if __name__ == "__main__":
    sys.exit(main())
