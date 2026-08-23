from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

c = Credentials.from_authorized_user_file("yt_token.json", ["https://www.googleapis.com/auth/youtube.force-ssl"])
yt = build("youtube", "v3", credentials=c)
ch = yt.channels().list(part="contentDetails,snippet,statistics", mine=True).execute()["items"][0]
print("CHANNEL:", ch["snippet"]["title"])
print("VIDEO COUNT:", ch["statistics"].get("videoCount"))
up = ch["contentDetails"]["relatedPlaylists"]["uploads"]
for it in yt.playlistItems().list(part="snippet", playlistId=up, maxResults=40).execute()["items"]:
    print(it["snippet"]["resourceId"]["videoId"], it["snippet"]["title"][:35])
