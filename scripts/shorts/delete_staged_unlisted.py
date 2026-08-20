# -*- coding: utf-8 -*-
"""자동 실행이 잘못 올린 unlisted 중복본 정리.

staged_unlisted_*.json에 기록된 영상 ID를 대상으로,
  1) 현재 상태를 조회해 정말 unlisted인지 확인하고
  2) public인 영상은 절대 건드리지 않으며(원본 보호)
  3) unlisted인 것만 삭제한다.
--dry 로 먼저 확인만 할 수 있다.
"""
import os, sys, json, glob

HERE = os.path.dirname(os.path.abspath(__file__))
DRY = "--dry" in sys.argv


def yt_client(token_file):
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    from googleapiclient.discovery import build
    p = os.path.join(HERE, token_file)
    tok = json.load(open(p))
    c = Credentials(tok["token"], refresh_token=tok.get("refresh_token"),
                    token_uri="https://oauth2.googleapis.com/token",
                    client_id=tok["client_id"], client_secret=tok["client_secret"],
                    scopes=tok.get("scopes"))
    if not c.valid:
        c.refresh(Request())
        open(p, "w").write(c.to_json())
    return build("youtube", "v3", credentials=c)


def main():
    targets = {}  # id -> (title, proj)
    for f in sorted(glob.glob(os.path.join(HERE, "staged_unlisted_*.json"))):
        for k, v in json.load(open(f, encoding="utf-8")).items():
            targets[v["id"]] = (v.get("title", ""), v.get("proj", 1))
    if not targets:
        print("대상 없음")
        return

    print(f"기록된 대상 {len(targets)}건\n")
    yt = yt_client("yt_token.json")

    ids = list(targets)
    status = {}
    for i in range(0, len(ids), 50):
        chunk = ids[i:i + 50]
        r = yt.videos().list(part="status,snippet", id=",".join(chunk)).execute()
        for it in r.get("items", []):
            status[it["id"]] = (it["status"]["privacyStatus"], it["snippet"]["title"])

    to_delete, skipped, missing = [], [], []
    for vid, (title, _) in targets.items():
        if vid not in status:
            missing.append((vid, title))
        elif status[vid][0] == "unlisted":
            to_delete.append((vid, status[vid][1]))
        else:
            skipped.append((vid, status[vid][0], status[vid][1]))

    for vid, t in to_delete:
        print(f"  [삭제대상] {vid}  {t[:46]}")
    for vid, st, t in skipped:
        print(f"  [보존:{st}] {vid}  {t[:46]}")
    for vid, t in missing:
        print(f"  [이미없음]  {vid}  {t[:46]}")

    print(f"\n삭제 {len(to_delete)} / 보존 {len(skipped)} / 없음 {len(missing)}")
    if DRY:
        print("\n(--dry 모드: 실제 삭제 안 함)")
        return

    ok = fail = 0
    for vid, t in to_delete:
        try:
            yt.videos().delete(id=vid).execute()
            ok += 1
            print(f"  삭제됨 {vid}")
        except Exception as e:
            fail += 1
            print(f"  실패 {vid}: {e}")
    print(f"\n완료: 삭제 {ok}건, 실패 {fail}건")


if __name__ == "__main__":
    main()
