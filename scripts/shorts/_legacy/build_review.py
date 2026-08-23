# Review dashboard: uploaded (YouTube embed) + local unuploaded (out/*.mp4).
import json
import html
import glob
import os
from pathlib import Path

HERE = Path(__file__).parent
PEND = HERE / "pending.jsonl"
OUT = HERE / "review.html"

items = []
if PEND.exists():
    for line in PEND.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            try:
                items.append(json.loads(line))
            except Exception:
                pass
items.reverse()


def yt_card(it):
    vid = html.escape(str(it.get("id", "")))
    title = html.escape(str(it.get("title", "")))
    topic = html.escape(str(it.get("topic", "")))
    pv = it.get("privacy", "unlisted")
    btext, bcolor = ("공개됨", "#2a6") if pv == "public" else ("비공개 검토대기", "#b80")
    cmd = "python scripts/shorts/set_privacy.py " + vid + " public"
    return (
        '<div class="card">'
        '<iframe src="https://www.youtube.com/embed/' + vid + '" allowfullscreen loading="lazy"></iframe>'
        '<div class="meta"><div class="title">' + title + '</div>'
        '<div class="topic">화제: ' + topic + '</div>'
        '<span class="badge" style="background:' + bcolor + '">' + btext + '</span>'
        '<div class="actions">'
        '<button onclick="navigator.clipboard.writeText(\'' + cmd + '\').then(()=>this.textContent=\'복사됨\')">공개 명령 복사</button>'
        '<a href="https://youtu.be/' + vid + '" target="_blank">새 탭</a>'
        '</div></div></div>'
    )


local_cards = []
for f in sorted(glob.glob(str(HERE / "out" / "*.mp4"))):
    name = os.path.basename(f)
    rel = "out/" + name
    local_cards.append(
        '<div class="card">'
        '<video src="' + rel + '" controls preload="metadata"></video>'
        '<div class="meta"><div class="title">' + html.escape(name) + '</div>'
        '<span class="badge" style="background:#555">로컬 · 미업로드</span></div></div>'
    )

yt_body = "".join(yt_card(it) for it in items) if items else '<div class="empty">업로드된 영상 없음</div>'
local_body = "".join(local_cards) if local_cards else '<div class="empty">로컬 영상 없음</div>'

CSS = (
    "body{background:#0e0e10;color:#eaeaea;font-family:'Segoe UI',sans-serif;margin:0;padding:24px}"
    "h1{font-size:20px;margin:0 0 6px}h2{font-size:15px;color:#9aa;margin:24px 0 10px;border-top:1px solid #2a2a2e;padding-top:16px}"
    ".grid{display:flex;flex-wrap:wrap;gap:18px}"
    ".card{background:#18181b;border:1px solid #2a2a2e;border-radius:14px;overflow:hidden;width:300px}"
    "iframe,video{width:300px;height:533px;border:0;display:block;background:#000;object-fit:cover}"
    ".meta{padding:14px}.title{font-weight:700;font-size:14px;margin-bottom:6px;line-height:1.3}"
    ".topic{color:#9aa;font-size:13px}"
    ".badge{display:inline-block;color:#fff;font-size:12px;padding:3px 10px;border-radius:20px;margin:10px 0}"
    ".actions{display:flex;flex-direction:column;gap:8px}"
    "button{background:#3a6df0;color:#fff;border:0;padding:9px 12px;border-radius:8px;cursor:pointer;font-size:13px}"
    "a{color:#6af;font-size:13px;text-decoration:none}.empty{color:#777;padding:20px}"
)

doc = (
    '<!doctype html><html lang="ko"><head><meta charset="utf-8">'
    '<meta name="viewport" content="width=device-width,initial-scale=1">'
    "<title>쇼츠 검토</title><style>" + CSS + "</style></head><body>"
    "<h1>쇼츠 검토 대시보드</h1>"
    "<h2>로컬 · 미업로드 (검토 후 내일 업로드)</h2><div class=\"grid\">" + local_body + "</div>"
    "<h2>유튜브 업로드됨</h2><div class=\"grid\">" + yt_body + "</div>"
    "</body></html>"
)

OUT.write_text(doc, encoding="utf-8")
print("wrote", OUT, "(" + str(len(items)) + " uploaded, " + str(len(local_cards)) + " local)")
