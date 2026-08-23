# Suno 라이브러리 자동 동기화 → music/ 에 mp3 + 수노 커버 다운 → 영상화까지.
# 수동 다운로드 없이 새 곡을 끌어온다. 쿠키 필요(suno_cookie.txt 또는 SUNO_COOKIE env).
# 비공식 Suno API(Clerk 세션 → feed). 엔드포인트가 가끔 바뀌므로 첫 실행 시 검증 필요.
import json
import os
import re
import subprocess
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).parent
MUSIC = HERE / "music"
SYNCED = MUSIC / ".synced.json"
STATUS = MUSIC / ".sync_status.json"
META = MUSIC / ".meta.json"
CLERK_V = "5.35.0"

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def progress(state: str, msg: str = "", current: int = 0, total: int = 0, added: int = 0):
    """대시보드 프로그레스바가 폴링하는 상태 파일. state: auth|fetch|download|done|error."""
    try:
        MUSIC.mkdir(exist_ok=True)
        STATUS.write_text(json.dumps(
            {"state": state, "msg": msg, "current": current, "total": total, "added": added},
            ensure_ascii=False), encoding="utf-8")
    except Exception:
        pass


def raw_paste() -> str:
    c = os.environ.get("SUNO_COOKIE", "").strip()
    if c:
        return c
    f = HERE / "suno_cookie.txt"
    return f.read_text(encoding="utf-8").strip() if f.exists() else ""


def parse_creds(txt: str) -> tuple[str, str]:
    """붙여넣은 게 무엇이든(원시 쿠키 / 'Copy as cURL' 명령) 파싱.
    반환: (cookie, bearer_token). 둘 중 있는 것만 채워짐."""
    bearer = ""
    cookie = ""
    # curl -H 'authorization: Bearer xxx'
    m = re.search(r"-H ['\"]?authorization:\s*Bearer\s+([A-Za-z0-9._\-]+)", txt, re.I)
    if m:
        bearer = m.group(1)
    # curl -H 'cookie: ...'  또는  -b 'cookie: ...'
    m = re.search(r"-H ['\"]?cookie:\s*([^'\"]+)['\"]", txt, re.I) or \
        re.search(r"-b ['\"]([^'\"]+)['\"]", txt)
    if m:
        cookie = m.group(1).strip()
    # curl 도 아니고 Bearer 헤더도 없으면 → 통째로 쿠키로 간주
    if not cookie and not bearer and "curl " not in txt:
        cookie = txt.strip()
    return cookie, bearer


def _get(url: str, headers: dict) -> dict | list | None:
    req = urllib.request.Request(url, headers=headers, method="GET")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def _post(url: str, headers: dict) -> dict | None:
    req = urllib.request.Request(url, headers=headers, method="POST", data=b"")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def jwt(ck: str) -> str | None:
    """Clerk 세션 쿠키 → Bearer JWT."""
    h = {"Cookie": ck, "User-Agent": "Mozilla/5.0"}
    try:
        cl = _get(f"https://clerk.suno.com/v1/client?_clerk_js_version={CLERK_V}", h)
        sid = (cl or {}).get("response", {}).get("last_active_session_id")
        if not sid:
            print("세션 없음 — 쿠키 만료/오류"); return None
        tok = _post(
            f"https://clerk.suno.com/v1/client/sessions/{sid}/tokens?_clerk_js_version={CLERK_V}", h)
        return (tok or {}).get("jwt")
    except Exception as e:
        print("Clerk 인증 실패:", e); return None


def feed(token: str, max_pages: int = 15) -> list:
    """id 기준 중복 제거하며 페이지네이션. has_more가 항상 True인 버그 대비:
    새 id가 없는 페이지가 나오거나 빈 페이지면 중단(상한 max_pages)."""
    h = {"Authorization": f"Bearer {token}", "User-Agent": "Mozilla/5.0", "accept": "*/*"}
    out, ids = [], set()
    for page in range(0, max_pages):
        try:
            data = _get(f"https://studio-api-prod.suno.com/api/feed/v2?page={page}", h)
        except Exception:
            break
        clips = data if isinstance(data, list) else (data or {}).get("clips", [])
        if not clips:
            break
        fresh = 0
        for c in clips:
            cid = str(c.get("id", ""))
            if cid and cid not in ids:
                ids.add(cid); out.append(c); fresh += 1
        if fresh == 0:  # 이 페이지가 전부 기존 id면 끝
            break
    return out


def number_versions(clips: list) -> list:
    """수노는 한 곡을 2~3개 버전으로 만듦. 합치지 않고 전부 유지하되,
    같은 제목이 여러 개면 뒤에 #1 #2 #3 을 붙여 구분(각 버전의 매력 보존).
    각 clip에 c['_display'](표시용 제목) 부여. 완성본+오디오 있는 것만."""
    ok = [c for c in clips
          if (c.get("status") or "complete") == "complete" and c.get("audio_url")]
    counts = {}
    for c in ok:
        t = (c.get("title") or "").strip()
        counts[t.lower()] = counts.get(t.lower(), 0) + 1
    seen = {}
    for c in ok:
        t = (c.get("title") or "").strip() or "무제"
        k = t.lower()
        if counts.get(k, 0) > 1:  # 중복 제목만 번호
            seen[k] = seen.get(k, 0) + 1
            c["_display"] = f"{t} #{seen[k]}"
        else:
            c["_display"] = t
    return ok


def recent_only(clips: list, days: int) -> list:
    """created_at 기준 최근 N일(오늘 포함)만. days=2 → 어제·오늘."""
    if days <= 0:
        return clips
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days - 1)).date()
    out = []
    for c in clips:
        ds = (c.get("created_at") or "")[:10]
        try:
            if datetime.strptime(ds, "%Y-%m-%d").date() >= cutoff:
                out.append(c)
        except Exception:
            out.append(c)  # 날짜 파싱 실패 시 일단 포함
    return out


def date_range(clips: list, frm: str, to: str) -> list:
    """created_at 이 [frm, to] (YYYY-MM-DD, 양끝 포함) 안인 곡만."""
    try:
        d0 = datetime.strptime(frm, "%Y-%m-%d").date()
        d1 = datetime.strptime(to, "%Y-%m-%d").date()
    except Exception:
        return clips
    if d1 < d0:
        d0, d1 = d1, d0
    out = []
    for c in clips:
        ds = (c.get("created_at") or "")[:10]
        try:
            if d0 <= datetime.strptime(ds, "%Y-%m-%d").date() <= d1:
                out.append(c)
        except Exception:
            pass
    return out


BRAND_TAGS = ["AllThatHz", "AI 음악", "AI music", "Suno", "수노"]

# 거시 분류 체계(우리 발굴 체계). 미시적 스타일(garage roller 등)은 우리 발굴기술 영역 →
# 태그는 사람들이 실제로 검색하는 거시 카테고리(용도·무드)로 묶는다.
# (라벨, [스타일/제목에서 잡을 키워드], [한국어 검색 태그], 장르군)
MACRO = [
    ("운동", ["workout", "gym", "energetic", "aggressive", "intense", "hard ", "pump",
              "beast", "sprint", "power", "high energy", "banger", "driving", "anthem",
              "iron", "march", "pulse", "engine", "piston"],
     ["운동할 때 듣는 음악", "헬스 음악", "신나는 음악", "workout music", "gym music", "에너지"], "운동음악"),
    ("집중", ["lo-fi", "lofi", "study", "focus", "concentration", "chillhop", "quiet",
              "minimal", "discipline"],
     ["공부할 때 듣는 음악", "집중 음악", "작업용 음악", "study music", "lofi", "로파이"], "로파이"),
    ("힐링", ["ambient", "sleep", "relax", "calm", "peaceful", "healing", "soft",
              "gentle", "meditation", "rain", "nature", "warm humm", "hollow"],
     ["힐링 음악", "수면 음악", "잔잔한 음악", "relaxing music", "sleep music", "휴식"], "앰비언트"),
    ("감성", ["ballad", "emotional", "sad", "melancholy", "piano", "acoustic", "slow",
              "love", "lonely", "tear", "heartbreak", "nostalg", "lament", "remains"],
     ["감성 음악", "발라드", "새벽 감성", "감성 발라드", "sad song", "피아노 음악"], "발라드"),
    ("드라이브", ["drive", "night", "city pop", "synthwave", "cruise", "retro", "neon",
                "highway", "midnight"],
     ["드라이브 음악", "밤에 듣는 음악", "시티팝", "city pop", "night drive"], "시티팝"),
    ("댄스", ["house", "techno", "edm", "dance", "club", "party", "garage", "disco",
              "trance", "2-step", "four on the floor", "roller", "bass"],
     ["신나는 댄스 음악", "클럽 음악", "EDM", "파티 음악", "dance music", "house music"], "EDM"),
    ("힙합", ["hip hop", "hiphop", "trap", "drill", "boom bap", "rap", "phonk", "808"],
     ["힙합", "랩 음악", "비트", "hiphop", "trap beat"], "힙합"),
    ("락", ["rock", "metal", "punk", "guitar", "band", "grunge", "riff"],
     ["락 음악", "밴드 음악", "rock music", "기타"], "락"),
]
# 모든 곡에 붙이는 범용 고검색 태그(배경음악 수요)
UNIVERSAL_TAGS = ["BGM", "브금", "플레이리스트"]


def classify_macro(clip: dict, title: str) -> tuple:
    """제목(용도 신호) + 스타일 프롬프트(장르 신호) → 거시 카테고리.
    제목 키워드에 가중치 3 — 'Sprint/Iron/Discipline'이 garage 산문보다 용도를 더 잘 말해줌.
    (한국어태그들, 장르군) 반환."""
    title_l = " " + title.lower() + " "
    style_l = " " + (((clip.get("metadata") or {}).get("tags")) or "").lower() + " "
    best, best_score = None, 0
    for label, keys, ko, fam in MACRO:
        score = sum(3 for k in keys if k in title_l) + sum(1 for k in keys if k in style_l)
        if score > best_score:
            best, best_score = (ko, fam), score
    if best_score == 0:  # 못 잡으면 한국어곡은 감성, 그 외 일반
        if re.search(r"[가-힣]", title):
            return (["감성 음악", "한국어 노래"], "발라드")
        return (["신곡", "AI 커버"], "")
    return best


def build_tags(clip: dict, display_title: str) -> str:
    """거시 분류 기반 태그: 제목 + 거시 카테고리(한국어 검색어) + 장르군 + 브랜드.
    콤마 구분 문자열(대시보드/업로더가 그대로 사용)."""
    title_tag = re.sub(r"\s*#\d+$", "", display_title).strip()  # '#2' 떼고 제목만
    ko, fam = classify_macro(clip, title_tag)
    tags = ([title_tag] if title_tag else []) + list(ko)
    if fam:
        tags.append(fam)
    if re.search(r"[가-힣]", title_tag) and "한국어 노래" not in tags:
        tags.append("한국어 노래")
    tags += UNIVERSAL_TAGS + BRAND_TAGS
    out, seen = [], set()
    for t in tags:
        t = t.strip()
        if t and len(t) <= 30 and t.lower() not in seen:
            seen.add(t.lower()); out.append(t)
        if len(out) >= 15:
            break
    return ", ".join(out)


def is_instrumental(c: dict) -> bool:
    """연주곡(가사 없음) 판별. Suno의 make_instrumental 플래그가 정답 → 우선 사용.
    없으면 has_vocal, 마지막으로 가사(prompt) 비었는지로 추정."""
    md = c.get("metadata", {}) or {}
    if md.get("make_instrumental") is not None:
        return bool(md.get("make_instrumental"))
    hv = md.get("has_vocal")
    if hv is not None:
        return not bool(hv)
    return not (md.get("prompt") or "").strip()  # 가사 비면 연주곡


def safe(s: str) -> str:
    return re.sub(r"[^0-9A-Za-z가-힣]+", "_", s or "song").strip("_")[:40] or "song"


def download(url: str, dest: Path) -> bool:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as f:
            f.write(r.read())
        return dest.stat().st_size > 1000
    except Exception:
        return False


def main():
    MUSIC.mkdir(exist_ok=True)
    progress("auth", "Suno 인증 중…")
    paste = raw_paste()
    if not paste:
        progress("error", "쿠키 없음 — 쿠키를 저장하세요")
        print("SUNO_COOKIE 없음 — suno_cookie.txt에 쿠키 넣으세요."); sys.exit(2)
    ck, bearer = parse_creds(paste)
    token = None
    # 쿠키가 있으면 Clerk로 발급(자동 갱신 가능) — 가장 지속적
    if ck:
        token = jwt(ck)
    # 쿠키 없거나 발급 실패 시, 붙여넣은 Bearer 토큰 직접 사용(곧 만료될 수 있음)
    if not token and bearer:
        token = bearer
        print("Bearer 토큰 직접 사용(쿠키 없음 — 만료 시 다시 복사 필요)")
    if not token:
        progress("error", "인증 실패 — 쿠키 만료/오류")
        sys.exit(3)
    progress("fetch", "라이브러리 조회 중…")
    clips = feed(token)
    frm = os.environ.get("SUNO_FROM", "").strip()
    to = os.environ.get("SUNO_TO", "").strip()
    if frm:  # 날짜 지정(대시보드에서 시작·종료일 선택)
        clips = date_range(clips, frm, to or frm)
        span = f"{frm}~{to or frm}"
    else:    # 기본 어제·오늘만
        days = int(os.environ.get("SUNO_DAYS", "2"))
        clips = recent_only(clips, days)
        span = f"최근 {days}일"
    clips = number_versions(clips)  # 합치지 않고 전부 유지 + 같은 제목엔 #1 #2 …
    print(f"Suno 곡 {len(clips)}개 조회({span}, 버전 전부 유지)")
    done = set()
    if SYNCED.exists():
        try:
            done = set(json.loads(SYNCED.read_text(encoding="utf-8")))
        except Exception:
            pass
    # 신규(미동기화)만 추려서 진행률 분모로
    new_clips = [c for c in clips
                 if str(c.get("id", "")) and c.get("audio_url") and str(c.get("id", "")) not in done]
    total = len(new_clips)
    progress("fetch", f"신규 {total}곡 발견" if total else "신규 곡 없음", 0, total)
    meta = {}
    try:
        meta = json.loads(META.read_text(encoding="utf-8")) if META.exists() else {}
    except Exception:
        meta = {}
    added = 0
    for i, c in enumerate(new_clips, 1):
        cid = str(c.get("id", ""))
        audio = c.get("audio_url") or ""
        disp = c.get("_display") or c.get("title") or "무제"  # 깨끗한 표시 제목(#번호만)
        progress("download", f"{disp}", i, total, added)
        # 파일명엔 ID 6자리를 남겨 충돌 방지(사용자에겐 안 보임). 표시 제목은 meta에 따로.
        base = MUSIC / f"{safe(c.get('title') or cid)}_{cid[:6]}"
        if not download(audio, Path(str(base) + ".mp3")):
            continue
        cover = c.get("image_large_url") or c.get("image_url") or ""
        cov = str(base) + ".jpg"
        has_cover = cover and download(cover, Path(cov))
        # 수노 커버 그대로 영상화
        subprocess.run([sys.executable, "make_music_video.py", str(base) + ".mp3",
                        cov if has_cover else "", str(base) + ".mp4"],
                       cwd=str(HERE), capture_output=True)
        # 대시보드 기본 제목 = 깨끗한 제목 + 제대로 된 태그(파일명 key). 사용자 수정분은 보존.
        nm = base.name + ".mp3"
        e = meta.get(nm, {})
        e.setdefault("title", disp)
        e.setdefault("tags", build_tags(c, disp))
        e["instrumental"] = is_instrumental(c)  # 연주곡 여부(업로드 우선순위용)
        meta[nm] = e
        META.write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")  # 곡마다 즉시 기록
        done.add(cid)
        SYNCED.write_text(json.dumps(sorted(done), ensure_ascii=False), encoding="utf-8")
        added += 1
        print("동기화:", disp)
    META.write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    SYNCED.write_text(json.dumps(sorted(done), ensure_ascii=False), encoding="utf-8")
    progress("done", f"신규 {added}곡 동기화 완료", total, total, added)
    print(f"RESULT 신규 {added}개 동기화 완료")


def get_token():
    paste = raw_paste()
    if not paste:
        return None
    ck, bearer = parse_creds(paste)
    if ck:
        t = jwt(ck)
        if t:
            return t
    return bearer or None


def retag():
    """다운로드 없이, 기존 meta의 곡들에 연주곡 여부(instrumental)만 피드에서 갱신.
    파일명 끝 _<cid6> 로 클립을 매칭."""
    if not META.exists():
        print("메타 없음 — 먼저 동기화"); return
    token = get_token()
    if not token:
        progress("error", "인증 실패 — 쿠키 다시 붙여넣기")
        print("인증 실패 — 쿠키를 다시 저장하세요"); sys.exit(3)
    clips = feed(token)
    by_cid6 = {}
    for c in clips:
        cid = str(c.get("id", ""))
        if cid:
            by_cid6[cid[:6]] = c
    meta = json.loads(META.read_text(encoding="utf-8"))
    upd = inst = 0
    for nm, e in meta.items():
        stem = nm[:-4] if nm.endswith(".mp3") else nm
        cid6 = stem.split("_")[-1]
        c = by_cid6.get(cid6)
        if c is not None:
            e["instrumental"] = is_instrumental(c)
            inst += int(e["instrumental"])
            upd += 1
    META.write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    progress("done", f"재태깅 완료 — 연주곡 {inst}/{upd}", upd, upd)
    print(f"RESULT 재태깅 {upd}곡 갱신 · 연주곡 {inst}개")


if __name__ == "__main__":
    if "--retag" in sys.argv:
        retag()
    else:
        main()
