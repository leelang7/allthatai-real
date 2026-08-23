# 통합 자율 파이프라인: JSON -> 검증 -> 생성 -> 자동검증(ffprobe/프레임) -> unlisted 업로드.
#   python pipeline.py a.json b.json ...
# - JSON 사전검증(존재/파싱/cuts/topic/tags/link) 후 생성 → 사고(누락·깨짐) 예방
# - 생성물 자동검증: mp4 존재·길이 15~75s·용량·hook 프레임 추출
# - 제목/설명 자동 생성(또는 json의 title/desc 사용), 사이드카 태그+딥링크 자동
# - 항목별 try/except로 하나 실패해도 배치 지속, 끝에 요약
import sys
import os
import re
import json
import glob
import subprocess
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE.parent.parent

try:  # Windows cp949 콘솔에서도 한글/기호 출력 안 깨지게
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def vlog(*a):
    print(*a, flush=True)


def validate(jf):
    p = Path(jf)
    if not p.exists():
        return None, "파일 없음"
    try:
        d = json.loads(p.read_text(encoding="utf-8"))
    except Exception as e:
        return None, "JSON 오류: " + str(e)
    if not isinstance(d.get("cuts"), list) or len(d["cuts"]) < 3:
        return None, "cuts 부족"
    if not d.get("topic"):
        return None, "topic 없음"
    if not d.get("tags"):
        return None, "tags 없음"
    if not d.get("link"):
        vlog("  ⚠ link 없음(딥링크 생략):", jf)
    if not d.get("bgPrompt"):
        return None, "bgPrompt 없음"
    return d, None


def derive_title(d, result_title):
    if d.get("title"):
        return d["title"]
    return (result_title or d.get("topic", "")).strip()[:100]


def derive_desc(d):
    if d.get("desc"):
        return d["desc"]
    tips = [c for c in d.get("cuts", []) if c.get("kind") == "tip"]
    parts = []
    for c in tips:
        h = (c.get("head") or "").strip()
        if h:
            parts.append(h)
    return (d.get("topic", "") + " — " + ", ".join(parts)).strip()[:480]


def duration(mp4):
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=nw=1:nk=1", mp4],
            capture_output=True, text=True, encoding="utf-8", errors="replace", cwd=str(HERE))
        return float(out.stdout.strip() or 0)
    except Exception:
        return 0.0


def generate(jf):
    """make-short 실행, RESULT 라인 파싱해서 {mp4,title,topic,tags} 반환."""
    r = subprocess.run(
        ["npx", "tsx", "scripts/shorts/make-short.ts", jf],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
        cwd=str(ROOT), shell=(os.name == "nt"))
    out = (r.stdout or "") + "\n" + (r.stderr or "")
    res = None
    for line in out.splitlines():
        if line.startswith("RESULT "):
            try:
                res = json.loads(line[len("RESULT "):])
            except Exception:
                pass
    return res, out


def sanity(mp4):
    if not mp4 or not Path(mp4).exists():
        return "mp4 없음"
    sz = Path(mp4).stat().st_size
    if sz < 400_000:
        return "용량 비정상(%dKB)" % (sz // 1024)
    dur = duration(mp4)
    if not (15 <= dur <= 75):
        return "길이 비정상(%.1fs)" % dur
    # hook 프레임 추출(존재만 확인)
    name = re.sub(r"[^0-9A-Za-z]", "_", Path(mp4).stem)[:40]
    png = HERE / "verify" / (name + ".png")
    png.parent.mkdir(exist_ok=True)
    subprocess.run(["ffmpeg", "-y", "-ss", "1.6", "-i", mp4, "-frames:v", "1", str(png)],
                   capture_output=True, cwd=str(HERE))
    if not png.exists() or png.stat().st_size < 5000:
        return "프레임 추출 실패"
    return None


def upload(mp4, topic, title, desc):
    env = dict(os.environ, PYTHONUTF8="1",
               YT_PRIVACY=os.environ.get("PIPELINE_PRIVACY", "public"), YT_TOPIC=topic)
    r = subprocess.run([sys.executable, "upload_youtube.py", mp4, title, desc],
                       capture_output=True, text=True, encoding="utf-8", errors="replace",
                       cwd=str(HERE), env=env)
    out = (r.stdout or "") + (r.stderr or "")
    m = re.search(r"https://youtu\.be/(\S+)", out)
    return (m.group(1) if m else None), out


def main():
    jsons = sys.argv[1:]
    if not jsons:
        sys.exit("usage: python pipeline.py a.json b.json ...")
    # TTS 프리플라이트 — edge-tts가 죽으면 GPU 배경생성 낭비 전에 즉시 실패(명확한 안내)
    pre = HERE / "verify" / "_pre.mp3"
    pre.parent.mkdir(exist_ok=True)
    try:
        pre.unlink(missing_ok=True)
        subprocess.run(["edge-tts", "--text", "프리플라이트", "--write-media", str(pre)],
                       capture_output=True, timeout=40, cwd=str(HERE))
        ok_tts = pre.exists() and pre.stat().st_size > 1000
    except Exception:
        ok_tts = False
    if not ok_tts:
        sys.exit("✗ edge-tts(TTS) 동작 안 함 — 생성 중단. 복구: python -m pip install edge-tts")
    vlog("✓ TTS 프리플라이트 통과")
    ok, fail = [], []
    for jf in jsons:
        name = Path(jf).name
        vlog("\n===== " + name + " =====")
        d, err = validate(jf)
        if err:
            vlog("  ✗ 검증실패:", err); fail.append((name, err)); continue
        vlog("  ▶ 생성...")
        res, gout = generate(jf)
        if not res or not res.get("mp4"):
            tail = [l for l in (gout or "").splitlines() if l.strip() and "it/s" not in l and "Loading" not in l][-10:]
            vlog("  ✗ 생성실패(RESULT 없음). 마지막 출력:")
            for l in tail:
                vlog("    | " + l[:200])
            # 1회 자동 재시도(일시적 GPU 상태 대비)
            vlog("  ↻ 자동 재시도...")
            res, gout = generate(jf)
            if not res or not res.get("mp4"):
                vlog("  ✗ 재시도도 실패"); fail.append((name, "생성실패")); continue
            vlog("  ✓ 재시도 성공")
        mp4 = res["mp4"]
        serr = sanity(mp4)
        if serr:
            vlog("  ✗ 자동검증실패:", serr); fail.append((name, serr)); continue
        title = derive_title(d, res.get("title"))
        desc = derive_desc(d)
        vlog("  ▶ 업로드:", title)
        vid, uout = upload(mp4, d["topic"], title, desc)
        if not vid:
            vlog("  ✗ 업로드실패:", uout.strip()[-160:]); fail.append((name, "업로드실패")); continue
        vlog("  ✓ https://youtu.be/" + vid)
        ok.append((name, vid))
    vlog("\n===== 요약: 성공 %d / 실패 %d =====" % (len(ok), len(fail)))
    for n, v in ok:
        vlog("  ✓", n, "->", v)
    for n, e in fail:
        vlog("  ✗", n, "->", e)


if __name__ == "__main__":
    main()
