# music/ 의 모든 mp3를 2.5D 모션(켄번즈)으로 mp4 일괄 재생성 — 일관성 확보.
# mp3·커버(jpg)·메타는 그대로, mp4만 다시 만든다. 진행률은 대시보드 프로그레스바로 표시.
#   python rerender_motion.py
import glob
import json
import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent
MUSIC = HERE / "music"
STATUS = MUSIC / ".sync_status.json"

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def progress(state, msg="", current=0, total=0):
    try:
        STATUS.write_text(json.dumps(
            {"state": state, "msg": msg, "current": current, "total": total, "added": current},
            ensure_ascii=False), encoding="utf-8")
    except Exception:
        pass


def is_motion(mp4: str) -> bool:
    """이미 모션 영상(고fps)이면 True — 정지영상(2fps)만 골라 재생성하려고."""
    if not os.path.exists(mp4):
        return False
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "v:0",
             "-show_entries", "stream=avg_frame_rate", "-of", "default=nw=1:nk=1", mp4],
            capture_output=True, text=True, encoding="utf-8", errors="replace").stdout.strip()
        num, _, den = out.partition("/")
        fps = float(num) / float(den) if den and float(den) else float(num or 0)
        return fps >= 20
    except Exception:
        return False


def main():
    mp3s = sorted(glob.glob(str(MUSIC / "*.mp3")))
    total = len(mp3s)
    if not total:
        progress("error", "mp3 없음")
        print("재생성할 mp3 없음"); return
    progress("download", "모션 재생성 시작…", 0, total)
    env = dict(os.environ, MOTION="kenburns")  # 강제 모션
    force = os.environ.get("RERENDER_ALL", "").strip() == "1"  # 1이면 이미 모션도 전부 다시
    done = skipped = 0
    for i, mp3 in enumerate(mp3s, 1):
        base = mp3[:-4]
        cover = base + ".jpg"
        out = base + ".mp4"
        name = os.path.basename(base)
        if not force and is_motion(out):  # 이미 모션이면 건너뜀
            skipped += 1
            done += 1
            progress("download", f"이미 모션(건너뜀): {name}", i, total)
            print(f"[{i}/{total}] skip(이미 모션) {name}")
            continue
        progress("download", f"모션 재생성: {name}", i, total)
        r = subprocess.run(
            [sys.executable, "make_music_video.py", mp3,
             cover if os.path.exists(cover) else "", out],
            cwd=str(HERE), capture_output=True, text=True, encoding="utf-8", errors="replace", env=env)
        if os.path.exists(out) and os.path.getsize(out) > 50_000:
            done += 1
            print(f"[{i}/{total}] OK {name}")
        else:
            print(f"[{i}/{total}] 실패 {name}: {(r.stderr or '')[-150:]}")
    progress("done", f"모션 통일 완료 {done}/{total} (건너뜀 {skipped})", total, total)
    print(f"RESULT 모션 재생성 완료 {done}/{total} (이미 모션 {skipped} 건너뜀)")


if __name__ == "__main__":
    main()
