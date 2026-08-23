# @allthathz 자동 업로드 큐.
import re
# 우선순위: ①제목에 '경로를 이탈' 포함 → 최우선  ②연주곡(instrumental)만(기본)
# 쿼터 2개(프로젝트1+2) 로테이션 → 하루 ~12개. 발행은 하루 SLOTS_PER_DAY개 분산 예약.
# 쿼터 소진 시 그날치만 올리고 중단 → 매일 다시 돌리면 이어서 진행.
#   python upload_queue.py
#   env MAX_PER_RUN(기본12) SLOTS_PER_DAY(기본3) INSTRUMENTAL_ONLY(기본1)
import json
import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).parent
MUSIC = HERE / "music"
META = MUSIC / ".meta.json"
STATUS = MUSIC / ".sync_status.json"
SLOT_TIMES = ["00:00:00", "05:00:00", "11:00:00"]  # UTC = 09/14/20 KST
PRIORITY_KW = "경로를 이탈"
# (client_secret, token) 쌍 — @allthathz 채널, 프로젝트별 별도 토큰(쿼터 2배)
CLIENTS = [
    ("client_secret.json", "music_token.json"),
    ("client_secret2.json", "music_token2.json"),
]

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


def slot_for(idx: int, per_day: int) -> str:
    start = (datetime.now(timezone.utc) + timedelta(days=1)).date()
    times = SLOT_TIMES[:per_day] if per_day <= len(SLOT_TIMES) else SLOT_TIMES
    day = start + timedelta(days=idx // len(times))
    return f"{day.isoformat()}T{times[idx % len(times)]}Z"


def avail_clients():
    """존재하는 (client, token) 쌍만."""
    return [(c, t) for c, t in CLIENTS if (HERE / c).exists() and (HERE / t).exists()]


# 외국 유입 핵심: 곡명 + 무드별 영어 용도 설명(실제 검색어).
# "Dawn Lament"(emotional) → "Dawn Lament — Emotional Piano Music"
_INTL_BY_MOOD = {
    "workout": "Intense Workout Music",
    "lofi": "Lofi Beats to Study & Focus",
    "ambient": "Calm Music for Sleep & Healing",
    "emotional": "Emotional Piano Music",
    "club": "Energetic Dance / EDM",
    "world": "World & Traditional Fusion",
    "drive": "Night Drive Music",
    "rock": "Rock Instrumental",
}


# 무드별 리치 설명(영어 우선+한국어) — 검색 키워드·구독 유도. 업로더가 딥링크/해시태그를 뒤에 붙임.
_DESC_BY_MOOD = {
    "workout": "High-energy AI instrumental to push your workout, gym session or run.\n운동·헬스·러닝용 고에너지 AI 연주곡.",
    "lofi": "Lofi AI beats to study, focus and work — no lyrics, no distraction.\n공부·집중·작업용 로파이 AI 연주곡.",
    "ambient": "Calm ambient AI music for sleep, healing and deep rest.\n수면·힐링용 잔잔한 AI 앰비언트.",
    "emotional": "Emotional piano-driven AI instrumental for quiet nights.\n새벽 감성 피아노 AI 연주곡.",
    "club": "Energetic AI dance/EDM instrumental to lift the room.\n클럽·파티용 AI 댄스/EDM.",
    "world": "AI fusion of traditional & world instruments — a fresh take on heritage sounds.\n국악·월드 사운드의 AI 퓨전.",
    "drive": "Night-drive AI instrumental — neon city vibes.\n심야 드라이브용 AI 연주곡.",
    "rock": "AI rock instrumental — riffs without words.\nAI 락 연주곡.",
}
_DESC_TAIL = "\n\nAll music AI-composed. New tracks daily — subscribe for your mood.\n매일 새 곡이 올라옵니다."


def mood_desc(mood: str) -> str:
    return _DESC_BY_MOOD.get(mood, "AI-composed instrumental music.\nAI 연주 음악.") + _DESC_TAIL


def intl_title(title: str, mood: str) -> str:
    """곡명에 무드별 영어 설명을 붙여 글로벌 검색 노출↑ (이미 —/| 있으면 그대로)."""
    if "—" in title or "|" in title:
        return title[:100]
    desc = _INTL_BY_MOOD.get(mood, "AI Instrumental Music")
    return f"{title} — {desc}"[:100]


def delete_video(vid: str):
    """켄번즈→i2v 교체 시 기존 영상 삭제(music_token으로)."""
    try:
        from google.oauth2.credentials import Credentials
        from google.auth.transport.requests import Request
        from googleapiclient.discovery import build
        scopes = ["https://www.googleapis.com/auth/youtube.force-ssl"]
        c = Credentials.from_authorized_user_file(str(HERE / "music_token.json"), scopes)
        if c.expired and c.refresh_token:
            c.refresh(Request())
        build("youtube", "v3", credentials=c).videos().delete(id=vid).execute()
        return True
    except Exception as e:
        print("   기존영상 삭제 실패(무시):", str(e)[:100])
        return False


def try_upload(mp4, title, tags, cover, desc, clients):
    """클라이언트(프로젝트) 순회하며 업로드 시도. 성공 시 video url, 쿼터 전부 소진 시 'QUOTA', 실패 시 None.
    바로 공개(public)로 업로드 — 예약/수동공개 단계 제거."""
    quota_hit = 0
    for cs, tok in clients:
        menv = dict(os.environ, YT_TOPIC="music", YT_CATEGORY="10", YT_TAGS=tags,
                    YT_CLIENT_FILE=cs, YT_TOKEN_FILE=tok, YT_PRIVACY="public")
        menv.pop("YT_PUBLISH_AT", None)
        if cover and Path(cover).exists():
            menv["YT_THUMB"] = str(cover)
        r = subprocess.run([sys.executable, "upload_youtube.py", str(mp4), title, desc],
                           cwd=str(HERE), capture_output=True, text=True, encoding="utf-8", errors="replace", env=menv)
        out = (r.stdout or "") + (r.stderr or "")
        if "uploaded:" in out:
            for line in out.splitlines():
                if line.startswith("uploaded:"):
                    return line.split()[1]
            return "ok"
        if "쿼터" in out or "quota" in out.lower():
            quota_hit += 1
            continue
        print(f"   실패({cs}): {out[-160:]}")
    return "QUOTA" if quota_hit and quota_hit >= len(clients) else None


def main():
    if not META.exists():
        progress("error", "메타 없음"); print("메타 없음 — 먼저 동기화"); return
    clients = avail_clients()
    if not clients:
        progress("error", "인증 파일 없음"); print("인증(music_token.json) 없음 — auth_music.py 먼저"); return

    meta = json.loads(META.read_text(encoding="utf-8"))
    max_run = int(os.environ.get("MAX_PER_RUN", "12"))
    per_day = int(os.environ.get("SLOTS_PER_DAY", "3"))
    inst_only = os.environ.get("INSTRUMENTAL_ONLY", "1") == "1"
    require_i2v = os.environ.get("REQUIRE_I2V", "0") == "1"  # i2v 완료분만 업로드(켄번즈 방지)
    i2v_done = set()
    if require_i2v:
        dp = MUSIC / ".i2v_done.json"
        if dp.exists():
            try:
                i2v_done = set(json.loads(dp.read_text(encoding="utf-8")))
            except Exception:
                i2v_done = set()

    def ready(nm, m):
        if require_i2v and nm not in i2v_done:
            return False
        return (m.get("status") != "uploaded") and (MUSIC / (nm[:-4] + ".mp4")).exists()

    pend = [(nm, m) for nm, m in meta.items() if ready(nm, m)]
    if inst_only:
        kept = [(nm, m) for nm, m in pend if m.get("instrumental") is True]
        skipped_lyric = len(pend) - len(kept)
        pend = kept
    else:
        skipped_lyric = 0

    # 우선순위: ①사용자 지정 목록(.upload_priority.json) 순서 → ②검색 잘되는 카테고리(운동·집중…) → ③제목순
    prio_list = []
    pf = MUSIC / ".upload_priority.json"
    if pf.exists():
        try:
            prio_list = [str(x).strip().lower() for x in json.loads(pf.read_text(encoding="utf-8"))]
        except Exception:
            prio_list = []
    # 카테고리 검색량 가중(태그 기반): 낮을수록 먼저
    CAT_ORDER = ["운동할 때", "공부할 때", "집중", "힐링", "수면", "드라이브", "신나는 댄스", "힙합", "락"]

    def cat_score(tags: str) -> int:
        for i, kw in enumerate(CAT_ORDER):
            if kw in tags:
                return i
        return len(CAT_ORDER)

    def rank(item):
        nm, m = item
        t = (m.get("title") or nm)
        base = re.sub(r"\s*#\d+$", "", t).strip().lower()
        # 사용자 지정 목록에 있으면 그 순서대로 최우선
        for idx, p in enumerate(prio_list):
            if p and p in base:
                return (0, idx, t)
        return (1, cat_score(m.get("tags") or ""), t)
    pend.sort(key=rank)

    already = sum(1 for m in meta.values() if m.get("status") == "uploaded")
    total_inst = sum(1 for nm, m in meta.items()
                     if (not inst_only or m.get("instrumental") is True) and (MUSIC / (nm[:-4] + ".mp4")).exists())

    if not pend:
        msg = "업로드 대기 없음"
        if inst_only and skipped_lyric:
            msg += f" (가사곡 {skipped_lyric}개 제외 — 연주곡 태깅됐는지 확인: suno_sync.py --retag)"
        progress("done", msg, total_inst, total_inst); print("RESULT " + msg); return

    print(f"대기 {len(pend)}개(연주곡{' only' if inst_only else ''}) · 가사곡제외 {skipped_lyric} · 이미 {already} · 프로젝트 {len(clients)}개 · 이번 최대 {max_run}")
    done = 0
    for nm, m in pend:
        if done >= max_run:
            break
        base = nm[:-4]
        tags = m.get("tags") or ""
        title = intl_title((m.get("title") or base), m.get("mood") or "")  # 무드별 영어 제목
        cover = MUSIC / (base + ".jpg")
        # 즉시 공개 업로드 — 예약(slot) 로직은 사용 안 함(로그 거짓 방지)
        progress("download", f"업로드: {title}", already + done + 1, total_inst)
        # 켄번즈→i2v 교체: 기존 영상 있으면 먼저 삭제(중복 방지)
        if m.get("old_youtube"):
            delete_video(m["old_youtube"].rsplit("/", 1)[-1])
        res = try_upload(MUSIC / (base + ".mp4"), title, tags, cover, mood_desc(m.get("mood") or ""), clients)
        if res == "QUOTA":
            print(f"모든 프로젝트 쿼터 소진 — 오늘 {done}개. 내일 이어서."); break
        if res:
            m.update({"status": "uploaded", "youtube": res})
            m.pop("old_youtube", None)
            meta[nm] = m
            META.write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
            done += 1
            # 용량: 업로드 성공(영상 URL 확보) 즉시 로컬 원본 정리 — CLEAN_AFTER=1일 때
            if os.environ.get("CLEAN_AFTER", "") == "1":
                for ext in (".mp3", ".mp4", ".jpg"):
                    try:
                        (MUSIC / (base + ext)).unlink(missing_ok=True)
                    except Exception:
                        pass
            # 무드 재생목록 자동 라우팅(네비게이션)
            mood = m.get("mood")
            if mood:
                try:
                    import playlists
                    playlists.route(playlists.yt_client(), res.rsplit("/", 1)[-1], mood)
                except Exception as e:
                    print("   재생목록 라우팅 실패(무시):", str(e)[:80])
            star = " ⭐최우선" if PRIORITY_KW in title else ""
            print(f"[{done}] OK {title}{star} → {res} [{mood or '-'}]")
        else:
            print(f"   건너뜀 {title}")
    remain = len(pend) - done
    progress("done", f"오늘 {done}개 예약업로드 · 남은 {remain}개", total_inst, total_inst)
    print(f"RESULT 이번 {done}개 · 남은 {remain}개")


if __name__ == "__main__":
    main()
