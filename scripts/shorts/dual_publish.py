# -*- coding: utf-8 -*-
"""
검증된 토픽 JSON 하나로 유튜브 쇼츠 + 인스타 카드뉴스를 동시에 만들고 발행한다.
캡션/설명/해시태그는 JSON에서 자동 생성. 이게 채널 운영 자동화의 단일 진입점.

사용:
  python dual_publish.py <json> <theme> [--yt public|2026-07-16T00:00:00Z] [--ig] [--title "..."]
    theme  : bg_pool/<theme>.mp4 (office/money/health/crypto/car/realestate/law/film/family/generic/stadium/tech)
    --yt   : 'public'=지금 공개 / RFC3339 UTC=예약 / 생략=유튜브 건너뜀
    --ig   : 인스타 카드뉴스도 발행
    --title: 유튜브 제목(생략 시 훅에서 자동 생성)
전제: SP 환경변수(scratchpad 경로, 카드 폰트용), yt_token.json, ig_token.txt
"""
import os, sys, json, glob, re, hashlib, subprocess, argparse
try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")

def _hashint(s): return int(hashlib.md5((s or "x").encode("utf-8")).hexdigest(), 16)

def load(jpath): return json.load(open(jpath, encoding="utf-8"))

def hook_of(j): return next(c for c in j["cuts"] if c["kind"] == "hook")
def tips_of(j): return [c for c in j["cuts"] if c["kind"] == "tip"]

def auto_title(j):
    h = hook_of(j)
    return " ".join(h["titleLines"]).replace(",", "").strip()

def yt_description(j):
    link = j.get("link", "real.allthatai.kr")
    bodies = " ".join(t.get("body", "") for t in tips_of(j))
    tags = j.get("tags", [])
    hashline = " ".join("#" + t for t in tags[:8])
    return (f"👉 {link}\n\n{bodies}\n\n"
            "※ 정보는 발행 시점 기준이에요. 최신 내용은 공식 출처에서 확인하세요.\n\n"
            f"#Shorts {hashline}")

def ig_caption(j):
    h = hook_of(j)
    lead = h.get("narration", " ".join(h["titleLines"]))
    bullets = "\n".join("✅ " + t.get("body", "") for t in tips_of(j))
    link = j.get("link", "real.allthatai.kr")
    tags = j.get("tags", []) + ["생활정보", "꿀팁", "정부지원", "allthatlink"]
    seen, uniq = set(), []
    for t in tags:
        if t not in seen: seen.add(t); uniq.append(t)
    hashline = " ".join("#" + t for t in uniq[:15])
    return (f"{lead}\n\n{bullets}\n\n"
            "※ 정보는 발행 시점 기준이에요. 최신 내용은 공식 출처에서 확인하세요.\n\n"
            f"더 많은 생활·정책 꿀정보와 AI 도구는 프로필 링크에서 👉 {link}\n\n"
            f"{hashline}")

def safe_name(src):
    """make-short.ts:321 과 동일한 파일명 규칙. JS \\w는 ASCII만이므로 가-힣을 명시.
    예: 'GPT-5.6' -> 'GPT_5_6' (한글 토픽은 그대로)."""
    s = re.sub(r"[^A-Za-z0-9_가-힣]+", "_", src)
    s = re.sub(r"^_|_$", "", s)
    return s[:40] or "short"

def latest_mp4(topic):
    fs = sorted(glob.glob(os.path.join(OUT, glob.escape(safe_name(topic)) + "_*.mp4")),
                key=os.path.getmtime)
    return fs[-1] if fs else None


def _image_ok(path):
    """생성된 배경이 발행해도 되는 그림인지 본다.

    2026-09-02, SDXL 이 "복부초음파" 배경으로 전신 나체를 그렸고 아무도 보지 않은 채
    공개돼 유튜브에서 삭제됐다. 프롬프트만 거르는 걸로는 못 막는다 — 모델은 프롬프트와
    다른 걸 그린다. 그래서 픽셀을 판별 모델에 넣어 본다.

    검사를 **못 했을 때는 통과**시킨다(모델 로딩 실패 등). 검사 실패로 그날 발행이
    통째로 멈추면 안 되고, 그 경우는 로그에 남는다.
    """
    try:
        from image_guard import check
        ok, level, msg, _ = check(path)
    except Exception as e:
        print("  [guard] 검사 못 함(통과 처리):", str(e)[:100])
        return True
    tag = {"ok": "OK", "warn": "확인필요", "block": "차단", "skip": "건너뜀"}.get(level, level)
    print(f"  [guard] {tag} — {msg}")
    if not ok:
        # 다음 실행에서 재사용되지 않게 치운다.
        try:
            os.replace(path, path + ".blocked")
            print("  [guard] 문제 이미지를 .blocked 로 옮김:", os.path.basename(path))
        except OSError:
            pass
    return ok


def ensure_still(j):
    """콘텐츠별 배경 스틸을 1회 생성(카드+쇼츠 공용). j['bgPrompt'] 필요. 실패 시 None→메시 폴백."""
    prompt = j.get("bgPrompt", "").strip()
    if not prompt:
        return None
    still = os.path.join(OUT, "_still_" + safe_name(j.get("topic", "x")) + ".png")
    if os.path.exists(still) and os.path.getsize(still) > 10000:
        # 재사용본도 검사한다. 사고 이미지는 이미 디스크에 있던 것이었다.
        return still if _image_ok(still) else None
    os.makedirs(OUT, exist_ok=True)
    cenv = dict(os.environ, PYTHONIOENCODING="utf-8")
    # GPU가 다른 서비스와 버스트 경합할 수 있어 최대 3회 재시도(공존모드+재시도로 신뢰성 확보).
    for attempt in range(1, 4):
        try:
            r = subprocess.run([sys.executable, os.path.join(HERE, "gen_still.py"),
                                prompt, still, "896", "1344", "26",
                                str(_hashint(j.get("topic", "x")) % 100000)],
                               cwd=HERE, env=cenv, capture_output=True, text=True,
                               encoding="utf-8", errors="replace", timeout=600)
            if os.path.exists(still) and os.path.getsize(still) > 10000:
                print(f"  [still] 콘텐츠 배경 생성됨 (시도 {attempt})")
                # **검사를 통과해야 쓴다.** 통과 못 하면 배경 없이(메시 폴백) 간다 —
                # 나체가 공개되는 것보다 배경이 밋밋한 게 훨씬 낫다.
                return still if _image_ok(still) else None
            print(f"  [still] 시도 {attempt} 실패:", (r.stderr or "")[-120:])
        except Exception as e:
            print(f"  [still] 시도 {attempt} 예외:", str(e)[:120])
        import time as _t; _t.sleep(20)   # GPU 여유 생길 시간
    return None

def render_short(jpath, theme, still=None):
    j = load(jpath)
    cenv = dict(os.environ, PYTHONIOENCODING="utf-8")
    # 배경: 콘텐츠 스틸 켄번스(있으면) → 없으면 주제색 메시 → 최후 bg_pool.
    bg = os.path.join(HERE, "bg_pool", theme + ".mp4")
    try:
        mbg = os.path.join(OUT, "_bg_" + safe_name(j.get("topic", theme)) + ".mp4")
        os.makedirs(OUT, exist_ok=True)
        args = [sys.executable, os.path.join(HERE, "make_bg.py"),
                j.get("topic", theme), mbg, "1080", "1920", "36"]
        if still:
            args.append(still)
        r0 = subprocess.run(args, cwd=HERE, env=cenv, capture_output=True, text=True,
                            encoding="utf-8", errors="replace", timeout=240)
        if os.path.exists(mbg) and os.path.getsize(mbg) > 10000:
            bg = mbg
        else:
            print("  [short] 배경 생성 실패 → bg_pool 폴백:", (r0.stderr or "")[-120:])
    except Exception as e:
        print("  [short] 배경 예외 → bg_pool 폴백:", str(e)[:120])
    env = dict(cenv, BG_VIDEO=bg)
    r = subprocess.run(["npx", "tsx", "make-short.ts", jpath], cwd=HERE, env=env,
                       capture_output=True, text=True, encoding="utf-8", errors="replace",
                       timeout=300, shell=True)
    if "wrote" not in (r.stdout or ""):
        raise RuntimeError("쇼츠 렌더 실패: " + ((r.stdout or "") + (r.stderr or ""))[-400:])
    print("  [short] rendered")

def upload_yt(j, jpath, title, yt_when):
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload
    p = os.path.join(HERE, os.environ.get("YT_TOKEN_FILE", "yt_token.json")); tok = json.load(open(p))
    c = Credentials(tok["token"], refresh_token=tok.get("refresh_token"),
                    token_uri="https://oauth2.googleapis.com/token",
                    client_id=tok["client_id"], client_secret=tok["client_secret"], scopes=tok.get("scopes"))
    if not c.valid:
        c.refresh(Request()); open(p, "w").write(c.to_json())
    yt = build("youtube", "v3", credentials=c)
    fp = latest_mp4(j["topic"])
    if not fp: raise RuntimeError("mp4 없음: " + j["topic"])
    public = (yt_when == "public")
    status = {"privacyStatus": "public" if public else "private", "selfDeclaredMadeForKids": False}
    if not public: status["publishAt"] = yt_when
    body = {"snippet": {"title": title, "description": yt_description(j),
                        "tags": j.get("tags", [])[:15], "categoryId": "27"}, "status": status}
    req = yt.videos().insert(part="snippet,status", body=body,
                             media_body=MediaFileUpload(fp, mimetype="video/mp4", resumable=True))
    resp = None
    while resp is None:
        _, resp = req.next_chunk()
    tag = "PUBLIC" if public else "SCHED " + yt_when
    print(f"  [yt] {tag} https://youtu.be/{resp['id']}")
    # 업로드 성공 → 유튜브에 있으니 로컬 mp4 제거(누적 방지). 실패해도 무시.
    try:
        os.remove(fp); print("  [yt] 로컬 mp4 정리")
    except Exception:
        pass

def publish_ig(jpath, theme, still=None):
    sp = os.environ.get("SP", "")
    outdir = os.path.join(sp, "cardnews_out", os.path.splitext(os.path.basename(jpath))[0])
    cenv = dict(os.environ, PYTHONIOENCODING="utf-8")
    args = [sys.executable, os.path.join(HERE, "make_cardnews.py"), jpath, theme, outdir]
    if still:
        args.append(still)
    subprocess.run(args, check=True, timeout=180, env=cenv)
    cap = ig_caption(load(jpath))
    env = dict(cenv, IG_TOKEN=open(os.path.join(HERE, "ig_token.txt")).read().strip())
    r = subprocess.run([sys.executable, os.path.join(HERE, "ig_carousel_post.py"), outdir, cap],
                       env=env, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=420)
    out = (r.stdout or "").strip()
    for line in out.splitlines():
        if line.startswith("[OK]") or line.startswith("[URL]"): print("  [ig]", line)
    if r.returncode != 0 and "[OK]" not in out:
        print("  [ig] 실패:", (r.stderr or out)[-300:])

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("json"); ap.add_argument("theme")
    ap.add_argument("--yt", default=None); ap.add_argument("--ig", action="store_true")
    ap.add_argument("--title", default=None)
    a = ap.parse_args()
    j = load(a.json)
    print(f"== {j['topic']} ({a.theme}) ==")
    rc = 0
    still = ensure_still(j)   # 콘텐츠 배경 1회 생성 → 카드+쇼츠 공용
    # 콘텐츠 배경 필수: bgPrompt 있는데 스틸 생성 실패(GPU 점유 등)면 발행 안 함(메시 폴백 금지).
    if j.get("bgPrompt", "").strip() and not still:
        print("  [skip] 콘텐츠 배경 생성 실패 → 메시로 발행 안 함. GPU 여유 후 재시도.")
        sys.exit(2)
    if a.yt:
        try:
            render_short(a.json, a.theme, still)
            upload_yt(j, a.json, a.title or auto_title(j), a.yt)
        except Exception as e:
            print(f"  [yt] 실패: {e}"); rc = 1
    if a.ig:
        try:
            publish_ig(a.json, a.theme, still)
        except Exception as e:
            print(f"  [ig] 실패: {e}"); rc = 1
    sys.exit(rc)

if __name__ == "__main__":
    main()
