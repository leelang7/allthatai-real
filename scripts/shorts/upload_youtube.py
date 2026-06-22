# YouTube Shorts auto-uploader (YouTube Data API v3, OAuth).
# Setup: put client_secret.json next to this file (see guide). First run opens a
# browser to authorize once; token is cached to yt_token.json for unattended runs.
#
# Usage: python upload_youtube.py <video.mp4> "<title>" "<description>"
#   env YT_PRIVACY = private | unlisted | public   (default: private)
import os
import sys
from pathlib import Path

from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]
HERE = Path(__file__).parent
CLIENT_SECRET = HERE / "client_secret.json"
TOKEN = HERE / "yt_token.json"


def get_creds():
    creds = None
    if TOKEN.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN), SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not CLIENT_SECRET.exists():
                sys.exit(f"client_secret.json 없음 — {CLIENT_SECRET} 에 두세요 (가이드 참고)")
            flow = InstalledAppFlow.from_client_secrets_file(str(CLIENT_SECRET), SCOPES)
            creds = flow.run_local_server(port=0)
        TOKEN.write_text(creds.to_json(), encoding="utf-8")
    return creds


def main():
    if len(sys.argv) < 2:
        sys.exit("usage: python upload_youtube.py <video.mp4> [title] [description]")
    video = sys.argv[1]
    title = (sys.argv[2] if len(sys.argv) > 2 else "오늘의 이슈")[:100]
    desc = sys.argv[3] if len(sys.argv) > 3 else ""
    privacy = os.environ.get("YT_PRIVACY", "private")

    yt = build("youtube", "v3", credentials=get_creds())
    body = {
        "snippet": {
            "title": title,
            "description": (desc + "\n\n#Shorts #뉴스 #이슈").strip(),
            "categoryId": "25",  # News & Politics
            "tags": ["shorts", "뉴스", "이슈", "트렌드"],
        },
        "status": {"privacyStatus": privacy, "selfDeclaredMadeForKids": False},
    }
    media = MediaFileUpload(video, chunksize=-1, resumable=True, mimetype="video/mp4")
    req = yt.videos().insert(part="snippet,status", body=body, media_body=media)
    resp = None
    while resp is None:
        _, resp = req.next_chunk()
    print("uploaded:", f"https://youtu.be/{resp['id']}", f"({privacy})")


if __name__ == "__main__":
    main()
