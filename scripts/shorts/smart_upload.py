# 쇼츠 스마트 발행 자동화.
#   JSON 스크립트 폴더를 받아 → out/의 렌더된 mp4를 찾아 → 스마트 카데스로 업로드.
#   처음 PUBLIC_NOW편은 '오늘 즉시 공개', 나머지는 하루 PER_DAY편씩 '예약'(KST 09/14/20시).
#   → 하루 도배도 안 하고, 오늘 노출도 챙김. 제목·설명·태그는 JSON에서 자동 생성.
# 사용: python smart_upload.py <json폴더> [PUBLIC_NOW=3] [PER_DAY=3]
import json, os, sys, glob
from datetime import datetime, timedelta, timezone
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

HERE = os.path.dirname(__file__)
SLOTS_UTC = [0, 5, 11]  # KST 09/14/20
BRAND = "real.allthatai.kr"

def creds():
    p = os.path.join(HERE, "yt_token.json")
    tok = json.load(open(p))
    c = Credentials(token=tok.get("token"), refresh_token=tok.get("refresh_token"),
        token_uri=tok.get("token_uri", "https://oauth2.googleapis.com/token"),
        client_id=tok.get("client_id"), client_secret=tok.get("client_secret"), scopes=tok.get("scopes"))
    if not c.valid:  # 만료 시에만 refresh (매번 refresh하면 Google이 revoke함)
        c.refresh(Request()); open(p, "w", encoding="utf-8").write(c.to_json())
    return c

def meta_from_json(j):
    cuts = j["cuts"]; topic = j.get("topic", "")
    title = " ".join(cuts[0].get("titleLines", [topic])).strip()[:100]
    link = j.get("link", BRAND)
    tags = j.get("tags", [])
    tips = [f"· {c.get('head','')}" for c in cuts if c.get("kind") == "tip" and c.get("head")]
    lead = cuts[0].get("narration", "")
    hashtags = " ".join("#" + t.replace(" ", "") for t in tags)
    head = (f"👉 {link}" if link and link != BRAND else f"👉 {BRAND}")
    desc = f"{head}\n\n{lead}\n" + "\n".join(tips) + f"\n\n{hashtags} #shorts"
    return title, desc, tags

def find_mp4(topic):
    fs = sorted(glob.glob(os.path.join(HERE, "out", f"{topic}_*.mp4")), key=os.path.getmtime)
    return fs[-1] if fs else None

def main():
    if len(sys.argv) < 2: sys.exit("사용: python smart_upload.py <json폴더> [PUBLIC_NOW=3] [PER_DAY=3]")
    folder = sys.argv[1]
    public_now = int(sys.argv[2]) if len(sys.argv) > 2 else 3
    per_day = int(sys.argv[3]) if len(sys.argv) > 3 else 3
    jsons = sorted(glob.glob(os.path.join(folder, "*.json")))
    yt = build("youtube", "v3", credentials=creds())
    # 예약 시작: 내일 00:00 UTC(=KST 09시)
    base = (datetime.now(timezone.utc) + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    sched_i = 0; done = 0
    for idx, jp in enumerate(jsons):
        j = json.load(open(jp, encoding="utf-8"))
        mp4 = find_mp4(j.get("topic", ""))
        if not mp4: print(f"[{idx+1}] {j.get('topic')} mp4없음 스킵"); continue
        title, desc, tags = meta_from_json(j)
        status = {"selfDeclaredMadeForKids": False}
        if idx < public_now:
            status["privacyStatus"] = "public"; when = "공개(오늘)"
        else:
            pub = base + timedelta(days=sched_i // per_day, hours=SLOTS_UTC[sched_i % per_day % len(SLOTS_UTC)])
            status["privacyStatus"] = "private"; status["publishAt"] = pub.strftime("%Y-%m-%dT%H:%M:%SZ")
            when = "예약 " + pub.strftime("%m-%d %H:%MZ"); sched_i += 1
        body = {"snippet": {"title": title, "description": desc, "tags": tags, "categoryId": "26"}, "status": status}
        try:
            r = yt.videos().insert(part="snippet,status", body=body,
                media_body=MediaFileUpload(mp4, chunksize=-1, resumable=True)).execute()
            print(f"[{idx+1:2}] {title[:20]:20} → {when}  youtu.be/{r['id']}"); done += 1
        except Exception as e:
            print(f"[{idx+1:2}] {title[:20]} 실패: {str(e)[:80]}")
    print(f"--- 발행 {done}/{len(jsons)}편 (공개 {min(public_now,done)} + 예약 나머지) ---")

if __name__ == "__main__":
    main()
