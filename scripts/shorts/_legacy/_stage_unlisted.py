# -*- coding: utf-8 -*-
"""
검증 완료된 q816 렌더본을 unlisted로 스테이징 업로드(무인 실행 기본값=run_daily.ps1의 YT_PRIVACY=unlisted).
- 재렌더 없음: out/의 기존 mp4를 그대로 업로드(GPU 불필요).
- 메타데이터는 토픽 JSON에서 생성(dual_publish.auto_title / yt_description / tags).
- 2개 프로젝트 쿼터 로테이션(client_secret.json -> client_secret2.json).
- 상태파일(staged_unlisted_<date>.json)로 중복 업로드 방지.
사용: python _stage_unlisted.py <date> <json1> <json2> ...
"""
import os, sys, json, datetime
from pathlib import Path
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from googleapiclient.errors import HttpError

try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import dual_publish as dp  # auto_title, yt_description, latest_mp4, load

CLIENTS = [("client_secret.json", "yt_token.json"), ("client_secret2.json", "yt_token2.json")]
SCOPES = ["https://www.googleapis.com/auth/youtube.force-ssl"]


def creds_for(tok):
    p = HERE / tok
    d = json.load(open(p))
    c = Credentials(d["token"], refresh_token=d.get("refresh_token"),
                    token_uri="https://oauth2.googleapis.com/token",
                    client_id=d["client_id"], client_secret=d["client_secret"],
                    scopes=d.get("scopes", SCOPES))
    if not c.valid:
        c.refresh(Request()); open(p, "w").write(c.to_json())
    return c


def main():
    date = sys.argv[1]
    jsons = sys.argv[2:]
    state_p = HERE / f"staged_unlisted_{date}.json"
    state = json.load(open(state_p, encoding="utf-8")) if state_p.exists() else {}

    proj = 0
    yt = build("youtube", "v3", credentials=creds_for(CLIENTS[proj][1]))
    print(f"[proj{proj+1}] auth ok")

    for jp in jsons:
        key = os.path.basename(jp)
        if state.get(key, {}).get("id"):
            print(f"SKIP  {key} (이미 스테이징됨 {state[key]['id']})"); continue
        j = dp.load(jp if os.path.isabs(jp) else str(HERE / jp))
        topic = j["topic"]
        mp4 = dp.latest_mp4(topic)
        if not mp4:
            print(f"MISS  {key} (mp4 없음: {topic})"); state[key] = {"error": "no_mp4"}; continue
        title = dp.auto_title(j)[:100]
        body = {"snippet": {"title": title, "description": dp.yt_description(j),
                            "tags": j.get("tags", [])[:15], "categoryId": "27"},
                "status": {"privacyStatus": "unlisted", "selfDeclaredMadeForKids": False}}
        media = MediaFileUpload(mp4, mimetype="video/mp4", chunksize=-1, resumable=True)
        while True:
            try:
                req = yt.videos().insert(part="snippet,status", body=body, media_body=media)
                resp = None
                while resp is None:
                    _, resp = req.next_chunk()
                vid = resp["id"]
                print(f"OK    {key}  https://youtu.be/{vid}  [unlisted p{proj+1}] {title}")
                state[key] = {"id": vid, "title": title, "proj": proj + 1,
                              "at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M")}
                json.dump(state, open(state_p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
                with open(HERE / "pending.jsonl", "a", encoding="utf-8") as f:
                    f.write(json.dumps({"id": vid, "title": title, "topic": topic,
                                        "privacy": "unlisted",
                                        "created": state[key]["at"]}, ensure_ascii=False) + "\n")
                break
            except HttpError as e:
                es = str(e).lower()
                if ("quota" in es or "exceeded" in es) and proj + 1 < len(CLIENTS):
                    proj += 1
                    print(f"  proj{proj} 쿼터 소진 → proj{proj+1}로 전환")
                    yt = build("youtube", "v3", credentials=creds_for(CLIENTS[proj][1]))
                    media = MediaFileUpload(mp4, mimetype="video/mp4", chunksize=-1, resumable=True)
                    continue
                print(f"FAIL  {key}  {type(e).__name__}: {str(e)[:180]}")
                state[key] = {"error": str(e)[:180]}
                json.dump(state, open(state_p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
                if "quota" in es or "exceeded" in es:
                    print("=== 모든 프로젝트 쿼터 소진 — 중단 ==="); return 2
                break

    done = sum(1 for v in state.values() if v.get("id"))
    print(f"\n=== staged {done}/{len(jsons)} unlisted (state: {state_p.name}) ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
