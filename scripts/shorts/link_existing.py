# 이미 공개된 영상 설명 맨 위에 CTA 딥링크 한 줄 추가(update=50유닛/개, 재업로드 X).
# 멱등: 이미 그 링크가 있으면 건너뜀.
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

BASE = "https://real.allthatai.kr"
LINKS = {
    "fcKkifYlyQU": "/tools/unemployment-benefit/",   # 실업급여
    "rmfGlxIBAZ8": "/tools/national-pension/",         # 국민연금 임의가입
    "8Lf3Of5XqpM": "/tools/housing-subscription/",     # 청약
    "h6qA79aKXfo": "/tools/childcare-money/",           # 자녀장려금
    "KMFWl_1REZk": "/tools/health-insurance/",          # 본인부담상한제
    "forBVWcR3Mo": "/tools/savings/",                   # 청년적금
    "TEWBG_2_i8E": "/hidden-money/",                    # 숨은 정부지원금
    "bBD6NLYyJNQ": "/jeonse/",                           # 전세사기
    "S0QrxmWw_T8": "/tools/tax-refund/",                # 근로장려금(근사)
    "GVCkB431D18": "/tools/loan-compare/",              # 신생아 특례대출(근사)
    "AaFNsINPms0": "/hidden-money/",                     # K패스(교통비 환급→받을 돈 챙기기, 근사)
    "lUWdthzoo-g": "/box-office/",                       # 슈퍼걸(영화→박스오피스)
}

for vid, path in LINKS.items():
    url = BASE + path
    cur = yt.videos().list(part="snippet", id=vid).execute()
    if not cur["items"]:
        print("없음:", vid); continue
    sn = cur["items"][0]["snippet"]
    desc = sn.get("description", "")
    if url in desc:
        print("이미있음, 건너뜀:", vid); continue
    sn["description"] = ("👉 무료 계산기/확인: " + url + "\n\n" + desc).strip()
    yt.videos().update(part="snippet", body={"id": vid, "snippet": sn}).execute()
    print("링크추가:", vid, "->", url)
print("DONE")
