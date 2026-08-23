# 쇼츠 분석·관리 대시보드.
#   python review_server.py  ->  http://localhost:8800
# - 유튜브 실제 상태 + 조회수/좋아요/댓글 API 동기화
# - 인사이트: 총·평균 조회수, TOP, 카테고리별 평균, 반응형 vs 에버그린(발굴 반영)
# - 정렬(조회수/최신) · 필터 · 일괄 공개 · 카드별 공개/비공개/삭제
import http.server
import socketserver
import subprocess
import glob
import os
import json
import sys
import urllib.parse
import time
from pathlib import Path

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

HERE = Path(__file__).parent
PORT = 8800
SCOPES = ["https://www.googleapis.com/auth/youtube.force-ssl"]

# 발굴 반영용 카테고리 분류(주제 키워드 기반)
CATS = [
    ("AI·테크", ["엔비디아", "테슬라", "AI 모델", "최강 AI", "AI 툴", "무료 AI", "로보택시", "GPT", "반도체", "Rubin"]),
    ("스포츠·트렌드", ["월드컵", "손흥민", "남아공", "48개국", "경우의 수", "16강"]),
    ("부동산", ["청약", "전세", "양도", "취득", "종합부동산", "중개", "전월세", "디딤돌", "신생아", "부동산"]),
    ("세금·환급", ["근로장려", "자녀장려", "종합소득", "부가가치", "숨은", "본인부담", "연말정산"]),
    ("노동·금융", ["실업급여", "퇴직금", "연차", "국민연금", "예금자", "적금", "카드", "DSR", "대출", "육아휴직", "K패스", "교통비"]),
]
REACTIVE = {"AI·테크", "스포츠·트렌드"}


def categorize(topic):
    t = topic or ""
    for name, kws in CATS:
        if any(k in t for k in kws):
            return name
    return "기타"


def yt_client():
    tp = HERE / "yt_token.json"
    creds = Credentials.from_authorized_user_file(str(tp), SCOPES)
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        tp.write_text(creds.to_json(), encoding="utf-8")
    return build("youtube", "v3", credentials=creds)


def load_pending():
    seen, out = set(), []
    pf = HERE / "pending.jsonl"
    if pf.exists():
        for l in reversed(pf.read_text(encoding="utf-8").splitlines()):
            l = l.strip()
            if not l:
                continue
            try:
                r = json.loads(l)
            except Exception:
                continue
            vid = str(r.get("id", ""))
            if vid and vid not in seen:
                seen.add(vid)
                out.append(r)
    return out


def live_data(ids):
    """유튜브 실제 상태·통계 배치 조회: {id:{privacy,title,views,likes,comments,published}}."""
    res = {}
    if not ids:
        return res
    try:
        yt = yt_client()
        for i in range(0, len(ids), 50):
            chunk = ids[i:i + 50]
            r = yt.videos().list(part="status,snippet,statistics", id=",".join(chunk)).execute()
            for it in r.get("items", []):
                st = it.get("statistics", {})
                res[it["id"]] = {
                    "privacy": it["status"]["privacyStatus"],
                    "title": it["snippet"]["title"],
                    "published": it["snippet"].get("publishedAt", ""),
                    "views": int(st.get("viewCount", 0)),
                    "likes": int(st.get("likeCount", 0)),
                    "comments": int(st.get("commentCount", 0)),
                }
    except Exception as e:
        print("live_data 실패(폴백):", e)
    return res


_CACHE = {"ids": None, "data": {}, "ts": 0.0}


def live_data_cached(ids, ttl=60):
    """60초 캐시 — 잦은 새로고침에도 API 호출 최소화(속도)."""
    now = time.time()
    if _CACHE["ids"] == tuple(ids) and (now - _CACHE["ts"]) < ttl and _CACHE["data"]:
        return _CACHE["data"]
    data = live_data(ids)
    if data:
        _CACHE.update(ids=tuple(ids), data=data, ts=now)
    return data


def fmt(n):
    return format(int(n), ",")


CSS = """<style>
:root{color-scheme:dark}*{box-sizing:border-box}
body{background:#0d0d0f;color:#eaeaea;font-family:'Segoe UI',system-ui,sans-serif;margin:0;padding:22px}
h1{font-size:20px;margin:0 0 14px}
.kpis{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:14px}
.kpi{background:#16161a;border:1px solid #26262c;border-radius:14px;padding:14px 18px;min-width:140px}
.kpi .n{font-size:24px;font-weight:800;letter-spacing:-.5px}
.kpi .l{font-size:12px;color:#8a93a0;margin-top:2px}
.kpi.hot{border-color:#3a6df0}
.panels{display:flex;flex-wrap:wrap;gap:14px;margin-bottom:18px}
.panel{background:#16161a;border:1px solid #26262c;border-radius:14px;padding:14px 16px;flex:1;min-width:300px}
.panel h3{margin:0 0 10px;font-size:13px;color:#cdd3da}
.rowi{display:flex;justify-content:space-between;font-size:13px;padding:5px 0;border-bottom:1px solid #20202610}
.rowi .v{color:#7fd1a0;font-variant-numeric:tabular-nums;font-weight:700}
.bar{height:7px;background:#2a6df0;border-radius:5px;margin-top:3px}
.tip{font-size:12px;color:#8a93a0;margin-top:8px;line-height:1.5}
.bar2{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0 4px}
.tab{background:#16161a;color:#cfd;border:1px solid #26262c;padding:7px 13px;border-radius:20px;cursor:pointer;font-size:13px}
.tab.on{background:#3a6df0;border-color:#3a6df0;color:#fff}
.btnbar{margin-left:auto;display:flex;gap:8px}
.grid{display:flex;flex-wrap:wrap;gap:15px;margin-top:14px}
.card{background:#16161a;border:1px solid #26262c;border-radius:14px;overflow:hidden;width:218px}
.thumb{display:block;width:218px;height:292px;object-fit:cover;background:#000;border:0}
.meta{padding:11px}
.title{font-weight:700;font-size:12.5px;margin-bottom:5px;line-height:1.35;max-height:51px;overflow:hidden}
.stat{font-size:12px;color:#9aa;font-variant-numeric:tabular-nums;margin-bottom:6px}
.stat b{color:#7fd1a0}
.cat{font-size:11px;color:#7a8290;margin-bottom:6px}
.badge{display:inline-block;color:#fff;font-size:11px;padding:2px 8px;border-radius:20px;margin-bottom:7px}
.row{display:flex;flex-wrap:wrap;gap:5px}
button,a.btn{color:#fff;border:0;padding:6px 10px;border-radius:7px;cursor:pointer;font-size:12px;text-decoration:none;display:inline-block}
.p{background:#2a8a4a}.u{background:#b8860b}.d{background:#a13333}.s{background:#2f6fe0}.g{background:#34343a}
.empty{color:#777;padding:18px}
h2{font-size:14px;color:#9aa;border-top:1px solid #26262c;padding-top:14px;margin:24px 0 4px}
</style>"""

JS = """<script>
async function api(o){const r=await fetch('/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(o)});return r.ok}
function reload(){location.reload()}
function pub(id){api({action:'publish',id}).then(()=>setTimeout(reload,1200))}
function unlist(id){api({action:'unlist',id}).then(()=>setTimeout(reload,1200))}
function del(id){if(confirm('유튜브에서 영구 삭제?'))api({action:'delete',id}).then(()=>setTimeout(reload,1000))}
function up(f){if(confirm('비공개로 업로드?'))api({action:'upload',file:f}).then(()=>alert('업로드 시작 — 1~2분 뒤 새로고침'))}
function delf(f){if(confirm('로컬 파일 삭제?'))api({action:'delfile',file:f}).then(reload)}
function mkvid(f){api({action:'mkvid',file:f}).then(()=>alert('영상화 시작 — 30초~1분 뒤 새로고침'))}
function mCard(b){const c=b.closest('[data-mid]');return {file:c.dataset.mid,title:c.querySelector('.mtitle').value,tags:c.querySelector('.mtags').value,date:c.querySelector('.mdate').value};}
function musicSave(b){const d=mCard(b);api(Object.assign({action:'music_save'},d)).then(()=>alert('저장됨: '+d.title))}
function musicUp(b){const d=mCard(b);if(!d.date)return alert('발행 날짜를 지정하세요');if(confirm('@allthathz에 '+d.date+' 예약 업로드?'))api(Object.assign({action:'music_up'},d)).then(()=>alert('예약 업로드 시작(채널 인증 필요시 실패)'))}
function musicDel(f){if(confirm('이 곡 삭제(mp3·영상·메타)?'))api({action:'music_del',file:f}).then(reload)}
function setRange(n){const t=new Date(),iso=d=>d.toISOString().slice(0,10);const f=document.getElementById('sfrom'),to=document.getElementById('sto');
 if(n===0){f.value='';to.value='';}else if(n===1){f.value=iso(t);to.value=iso(t);}else{const y=new Date(t);y.setDate(t.getDate()-1);f.value=iso(y);to.value=iso(t);}}
function sunoSync(){const f=document.getElementById('sfrom').value,to=document.getElementById('sto').value;
 const label=f?(f+' ~ '+(to||f)):'어제·오늘';if(!confirm('['+label+'] 곡 자동 동기화?'))return;
 api({action:'suno_sync',from:f,to:to}).then(()=>{document.getElementById('syncbox').style.display='block';pollSync()})}
let _syncTimer=null;
function pollSync(){fetch('/sync_status').then(r=>r.json()).then(s=>{
 const box=document.getElementById('syncbox'),bar=document.getElementById('syncbar'),txt=document.getElementById('synctxt');
 const lbl={auth:'🔑 인증 중',fetch:'📚 라이브러리 조회',download:'⬇️ 다운로드/영상화',done:'✅ 완료',error:'❌ 오류',idle:'대기'}[s.state]||s.state;
 let pct=0; if(s.total>0)pct=Math.round((s.current/s.total)*100); if(s.state==='done')pct=100;
 bar.style.width=pct+'%'; bar.style.background=(s.state==='error')?'#a13333':(s.state==='done')?'#2a8a4a':'#2f6fe0';
 txt.textContent=lbl+(s.total?(' '+s.current+'/'+s.total):'')+(s.msg?(' — '+s.msg):'')+(s.state==='download'?(' (신규 '+(s.added||0)+')'):'');
 if(s.state==='done'||s.state==='error'){clearTimeout(_syncTimer);_syncTimer=null;setTimeout(reload,1500);return;}
 _syncTimer=setTimeout(pollSync,1000);
}).catch(()=>{_syncTimer=setTimeout(pollSync,1500);})}
function saveCookie(){const v=document.getElementById('sunock').value.trim();if(!v)return alert('쿠키를 붙여넣으세요');api({action:'suno_cookie',cookie:v}).then(()=>{alert('쿠키 저장됨 — 이제 [🔄 Suno 동기화]를 누르세요');reload()})}
function puball(n){if(confirm(n+'개 비공개 영상을 전부 공개?'))api({action:'publish_all'}).then(()=>setTimeout(reload,2500))}
function filt(s){document.querySelectorAll('.tab[data-f]').forEach(t=>t.classList.toggle('on',t.dataset.f===s));
 document.querySelectorAll('[data-status]').forEach(c=>{c.style.display=(s==='all'||c.dataset.status===s)?'':'none'});
 document.querySelectorAll('.sec').forEach(h=>{h.style.display=(s==='all'||s==='local')?'':'none'})}
function sortBy(k){const u=new URL(location);u.searchParams.set('sort',k);location=u}
// 진행 중 동기화가 있으면 새로고침 후에도 바 복구
fetch('/sync_status').then(r=>r.json()).then(s=>{if(['auth','fetch','download'].includes(s.state)){var b=document.getElementById('syncbox');if(b){b.style.display='block';pollSync();}}}).catch(()=>{});
</script>"""


def yt_card(it, info):
    vid = str(it.get("id", ""))
    title = (info.get("title") or it.get("title", "") or "").replace("<", "&lt;")
    topic = it.get("topic", "")
    cat = categorize(topic)
    pv = info.get("privacy", it.get("privacy", "unlisted"))
    views, likes, comments = info.get("views", 0), info.get("likes", 0), info.get("comments", 0)
    if pv == "public":
        status, badge, bg = "public", "🟢 공개", "#2a8a4a"
        actbtn = '<button class="u" onclick="unlist(\'' + vid + '\')">비공개로</button>'
    else:
        status, badge, bg = "private", "🟡 비공개", "#b8860b"
        actbtn = '<button class="p" onclick="pub(\'' + vid + '\')">공개</button>'
    thumb = "https://i.ytimg.com/vi/" + vid + "/hqdefault.jpg"
    return (
        '<div class="card" data-status="' + status + '">'
        '<a href="https://youtu.be/' + vid + '" target="_blank"><img class="thumb" src="' + thumb + '" loading="lazy"></a>'
        '<div class="meta"><div class="title">' + title + '</div>'
        '<div class="stat">👁 <b>' + fmt(views) + '</b> · 👍 ' + fmt(likes) + ' · 💬 ' + fmt(comments) + '</div>'
        '<div class="cat">' + cat + '</div>'
        '<span class="badge" style="background:' + bg + '">' + badge + '</span>'
        '<div class="row">' + actbtn +
        '<a class="btn s" href="https://youtu.be/' + vid + '" target="_blank">새 탭</a>'
        '<button class="d" onclick="del(\'' + vid + '\')">삭제</button>'
        '</div></div></div>'
    )


MUSIC_META = HERE / 'music' / '.meta.json'


def load_music_meta():
    try:
        return json.loads(MUSIC_META.read_text(encoding='utf-8'))
    except Exception:
        return {}


def save_music_meta(m):
    MUSIC_META.parent.mkdir(exist_ok=True)
    MUSIC_META.write_text(json.dumps(m, ensure_ascii=False), encoding='utf-8')


def page(sort="views"):
    pending = load_pending()
    ids = [str(it.get("id", "")) for it in pending if it.get("id")]
    live = live_data_cached(ids)
    rows = []  # (it, info)
    for it in pending:
        vid = str(it.get("id", ""))
        if live:
            if vid not in live:
                continue
            info = live[vid]
        else:
            info = {"privacy": it.get("privacy", "unlisted"), "views": 0, "likes": 0, "comments": 0}
        rows.append((it, info))

    if sort == "recent":
        rows.sort(key=lambda r: r[1].get("published", ""), reverse=True)
    else:
        rows.sort(key=lambda r: r[1].get("views", 0), reverse=True)

    pub_rows = [r for r in rows if r[1].get("privacy") == "public"]
    total_v = sum(r[1].get("views", 0) for r in rows)
    n = len(rows)
    avg = total_v // n if n else 0
    n_pub = len(pub_rows)
    n_priv = n - n_pub

    # 카테고리별 평균 조회수(공개 영상 기준)
    catagg = {}
    for it, info in (pub_rows or rows):
        c = categorize(it.get("topic", ""))
        a = catagg.setdefault(c, [0, 0])
        a[0] += info.get("views", 0)
        a[1] += 1
    cat_list = sorted(([c, v // cnt, cnt] for c, (v, cnt) in catagg.items() if cnt), key=lambda x: x[1], reverse=True)
    cmax = max([c[1] for c in cat_list], default=1) or 1

    # 반응형 vs 에버그린 평균
    def avg_of(pred):
        sel = [info.get("views", 0) for it, info in (pub_rows or rows) if pred(categorize(it.get("topic", "")))]
        return (sum(sel) // len(sel)) if sel else 0
    react_avg = avg_of(lambda c: c in REACTIVE)
    ever_avg = avg_of(lambda c: c not in REACTIVE)

    # TOP5
    top5 = "".join(
        '<div class="rowi"><span>' + (info.get("title") or it.get("title", ""))[:26].replace("<", "&lt;") +
        '</span><span class="v">' + fmt(info.get("views", 0)) + '</span></div>'
        for it, info in rows[:5]
    ) or '<div class="tip">데이터 없음</div>'

    cat_rows = "".join(
        '<div class="rowi"><span>' + c + ' <span style="color:#666">(' + str(cnt) + ')</span></span>'
        '<span class="v">' + fmt(av) + '</span></div><div class="bar" style="width:' + str(int(av / cmax * 100)) + '%"></div>'
        for c, av, cnt in cat_list
    ) or '<div class="tip">데이터 없음</div>'

    winner = "반응형" if react_avg >= ever_avg else "에버그린"
    react_tip = ('발굴 반영: <b style="color:#7fd1a0">' + winner + '</b>이 평균 조회수 우위 → ' +
                 ('실시간 화제(트렌드)를 더 자주 발굴' if winner == "반응형" else '정보형 계산기 콘텐츠 비중 유지') + '.')

    sync = "🟢 실시간 동기화" if live else "⚠️ API 미동기"
    sopt = lambda k, lbl: ('<button class="tab on" onclick="sortBy(\'' + k + '\')">' + lbl + '</button>'
                           if sort == k else '<button class="tab" onclick="sortBy(\'' + k + '\')">' + lbl + '</button>')

    kpis = (
        '<div class="kpis">'
        '<div class="kpi hot"><div class="n">' + fmt(total_v) + '</div><div class="l">총 조회수</div></div>'
        '<div class="kpi"><div class="n">' + fmt(avg) + '</div><div class="l">영상당 평균</div></div>'
        '<div class="kpi"><div class="n">' + str(n_pub) + ' / ' + str(n_priv) + '</div><div class="l">공개 / 비공개</div></div>'
        '<div class="kpi"><div class="n">' + fmt(react_avg) + '</div><div class="l">반응형 평균</div></div>'
        '<div class="kpi"><div class="n">' + fmt(ever_avg) + '</div><div class="l">에버그린 평균</div></div>'
        '</div>'
    )
    panels = (
        '<div class="panels">'
        '<div class="panel"><h3>📂 카테고리별 평균 조회수</h3>' + cat_rows + '<div class="tip">' + react_tip + '</div></div>'
        '<div class="panel"><h3>🏆 조회수 TOP 5</h3>' + top5 + '</div>'
        '</div>'
    )

    n_priv_show = n_priv
    bulk = ('<button class="p" onclick="puball(' + str(n_priv_show) + ')">📢 비공개 전체 공개 (' + str(n_priv_show) + ')</button>') if n_priv_show else ""
    bar = (
        '<div class="bar2">'
        '<button class="tab on" data-f="all" onclick="filt(\'all\')">전체</button>'
        '<button class="tab" data-f="private" onclick="filt(\'private\')">🟡 비공개</button>'
        '<button class="tab" data-f="public" onclick="filt(\'public\')">🟢 공개</button>'
        '<span style="margin:0 6px;color:#555">|</span>정렬 ' + sopt("views", "조회수순") + sopt("recent", "최신순") +
        '<span class="btnbar"><button class="g" onclick="reload()">🔄 새로고침</button>' + bulk + '</span>'
        '</div>'
    )

    cards = "".join(yt_card(it, info) for it, info in rows)
    local = []
    for f in sorted(glob.glob(str(HERE / "out" / "*.mp4"))):
        nm = os.path.basename(f)
        q = urllib.parse.quote(nm)
        local.append(
            '<div class="card"><div class="meta">'
            '<div class="title" style="font-size:11.5px">' + nm.replace("<", "&lt;") + '</div>'
            '<span class="badge" style="background:#555">📁 로컬</span><div class="row">'
            '<a class="btn s" href="/video/' + q + '" target="_blank">▶</a>'
            '<button class="p" onclick="up(\'' + q + '\')">업로드</button>'
            '<button class="d" onclick="delf(\'' + q + '\')">삭제</button>'
            '</div></div></div>'
        )
    # 🎵 음악(AllThatHz) — Suno mp3 → 제목·태그·날짜·썸네일 → @allthathz 예약 업로드
    mmeta = load_music_meta()
    music = []
    for f in sorted(glob.glob(str(HERE / 'music' / '*.mp3'))):
        nm = os.path.basename(f)
        q = urllib.parse.quote(nm)
        m = mmeta.get(nm, {})
        has = os.path.exists(f[:-4] + '.mp4')
        cov = nm[:-4] + '.jpg'
        has_cov = os.path.exists(str(HERE / 'music' / cov))
        title = (m.get('title') or nm[:-4]).replace('"', '&quot;')
        tags = m.get('tags') or 'AllThatHz, AI music, AI음악, 수노, suno, 인공지능음악'
        date = m.get('date') or ''
        st = m.get('status') or ('영상✓' if has else 'mp3')
        mp4q = urllib.parse.quote(nm[:-4] + '.mp4')
        thumb_html = ''
        if has_cov:
            img = '<img class="thumb" style="height:150px;border-radius:8px;display:block" src="/music/' + urllib.parse.quote(cov) + '">'
            # 영상 있으면 썸네일 클릭=재생, 위에 ▶ 오버레이
            thumb_html = ('<a href="/music/' + mp4q + '" target="_blank" style="position:relative;display:block">' + img
                          + '<span style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);'
                            'font-size:34px;color:#fff;text-shadow:0 2px 8px #000;pointer-events:none">▶</span></a>') if has else img
        music.append(
            '<div class="card" data-mid="' + q + '" style="width:248px"><div class="meta">'
            + thumb_html
            + '<input class="mtitle" value="' + title + '" placeholder="제목" '
              'style="width:100%;background:#0e0e10;color:#eee;border:1px solid #2a2a2e;border-radius:6px;padding:5px;font-size:12px;margin:4px 0">'
            '<textarea class="mtags" style="width:100%;background:#0e0e10;color:#eee;border:1px solid #2a2a2e;border-radius:6px;padding:5px;font-size:11px;min-height:34px">' + tags + '</textarea>'
            '<div class="row" style="margin:4px 0"><input type="date" class="mdate" value="' + date + '" style="background:#0e0e10;color:#eee;border:1px solid #2a2a2e;border-radius:6px;padding:4px;font-size:12px">'
            '<span class="badge" style="background:' + ('#2a8a4a' if has else '#555') + '">' + st + '</span></div>'
            '<div class="row">'
            + ('<a class="btn g" href="/music/' + mp4q + '" target="_blank" style="text-decoration:none">▶재생</a>' if has else '')
            + '<button class="s" onclick="musicSave(this)">저장</button>'
            '<button class="g" onclick="mkvid(\'' + q + '\')">영상화</button>'
            + ('<button class="p" onclick="musicUp(this)">예약업로드</button>' if has else '')
            + '<button class="d" onclick="musicDel(\'' + q + '\')">삭제</button>'
            '</div></div></div>'
        )
    ck_set = (HERE / 'suno_cookie.txt').exists()
    music_sec = ('<h2 class="sec">🎵 음악 · AllThatHz (' + str(len(music)) + ') '
                 '<button class="p" style="font-size:12px;margin-left:8px" onclick="sunoSync()">🔄 Suno 동기화</button></h2>'
                 '<div class="bar2"><input id="sunock" placeholder="여기에 Suno 쿠키 붙여넣기 (suno.com 로그인 후 복사)" '
                 'style="flex:1;background:#0e0e10;color:#eee;border:1px solid #2a2a2e;border-radius:7px;padding:8px;font-size:12px">'
                 '<button class="tab" onclick="saveCookie()">쿠키 저장</button>'
                 '<span style="font-size:12px;color:' + ('#7fd1a0' if ck_set else '#c88') + '">'
                 + ('🟢 쿠키 등록됨' if ck_set else '⚠️ 쿠키 미등록') + '</span></div>'
                 '<div class="bar2" style="align-items:center">'
                 '<span style="font-size:12px;color:#9aa">📅 동기화 날짜</span>'
                 '<input type="date" id="sfrom" style="background:#0e0e10;color:#eee;border:1px solid #2a2a2e;border-radius:6px;padding:5px;font-size:12px">'
                 '<span style="color:#9aa">~</span>'
                 '<input type="date" id="sto" style="background:#0e0e10;color:#eee;border:1px solid #2a2a2e;border-radius:6px;padding:5px;font-size:12px">'
                 '<button class="tab" onclick="setRange(1)">오늘만</button>'
                 '<button class="tab" onclick="setRange(2)">어제+오늘</button>'
                 '<button class="tab" onclick="setRange(0)">전체</button>'
                 '<span style="font-size:11px;color:#8a93a0">비우면 어제·오늘</span></div>'
                 '<div id="syncbox" style="display:none;margin:8px 0;background:#16161a;border:1px solid #26262c;border-radius:8px;padding:10px">'
                 '<div style="background:#0e0e10;border-radius:6px;height:14px;overflow:hidden">'
                 '<div id="syncbar" style="height:100%;width:0%;background:#2f6fe0;transition:width .3s"></div></div>'
                 '<div id="synctxt" style="font-size:12px;color:#cdd;margin-top:6px">대기</div></div>'
                 '<div class="grid">' + ("".join(music) or '<div class="empty">music/ 폴더에 mp3 없음 — 쿠키 저장 후 동기화</div>') + '</div>')
    return (
        '<!doctype html><html lang="ko"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<title>쇼츠 분석·관리</title>' + CSS + '</head><body>'
        '<h1>🎬 쇼츠 분석·관리 <span style="font-size:12px;color:#8a93a0">' + sync + '</span></h1>'
        + kpis + panels + bar +
        '<div class="grid">' + (cards or '<div class="empty">영상 없음</div>') + '</div>'
        '<h2 class="sec">📁 로컬 파일 (' + str(len(local)) + ')</h2><div class="grid">' + ("".join(local) or '<div class="empty">없음</div>') + '</div>'
        + music_sec
        + JS + '</body></html>'
    )


def set_privacy(vid, status):
    yt_client().videos().update(part="status", body={"id": vid, "status": {"privacyStatus": status}}).execute()


class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, body, ct='text/html; charset=utf-8'):
        self.send_response(code)
        self.send_header('Content-Type', ct)
        self.end_headers()
        if isinstance(body, str):
            body = body.encode('utf-8')
        self.wfile.write(body)

    def do_GET(self):
        if self.path == '/' or self.path.startswith('/?'):
            qs = urllib.parse.urlparse(self.path).query
            sort = urllib.parse.parse_qs(qs).get('sort', ['views'])[0]
            try:
                body = page(sort)
            except Exception as e:
                body = '<body style="background:#111;color:#eee;font-family:sans-serif;padding:30px">렌더 오류: ' + str(e) + '<br><a style="color:#6af" href="/">새로고침</a></body>'
            self._send(200, body)
        elif self.path.startswith('/video/'):
            nm = urllib.parse.unquote(self.path[len('/video/'):])
            p = HERE / 'out' / nm
            if p.exists() and p.suffix == '.mp4':
                self._send(200, p.read_bytes(), 'video/mp4')
            else:
                self._send(404, 'no')
        elif self.path == '/sync_status':
            sp = HERE / 'music' / '.sync_status.json'
            self._send(200, sp.read_bytes() if sp.exists() else b'{"state":"idle"}', 'application/json')
        elif self.path.startswith('/music/'):
            nm = urllib.parse.unquote(self.path[len('/music/'):])
            p = HERE / 'music' / nm
            if p.exists() and p.is_file():
                ct = ('image/jpeg' if p.suffix.lower() in ('.jpg', '.jpeg', '.png')
                      else 'video/mp4' if p.suffix.lower() == '.mp4' else 'audio/mpeg')
                self._send(200, p.read_bytes(), ct)
            else:
                self._send(404, 'no')
        else:
            self._send(404, 'no')

    def do_POST(self):
        try:
            ln = int(self.headers.get('Content-Length', 0))
            d = json.loads(self.rfile.read(ln) or b'{}')
            a = d.get('action')
            env = dict(os.environ, PYTHONUTF8='1')
            if a == 'publish':
                set_privacy(d['id'], 'public')
            elif a == 'unlist':
                set_privacy(d['id'], 'unlisted')
            elif a == 'delete':
                yt_client().videos().delete(id=d['id']).execute()
            elif a == 'publish_all':
                live = live_data([str(it.get('id', '')) for it in load_pending() if it.get('id')])
                for vid, info in live.items():
                    if info['privacy'] != 'public':
                        try:
                            set_privacy(vid, 'public')
                        except Exception as e:
                            print('일괄공개 실패', vid, e)
            elif a == 'delfile':
                mp4 = HERE / 'out' / urllib.parse.unquote(d['file'])
                mp4.unlink(missing_ok=True)
                mp4.with_name(mp4.name + '.tags.json').unlink(missing_ok=True)
                mp4.with_name(mp4.name + '.link.txt').unlink(missing_ok=True)
            elif a == 'upload':
                f = urllib.parse.unquote(d['file'])
                title = os.path.splitext(f)[0]
                env['YT_PRIVACY'] = 'unlisted'
                subprocess.Popen([sys.executable, 'upload_youtube.py', str(HERE / 'out' / f), title], cwd=str(HERE), env=env)
            elif a == 'mkvid':
                f = urllib.parse.unquote(d['file'])
                base = HERE / 'music' / os.path.splitext(f)[0]
                cover = str(base) + '.jpg'
                subprocess.Popen([sys.executable, 'make_music_video.py', str(base) + '.mp3',
                                  cover if os.path.exists(cover) else '', str(base) + '.mp4'],
                                 cwd=str(HERE), env=env)
            elif a == 'suno_cookie':
                (HERE / 'suno_cookie.txt').write_text(d.get('cookie', '').strip(), encoding='utf-8')
            elif a == 'suno_sync':
                senv = dict(env)
                if d.get('from'):
                    senv['SUNO_FROM'] = d.get('from', '')
                    senv['SUNO_TO'] = d.get('to', '') or d.get('from', '')
                subprocess.Popen([sys.executable, 'suno_sync.py'], cwd=str(HERE), env=senv)
            elif a == 'music_save':
                f = urllib.parse.unquote(d['file'])
                mm = load_music_meta()
                e = mm.get(f, {})
                e.update({'title': d.get('title', ''), 'tags': d.get('tags', ''), 'date': d.get('date', '')})
                mm[f] = e
                save_music_meta(mm)
            elif a == 'music_del':
                f = urllib.parse.unquote(d['file'])
                base = HERE / 'music' / os.path.splitext(f)[0]
                for ext in ('.mp3', '.mp4', '.jpg'):
                    Path(str(base) + ext).unlink(missing_ok=True)
                mm = load_music_meta()
                mm.pop(f, None)
                save_music_meta(mm)
            elif a == 'music_up':
                f = urllib.parse.unquote(d['file'])
                base = os.path.splitext(f)[0]
                mp4 = HERE / 'music' / (base + '.mp4')
                cover = HERE / 'music' / (base + '.jpg')
                title = (d.get('title') or base)[:100]
                tags = d.get('tags') or ''
                date = d.get('date') or ''
                # @allthathz 전용 클라이언트가 있으면 그걸, 없으면 기존 client_secret.json 재사용
                # (토큰은 항상 음악 전용 — 인증 시 @allthathz 채널을 선택)
                mclient = 'music_client.json' if (HERE / 'music_client.json').exists() else 'client_secret.json'
                menv = dict(env, YT_TOPIC='music', YT_CATEGORY='10', YT_TAGS=tags,
                            YT_CLIENT_FILE=mclient, YT_TOKEN_FILE='music_token.json')
                if cover.exists():
                    menv['YT_THUMB'] = str(cover)
                if date:  # 그날 오전 9시(UTC) 예약 발행
                    menv['YT_PUBLISH_AT'] = date + 'T09:00:00Z'
                    menv['YT_PRIVACY'] = 'private'
                else:
                    menv['YT_PRIVACY'] = 'public'
                subprocess.Popen([sys.executable, 'upload_youtube.py', str(mp4), title,
                                  'AllThatHz · AI music'], cwd=str(HERE), env=menv)
                mm = load_music_meta()
                e = mm.get(f, {})
                e.update({'title': title, 'tags': tags, 'date': date, 'status': 'queued'})
                mm[f] = e
                save_music_meta(mm)
            if a in ('publish', 'unlist', 'delete', 'publish_all'):
                _CACHE['ts'] = 0.0  # 상태 변경 → 캐시 무효화(즉시 반영)
            self._send(200, 'ok')
        except Exception as e:
            self._send(500, str(e))


print('대시보드: http://localhost:' + str(PORT))
socketserver.TCPServer.allow_reuse_address = True
socketserver.TCPServer(('127.0.0.1', PORT), H).serve_forever()
