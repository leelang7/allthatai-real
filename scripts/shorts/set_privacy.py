# Flip a YouTube video's privacy (e.g. unlisted -> public) after your approval.
# Usage: python set_privacy.py <video_id> <public|unlisted|private>
import sys
from pathlib import Path

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

HERE = Path(__file__).parent
TOKEN = HERE / "yt_token.json"
SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]

if len(sys.argv) < 2:
    sys.exit("usage: python set_privacy.py <video_id> [public|unlisted|private]")
vid = sys.argv[1]
privacy = sys.argv[2] if len(sys.argv) > 2 else "public"

creds = Credentials.from_authorized_user_file(str(TOKEN), SCOPES)
if creds.expired and creds.refresh_token:
    creds.refresh(Request())
yt = build("youtube", "v3", credentials=creds)
yt.videos().update(part="status", body={"id": vid, "status": {"privacyStatus": privacy}}).execute()
print(f"{vid} -> {privacy}  ( https://youtu.be/{vid} )")
