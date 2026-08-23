from pathlib import Path
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

SCOPES = ["https://www.googleapis.com/auth/youtube.force-ssl"]
HERE = Path(__file__).parent
creds = Credentials.from_authorized_user_file(str(HERE / "yt_token.json"), SCOPES)
if creds.expired and creds.refresh_token:
    creds.refresh(Request())
yt = build("youtube", "v3", credentials=creds)

TAGS = {
    "e9-1eeL7kIM": ["리니지", "리니지클래식", "공성전", "리니지M", "MMORPG", "엔씨소프트", "게임", "게임뉴스", "pc게임", "롤플레잉", "shorts", "쇼츠", "게임꿀팁"],
    "94w69pXlDig": ["GTA6", "GTA", "그랜드테프트오토", "락스타", "사전예약", "콘솔게임", "PS5", "엑스박스", "게임", "게임뉴스", "오픈월드", "기대작", "shorts", "쇼츠"],
    "forBVWcR3Mo": ["청년미래적금", "청년적금", "지원금", "정부지원금", "목돈마련", "재테크", "적금", "청년정책", "비과세", "금융", "청년", "shorts", "쇼츠", "꿀팁"],
    "lUWdthzoo-g": ["슈퍼걸", "DC", "제임스건", "밀리앨콕", "제이슨모모아", "DC유니버스", "슈퍼맨", "영화", "개봉영화", "히어로영화", "영화추천", "shorts", "쇼츠"],
    "bBD6NLYyJNQ": ["전세사기", "전세", "부동산", "보증금", "깡통전세", "등기부등본", "확정일자", "전입신고", "부동산꿀팁", "임대차", "내집마련", "shorts", "쇼츠"],
    "8Lf3Of5XqpM": ["주택청약", "청약", "청약가점", "가점계산", "무주택기간", "부양가족", "청약통장", "내집마련", "아파트청약", "부동산", "청약1순위", "청약꿀팁", "재테크", "shorts", "쇼츠"],
}

import re

for vid, tags in TAGS.items():
    cur = yt.videos().list(part="snippet", id=vid).execute()
    if not cur["items"]:
        print("없음:", vid)
        continue
    sn = cur["items"][0]["snippet"]
    sn["tags"] = tags
    # 설명란 옛 고정 해시태그(#Shorts #뉴스 #이슈 ...) 줄을 태그 기반으로 교체
    hashtags = " ".join("#" + t.replace(" ", "") for t in tags if " " not in t)
    desc = sn.get("description", "")
    desc = re.sub(r"\n*#\S+(?:\s+#\S+)*\s*$", "", desc).rstrip()  # 끝의 해시태그 블록 제거
    sn["description"] = (desc + "\n\n" + hashtags).strip()
    yt.videos().update(part="snippet", body={"id": vid, "snippet": sn}).execute()
    print("태그+설명 갱신:", vid, len(tags))
