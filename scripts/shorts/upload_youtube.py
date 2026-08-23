# YouTube uploader with multi-project quota rotation.
# Tries project 1 (client_secret.json), falls to project 2 (client_secret2.json)
# when quota is exhausted -> effectively 6 -> 12+ uploads/day.
#   python upload_youtube.py <video.mp4> "<title>" "<description>"
#   env YT_PRIVACY=private|unlisted|public  YT_TOPIC=<for dashboard>
import os
import sys
import json
from pathlib import Path
from datetime import datetime

from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from googleapiclient.errors import HttpError

SCOPES = ["https://www.googleapis.com/auth/youtube.force-ssl"]
HERE = Path(__file__).parent
# (client_secret, token) per Google Cloud project — each has its own daily quota
CLIENTS = [
    ("client_secret.json", "yt_token.json"),
    ("client_secret2.json", "yt_token2.json"),
]


def get_creds(cs, tok):
    csp, tp = HERE / cs, HERE / tok
    creds = None
    if tp.exists():
        try:
            creds = Credentials.from_authorized_user_file(str(tp), SCOPES)
        except Exception:
            creds = None
    if not (creds and creds.valid and creds.has_scopes(SCOPES)):
        if creds and creds.expired and creds.refresh_token and creds.has_scopes(SCOPES):
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(str(csp), SCOPES)
            creds = flow.run_local_server(
                port=8765, open_browser=False,
                authorization_prompt_message="\n\n>>> 이 URL을 브라우저에서 열어 인증하세요:\n{url}\n\n",
            )
        tp.write_text(creds.to_json(), encoding="utf-8")
    return creds


def resolve_tags(video):
    """태그 우선순위: YT_TAGS 환경변수(콤마구분) > <video>.tags.json 사이드카 > 제네릭 폴백."""
    env = os.environ.get("YT_TAGS", "").strip()
    if env:
        tags = [t.strip() for t in env.split(",") if t.strip()]
        if tags:
            return tags
    side = Path(str(video) + ".tags.json")
    if side.exists():
        try:
            data = json.loads(side.read_text(encoding="utf-8"))
            tags = data if isinstance(data, list) else data.get("tags", [])
            tags = [str(t).strip() for t in tags if str(t).strip()]
            if tags:
                return tags
        except Exception:
            pass
    return ["shorts", "쇼츠", "이슈", "트렌드"]


def resolve_link(video):
    """CTA 딥링크: YT_LINK 환경변수 > <video>.link.txt 사이드카 > 없음."""
    env = os.environ.get("YT_LINK", "").strip()
    if env:
        return env
    side = Path(str(video) + ".link.txt")
    if side.exists():
        try:
            return side.read_text(encoding="utf-8").strip()
        except Exception:
            pass
    return ""


def try_upload(cs, tok, video, title, desc, privacy):
    yt = build("youtube", "v3", credentials=get_creds(cs, tok))
    tags = resolve_tags(video)[:15]
    # 설명란 해시태그도 실제 태그에서 생성(공백 없는 것 위주, 최대 8개) — 고정 문구 제거
    hashtags = " ".join("#" + t.replace(" ", "") for t in tags if " " not in t)[:480] or "#shorts"
    link = resolve_link(video)
    # CTA를 실제 연결: 설명 맨 위에 딥링크 한 줄. 도구(/tools/·hidden-money 등)는 "계산기",
    # 트렌딩/이슈 링크는 "더보기"로 문구 자동 분기(스포츠에 '계산기'라 안 적게).
    if link:
        label = "무료 계산기/확인" if ("/tools/" in link or "hidden-money" in link or "/jeonse" in link) else "자세히 보기"
        head = "👉 " + label + ": " + link + "\n\n"
    else:
        head = ""
    full_desc = (head + desc + "\n\n" + hashtags).strip()
    status = {"privacyStatus": privacy, "selfDeclaredMadeForKids": False}
    # 예약 발행: 날짜 지정 시 비공개로 올리고 publishAt에 그 시각 → 자동 공개
    pub_at = os.environ.get("YT_PUBLISH_AT", "").strip()
    if pub_at:
        status["privacyStatus"] = "private"
        status["publishAt"] = pub_at
    body = {
        "snippet": {"title": title[:100], "description": full_desc,
                    "categoryId": os.environ.get("YT_CATEGORY", "25"), "tags": tags},
        "status": status,
    }
    media = MediaFileUpload(video, chunksize=-1, resumable=True, mimetype="video/mp4")
    req = yt.videos().insert(part="snippet,status", body=body, media_body=media)
    resp = None
    while resp is None:
        _, resp = req.next_chunk()
    vid = resp["id"]
    # 커스텀 썸네일(수노 커버 등) — 음악 채널은 쇼츠와 달리 썸네일 지정
    thumb = os.environ.get("YT_THUMB", "").strip()
    if thumb and os.path.exists(thumb):
        try:
            yt.thumbnails().set(videoId=vid, media_body=MediaFileUpload(thumb)).execute()
        except Exception as e:
            print("썸네일 설정 실패(무시):", e)
    return vid


def main():
    if len(sys.argv) < 2:
        sys.exit("usage: python upload_youtube.py <video.mp4> [title] [description]")
    video = sys.argv[1]
    title = (sys.argv[2] if len(sys.argv) > 2 else "오늘의 이슈")[:100]
    desc = sys.argv[3] if len(sys.argv) > 3 else ""
    privacy = os.environ.get("YT_PRIVACY", "private")

    # 채널 오버라이드: 음악(@allthathz) 등 다른 채널로 올릴 때 전용 토큰 사용.
    clients = CLIENTS
    cf, tf = os.environ.get("YT_CLIENT_FILE"), os.environ.get("YT_TOKEN_FILE")
    if cf and tf:
        clients = [(cf, tf)]

    for i, (cs, tok) in enumerate(clients, 1):
        if not (HERE / cs).exists():
            continue
        try:
            vid = try_upload(cs, tok, video, title, desc, privacy)
            print("uploaded:", "https://youtu.be/" + vid, "(" + privacy + ") via project" + str(i))
            rec = {"id": vid, "title": title, "topic": os.environ.get("YT_TOPIC", title),
                   "privacy": privacy, "created": datetime.now().strftime("%Y-%m-%d %H:%M")}
            with open(HERE / "pending.jsonl", "a", encoding="utf-8") as f:
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")
            return
        except HttpError as e:
            es = str(e).lower()
            if "quota" in es or "exceeded" in es:
                print("  project" + str(i) + " 쿼터 소진 — 다음 프로젝트 시도")
                continue
            raise
    print("ERROR: 모든 프로젝트 쿼터 소진")
    sys.exit(1)


if __name__ == "__main__":
    main()
