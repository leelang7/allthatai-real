# -*- coding: utf-8 -*-
"""
AI 화제 자동 발굴. 권위/주요 피드를 훑어 최근 이슈를 뽑고, 이미 만든 주제는 걸러낸다.
사람 기억에 의존하던 발굴 단계를 도구로 대체(= GPT-5.6 놓친 버그의 진짜 수정).

사용:
  python trend_scan.py              # 최근 7일 후보 출력
  python trend_scan.py --days 3 --top 15
  python trend_scan.py --json out.json
스케줄러가 매일 돌려 candidates 파일을 남기면, 작업 시작할 때 그걸 보고 제작한다.
"""
import os, sys, re, json, html, argparse
from datetime import datetime, timezone, timedelta
from xml.etree import ElementTree as ET
import urllib.request

try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")

FEEDS = [
    ("OpenAI",     "https://openai.com/news/rss.xml"),
    ("TechCrunch", "https://techcrunch.com/category/artificial-intelligence/feed/"),
    ("AI타임스",    "https://www.aitimes.kr/rss/allArticle.xml"),
    ("Ars",        "https://feeds.arstechnica.com/arstechnica/technology-lab"),
    ("GoogleAI",   "https://blog.google/technology/ai/rss/"),
    ("VentureBeat","https://venturebeat.com/category/ai/feed/"),
]

# 화제성 가중치: 제목에 있으면 점수
HOT = {
    "출시": 5, "공개": 4, "launch": 5, "release": 5, "unveil": 4, "announce": 3,
    "gpt": 6, "claude": 6, "gemini": 6, "openai": 5, "anthropic": 5, "chatgpt": 6,
    "무료": 5, "free": 3, "가격": 4, "pricing": 4, "price": 3,
    "규제": 5, "금지": 5, "ban": 4, "규제안": 5, "소송": 4, "lawsuit": 4,
    "논란": 4, "유출": 4, "해킹": 4, "보안": 3,
    "에이전트": 4, "agent": 3, "모델": 2, "model": 2, "ai": 1, "인공지능": 2,
}

def fetch(url, timeout=25):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()

def parse_date(s):
    if not s: return None
    s = s.strip()
    fmts = ["%a, %d %b %Y %H:%M:%S %z", "%a, %d %b %Y %H:%M:%S %Z",
            "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d %H:%M:%S"]
    for f in fmts:
        try:
            d = datetime.strptime(s.replace("GMT", "+0000"), f)
            return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
        except Exception:
            pass
    return None

def items_of(xml_bytes):
    """RSS(item) / Atom(entry) 둘 다 지원."""
    root = ET.fromstring(xml_bytes)
    ns = {"a": "http://www.w3.org/2005/Atom"}
    out = []
    for it in root.iter():
        tag = it.tag.split("}")[-1]
        if tag not in ("item", "entry"): continue
        def g(*names):
            for n in names:
                e = it.find(n) if not n.startswith("a:") else it.find(n, ns)
                if e is None:
                    for c in it:
                        if c.tag.split("}")[-1] == n.split(":")[-1]:
                            e = c; break
                if e is not None:
                    return (e.text or e.attrib.get("href") or "").strip()
            return ""
        title = html.unescape(g("title"))
        link = g("link")
        date = parse_date(g("pubDate", "published", "updated"))
        if title:
            out.append({"title": title, "link": link, "date": date})
    return out

COVERED = os.path.join(HERE, "covered.json")

def covered_links():
    """이미 콘텐츠로 만든 기사 URL 원장.
    파일명(한글 토픽) vs 기사제목(영문)은 언어가 달라 대조가 안 되므로 URL로 건다."""
    try:
        return set(json.load(open(COVERED, encoding="utf-8")))
    except Exception:
        return set()

def mark_covered(links):
    s = covered_links() | set(links)
    json.dump(sorted(s), open(COVERED, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return len(s)

def produced_topics():
    """이미 만든 주제(out/*.mp4 파일명) → 같은 언어일 때의 보조 필터."""
    seen = set()
    if os.path.isdir(OUT):
        for f in os.listdir(OUT):
            if f.endswith(".mp4"):
                seen.add(re.sub(r"_\d{8,}\.mp4$", "", f).lower())
    return seen

def score(title):
    t = title.lower()
    return sum(w for k, w in HOT.items() if k in t)

def is_dup(title, seen):
    t = re.sub(r"[^a-z0-9가-힣]", "", title.lower())
    for s in seen:
        key = re.sub(r"[^a-z0-9가-힣]", "", s)
        if len(key) >= 4 and key in t:
            return True
    return False

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--top", type=int, default=12)
    ap.add_argument("--json", default=None)
    ap.add_argument("--mark", nargs="+", metavar="URL",
                    help="이 기사 URL들을 '제작완료'로 원장에 기록하고 종료")
    a = ap.parse_args()

    if a.mark:
        n = mark_covered(a.mark)
        print(f"원장에 기록: {len(a.mark)}건 추가 (총 {n}건)"); return

    cutoff = datetime.now(timezone.utc) - timedelta(days=a.days)
    seen = produced_topics()
    done = covered_links()
    rows = []
    for name, url in FEEDS:
        try:
            for it in items_of(fetch(url)):
                if it["date"] and it["date"] < cutoff: continue
                sc = score(it["title"])
                if sc < 5: continue                       # AI 화제성 낮으면 컷
                if it["link"] in done: continue           # 이미 콘텐츠로 만든 기사 컷
                if is_dup(it["title"], seen): continue    # 같은 언어 제목이면 보조 컷
                rows.append({"src": name, "score": sc, "title": it["title"],
                             "link": it["link"],
                             "date": it["date"].strftime("%m-%d") if it["date"] else "?"})
        except Exception as e:
            print(f"[warn] {name} 실패: {str(e)[:60]}", file=sys.stderr)
    rows.sort(key=lambda r: (-r["score"], r["date"]), reverse=False)
    rows = sorted(rows, key=lambda r: -r["score"])[:a.top]
    print(f"=== AI 화제 후보 {len(rows)}건 (최근 {a.days}일, 제작완료 제외) ===")
    for r in rows:
        print(f"[{r['score']:2d}] {r['date']} {r['src']:11s} {r['title'][:70]}")
        print(f"     {r['link'][:100]}")
    if a.json:
        json.dump(rows, open(a.json, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(f"\n-> {a.json}")

if __name__ == "__main__":
    main()
