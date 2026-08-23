from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

c = Credentials.from_authorized_user_file("yt_token.json", ["https://www.googleapis.com/auth/youtube.force-ssl"])
yt = build("youtube", "v3", credentials=c)
for vid in ["forBVWcR3Mo", "lUWdthzoo-g"]:
    s = yt.videos().list(part="snippet", id=vid).execute()["items"][0]["snippet"]
    print(vid, "->", s.get("tags"))
