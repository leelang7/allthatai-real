"""
profile_ref.py — 참조 hwpx 에서 '서식 지문(style profile)'을 추출한다. (모방학습 1단계)

과거 실패 교훈: 내용→역할 분류기는 문서 간 일반화가 안 됐다. 그래서 여기서는 '학습'의
대상을 바꾼다. 배우는 것은 내용이 아니라 **참조 문서가 각 역할(제목/소제목/글머리/본문/
표)에 실제로 쓴 서식 ID(styleIDRef·paraPrIDRef·charPrIDRef·borderFillIDRef)와 선행기호**다.
출력 hwpx 는 참조 문서의 header.xml 을 그대로 물려받으므로, 이 ID 를 그대로 쓰면 폰트·
자간·장평·줄간격·들여쓰기·여백이 참조 문서와 **비트 단위로 동일**해진다.

사용법:
  python profile_ref.py ref.hwpx                 # 후보 출력 + profile.json 저장
  python profile_ref.py ref.hwpx -o prof.json
"""
import sys, re, json, argparse
from collections import defaultdict
from hwpx import HwpxDocument

HH = 'http://www.hancom.co.kr/hwpml/2011/head'
HP = 'http://www.hancom.co.kr/hwpml/2011/paragraph'
NS = {'hh': HH, 'hc': 'http://www.hancom.co.kr/hwpml/2011/core'}
# 선행기호: 숫자(1. 1) (1) 1.1), 가나다, 원문자, 기호, 로마자
LEAD_RE = re.compile(r"^((?:\d+(?:\.\d+)+\.?)|(?:\d+\.)|(?:[가-힣]\.)|[①-⑳]|[ㅇo○◦◎□■※\-·•▶▷◇◆☞\U000F0000-\U000FFFFD]|(?:[IVXⅠⅡⅢⅣⅤ]+\.?)|(?:\(\d+\))|(?:\d+\)))\s+")
BULLET_LEADS = ("-", "·", "•")
HWP_PER_MM = 7200 / 25.4
KIND_RANK = {"roman": 0, "num": 1, "sym": 2, "ga": 3, "circ": 4}
# 공문서 항목 기호의 깊이(얕은 것부터). 같은 줄의 기호는 같은 깊이로 본다.
MARK_ORDER = [
    (r"^[IVXⅠⅡⅢⅣⅤ]+\.?$",), (r"^\d+\.$", r"^[■□]$"), (r"^[가-힣]\.$", r"^[○◯❍◎ㅇ]$"),
    (r"^\d+\)$", r"^[-–]$"), (r"^[가-힣]\)$", r"^[·•◦]$"), (r"^\(\d+\)$",), (r"^\([가-힣]\)$",), (r"^[①-⑳]$",),
]
GOV_MARKS = ["1.", "가.", "1)", "가)", "(1)", "(가)"]


def mark_rank(lead):
    """항목 기호의 계층 깊이. 모르는 기호는 None."""
    if not lead:
        return None
    for i, pats in enumerate(MARK_ORDER):
        if any(re.match(p, lead) for p in pats):
            return i
    return None


def lead_kind_of(lead):
    if not lead:
        return "none"
    if re.match(r"^\d+(\.\d+)+\.?$|^\d+\.$|^\d+\)$|^\(\d+\)$", lead):
        return "num"
    if re.match(r"^[가-힣]\.$", lead):
        return "ga"
    if lead in "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳":
        return "circ"
    if re.match(r"^[IVXⅠⅡⅢⅣⅤ]+\.?$", lead):
        return "roman"
    return "sym"


def index_styles(root):
    """열려 있는 문서의 header 트리에서 글꼴·글자속성·문단속성 색인을 만든다.

    ★ load(경로)는 파일을 다시 파싱해 **별개 트리**를 만든다. 편집 중인 문서에 스타일을 추가하려면
      반드시 그 문서의 트리(doc.parts.headers[0].element)로 색인해야 한다.
    """
    fonts = {f.get('id'): f.get('face') for ff in root.iter('{%s}fontface' % HH) if ff.get('lang') == 'HANGUL' for f in ff}
    cps = {c.get('id'): c for c in root.iter('{%s}charPr' % HH)}
    pps = {p.get('id'): p for p in root.iter('{%s}paraPr' % HH)}
    return fonts, cps, pps


def load(src):
    doc = HwpxDocument.open(src)
    root = doc.parts.headers[0].element
    fonts = {f.get('id'): f.get('face') for ff in root.iter('{%s}fontface' % HH) if ff.get('lang') == 'HANGUL' for f in ff}
    cps = {c.get('id'): c for c in root.iter('{%s}charPr' % HH)}
    pps = {p.get('id'): p for p in root.iter('{%s}paraPr' % HH)}
    return doc, root, fonts, cps, pps


def char_info(cps, fonts, cid):
    el = cps.get(str(cid)) if cid is not None else None
    if el is None:
        return None

    def g(t, a, d=None):
        e = el.find('hh:%s' % t, NS)
        return e.get(a) if e is not None else d
    return {"id": str(cid), "font": fonts.get(g('fontRef', 'hangul')), "size_pt": int(el.get('height', '1000')) / 100,
            "bold": el.find('hh:bold', NS) is not None, "spacing": int(g('spacing', 'hangul', '0')),
            "ratio": int(g('ratio', 'hangul', '100')), "color": el.get('textColor')}


def para_info(pps, pid):
    el = pps.get(str(pid)) if pid is not None else None
    if el is None:
        return None
    al = el.find('hh:align', NS)
    hd = el.find('hh:heading', NS)
    ls = el.find('.//hh:lineSpacing', NS)
    mg = el.find('.//hh:margin', NS)
    m = {c.tag.split('}')[1]: int(c.get('value')) for c in mg} if mg is not None else {}
    return {"id": str(pid), "align": al.get('horizontal') if al is not None else None,
            "line_spacing": int(ls.get('value')) if ls is not None else None,
            "heading": [hd.get('type'), hd.get('idRef'), hd.get('level')] if hd is not None else None,
            "left": m.get('left', 0), "indent": m.get('intent', 0), "prev": m.get('prev', 0), "next": m.get('next', 0)}


def first_run_char(p_el):
    for r in p_el.findall('{%s}run' % HP):
        if r.find('{%s}t' % HP) is not None:
            return r.get('charPrIDRef')
    return None


def sid(x):
    return None if x is None else str(x)


def page_setup(doc):
    sec = doc.sections[0].element
    pg = sec.find('.//{%s}pagePr' % HP)
    if pg is None:
        return None
    mg = pg.find('{%s}margin' % HP)

    def mm(v):
        return round(int(v) / HWP_PER_MM, 1)
    out = {"width_mm": mm(pg.get('width')), "height_mm": mm(pg.get('height')), "landscape": pg.get('landscape')}
    for k in ("left", "right", "top", "bottom", "header", "footer", "gutter"):
        out[k] = mm(mg.get(k))
    return out


def collect(doc, fonts, cps, pps):
    """(styleIDRef, paraPrIDRef, charPrIDRef) 별로 문단을 모은다. 표 안 문단은 in_table 로 구분."""
    groups = defaultdict(lambda: {"n": 0, "texts": [], "leads": defaultdict(int), "kinds": defaultdict(int), "in_table": 0, "first_idx": None})
    order = [0]

    def visit(p, in_table):
        t = (p.text or "").strip()
        if t:
            key = (sid(p.style_id_ref), sid(p.para_pr_id_ref), sid(first_run_char(p.element)))
            g = groups[key]
            g["n"] += 1
            g["in_table"] += int(in_table)
            if g["first_idx"] is None:
                g["first_idx"] = order[0]
            if len(g["texts"]) < 3:
                g["texts"].append(t[:60])
            m = LEAD_RE.match(t + " ")
            lead = m.group(1) if m else ""
            # 문단 속성 자체에 글머리표/번호가 걸린 경우(텍스트엔 기호가 없음) → 기호를 정의에서 가져오고 auto 표시
            pi = para_info(pps, p.para_pr_id_ref)
            hd = (pi or {}).get("heading")
            if hd and hd[0] == "BULLET":
                b = doc.styles.bullets.get(str(hd[1]))
                lead = (b.char if b is not None and b.char else "•")
                g["auto"] = True
            elif hd and hd[0] == "NUMBER":
                lead = "1."
                g["auto"] = True
            g["leads"][lead] += 1
            g["kinds"][lead_kind_of(lead)] += 1
            order[0] += 1
        for tb in p.tables:
            for row in tb.rows:
                for c in row.cells:
                    for cp in c.paragraphs:
                        visit(cp, True)
    for p in doc.paragraphs:
        visit(p, False)
    cands = []
    for (st, pp, cp), g in groups.items():
        kind, kcnt = max(g["kinds"].items(), key=lambda kv: kv[1])
        leads_of_kind = {l: c for l, c in g["leads"].items() if lead_kind_of(l) == kind}
        lead = max(leads_of_kind.items(), key=lambda kv: kv[1])[0] if leads_of_kind else ""
        cands.append({"style": st, "para": pp, "char": cp, "n": g["n"], "in_table": g["in_table"], "first_idx": g["first_idx"],
                      "lead": lead, "lead_kind": kind, "lead_ratio": round(kcnt / g["n"], 2), "auto": bool(g.get("auto")),
                      "char_info": char_info(cps, fonts, cp), "para_info": para_info(pps, pp), "samples": g["texts"]})
    cands.sort(key=lambda c: -c["n"])
    return cands


def border_info(root, bf_id):
    """borderFill 이 실제 테두리/배경을 갖는지 — '데이터 표'와 '배치용 투명 표'를 가르는 신호."""
    if bf_id is None:
        return {"border": 0, "fill": 0}
    for bf in root.iter('{%s}borderFill' % HH):
        if bf.get('id') != str(bf_id):
            continue
        n = 0
        for side in ("leftBorder", "rightBorder", "topBorder", "bottomBorder"):
            e = bf.find('hh:%s' % side, NS)
            if e is not None and (e.get('type') or 'NONE') != 'NONE':
                n += 1
        return {"border": n, "fill": int(bf.find('.//hc:winBrush', NS) is not None)}
    return {"border": 0, "fill": 0}


def iter_tables(paragraphs):
    """표 안의 표(양식 안에 데이터 표)까지 재귀로 순회."""
    for p in paragraphs:
        for t in p.tables:
            yield t
            for row in t.rows:
                for c in row.cells:
                    yield from iter_tables(c.paragraphs)


def tables_info(doc, cps=None, fonts=None, root=None):
    out = []
    for t in iter_tables(doc.paragraphs):
        try:
            c0 = t.cell(0, 0)
            # 본문 셀은 (1,1) 에서 뽑는다 — (1,0) 첫 열은 굵은 '구분' 열인 경우가 많아 데이터 행 서식을 오염시킨다
            c1 = t.cell(min(1, t.row_count - 1), min(1, t.column_count - 1))
        except Exception:
            continue
        p0 = c0.paragraphs[0]
        p1 = c1.paragraphs[0]
        bc = first_run_char(p1.element)
        out.append({"rows": t.row_count, "cols": t.column_count, "bf": t.element.get('borderFillIDRef'),
                    "head": {"para": sid(p0.para_pr_id_ref), "char": sid(first_run_char(p0.element)), "bf": c0.element.get('borderFillIDRef'), "style": sid(p0.style_id_ref)},
                    "body": {"para": sid(p1.para_pr_id_ref), "char": sid(bc), "bf": c1.element.get('borderFillIDRef'), "style": sid(p1.style_id_ref)},
                    "_body_ci": char_info(cps, fonts, bc) if cps else None,
                    "_head_bd": border_info(root, c0.element.get('borderFillIDRef')) if root is not None else None,
                    "_body_bd": border_info(root, c1.element.get('borderFillIDRef')) if root is not None else None})
    return out


def describe(c):
    ci = c["char_info"] or {}
    pi = c["para_info"] or {}
    return ("%s %spt%s 자간%s 장평%s %s 줄%s%% 들여%s 왼%s 앞%s lead='%s' n=%s" % (
        ci.get('font'), ci.get('size_pt'), ' B' if ci.get('bold') else '', ci.get('spacing'), ci.get('ratio'),
        pi.get('align'), pi.get('line_spacing'), pi.get('indent'), pi.get('left'), pi.get('prev'), c['lead'], c['n']))


def find_plain_para(pps, ref_pi):
    """'들여쓰기 없는' 문단속성(왼0·내어쓰기0·자동글머리 없음)을 참조 문서에서 찾는다.

    참조가 온통 기호 문단이라 순수 본문 서식이 없는 문서(정부 안내문 등)에서, 본문을
    글머리 서식으로 쓰면 둘째 줄부터 내어쓰기 때문에 어긋난다. 그때 쓸 문단속성.
    """
    ref_pi = ref_pi or {}
    best, best_key = None, None
    for pid in pps:
        pi = para_info(pps, pid)
        if not pi or pi.get("left", 0) != 0 or abs(pi.get("indent", 0)) > 300:
            continue
        hd = pi.get("heading")
        if hd and hd[0] in ("BULLET", "NUMBER", "OUTLINE"):
            continue
        key = (pi.get("align") == ref_pi.get("align"), pi.get("line_spacing") == ref_pi.get("line_spacing"), -int(pid))
        if best_key is None or key > best_key:
            best, best_key = pi, key
    return best


def assign_roles(cands, tables, pps=None):
    """휴리스틱 역할 배정. LLM/사람이 profile.json 의 roles 를 덮어쓸 수 있다.

    원칙: 문서의 '계층'은 선행기호 그룹을 (글자크기, 굵게, 빈도) 순으로 줄 세우면 드러난다.
    □/○/- 처럼 기호가 다르고 크기가 줄어드는 정부문서 관례를 그대로 이용한다.
    """
    non_table = [c for c in cands if not c["in_table"]]
    pool = non_table if sum(c["n"] for c in non_table) >= 15 else cands   # 양식(표 안에 본문) 문서는 표 안 후보도 포함

    def sz(c):
        return (c["char_info"] or {}).get("size_pt", 0) or 0

    HEAVY = ("헤드라인", "견고딕", "견명조", "태고딕", "태명조", "ExtraBold", "Black", "Bold", "Heavy")

    def font(c):
        return (c["char_info"] or {}).get("font") or ""

    def bold(c):
        return bool((c["char_info"] or {}).get("bold")) or any(h in font(c) for h in HEAVY)

    def align(c):
        return (c["para_info"] or {}).get("align")

    def white(c):
        return ((c["char_info"] or {}).get("color") or "").upper() in ("#FFFFFF", "#FFFFFE")

    def strong(c):
        return c["lead_ratio"] >= 0.6
    used = set()

    def take(c):
        used.add(id(c))
        return c

    def free(cs):
        return [c for c in cs if id(c) not in used]
    roles = {}
    _needs_indent = set()   # 참조에 해당 서식이 없어 forge 가 왼여백을 더해야 하는 역할
    # 제목: 가운데 정렬 + 큰 글자 + 초반
    tt = free([c for c in pool if align(c) == "CENTER" and sz(c) >= 16 and (c["first_idx"] or 0) < 12 and c["lead_kind"] == "none"])
    if tt:
        roles["title"] = take(max(tt, key=sz))
    # 계층 후보: 선행기호(글머리 -·• 와 ※ 제외) 그룹, 최소 2회 이상 또는 굵게
    heads = free([c for c in pool if strong(c) and c["lead_kind"] in ("num", "sym", "ga", "circ", "roman") and c["lead"] not in BULLET_LEADS + ("※",)
                  and (c["n"] >= 2 or bold(c)) and not white(c)
                  and not (c["lead_kind"] == "num" and not bold(c) and sz(c) <= 11)])   # 작은 글씨의 굵지 않은 '1.' 은 번호목록(참고문헌 등)
    # 계층 순서: 로마자 > 숫자(1., 1.1) > 기호(□ ○ ㅇ) > 가나다 > 원문자, 같은 종류면 큰 글자·굵게·앞여백 큰 것이 상위
    heads.sort(key=lambda c: (KIND_RANK.get(c["lead_kind"], 9), -sz(c), -int(bold(c)), -((c["para_info"] or {}).get("prev", 0)), -c["n"]))
    # 같은 (크기,굵게,기호종류) 는 한 계층 — 가장 많이 쓴 그룹이 대표, 나머지(6. 7. 8. 같은 1회성)는 소모 처리
    def norm_lead(c):
        k = c["lead_kind"]
        if k in ("num", "ga", "circ", "roman"):
            return k
        return "PUA" if ord(c["lead"][0]) >= 0xE000 else c["lead"]
    heads.sort(key=lambda c: -c["n"])
    rep = {}
    for c in heads:
        k = (sz(c), bold(c), norm_lead(c))
        if k in rep:
            take(c)          # 대표에 흡수
        else:
            rep[k] = c
    levels = list(rep.values())
    # 1회성(n<2) 그룹은 뒤로: 계층은 반복해서 쓰인 서식이 정의한다.
    # 순서는 '기호 자체의 깊이'(Ⅰ. > 1./□ > 가./○ > 1)/- …)를 먼저 본다 — 종류(KIND_RANK)만 보면
    # ◦ 를 □ 위에, Ⅲ. 을 2. 아래에 놓는 역전이 생긴다.
    levels.sort(key=lambda c: (int(c["n"] < 2),
                               mark_rank(c["lead"]) if mark_rank(c["lead"]) is not None else 9,
                               KIND_RANK.get(c["lead_kind"], 9), -sz(c), -int(bold(c)),
                               -((c["para_info"] or {}).get("prev", 0)), -c["n"]))
    # '-'/'·' 글머리가 아예 없는 문서(o, ㅇ 를 글머리로 쓰는 양식류): 굵지 않고 가장 많이 쓰인 기호 그룹을 계층에서 빼서 글머리로
    if not any(strong(c) and c["lead"] in BULLET_LEADS for c in pool):
        cand = [c for c in levels if c["lead_kind"] == "sym" and not bold(c)]
        if cand:
            b = max(cand, key=lambda c: c["n"])
            levels.remove(b)
            roles["bullet"] = take(b)
    for r, c in zip(("h1", "h2", "h3"), levels):
        roles[r] = take(c)
    # 번호 목록: 숫자 선행 중 계층에 안 쓰인 것 (굵지 않은 것 우선)
    nums = free([c for c in pool if strong(c) and c["lead_kind"] == "num" and not white(c)])
    if nums:
        roles["number"] = take(max(nums, key=lambda c: (not bold(c), c["n"])))
    # 비고 ※ — 참조의 ※ 는 대개 본문보다 작고 굵지 않다. 굵은 후보를 먼저 고르면 결과물에서 비고가 튄다.
    notes = free([c for c in pool if strong(c) and c["lead"] == "※"])
    if notes:
        roles["note"] = take(max(notes, key=lambda c: (not bold(c), c["n"])))
    # 글머리: - · • (빈도순). 없으면 계층에 못 든 기호 그룹(o ㅇ ○ ◦ 등, 굵지 않은 것)을 글머리로.
    buls = free([c for c in pool if strong(c) and c["lead"] in BULLET_LEADS])
    if not buls:
        buls = free([c for c in levels[3:] + [c for c in pool if strong(c) and c["lead_kind"] == "sym" and c["lead"] != "※"] if not bold(c) and not white(c)])
    buls.sort(key=lambda c: -c["n"])
    if "bullet" in roles:
        buls = [roles["bullet"]] + buls
    if buls:
        b1 = roles["bullet"] = take(buls[0])
        rest = free(buls)
        if rest:
            # 하위 글머리는 같은 글꼴·크기 중 더 깊게 들여쓴 것 — 글꼴이 다르면 본문과 크기가 어긋난다
            same = [c for c in rest if font(c) == font(b1) and abs(sz(c) - sz(b1)) < 0.5]
            pick_from = same or rest
            p1 = b1["para_info"] or {}
            # ★ 실제로 들여써지는 건 '왼여백(left)'이다. 내어쓰기(intent)가 큰 것을 하위로 고르면
            #   화면에서 상위 글머리와 같은 자리에 붙어버린다.
            deeper = [c for c in pick_from if (c["para_info"] or {}).get("left", 0) > p1.get("left", 0)]
            if deeper:
                roles["bullet2"] = take(deeper[0])
            else:
                roles["bullet2"] = b1          # 참조에 하위 글머리가 없다 → forge 가 왼여백을 더해 만든다
                _needs_indent.add("bullet2")
    # 본문: 기호 없음·굵지 않음·가운데/오른쪽 아님.
    # ★ 들여쓰기가 정상(왼여백 0 & 내어쓰기 거의 0)인 문단이 '진짜 본문'이다. 빈도만 보면 세부조항·주석 스타일을
    #   본문으로 잘못 골라 글자 크기·장평이 어긋나고 둘째 줄부터 들쭉날쭉해진다.
    bodies = free([c for c in pool if c["lead_kind"] == "none" and not bold(c)
                   and align(c) not in ("CENTER", "RIGHT", "DISTRIBUTE") and not white(c)])
    if bodies:
        bf_font = font(roles["bullet"]) if "bullet" in roles else None

        def plain(c):
            pi = c["para_info"] or {}
            return pi.get("left", 0) == 0 and abs(pi.get("indent", 0)) <= 300

        roles["body"] = take(max(bodies, key=lambda c: (
            plain(c),                                    # 1순위: 들여쓰기 정상
            bf_font is not None and font(c) == bf_font,  # 2순위: 글머리와 같은 글꼴 계열
            c["n"],                                      # 3순위: 빈도
            -(c["first_idx"] or 0))))                    # 4순위: 문서 앞쪽
    elif "bullet" in roles:
        roles["body"] = roles["bullet"]
    elif cands:
        roles["body"] = take(cands[0])
    out = {}
    for r, c in roles.items():
        auto = bool(c.get("auto")) or bool((c["para_info"] or {}).get("heading") and c["para_info"]["heading"][0] in ("BULLET", "NUMBER", "OUTLINE"))
        out[r] = {"style": c["style"] or "0", "para": c["para"] or "0", "char": c["char"],
                  "lead": c["lead"] if strong(c) else "", "lead_kind": c["lead_kind"] if strong(c) else "none",
                  "auto_heading": auto, "desc": describe(c), "sample": c["samples"][0] if c["samples"] else ""}
        if r in _needs_indent:
            out[r]["indent_mm"] = 8.0
            out[r]["desc"] += " (+왼여백 8mm 합성)"

    if tables:
        # 진짜 '데이터 표'를 고른다. 테두리가 없는 표는 양식의 '배치용 투명 표'라 서식 견본으로 쓰면 안 된다.
        def score(t):
            ci = t.get("_body_ci") or {}
            hb, bb = t.get("_head_bd") or {}, t.get("_body_bd") or {}
            return (int(t["rows"] >= 2 and t["cols"] >= 2),
                    int(bb.get("border", 0) >= 3),               # 데이터 셀에 테두리
                    int(hb.get("fill", 0) or hb.get("border", 0) >= 3),  # 머리 셀에 배경/테두리
                    int(not ci.get("bold")),
                    int(t["body"]["char"] is None or (ci.get("size_pt") or 0) <= 12),
                    int(bool(t["head"]["char"])),
                    t["rows"] * t["cols"])
        t = max(tables, key=score)
        out["table"] = {"bf": t["bf"], "head": t["head"], "body": t["body"]}
    # 본문 서식이 여전히 들여쓰기 걸린 것뿐이면(참조가 전부 기호 문단인 안내문 등) 합성한다:
    # 글자속성은 글머리 것(문서의 주력 크기), 문단속성은 참조 안의 '들여쓰기 없는' 것.
    if pps and "body" in out:
        bpi = para_info(pps, out["body"]["para"]) or {}
        if bpi.get("left", 0) != 0 or abs(bpi.get("indent", 0)) > 300:
            bl = out.get("bullet")
            newp = find_plain_para(pps, para_info(pps, bl["para"]) if bl else None)
            if newp:
                ch = (bl or out["body"])["char"]
                out["body"] = {"style": "0", "para": newp["id"], "char": ch, "lead": "", "lead_kind": "none",
                               "auto_heading": False, "synth": True, "sample": "",
                               "desc": "합성 본문 = 글머리 글자속성 cp%s + 들여쓰기 없는 문단속성 pp%s (%s 줄%s%%)"
                                       % (ch, newp["id"], newp.get("align"), newp.get("line_spacing"))}
    # 폴백: 계층은 가까운 계층으로(fallback 표시 → forge 가 제목이면 가운데 정렬), 글머리·비고·번호는 본문 서식 + 기본 기호로
    for r, chain in {"h1": ["h2", "h3", "body"], "h2": ["h3", "h1", "body"], "h3": ["h2", "h1", "body"], "title": ["h1", "body"]}.items():
        if r not in out:
            for alt in chain:
                if alt in out:
                    out[r] = dict(out[alt], desc=out[alt]["desc"] + " (%s 대체)" % alt, fallback=alt)
                    break
    for r, (lead, kind) in {"bullet": ("-", "sym"), "bullet2": ("·", "sym"), "note": ("※", "sym"), "number": ("1.", "num")}.items():
        if r not in out and "body" in out:
            src = out["bullet"] if (r != "bullet" and "bullet" in out) else out["body"]
            out[r] = dict(src, lead=lead, lead_kind=kind, auto_heading=False, desc=src["desc"] + " (기본기호 %s)" % lead)
            if r == "bullet2":                      # 상위 글머리와 같은 서식이므로 왼여백으로 계층을 만든다
                out[r]["indent_mm"] = 8.0
                out[r]["desc"] += " +왼여백 8mm"
    # ★ 계층 기호가 겹치거나(h1='1.' h2='1.') 순서가 뒤집히면(h1='◦' h2='□') 문서에서 계층이
    #   보이지 않는다. 서식(글꼴·크기)은 참조 그대로 두고 **기호만** 공문서 순서로 바로잡는다.
    #   폴백(h3 ← h2 복사)까지 끝난 뒤에 봐야 복사로 생긴 겹침도 잡힌다.
    marks = [(r, out[r].get("lead", "")) for r in ("h1", "h2", "h3") if isinstance(out.get(r), dict)]
    # 폴백(h3 ← h2 복사)으로 생긴 겹침 때문에 참조에서 실제로 뽑은 h1·h2 기호까지 바꾸면 안 된다.
    real = [(r, m) for r, m in marks if not out[r].get("fallback")]
    real_marks = [m for _, m in real if m]
    rr = [mark_rank(m) for _, m in real]
    dup = len(real_marks) != len(set(real_marks))
    inverted = any(a is not None and b is not None and a >= b for a, b in zip(rr, rr[1:]))

    def set_mark(r, mark, why):
        if out[r].get("auto_heading"):
            return                              # 문단 속성이 번호를 붙이는 경우는 건드리지 않는다
        out[r]["lead"] = mark
        out[r]["lead_kind"] = lead_kind_of(mark)
        out[r]["desc"] += "  (기호 %s → %s)" % (why, mark)

    if real and (dup or inverted):
        for i, (r, _) in enumerate(marks):      # 실제 기호끼리 어긋났다 → 전체를 표준 순서로
            set_mark(r, GOV_MARKS[i] if i < len(GOV_MARKS) else GOV_MARKS[-1], "교정")
        out["_mark_fixed"] = "겹침" if dup else "역전"
    else:
        # 실제 기호는 멀쩡하다 → 폴백으로 복사돼 상위와 겹치는 역할만 한 단계 아래 기호로 민다
        taken = set(real_marks)
        for i, (r, m) in enumerate(marks):
            if not out[r].get("fallback"):
                continue
            if m and m not in taken:
                taken.add(m)
                continue
            prev_rank = mark_rank(marks[i - 1][1]) if i > 0 else None
            nxt = next((g for g in GOV_MARKS
                        if g not in taken and (prev_rank is None or (mark_rank(g) or 9) > prev_rank)), None)
            if nxt:
                set_mark(r, nxt, "폴백 분리")
                taken.add(nxt)

    # 번호목록이 대제목과 같은 기호('1.')면 문서에서 둘이 구분되지 않는다 → 한 단계 아래 기호로
    if isinstance(out.get("number"), dict) and not out["number"].get("auto_heading"):
        head_marks = {out[r].get("lead") for r in ("h1", "h2", "h3") if isinstance(out.get(r), dict)}
        head_marks |= {"1)"}                 # forge 가 h3 분리용으로 쓰는 기호도 피한다
        if out["number"].get("lead") in head_marks:
            alt = next((g for g in ("1)", "가)", "(1)", "①") if g not in head_marks), "1)")
            out["number"]["lead"] = alt
            out["number"]["lead_kind"] = lead_kind_of(alt)
            out["number"]["desc"] += "  (기호 분리 → %s)" % alt

    # 본문 char 가 없으면(표 셀 등) 글머리 char 로
    for r, v in out.items():
        if r == "table" or not isinstance(v, dict):      # _mark_fixed 같은 표시값은 건너뛴다
            continue
        if not v.get("char"):
            v["char"] = out.get("bullet", out.get("body", {})).get("char") or "0"
    return out


def lint_roles(roles, cands, cps=None, fonts=None, pps=None):
    """역할 배정이 결과물에서 '글씨 크기·볼드·여백이 안 맞아' 보일 만한 지점을 경고로 뽑는다."""
    warns = []

    def info(role):
        v = roles.get(role)
        if not isinstance(v, dict) or role == "table":
            return {}, {}
        return (char_info(cps, fonts, v.get("char")) or {}), (para_info(pps, v.get("para")) or {})
    bci, bpi = info("body")
    if bpi and (bpi.get("left", 0) != 0 or abs(bpi.get("indent", 0)) > 300):
        warns.append("본문 문단에 왼여백 %s·내어쓰기 %s 가 걸려 있다 → 둘째 줄부터 어긋나 보인다. --roles 로 교체 권장"
                     % (bpi.get("left"), bpi.get("indent")))
    nci, _ = info("note")
    if nci.get("bold"):
        warns.append("비고(※) 서식이 굵게다 → 결과물에서 비고가 본문보다 튄다")
    if roles.get("_mark_fixed"):
        warns.append("계층 기호가 %s이라 공문서 순서(1. 가. 1))로 교정했다 — 참조 문서의 기호 체계가 불명확하다"
                     % roles["_mark_fixed"])
    sizes = {r: (info(r)[0] or {}).get("size_pt") for r in ("h1", "h2", "h3", "body", "bullet")}
    if sizes.get("h1") and sizes.get("h2") and sizes["h1"] < sizes["h2"]:
        warns.append("대제목(%spt)이 소제목(%spt)보다 작다 — 참조 문서가 실제로 그렇다면 정상(정부문서 관례)" % (sizes["h1"], sizes["h2"]))
    if sizes.get("body") and sizes.get("bullet") and abs(sizes["body"] - sizes["bullet"]) > 2:
        warns.append("본문(%spt)과 글머리(%spt) 크기 차이가 크다 → 한쪽이 잘못 잡혔을 수 있다" % (sizes["body"], sizes["bullet"]))
    t = roles.get("table") or {}
    if cps and t.get("body", {}).get("char"):
        tci = char_info(cps, fonts, t["body"]["char"]) or {}
        if tci.get("bold"):
            warns.append("표 데이터 셀 서식이 굵게다 → 표 전체가 굵게 나온다")
    return warns


def build_profile(ref, top=25):
    doc, root, fonts, cps, pps = load(ref)
    cands = collect(doc, fonts, cps, pps)
    tabs = tables_info(doc, cps, fonts, root)
    roles = assign_roles(cands, tabs, pps)
    warns = lint_roles(roles, cands, cps, fonts, pps)
    for t in tabs:
        for k in ("_body_ci", "_head_bd", "_body_bd"):
            t.pop(k, None)
    return {"source": ref, "page": page_setup(doc), "roles": roles, "warnings": warns, "candidates": cands[:top],
            "tables": tabs[:5], "bullets": {k: v.char for k, v in doc.styles.bullets.items()}}, cands


def print_profile(prof, cands, top):
    print("=== 참조: %s  page=%s" % (prof["source"], prof['page']))
    print("--- 후보 (style/para/char, n, lead, 서식) ---")
    for c in cands[:top]:
        print("  st%3s pp%3s cp%4s n=%3d%s | %s | %s" % (c['style'], c['para'], c['char'], c['n'], ' T' if c['in_table'] else '  ', describe(c), c['samples'][0][:40] if c['samples'] else ''))
    print("--- 역할 배정 ---")
    for r, v in prof["roles"].items():
        if not isinstance(v, dict):
            print("  %-8s: %s" % (r, v))
            continue
        if r == "table":
            print("  table: bf=%s head=%s body=%s" % (v['bf'], v['head'], v['body']))
        else:
            print("  %-8s: st%s pp%s cp%s lead='%s' | %s | %s" % (r, v['style'], v['para'], v['char'], v['lead'], v['desc'], v['sample'][:36]))
    for w in prof.get("warnings") or []:
        print("  [경고] %s" % w)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ref")
    ap.add_argument("-o", "--out", default="profile.json")
    ap.add_argument("--top", type=int, default=25)
    a = ap.parse_args()
    prof, cands = build_profile(a.ref, a.top)
    json.dump(prof, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print_profile(prof, cands, a.top)
    print("-> %s" % a.out)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
