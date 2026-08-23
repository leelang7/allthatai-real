# 무드별 재생목록 라우팅 — 업로드된 곡을 무드 재생목록에 자동 분류(네비게이션).
# 재생목록명은 "한국어 · English"(외국 유입). id는 music/.playlists.json에 캐시.
import json
from pathlib import Path

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

from assign_moods import MOODS

HERE = Path(__file__).parent
CACHE = HERE / "music" / ".playlists.json"
SCOPES = ["https://www.googleapis.com/auth/youtube.force-ssl"]


def yt_client():
    c = Credentials.from_authorized_user_file(str(HERE / "music_token.json"), SCOPES)
    if c.expired and c.refresh_token:
        c.refresh(Request())
    return build("youtube", "v3", credentials=c)


def playlist_title(mood: str) -> str:
    if mood not in MOODS:
        return ""
    ko, en, *_ = MOODS[mood]
    return f"{ko} · {en}"


def _cache() -> dict:
    try:
        return json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    except Exception:
        return {}


def _save_cache(d: dict):
    CACHE.write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")


def ensure_playlist(yt, mood: str) -> str:
    """무드 재생목록 id 반환(없으면 생성). 캐시로 재호출 최소화."""
    title = playlist_title(mood)
    if not title:
        return ""
    cache = _cache()
    if cache.get(mood):
        return cache[mood]
    pid = ""
    req = yt.playlists().list(part="snippet", mine=True, maxResults=50)
    while req is not None and not pid:
        resp = req.execute()
        for it in resp.get("items", []):
            if it["snippet"]["title"].strip() == title:
                pid = it["id"]
                break
        req = yt.playlists().list_next(req, resp)
    if not pid:
        resp = yt.playlists().insert(part="snippet,status", body={
            "snippet": {"title": title,
                        "description": "AI instrumental music · " + MOODS[mood][1]},
            "status": {"privacyStatus": "public"},
        }).execute()
        pid = resp["id"]
    cache[mood] = pid
    _save_cache(cache)
    return pid


def route(yt, video_id: str, mood: str) -> bool:
    """영상을 무드 재생목록에 추가."""
    pid = ensure_playlist(yt, mood)
    if not pid:
        return False
    try:
        yt.playlistItems().insert(part="snippet", body={
            "snippet": {"playlistId": pid,
                        "resourceId": {"kind": "youtube#video", "videoId": video_id}},
        }).execute()
        return True
    except Exception as e:
        print("   재생목록 추가 실패(무시):", str(e)[:100])
        return False
