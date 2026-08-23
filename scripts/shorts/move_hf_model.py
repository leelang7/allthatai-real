# HF 캐시 모델 폴더를 드라이브 간 이동(심링크 보존). robocopy가 심링크에서 실패해서 직접 처리.
# blobs/refs/.no_exist 는 실파일 복사, snapshots 는 심링크 재생성(상대경로 그대로).
#   python move_hf_model.py "<src model dir>" "<dst model dir>"
import os
import shutil
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def copy_tree_preserving_links(src: Path, dst: Path):
    dst.mkdir(parents=True, exist_ok=True)
    for root, dirs, files in os.walk(src, followlinks=False):
        rel = Path(root).relative_to(src)
        (dst / rel).mkdir(parents=True, exist_ok=True)
        for name in dirs + files:
            sp = Path(root) / name
            dp = dst / rel / name
            if sp.is_symlink():
                target = os.readlink(sp)           # 상대경로(../../blobs/..) 그대로 유지
                if dp.exists() or dp.is_symlink():
                    continue
                os.symlink(target, dp)
            elif sp.is_file():
                if not dp.exists():
                    shutil.copy2(sp, dp)


def dir_size(p: Path) -> int:
    return sum(f.stat().st_size for f in p.rglob("*") if f.is_file() and not f.is_symlink())


def main():
    src = Path(sys.argv[1])
    dst = Path(sys.argv[2])
    if not src.exists():
        print("원본 없음:", src); return
    print(f"이동: {src.name}\n  {src} → {dst}")
    before = dir_size(src)
    print(f"  실데이터 크기(심링크 제외): {before/1e9:.1f}GB")
    copy_tree_preserving_links(src, dst)
    after = dir_size(dst)
    print(f"  복사 후 D: 실데이터: {after/1e9:.1f}GB")
    # 검증: 실데이터 크기 일치 + 심링크가 실제 blob을 가리키는지 표본 확인
    ok = abs(after - before) < 1_000_000
    bad = 0
    for s in (dst / "snapshots").rglob("*"):
        if s.is_symlink() and not s.resolve().exists():
            bad += 1
    if ok and bad == 0:
        shutil.rmtree(src)
        print(f"검증 통과 — 원본 삭제 완료. (깨진 링크 {bad})")
        print("RESULT MOVED")
    else:
        print(f"검증 실패(크기일치={ok}, 깨진링크={bad}) — 원본 보존. D: 복사본은 수동 확인 필요.")
        print("RESULT KEPT_SOURCE")


if __name__ == "__main__":
    main()
