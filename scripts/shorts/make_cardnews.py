# -*- coding: utf-8 -*-
"""
쇼츠 JSON(hook/tip/cta) 하나 -> 인스타 카드뉴스(1080x1350 PNG 여러 장) 자동 생성.

디자인 다양성 = 독립 3축을 주제 해시로 조합:
  · 레이아웃  cover 6종 / tip 6종 / cta 3종  (구조 자체가 다름)
  · 모티프    배경 텍스처 5종(무지/격자/도트/대각선/링)
  · 팔레트    다크 컬러 12종
→ 주제마다 다른 톤·구조. 브랜드 골드(#FBBF24)만 공통. env로 강제: CARD_LAYOUT / CARD_MOTIF.
"""
import json, os, sys, subprocess, html, glob, hashlib, tempfile, colorsys

HERE = os.path.dirname(os.path.abspath(__file__))
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
SP = os.environ.get("SP", "")
FONTS = "file:///" + os.path.join(SP, "cardnews", "fonts").replace("\\", "/") if SP else ""
W, H = 1080, 1350

def esc(s): return html.escape(str(s))

PALETTES = [
    ("#0b1730", "#070b16", "56,120,220"), ("#06231f", "#06100e", "20,200,168"),
    ("#140f30", "#0a0714", "124,92,240"), ("#200f2a", "#100714", "200,96,222"),
    ("#260a12", "#14070a", "232,72,92"),  ("#0a2414", "#07120b", "44,200,112"),
    ("#08202b", "#060f15", "44,182,222"), ("#231a0b", "#120d06", "214,150,58"),
    ("#101a38", "#080c1a", "84,112,255"), ("#250a1b", "#130610", "240,84,150"),
    ("#221206", "#120a05", "236,120,52"), ("#0d2320", "#07110f", "80,210,150"),
]
GPOS = [(16, 14), (84, 12), (18, 82), (82, 86), (50, 8), (12, 50), (88, 48)]
NL_COVER, NL_TIP, NL_CTA, NMOTIF = 6, 6, 3, 5

def _hi(s): return int(hashlib.md5((s or "x").encode("utf-8")).hexdigest(), 16)

def palette(seed):
    h = _hi(seed); d1, d2, glow = PALETTES[h % len(PALETTES)]
    gx, gy = GPOS[(h // 13) % len(GPOS)]
    return {"d1": d1, "d2": d2, "glow": glow, "gx": gx, "gy": gy}

def recolor(htmlstr, pal):
    # 브랜드 골드(#FBBF24) 고정 → 주제별 팔레트 glow색으로 강조색 다양화(썸네일 동일화 방지)
    r, g, b = [int(x) for x in pal["glow"].split(",")]
    hh, ll, ss = colorsys.rgb_to_hls(r/255.0, g/255.0, b/255.0)
    def hx(L, S):
        cr, cg, cb = colorsys.hls_to_rgb(hh, L, min(1.0, S))
        rgb = (int(cr*255), int(cg*255), int(cb*255))
        return "#%02x%02x%02x" % rgb, rgb
    accent, arb = hx(min(0.64, max(ll, 0.57)), ss*1.05 + 0.05)   # 밝고 선명한 강조(골드처럼 팝)
    light, _ = hx(0.74, ss)                                       # 더 밝은 톤(pill 글자 등)
    ar, ag, ab = arb
    return (htmlstr.replace("#FBBF24", accent).replace("#FCD34D", light)
                   .replace("251,191,36", f"{ar},{ag},{ab}"))

def mesh(pal, strength=1.0):
    g = pal["glow"]
    return (f"radial-gradient(1050px 820px at {pal['gx']}% {pal['gy']}%, rgba({g},{0.30*strength:.2f}), transparent 60%),"
            f"radial-gradient(880px 760px at 82% 90%, rgba(251,191,36,{0.13*strength:.2f}), transparent 62%),"
            f"linear-gradient(155deg, {pal['d1']} 0%, {pal['d2']} 100%)")

def motif_layer(kind, pal):
    g = pal["glow"]
    if kind == 1:
        css = ("background-image:linear-gradient(rgba(255,255,255,.045) 1px,transparent 1px),"
               "linear-gradient(90deg,rgba(255,255,255,.045) 1px,transparent 1px);background-size:98px 98px")
    elif kind == 2:
        css = "background-image:radial-gradient(rgba(255,255,255,.06) 3px,transparent 3px);background-size:62px 62px"
    elif kind == 3:
        css = f"background-image:repeating-linear-gradient(-38deg,rgba({g},.06) 0 2px,transparent 2px 32px)"
    elif kind == 4:
        css = (f"background-image:radial-gradient(circle at 86% 10%,transparent 118px,rgba({g},.11) 119px 123px,transparent 124px),"
               f"radial-gradient(circle at 86% 10%,transparent 208px,rgba({g},.08) 209px 213px,transparent 214px),"
               f"radial-gradient(circle at 86% 10%,transparent 300px,rgba({g},.06) 301px 305px,transparent 306px)")
    else:
        return ""
    return f'<div style="position:absolute;inset:0;{css};pointer-events:none"></div>'

FONT_FACE = "".join(
    f"@font-face{{font-family:'Pretendard';font-weight:{wt};src:url('{FONTS}/Pretendard-{nm}.woff2') format('woff2')}}"
    for wt, nm in [(400,"Regular"),(500,"Medium"),(600,"SemiBold"),(700,"Bold"),(800,"ExtraBold"),(900,"Black")])

BASE = """*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1350px;overflow:hidden}
.card{width:1080px;height:1350px;position:relative;overflow:hidden;background:#0a0d14;font-family:'Pretendard',sans-serif;color:#fff;-webkit-font-smoothing:antialiased}
.bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:saturate(1.05) contrast(1.04)}
.scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(8,11,18,.55) 0%,rgba(8,11,18,.25) 26%,rgba(8,11,18,.86) 68%,rgba(6,8,14,.98) 100%)}
.scrim2{position:absolute;inset:0;background:linear-gradient(180deg,rgba(8,11,18,.82) 0%,rgba(8,11,18,.72) 45%,rgba(6,8,14,.93) 100%)}
.glow{position:absolute;left:-160px;bottom:60px;width:720px;height:720px;border-radius:50%;background:radial-gradient(circle,rgba(251,191,36,.2),transparent 62%);filter:blur(34px)}
.handle{font-size:29px;font-weight:600;opacity:.85}
.dots{display:flex;gap:12px}.dots i{width:16px;height:16px;border-radius:50%;background:rgba(255,255,255,.28)}
.dots i.on{width:46px;border-radius:8px;background:#FBBF24}
.hl{color:#FBBF24}
.swipe{display:inline-flex;align-items:center;gap:18px;font-size:34px;font-weight:700}
.arw{width:64px;height:64px;border-radius:50%;background:#FBBF24;display:flex;align-items:center;justify-content:center;flex:0 0 auto}
.pill{display:inline-flex;align-items:center;gap:13px;background:rgba(251,191,36,.15);border:1.5px solid rgba(251,191,36,.5);padding:15px 30px;border-radius:999px;font-size:31px;font-weight:700;color:#FCD34D}
.pill .d{width:15px;height:15px;border-radius:50%;background:#FBBF24;box-shadow:0 0 18px #FBBF24}
.tab{display:inline-flex;align-items:center;background:#FBBF24;color:#0a0d14;padding:14px 30px;border-radius:12px;font-size:31px;font-weight:800}
.brk{font-size:32px;font-weight:800;color:#FCD34D;letter-spacing:.02em}"""

ARW = ('<svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#0a0d14" stroke-width="2.6" '
       'stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h15M13 6l6 6-6 6"/></svg>')
SWIPE = f'<span class="swipe"><span class="arw">{ARW}</span>넘겨서 보기</span>'
HANDLE = '<span class="handle">@allthatlink</span>'

def pill_of(kind, txt):
    if kind == "tab": return f'<span class="tab">{txt}</span>'
    if kind == "brk": return f'<span class="brk">[ {txt} ]</span>'
    return f'<span class="pill"><span class="d"></span>{txt}</span>'

def dots(idx, total):
    return '<span class="dots">' + "".join(f'<i class="{"on" if i==idx else ""}"></i>' for i in range(total)) + '</span>'

def page(style, body):
    return f"<!doctype html><html><head><meta charset='utf-8'><style>{FONT_FACE}{BASE}{style}</style></head><body><div class='card'>{body}</div></body></html>"

def numsvg(num, fill="#0a0d14", size=98, fs=55):
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 {size} {size}"><text x="{size//2}" y="{size//2+2}" '
            f'text-anchor="middle" dominant-baseline="central" font-family="Pretendard" font-weight="900" font-size="{fs}" fill="{fill}">{num}</text></svg>')

# ─────────────────────────── COVER (6) ───────────────────────────
def cover(j, pal, total, bgurl, layout, motif):
    hook = next(c for c in j["cuts"] if c["kind"] == "hook")
    lines = hook["titleLines"]; hlj = hook.get("highlightLine", -1)
    h1 = "<br>".join(f'<span class="hl">{esc(l)}</span>' if i == hlj else esc(l) for i, l in enumerate(lines))
    pill = esc(hook.get("pill", j.get("topic", ""))); sub = esc(hook.get("narration", ""))
    cardbg = "" if bgurl else f".card{{background:{mesh(pal)}}}\n"
    photo = (f'<img class="bg" src="{bgurl}"><div class="scrim"></div><div class="glow"></div>' if bgurl else "")
    mo = motif_layer(motif, pal)
    L = layout % NL_COVER

    if L == 1:  # 스포트라이트(중앙)
        style = cardbg + """.hd{position:absolute;top:70px;left:0;right:0;text-align:center}
.wrap{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:96px 74px}
.pill{margin-bottom:48px}h1{font-size:110px;line-height:1.09;font-weight:900;letter-spacing:-.045em;text-shadow:0 6px 44px rgba(0,0,0,.55)}
.sub{margin-top:42px;font-size:38px;font-weight:500;line-height:1.44;opacity:.93;max-width:900px}
.foot{position:absolute;left:0;right:0;bottom:92px;display:flex;flex-direction:column;align-items:center;gap:34px}"""
        body = f'{photo}{mo}<div class="hd">{HANDLE}</div><div class="wrap">{pill_of("pill",pill)}<h1>{h1}</h1><div class="sub">{sub}</div></div><div class="foot">{SWIPE}{dots(0,total)}</div>'
        return page(style, body)

    if L == 2:  # 매거진(탭+좌측바+구분선)
        style = cardbg + """.wrap{position:absolute;inset:0;display:flex;flex-direction:column;padding:82px 78px 92px}
.top{display:flex;align-items:center;justify-content:space-between}
.mid{margin-top:70px;position:relative;padding-left:42px}
.mid:before{content:"";position:absolute;left:0;top:10px;bottom:10px;width:9px;border-radius:6px;background:#FBBF24}
h1{font-size:104px;line-height:1.1;font-weight:900;letter-spacing:-.045em;text-shadow:0 6px 44px rgba(0,0,0,.55)}
.rule{margin-top:46px;height:3px;background:linear-gradient(90deg,rgba(251,191,36,.85),rgba(251,191,36,0))}
.sub{margin-top:34px;font-size:39px;font-weight:500;line-height:1.42;opacity:.94;max-width:940px}
.foot{margin-top:auto;display:flex;align-items:center;justify-content:space-between}"""
        body = f'{photo}{mo}<div class="wrap"><div class="top">{pill_of("tab",pill)}{HANDLE}</div><div class="mid"><h1>{h1}</h1></div><div class="rule"></div><div class="sub">{sub}</div><div class="foot">{SWIPE}{dots(0,total)}</div></div>'
        return page(style, body)

    if L == 3:  # 상단 앵커(무게 반전) — 제목 위, 하단 여백
        style = cardbg + """.wrap{position:absolute;inset:0;display:flex;flex-direction:column;padding:86px 78px 92px}
.top{display:flex;align-items:center;justify-content:space-between;margin-bottom:52px}
h1{font-size:112px;line-height:1.08;font-weight:900;letter-spacing:-.045em;text-shadow:0 6px 44px rgba(0,0,0,.55)}
.sub{margin-top:36px;font-size:39px;font-weight:500;line-height:1.42;opacity:.94;max-width:920px}
.foot{margin-top:auto;display:flex;align-items:center;justify-content:space-between}"""
        body = f'{photo}{mo}<div class="wrap"><div class="top">{pill_of("pill",pill)}{HANDLE}</div><h1>{h1}</h1><div class="sub">{sub}</div><div class="foot">{SWIPE}{dots(0,total)}</div></div>'
        return page(style, body)

    if L == 4:  # 스테이트먼트 — 거대 골드 인용바 + 큰 제목
        style = cardbg + """.wrap{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:90px 78px}
.top{position:absolute;top:78px;left:78px;right:78px;display:flex;align-items:center;justify-content:space-between}
.qt{font-size:150px;line-height:.6;font-weight:900;color:#FBBF24;height:80px}
h1{margin-top:18px;font-size:120px;line-height:1.05;font-weight:900;letter-spacing:-.05em;text-shadow:0 6px 44px rgba(0,0,0,.55)}
.sub{margin-top:40px;font-size:39px;font-weight:500;line-height:1.42;opacity:.94;max-width:900px}
.foot{position:absolute;left:78px;right:78px;bottom:92px;display:flex;align-items:center;justify-content:space-between}"""
        body = f'{photo}{mo}<div class="top">{pill_of("brk",pill)}{HANDLE}</div><div class="wrap"><div class="qt">“</div><h1>{h1}</h1><div class="sub">{sub}</div></div><div class="foot">{SWIPE}{dots(0,total)}</div>'
        return page(style, body)

    if L == 5:  # 포스터 프레임 — 얇은 골드 테두리
        style = cardbg + """.frame{position:absolute;inset:40px;border:2px solid rgba(251,191,36,.45);border-radius:26px;pointer-events:none}
.wrap{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:space-between;padding:98px 92px}
.top{display:flex;align-items:center;justify-content:space-between}
.mid{margin-top:auto}h1{font-size:106px;line-height:1.08;font-weight:900;letter-spacing:-.045em;text-shadow:0 6px 44px rgba(0,0,0,.55)}
.sub{margin-top:32px;font-size:38px;font-weight:500;line-height:1.42;opacity:.94;max-width:880px}
.foot{display:flex;align-items:center;justify-content:space-between;margin-top:48px}"""
        body = f'{photo}{mo}<div class="frame"></div><div class="wrap"><div class="top">{pill_of("pill",pill)}{HANDLE}</div><div class="mid"><h1>{h1}</h1><div class="sub">{sub}</div><div class="foot">{SWIPE}{dots(0,total)}</div></div></div>'
        return page(style, body)

    # L0 — 에디토리얼(하단 앵커)
    style = cardbg + """.wrap{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:space-between;padding:82px 78px 92px}
.top{display:flex;align-items:center;justify-content:space-between}
.mid{margin-top:auto}h1{font-size:118px;line-height:1.07;font-weight:900;letter-spacing:-.045em;text-shadow:0 6px 44px rgba(0,0,0,.55)}
.sub{margin-top:34px;font-size:39px;font-weight:500;line-height:1.42;opacity:.94;max-width:920px}
.foot{display:flex;align-items:center;justify-content:space-between;margin-top:56px}"""
    body = f'{photo}{mo}<div class="wrap"><div class="top">{pill_of("pill",pill)}{HANDLE}</div><div class="mid"><h1>{h1}</h1><div class="sub">{sub}</div><div class="foot">{SWIPE}{dots(0,total)}</div></div></div>'
    return page(style, body)

# ─────────────────────────── TIP (6) ───────────────────────────
def tip(t, num, idx, total, topic, pal, bgurl, layout, motif):
    base = mesh(pal, 0.9)
    photo = (f'<img class="bg" src="{bgurl}"><div class="scrim2"></div>' if bgurl else "")
    cardbg = "" if bgurl else f".card{{background:{base}}}\n"
    mo = motif_layer(motif, pal)
    head = esc(t.get("head", "")); body_txt = esc(t.get("body", "")); kick = esc(topic); g = pal["glow"]
    L = layout % NL_TIP

    if L == 1:  # 고스트 넘버
        style = cardbg + f""".wrap{{position:absolute;inset:0;padding:86px 78px 92px;display:flex;flex-direction:column}}
.top{{display:flex;align-items:center;justify-content:space-between}}.kick{{font-size:34px;font-weight:800;color:#FCD34D}}
.ghost{{position:absolute;right:34px;bottom:64px;font-size:600px;line-height:.72;font-weight:900;color:rgba({g},.16);z-index:0}}
.mid{{margin:auto 0;position:relative;z-index:1}}h2{{font-size:98px;line-height:1.08;font-weight:900;letter-spacing:-.04em}}
h2:after{{content:"";display:block;width:132px;height:10px;border-radius:6px;background:#FBBF24;margin-top:30px}}
.note{{margin-top:46px;font-size:48px;font-weight:600;line-height:1.5;color:#eef1f7;max-width:900px}}.dots{{position:relative;z-index:1}}"""
        body = f'{photo}{mo}<div class="ghost">{num}</div><div class="wrap"><div class="top"><span class="kick">{kick}</span>{HANDLE}</div><div class="mid"><h2>{head}</h2><div class="note">{body_txt}</div></div>{dots(idx,total)}</div>'
        return page(style, body)

    if L == 2:  # 상단 컬러밴드
        style = cardbg + f""".wrap{{position:absolute;inset:0;display:flex;flex-direction:column}}
.band{{padding:84px 78px 58px;background:linear-gradient(160deg,rgba({g},.30),rgba({g},.05));border-bottom:2px solid rgba(251,191,36,.38)}}
.brow{{display:flex;align-items:center;justify-content:space-between;margin-bottom:40px}}
.num{{width:96px;height:96px;border-radius:26px;background:#FBBF24;box-shadow:0 12px 40px rgba(251,191,36,.35)}}
h2{{font-size:90px;line-height:1.1;font-weight:900;letter-spacing:-.04em}}
.body{{padding:60px 78px 90px;display:flex;flex-direction:column;flex:1}}.note{{font-size:47px;font-weight:600;line-height:1.5;color:#eef1f7}}.dots{{margin-top:auto}}"""
        body = f'{photo}{mo}<div class="wrap"><div class="band"><div class="brow"><span class="num">{numsvg(num)}</span>{HANDLE}</div><h2>{head}</h2></div><div class="body"><div class="note">{body_txt}</div><div style="height:44px"></div>{dots(idx,total)}</div></div>'
        return page(style, body)

    if L == 3:  # 좌측 넘버 레일
        style = cardbg + """.rail{position:absolute;left:0;top:0;bottom:0;width:170px;background:linear-gradient(180deg,rgba(251,191,36,.20),rgba(251,191,36,.04));border-right:3px solid rgba(251,191,36,.5);display:flex;flex-direction:column;align-items:center;padding-top:96px}
.rnum{font-size:120px;font-weight:900;color:#FBBF24;line-height:1}
.wrap{position:absolute;left:170px;right:0;top:0;bottom:0;padding:86px 74px 90px;display:flex;flex-direction:column}
.top{display:flex;align-items:center;justify-content:space-between}.kick{font-size:32px;font-weight:800;color:#FCD34D}
.mid{margin:auto 0}h2{font-size:86px;line-height:1.12;font-weight:900;letter-spacing:-.04em}
.note{margin-top:38px;font-size:46px;font-weight:600;line-height:1.5;color:#eef1f7}"""
        body = f'{photo}{mo}<div class="rail"><span class="rnum">{num}</span></div><div class="wrap"><div class="top"><span class="kick">{kick}</span>{HANDLE}</div><div class="mid"><h2>{head}</h2><div class="note">{body_txt}</div></div>{dots(idx,total)}</div>'
        return page(style, body)

    if L == 4:  # 풀카드 보더 노트 + 상단 칩
        style = cardbg + """.wrap{position:absolute;inset:0;padding:86px 78px 90px;display:flex;flex-direction:column}
.top{display:flex;align-items:center;justify-content:space-between}
.chip{display:inline-flex;align-items:center;gap:14px;background:rgba(251,191,36,.16);border:1.5px solid rgba(251,191,36,.5);border-radius:999px;padding:12px 26px 12px 12px;font-size:30px;font-weight:800;color:#FCD34D}
.chip .cn{width:56px;height:56px;border-radius:50%;background:#FBBF24;display:flex;align-items:center;justify-content:center}
.mid{margin:auto 0}h2{font-size:90px;line-height:1.1;font-weight:900;letter-spacing:-.04em}
.note{margin-top:40px;font-size:46px;font-weight:600;line-height:1.5;color:#eef1f7;background:rgba(255,255,255,.05);border:1.5px solid rgba(251,191,36,.32);border-radius:28px;padding:44px 46px}"""
        chip = f'<span class="chip"><span class="cn">{numsvg(num,size=56,fs=32)}</span>{kick}</span>'
        body = f'{photo}{mo}<div class="wrap"><div class="top">{chip}{HANDLE}</div><div class="mid"><h2>{head}</h2><div class="note">{body_txt}</div></div>{dots(idx,total)}</div>'
        return page(style, body)

    if L == 5:  # 중앙 펀치
        style = cardbg + """.wrap{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:90px 78px}
.hd{position:absolute;top:74px;left:78px;right:78px;display:flex;align-items:center;justify-content:space-between}.kick{font-size:32px;font-weight:800;color:#FCD34D}
.num{width:120px;height:120px;border-radius:30px;background:#FBBF24;box-shadow:0 14px 46px rgba(251,191,36,.4);margin-bottom:44px}
h2{font-size:92px;line-height:1.1;font-weight:900;letter-spacing:-.04em}
.note{margin-top:36px;font-size:47px;font-weight:600;line-height:1.5;color:#eef1f7;max-width:880px}
.foot{position:absolute;left:0;right:0;bottom:90px;display:flex;justify-content:center}"""
        body = f'{photo}{mo}<div class="hd"><span class="kick">{kick}</span>{HANDLE}</div><div class="wrap"><span class="num">{numsvg(num,size=120,fs=68)}</span><h2>{head}</h2><div class="note">{body_txt}</div></div><div class="foot">{dots(idx,total)}</div>'
        return page(style, body)

    # L0 — 노트박스(좌측 골드 보더)
    style = cardbg + """.wrap{position:absolute;inset:0;padding:86px 78px 90px;display:flex;flex-direction:column}
.top{display:flex;align-items:center;justify-content:space-between}.hd{display:flex;align-items:center;gap:24px}
.num{width:98px;height:98px;border-radius:26px;background:#FBBF24;box-shadow:0 12px 40px rgba(251,191,36,.35)}.kick{font-size:34px;font-weight:800;color:#FCD34D}
.mid{margin:auto 0;display:flex;flex-direction:column}h2{font-size:92px;line-height:1.1;font-weight:900;letter-spacing:-.04em}
.note{margin-top:44px;font-size:46px;font-weight:600;line-height:1.48;color:#e8ebf2;background:rgba(255,255,255,.055);border-left:6px solid #FBBF24;border-radius:0 22px 22px 0;padding:42px 44px}"""
    body = f'{photo}{mo}<div class="wrap"><div class="top"><div class="hd"><div class="num">{numsvg(num)}</div><span class="kick">{kick}</span></div>{HANDLE}</div><div class="mid"><h2>{head}</h2><div class="note">{body_txt}</div></div>{dots(idx,total)}</div>'
    return page(style, body)

# ─────────────────────────── CTA (3) ───────────────────────────
def cta(j, pal, total, bgurl, layout, motif):
    link = esc(j.get("link", "real.allthatai.kr"))
    cardbg = "" if bgurl else f".card{{background:{mesh(pal)}}}\n"
    photo = (f'<img class="bg" src="{bgurl}"><div class="scrim"></div><div class="glow"></div>' if bgurl else "")
    mo = motif_layer(motif, pal)
    save_svg = '<svg width="30" height="30" viewBox="0 0 24 24" fill="#FBBF24"><path d="M5 3h14a1 1 0 0 1 1 1v17l-8-4-8 4V4a1 1 0 0 1 1-1z"/></svg>'
    link_svg = ('<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#0a0d14" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'
                '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>')
    linkbox = f'<div class="linkbox"><span class="ic">{link_svg}</span><span class="tx"><b>{link}</b><small>프로필 링크 클릭 → 바로 확인</small></span></div>'
    save = f'<span class="save">{save_svg}저장해두세요</span>'
    L = layout % NL_CTA

    if L == 1:  # 중앙
        style = cardbg + """.top{position:absolute;top:82px;left:78px;right:78px;display:flex;align-items:center;justify-content:space-between}
.save{display:inline-flex;align-items:center;gap:14px;background:rgba(251,191,36,.16);border:1.5px solid rgba(251,191,36,.5);padding:15px 30px;border-radius:999px;font-size:31px;font-weight:800;color:#FCD34D}
.wrap{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:90px 74px}
h1{font-size:100px;line-height:1.1;font-weight:900;letter-spacing:-.04em;text-shadow:0 6px 44px rgba(0,0,0,.55)}
.sub{margin-top:30px;font-size:40px;font-weight:500;line-height:1.44;opacity:.95;max-width:880px}
.linkbox{margin-top:54px;display:inline-flex;align-items:center;gap:22px;background:rgba(255,255,255,.07);border:1.5px solid rgba(251,191,36,.4);border-radius:24px;padding:34px 40px}
.linkbox .ic{width:64px;height:64px;border-radius:18px;background:#FBBF24;display:flex;align-items:center;justify-content:center;flex:0 0 auto}
.linkbox .tx{text-align:left}.linkbox .tx b{display:block;font-size:37px;font-weight:800;color:#FBBF24}.linkbox .tx small{font-size:30px;color:#c2c8d4;font-weight:500}
.foot{position:absolute;left:0;right:0;bottom:92px;display:flex;justify-content:center}"""
        body = f'{photo}{mo}<div class="top">{save}{HANDLE}</div><div class="wrap"><h1>필요할 때<br><span class="hl">놓치지 마세요</span></h1><div class="sub">더 많은 생활·정책 꿀정보와 AI 도구는 프로필 링크에서.</div>{linkbox}</div><div class="foot">{dots(total-1,total)}</div>'
        return page(style, body)

    if L == 2:  # 매거진 CTA(좌측바)
        style = cardbg + """.top{position:absolute;top:82px;left:78px;right:78px;display:flex;align-items:center;justify-content:space-between}
.save{display:inline-flex;align-items:center;gap:14px;background:rgba(251,191,36,.16);border:1.5px solid rgba(251,191,36,.5);padding:15px 30px;border-radius:999px;font-size:31px;font-weight:800;color:#FCD34D}
.wrap{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:flex-end;padding:82px 78px 96px}
.mid{position:relative;padding-left:42px}.mid:before{content:"";position:absolute;left:0;top:8px;bottom:8px;width:9px;border-radius:6px;background:#FBBF24}
h1{font-size:94px;line-height:1.1;font-weight:900;letter-spacing:-.04em}
.sub{margin-top:28px;font-size:39px;font-weight:500;line-height:1.44;opacity:.95;max-width:900px}
.linkbox{margin-top:50px;display:flex;align-items:center;gap:22px;background:rgba(255,255,255,.07);border:1.5px solid rgba(251,191,36,.4);border-radius:24px;padding:34px 40px}
.linkbox .ic{width:64px;height:64px;border-radius:18px;background:#FBBF24;display:flex;align-items:center;justify-content:center;flex:0 0 auto}
.linkbox .tx b{display:block;font-size:37px;font-weight:800;color:#FBBF24}.linkbox .tx small{font-size:30px;color:#c2c8d4;font-weight:500}"""
        body = f'{photo}{mo}<div class="top">{save}{HANDLE}</div><div class="wrap"><div class="mid"><h1>필요할 때<br><span class="hl">놓치지 마세요</span></h1><div class="sub">더 많은 생활·정책 꿀정보와 AI 도구는 프로필 링크에서.</div></div>{linkbox}<div style="margin-top:44px">{dots(total-1,total)}</div></div>'
        return page(style, body)

    # L0 — 하단 앵커
    style = cardbg + """.wrap{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:flex-end;padding:82px 78px 96px}
.top{position:absolute;top:82px;left:78px;right:78px;display:flex;align-items:center;justify-content:space-between}
.save{display:inline-flex;align-items:center;gap:14px;background:rgba(251,191,36,.16);border:1.5px solid rgba(251,191,36,.5);padding:15px 30px;border-radius:999px;font-size:31px;font-weight:800;color:#FCD34D}
h1{font-size:96px;line-height:1.1;font-weight:900;letter-spacing:-.04em;text-shadow:0 6px 44px rgba(0,0,0,.55)}
.sub{margin-top:30px;font-size:40px;font-weight:500;line-height:1.44;opacity:.95;max-width:900px}
.linkbox{margin-top:52px;display:flex;align-items:center;gap:22px;background:rgba(255,255,255,.07);border:1.5px solid rgba(251,191,36,.4);border-radius:24px;padding:34px 40px}
.linkbox .ic{width:64px;height:64px;border-radius:18px;background:#FBBF24;display:flex;align-items:center;justify-content:center;flex:0 0 auto}
.linkbox .tx b{display:block;font-size:37px;font-weight:800;color:#FBBF24}.linkbox .tx small{font-size:30px;color:#c2c8d4;font-weight:500}"""
    body = f'{photo}{mo}<div class="wrap"><div class="top">{save}{HANDLE}</div><h1>필요할 때<br><span class="hl">놓치지 마세요</span></h1><div class="sub">더 많은 생활·정책 꿀정보와 AI 도구는 프로필 링크에서.</div>{linkbox}<div style="margin-top:46px">{dots(total-1,total)}</div></div>'
    return page(style, body)

def render(htmlstr, outpng):
    tmp = outpng.replace(".png", ".html")
    open(tmp, "w", encoding="utf-8").write(htmlstr)
    url = "file:///" + tmp.replace("\\", "/")
    udd = os.path.join(tempfile.gettempdir(), "cardnews_chrome")
    r = subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                    "--no-first-run", "--no-default-browser-check", f"--user-data-dir={udd}",
                    "--force-device-scale-factor=1", f"--window-size={W},{H}",
                    "--allow-file-access-from-files", f"--screenshot={outpng}", url],
                   capture_output=True, timeout=90)
    if not os.path.exists(outpng):
        sys.stderr.write("[cardnews] chrome screenshot 실패: " + r.stderr.decode("utf-8", "ignore")[-400:] + "\n")
    try: os.remove(tmp)
    except OSError: pass

def main():
    jpath, theme, outdir = sys.argv[1], sys.argv[2], sys.argv[3]
    bgimg = sys.argv[4] if len(sys.argv) > 4 else ""
    j = json.load(open(jpath, encoding="utf-8"))
    os.makedirs(outdir, exist_ok=True)
    seed = j.get("topic", "") or theme
    pal = palette(seed)
    layout = int(os.environ.get("CARD_LAYOUT", _hi("layout:" + seed) % 6))
    motif = int(os.environ.get("CARD_MOTIF", _hi("motif:" + seed) % NMOTIF))
    bgurl = "file:///" + os.path.abspath(bgimg).replace("\\", "/") if bgimg and os.path.exists(bgimg) else None
    tips = [c for c in j["cuts"] if c["kind"] == "tip"]
    total = 1 + len(tips) + 1
    render(recolor(cover(j, pal, total, bgurl, layout, motif), pal), os.path.join(outdir, "00_cover.png"))
    nums = ["1","2","3","4","5","6"]
    for i, t in enumerate(tips):
        render(recolor(tip(t, nums[i], i+1, total, j.get("topic",""), pal, bgurl, layout, motif), pal), os.path.join(outdir, f"{i+1:02d}_tip.png"))
    render(recolor(cta(j, pal, total, bgurl, layout, motif), pal), os.path.join(outdir, f"{len(tips)+1:02d}_cta.png"))
    print(f"OK {total} cards (layout {layout%6}, motif {motif}) -> {outdir}")

if __name__ == "__main__":
    main()
