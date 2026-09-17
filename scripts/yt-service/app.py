"""유튜브 링크 → 다운로드. **홈 PC에서 도는 서비스.**

    pip install fastapi uvicorn yt-dlp
    python scripts/yt-service/app.py            # 기본 8130

왜 홈 PC인가
============
yt-dlp 는 파이썬 프로그램이고, 유튜브 서명을 풀기 위해 JS 런타임까지 필요하다.
Vercel 서버리스 함수(Node, 10~60초, 응답 크기 제한)에서는 돌릴 수 없다. 그래서
verify.allthatai.kr 과 같은 자리 -- 홈 PC -- 에 둔다. 사이트는 이미 그 패턴으로
모델 서버를 부르고 있다(src/lib/access-gate.ts).

바이트는 Vercel 을 지나지 않는다
==============================
영상 파일을 Vercel 함수로 흘리면 크기·시간 제한에 바로 걸린다. 그래서
  1  사이트 → /api/yt-info → 이 서비스 /info      제목·길이·포맷 (작은 JSON)
  2  브라우저 → 이 서비스 /file?token=...          파일 자체 (Vercel 우회)
토큰은 /info 가 발급하고 10분 뒤 죽는다. 링크만 있으면 누구나 받는 것을 막는다.

접근 제한
=========
X-API-Key 가 YT_KEY 환경변수와 맞아야 한다. 홈 회선과 홈 PC를 쓰는 서비스라
공개로 열어 두면 남의 대역폭 대신 내 것이 탄다. 키 없이 띄우면 경고하고 막는다.
"""
import hashlib
import hmac
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

try:
    from fastapi import FastAPI, Header, HTTPException, Query
    from fastapi.responses import FileResponse, JSONResponse
    import uvicorn
except ImportError:
    print("pip install fastapi uvicorn yt-dlp")
    raise SystemExit(1)

KEY = os.environ.get("YT_KEY", "")
PORT = int(os.environ.get("YT_PORT", "8130"))
WORK = Path(os.environ.get("YT_WORK", tempfile.gettempdir())) / "yt-service"
WORK.mkdir(parents=True, exist_ok=True)
TTL = 600                      # 토큰 수명(초)
MAX_SEC = 3600                 # 1시간 넘는 영상은 거절 -- 홈 회선이다
MAX_MB = 600

# yt-dlp 공통 옵션. JS 런타임이 없으면 제한된 클라이언트로 내려가 자동 자막이 사라지고
# 일부 영상은 403 이 난다. node 가 깔려 있으면 반드시 물린다.
YTDLP = ["yt-dlp", "--no-warnings", "--no-playlist"]
if shutil.which("node"):
    YTDLP += ["--js-runtimes", "node"]

ID_RE = re.compile(r"(?:v=|youtu\.be/|shorts/|embed/)([\w-]{11})")
app = FastAPI(title="yt-service")
_jobs: dict[str, dict] = {}
_lock = threading.Lock()


def auth(key: str | None):
    if not KEY:
        raise HTTPException(503, "서버에 YT_KEY 가 설정되지 않았다")
    if not key or not hmac.compare_digest(key, KEY):
        raise HTTPException(403, "키가 맞지 않는다")


def vid_of(url: str) -> str:
    m = ID_RE.search(url or "")
    if not m:
        raise HTTPException(400, "유튜브 링크에서 영상 id 를 찾지 못했다")
    return m.group(1)


def run(args: list[str], timeout: int = 120) -> subprocess.CompletedProcess:
    return subprocess.run(args, capture_output=True, text=True,
                          encoding="utf-8", errors="replace", timeout=timeout)


def sweep():
    """수명 지난 토큰과 파일을 치운다. 홈 PC 디스크가 조용히 차는 일을 막는다."""
    now = time.time()
    with _lock:
        dead = [t for t, j in _jobs.items() if now - j["at"] > TTL]
        for t in dead:
            j = _jobs.pop(t)
            for p in j.get("paths", []):      # 한 토큰이 여러 파일을 남길 수 있다
                try:
                    Path(p).unlink(missing_ok=True)
                except OSError:
                    pass
    for p in WORK.glob("*"):
        try:
            if now - p.stat().st_mtime > TTL * 2:
                p.unlink()
        except OSError:
            pass


@app.get("/health")
def health():
    return {"ok": True, "ytdlp": shutil.which("yt-dlp") is not None,
            "node": shutil.which("node") is not None, "keyed": bool(KEY)}


@app.post("/info")
def info(body: dict, x_api_key: str | None = Header(None)):
    """제목·길이·받을 수 있는 화질. 영상은 아직 받지 않는다."""
    auth(x_api_key)
    sweep()
    vid = vid_of(body.get("url", ""))
    r = run(YTDLP + ["-J", f"https://www.youtube.com/watch?v={vid}"], timeout=90)
    if r.returncode or not r.stdout.strip():
        msg = (r.stderr or "").strip().splitlines()
        tail = msg[-1][:200] if msg else "정보를 가져오지 못했다"
        raise HTTPException(502, tail)
    j = json.loads(r.stdout)

    dur = int(j.get("duration") or 0)
    if dur > MAX_SEC:
        raise HTTPException(413, f"{dur // 60}분짜리는 받지 않는다 (상한 {MAX_SEC // 60}분)")

    heights = sorted({f.get("height") for f in (j.get("formats") or [])
                      if f.get("height") and f.get("vcodec") != "none"}, reverse=True)
    opts = [h for h in heights if h <= 1080][:4]

    token = secrets.token_urlsafe(18)
    with _lock:
        _jobs[token] = {"vid": vid, "at": time.time(), "paths": [],
                        "title": j.get("title") or vid, "dur": dur}
    return {
        "ok": True, "token": token, "id": vid,
        "title": j.get("title"), "uploader": j.get("uploader"),
        "duration": dur, "thumbnail": j.get("thumbnail"),
        "heights": opts or [720], "audioOnly": True,
        "expiresIn": TTL,
    }


@app.get("/file")
def file(token: str = Query(...), height: int = Query(720), audio: int = Query(0)):
    """실제 파일. 브라우저가 이 주소로 바로 받는다 -- Vercel 을 지나지 않는다.

    여기서는 X-API-Key 를 요구하지 않는다. 브라우저 주소창 이동으로 받는 것이라
    헤더를 붙일 수 없기 때문이다. 대신 **토큰 자체가 열쇠**다 -- 인증된 /info 만
    발급하고, 추측할 수 없고, 10분이면 죽는다.
    """
    with _lock:
        job = _jobs.get(token)
    if not job:
        raise HTTPException(404, "토큰이 없거나 만료됐다. 다시 조회해라")
    if time.time() - job["at"] > TTL:
        raise HTTPException(410, "토큰이 만료됐다. 다시 조회해라")

    safe = re.sub(r'[\\/:*?"<>|]', "_", job["title"])[:80] or job["vid"]

    # 같은 토큰으로 영상과 소리를 둘 다 받을 수 있다. 파일 이름을 토큰만으로 지으면
    # 둘이 같은 자리를 쓰고, 뒤에서 glob 이 엉뚱한 쪽을 집어 **영상 대신 소리를**
    # 내주는 일이 생긴다(실측으로 걸렸다). 요청 종류를 이름에 박아 갈라 놓는다.
    kind = "audio" if audio else f"v{int(height)}"
    stem = f"{token}-{kind}"
    want = WORK / f"{stem}.{'m4a' if audio else 'mp4'}"

    def pick():
        cands = [q for q in WORK.glob(f"{stem}.*")
                 if q.is_file() and not q.name.endswith(".part") and q.stat().st_size > 10000]
        if not cands:
            return None
        return want if want in cands else max(cands, key=lambda q: q.stat().st_size)

    out = pick()
    if out is None:
        if audio:
            fmt = "ba[ext=m4a]/ba"
            extra = ["-x", "--audio-format", "m4a"]
        else:
            fmt = f"bv*[height<={height}]+ba/b[height<={height}]/b"
            extra = ["--merge-output-format", "mp4"]
        r = run(YTDLP + ["-f", fmt, *extra, "--max-filesize", f"{MAX_MB}m",
                         "-o", str(WORK / f"{stem}.%(ext)s"),
                         f"https://www.youtube.com/watch?v={job['vid']}"], timeout=900)
        out = pick()
        if out is None:
            msg = (r.stderr or r.stdout or "").strip().splitlines()
            tail = msg[-1][:200] if msg else "받지 못했다"
            raise HTTPException(502, tail)
        with _lock:
            _jobs[token].setdefault("paths", []).append(str(out))

    return FileResponse(out, media_type="audio/mp4" if audio else "video/mp4",
                        filename=f"{safe}.{out.suffix.lstrip('.')}")


@app.exception_handler(HTTPException)
def on_err(_req, exc: HTTPException):
    return JSONResponse({"ok": False, "error": exc.detail}, status_code=exc.status_code)


if __name__ == "__main__":
    if not KEY:
        print("경고: YT_KEY 가 없다. 모든 요청이 503 으로 막힌다.")
        print("  set YT_KEY=<긴 임의 문자열>   그리고 Vercel 에 같은 값을 넣어라")
    if not shutil.which("yt-dlp"):
        print("경고: yt-dlp 가 PATH 에 없다.  pip install yt-dlp")
    print(f"yt-service  http://127.0.0.1:{PORT}/health")
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="warning")
