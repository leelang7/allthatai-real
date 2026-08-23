# Manage uploaded videos: delete or set privacy. Uses youtube.force-ssl scope
# (full manage), so first run re-auths once; token then works for upload too.
#   python yt_manage.py delete <id> [<id> ...]
#   python yt_manage.py public <id> [<id> ...]
import sys
from pathlib import Path

from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

SCOPES = ["https://www.googleapis.com/auth/youtube.force-ssl"]
HERE = Path(__file__).parent
CLIENT_SECRET = HERE / "client_secret.json"
TOKEN = HERE / "yt_token.json"


def get_creds():
    creds = None
    if TOKEN.exists():
        try:
            creds = Credentials.from_authorized_user_file(str(TOKEN), SCOPES)
        except Exception:
            creds = None
    ok = creds and creds.valid and creds.has_scopes(SCOPES)
    if not ok:
        if creds and creds.expired and creds.refresh_token and creds.has_scopes(SCOPES):
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(str(CLIENT_SECRET), SCOPES)
            creds = flow.run_local_server(
                port=8765, open_browser=False,
                authorization_prompt_message="\n\n>>> 이 URL을 브라우저에서 열어 인증하세요:\n{url}\n\n",
            )
        TOKEN.write_text(creds.to_json(), encoding="utf-8")
    return creds


def main():
    if len(sys.argv) < 3:
        sys.exit("usage: python yt_manage.py <delete|public|unlisted|private> <id> [<id> ...]")
    action = sys.argv[1]
    ids = sys.argv[2:]
    yt = build("youtube", "v3", credentials=get_creds())
    for vid in ids:
        if action == "delete":
            yt.videos().delete(id=vid).execute()
            print("deleted:", vid)
        else:
            yt.videos().update(part="status", body={"id": vid, "status": {"privacyStatus": action}}).execute()
            print(f"{vid} -> {action}  ( https://youtu.be/{vid} )")


if __name__ == "__main__":
    main()
