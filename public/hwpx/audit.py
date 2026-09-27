"""
audit.py — 제출 직전 자동 결함 검사. "렌더 그림 보고 괜찮네" 하다가 놓친 것들을 기계가 잡는다.

이 검사기는 실제로 사용자에게 지적받은 결함을 그대로 규칙으로 만든 것이다.

  A1 칸 넘침        채운 글자가 셀 높이를 넘어 한/글에서 잘린다      ← 349자를 6mm 칸에 넣었던 사고
  A2 본문 내어쓰기   안내문용 내어쓰기가 남아 둘째 줄부터 밀린다      ← ※ 안내문 서식을 그대로 쓴 사고
  A3 점선 테두리     안내용 점선 상자에 제출 내용이 들어 있다        ← 안내 상자를 그대로 제출한 사고
  A4 예시 잔존       파란 예시 글자/문구가 안 지워졌다
  A5 빈 문단        칸 안 빈 문단이 여백을 만든다
  A6 폭 불일치       내용 상자가 제목 줄보다 좁다
  A7 글꼴 미설치     이 PC 에 없는 글꼴 → 렌더 검증이 거짓말을 한다
  A8 분량 초과       공고문이 정한 쪽수를 넘었다
  A9 스키마          XSD 검증 실패 = 한/글이 못 열 수 있다

사용법:
  python audit.py out.hwpx [--notice notice.json] [--json] [--strict]
종료코드: 0 통과 / 1 경고만 / 2 오류 있음(--strict 면 오류·경고 모두 2)
"""
import sys, os, re, json, argparse, zipfile

MM = 283.4645669       # 1mm in HWPUNIT
PT = 100               # 1pt in HWPUNIT
GUIDE_RE = re.compile(r"^[※◼▪]")
PLACEHOLDER_RE = re.compile(r"내용을?\s*입력|입력하세요|홍길동|example@|010-0{3,}|^0{2}\s*[명일월]|^NAIS$")

ERROR, WARN, INFO = "오류", "경고", "정보"


class Finding:
    def __init__(self, code, level, where, msg, hint=""):
        self.code, self.level, self.where, self.msg, self.hint = code, level, where, msg, hint

    def line(self):
        h = ("  → " + self.hint) if self.hint else ""
        return "[%s] %-3s %-22s %s%s" % (self.level, self.code, self.where, self.msg, h)

    def as_dict(self):
        return {"code": self.code, "level": self.level, "where": self.where, "message": self.msg, "hint": self.hint}


def is_blue(color):
    if not color or not re.match(r"^#[0-9A-Fa-f]{6}$", color or ""):
        return False
    r, g, b = int(color[1:3], 16), int(color[3:5], 16), int(color[5:7], 16)
    return b >= 130 and b > r + 50 and b > g + 40


def is_hint_color(color):
    """예시·안내용 글자색: 파랑 또는 회색(#808080 '글자수 제한 없음' 류)."""
    if not color or not re.match(r"^#[0-9A-Fa-f]{6}$", color or ""):
        return False
    if is_blue(color):
        return True
    r, g, b = int(color[1:3], 16), int(color[3:5], 16), int(color[5:7], 16)
    # ★ 종이 위에서 흐려 안 보이는 색도 안내용이다. 공모전 제안서의 작성 요령이 연베이지(#E3DCC1)
    #   였는데 회색만 보던 규칙이 놓쳐, 채운 본문이 그 색을 물려받아 거의 안 보였다(검사도 통과).
    if (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62:
        return True
    return abs(r - g) < 24 and abs(g - b) < 24 and r >= 0x60


MARK_ORDER = [                       # 얕은 것부터. 같은 줄의 기호는 같은 깊이로 본다.
    (r"^[IVXⅠⅡⅢⅣⅤ]+\.?$",), (r"^\d+\.$", r"^□$"), (r"^[가-힣]\.$", r"^○$", r"^ㅇ$"),
    (r"^\d+\)$", r"^-$"), (r"^[가-힣]\)$", r"^[·•]$"), (r"^\(\d+\)$",), (r"^\([가-힣]\)$",), (r"^[①-⑳]$",),
]


def mark_rank(lead):
    """공문서 항목 기호의 깊이. 모르는 기호(※ 등)는 None — 계층 비교에서 뺀다."""
    if not lead:
        return None
    for i, pats in enumerate(MARK_ORDER):
        if any(re.match(p, lead) for p in pats):
            return i
    return None


def page_texts(path):
    """rhwp 로 쪽별 텍스트. 양식 규정 '기획서 3쪽 이내'를 해당 구간만 세어 판정하는 데 쓴다."""
    import subprocess
    rh = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tools", "rhwp", "rhwp", "rhwp.exe")
    if not os.path.exists(rh):
        return []
    try:
        out = subprocess.run([rh, "export-text", os.path.abspath(path), "--json"], capture_output=True, text=True,
                             encoding="utf-8", errors="replace", timeout=180).stdout
        m = re.search(r"\{.*\}\s*$", out, re.S)
        return [p.get("text", "") for p in json.loads(m.group(0)).get("pages", [])] if m else []
    except Exception:
        return []


def section_span(pages, rule_text):
    """규정 문구가 있는 쪽부터 다음 절 제목(숫자 제목·동의서·서약서·유의사항)이 나오는 쪽 전까지의 쪽수."""
    key = re.sub(r"\s+", "", (rule_text or "").lstrip("※ ").strip())[:10]
    if not key:
        return None
    norm = [re.sub(r"\s+", "", t) for t in pages]
    start = next((i for i, t in enumerate(norm) if key in t), None)
    if start is None:
        return None
    for j in range(start + 1, len(pages)):
        head = re.sub(r"\s+", " ", pages[j]).strip()[:80]
        if re.match(r"^\d\s+\S", head) or re.search(r"동의서|서약서|유의\s*사항", head):
            return j - start
    return len(pages) - start


def border_kinds(root, bf_id):
    import profile_ref as PR
    HH = PR.HH
    for bf in root.iter('{%s}borderFill' % HH):
        if bf.get('id') != str(bf_id):
            continue
        out = set()
        for side in ("leftBorder", "rightBorder", "topBorder", "bottomBorder"):
            e = bf.find('{%s}%s' % (HH, side))
            if e is not None:
                out.add(e.get("type") or "NONE")
        return out
    return set()


def cell_texts(path):
    """(표index, 행, 열) → 텍스트. 원본과 대조해 '우리가 바꾼 칸'만 가려내기 위한 것."""
    import profile_ref as PR
    from hwpx import HwpxDocument
    out = {}
    try:
        doc = HwpxDocument.open(path)
    except Exception:
        return out
    for ti, t in enumerate(PR.iter_tables(doc.paragraphs)):
        for row in t.rows:
            for c in row.cells:
                out[(ti, c.address[0], c.address[1])] = " ".join((p.text or "") for p in c.paragraphs).strip()
    return out


def audit(path, notice=None, base=None):
    import profile_ref as PR
    from hwpx import HwpxDocument
    from hwpx.form_fit import estimate_lines
    HP = PR.HP
    doc = HwpxDocument.open(path)
    root = doc.parts.headers[0].element
    fonts, cps, pps = PR.index_styles(root)
    F = []
    base_texts = cell_texts(base) if base else None
    # 표 주소만으로 대조하면 표 순서·구조가 조금만 달라져도 '우리가 채운 칸'을 오인한다.
    # 원본 어딘가에 이미 있던 문구는 우리가 넣은 것이 아니므로 변경에서 제외한다.
    base_all = {t for t in (base_texts or {}).values() if t}
    todo = []          # 사람이 직접 입력해야 하는 칸
    cons, limits = {}, {}
    if base:
        try:
            import form_tool as FT
            binfo = FT.scan(base)
            cons = binfo.get("constraints") or {}
            # 칸별 글자 수 제한은 원본 안내문에 적혀 있다 — 채우면 지워지므로 원본에서 읽어 둔다
            for s in binfo.get("slots", []) + binfo.get("narrative", []):
                if s.get("limit"):
                    limits[(s["table"], s["row"], s["col"])] = (s["limit"], s.get("label", ""))
        except Exception:
            cons, limits = {}, {}

    # A9 스키마
    try:
        issues = list(HwpxDocument.open(path).validate().issues)
        if issues:
            F.append(Finding("A9", ERROR, "문서", "XSD 검증 실패 %d건" % len(issues), str(issues[:1])))
    except Exception as e:
        F.append(Finding("A9", ERROR, "문서", "검증 중 오류: %s" % e))

    # 본문 높이(쪽 높이 − 위아래 여백) — 셀 하나가 이걸 넘으면 한/글에서 표가 쪽을 넘어 깨진다
    pg = PR.page_setup(doc) or {}
    text_h_mm = (pg.get("height_mm") or 297) - (pg.get("top") or 15) - (pg.get("bottom") or 15) \
        - (pg.get("header") or 0) - (pg.get("footer") or 0)

    tables = list(PR.iter_tables(doc.paragraphs))
    widths = [int(t.element.find('{%s}sz' % HP).get("width"))
              for t in tables if t.element.find('{%s}sz' % HP) is not None and t.element.find('{%s}sz' % HP).get("width")]
    body_w = max(widths) if widths else None

    for ti, t in enumerate(tables):
        for row in t.rows:
            for cell in row.cells:
                paras = list(cell.paragraphs)
                text = " ".join((p.text or "") for p in paras).strip()
                if not text:
                    continue
                key = (ti, cell.address[0], cell.address[1])
                where = "표%d(%d,%d)" % key
                # 원본을 주면 '우리가 바꾼 칸'만 본다. 원본에 원래 있던 안내문·유의사항까지 잡으면 오탐이다.
                changed = True if base_texts is None else (base_texts.get(key) != text and text not in base_all)
                p0 = paras[0]
                cid = PR.first_run_char(p0.element)
                ci = PR.char_info(cps, fonts, cid) or {}
                pi = PR.para_info(pps, p0.para_pr_id_ref) or {}
                font_pt = ci.get("size_pt") or 10.0
                is_guide = bool(GUIDE_RE.match(text))
                is_options = (text.count("□") + text.count("■")) >= 2      # "□ 인공지능 □ 빅데이터" 선택지 줄
                long_body = len(text) > 60 and not is_guide and not is_options

                # A1 칸 넘침 — 셀 여백을 포함해 비교하고, 줄 추정이 보수적이므로 15% 여유를 준다
                mg = cell.element.find('{%s}cellMargin' % HP)
                ml = int(mg.get("left", 510)) if mg is not None else 510
                mr = int(mg.get("right", 510)) if mg is not None else 510
                mt = int(mg.get("top", 141)) if mg is not None else 141
                mb = int(mg.get("bottom", 141)) if mg is not None else 141
                avail = max(1000, (cell.width or 30000) - ml - mr)
                lines = sum(max(1, estimate_lines(c, avail, font_pt)) for c in text.split("\n"))
                need = lines * font_pt * PT * ((pi.get("line_spacing") or 160) / 100.0) + mt + mb
                # 양식 채우기(원본 비교 있음)면 모든 칸, 생성 문서면 긴 본문 칸만 — 짧은 데이터 셀은 한/글이 행을 자동으로 늘린다
                if changed and cell.height and need > cell.height * 1.15 and (base_texts is not None or long_body):
                    F.append(Finding("A1", ERROR, where,
                                     "칸 넘침: 글 %d자에 %d줄 필요(%.0fmm)인데 칸 높이 %.0fmm"
                                     % (len(text), lines, need / MM, cell.height / MM),
                                     "채운 뒤 셀 높이를 다시 계산하라"))

                # A2 본문 내어쓰기
                if changed and long_body and (pi.get("indent") or 0) < -300:
                    F.append(Finding("A2", ERROR, where,
                                     "본문에 내어쓰기 %.1fmm — 둘째 줄부터 밀린다" % ((pi.get("indent") or 0) / MM),
                                     "안내문 서식이다. 들여쓰기를 0 으로"))

                # A10 양식 규정 위반 — 양식이 스스로 정한 글자 크기·줄간격
                if changed and long_body and cons:
                    if cons.get("font_pt") and abs(font_pt - cons["font_pt"]) > 0.5:
                        F.append(Finding("A10", ERROR, where,
                                         "글자 %gpt ≠ 양식 규정 %gpt" % (font_pt, cons["font_pt"]),
                                         cons.get("_font_rule", "")[:60]))
                    ls_now = pi.get("line_spacing") or 0
                    if cons.get("line_spacing") and ls_now > cons["line_spacing"] + 1:
                        F.append(Finding("A10", ERROR, where,
                                         "줄간격 %d%% > 양식 규정 %d%%" % (ls_now, cons["line_spacing"])))

                # A12 서술형 본문이 가운데 정렬 — 힌트 문구 서식을 물려받으면 글이 칸 한가운데 뜬다
                if changed and long_body:
                    sub = cell.element.find('{%s}subList' % HP)
                    va = sub.get("vertAlign") if sub is not None else None
                    if pi.get("align") in ("CENTER", "RIGHT") or va == "CENTER":
                        F.append(Finding("A12", ERROR, where, "본문이 가운데 정렬(문단 %s / 세로 %s)" % (pi.get("align"), va),
                                         "양쪽 정렬·위 맞춤으로"))

                # A16 칸별 글자 수 제한 위반 — 양식이 '20자 이내' 라고 적어 둔 칸
                if changed and key in limits:
                    lim, lab = limits[key]
                    if len(text) > lim:
                        F.append(Finding("A16", ERROR, where,
                                         "글자 %d자 > 양식 제한 %d자 (%s)" % (len(text), lim, lab[:16]),
                                         "그 칸 안내문에 적힌 제한이다"))

                # A15 한 칸이 본문 높이를 넘음 — 표가 쪽을 넘어가며 깨진다
                if changed and cell.height and (cell.height / MM) > text_h_mm:
                    F.append(Finding("A15", ERROR, where,
                                     "칸 높이 %.0fmm > 본문 높이 %.0fmm — 표가 쪽을 넘어 깨진다"
                                     % (cell.height / MM, text_h_mm), "내용을 줄이거나 항목을 나눠라"))

                # A13 줄간격 100% 이하의 본문 — 힌트 문단 서식을 물려받아 빽빽하다
                if changed and long_body and 0 < (pi.get("line_spacing") or 0) < 120:
                    F.append(Finding("A13", WARN, where, "본문 줄간격 %d%% — 빽빽하다" % pi.get("line_spacing"),
                                     "160% 정도로 (양식 규정이 있으면 그 값)"))

                # A3 점선 상자에 본문
                if changed and long_body:
                    kinds = border_kinds(root, cell.element.get("borderFillIDRef"))
                    if kinds and kinds - {"NONE"} and all(k in ("DASH", "DOT", "DASH_DOT", "NONE") for k in kinds if k != "NONE"):
                        F.append(Finding("A3", WARN, where, "안내용 점선 테두리에 제출 내용이 들어 있다",
                                         "실선으로 바꾸거나 테두리를 없애라"))

                # A4 예시 잔존 — 우리가 채운 칸에 파란색이 남았으면 오류,
                #    손대지 않은 예시 칸은 '사람이 직접 입력할 항목'이므로 할 일 목록으로만 알린다
                blue = is_hint_color(ci.get("color")) and not is_guide
                ph = bool(PLACEHOLDER_RE.search(text))
                # 생성 문서(원본 없음)에서는 표 머리글처럼 짧은 회색 글자가 정상이므로 긴 글만 본다
                if changed and blue and (base_texts is not None or len(text) > 20):
                    F.append(Finding("A4", ERROR, where, "채운 글자가 예시 색(%s) 그대로다: '%s'" % (ci.get("color"), text[:24]),
                                     "검정으로 바꿔라"))
                elif (blue or ph) and not changed:
                    todo.append("%s %s" % (where, text[:30]))

                # A5 빈 문단
                empties = sum(1 for p in paras[1:] if not (p.text or "").strip())
                if changed and empties and long_body:
                    F.append(Finding("A5", WARN, where, "칸 안 빈 문단 %d개 — 아래 여백이 생긴다" % empties))

                # A6 폭 불일치 (서술형 1×1 상자만)
                if changed and long_body and body_w and t.row_count == 1 and t.column_count == 1:
                    tw = t.element.find('{%s}sz' % HP)
                    if tw is not None and tw.get("width") and int(tw.get("width")) < body_w * 0.95:
                        F.append(Finding("A6", WARN, where,
                                         "내용 상자 폭 %.0fmm < 본문 폭 %.0fmm" % (int(tw.get("width")) / MM, body_w / MM),
                                         "제목 줄과 폭을 맞춰라"))

    # A7 글꼴
    try:
        import verify as V
        miss, used = V.missing_fonts(path)
        if miss:
            F.append(Finding("A7", INFO, "문서", "미설치 글꼴: %s" % ", ".join(miss),
                             "파일은 정확하나 렌더 이미지는 대체 글꼴로 보인다"))
    except Exception:
        pass

    # A8 분량 — 공고문 제한은 오류, 양식 안 규정은 해당 부분(기획서 등) 기준일 수 있어 정보로만
    n_pages = None
    if notice and (notice.get("page_limits") or []):
        lim = notice["page_limits"][0]
        n_pages = page_count(path)
        if n_pages and n_pages > lim:
            F.append(Finding("A8", ERROR, "문서", "분량 %d쪽 > 공고문 제한 %d쪽" % (n_pages, lim), "내용을 줄여라"))
    if cons.get("page_limit"):
        pages = page_texts(path)
        span = section_span(pages, cons.get("_page_rule", ""))
        if span is not None:
            if span > cons["page_limit"]:
                F.append(Finding("A8", ERROR, "문서", "규정 구간 %d쪽 > 양식 규정 %d쪽 이내" % (span, cons["page_limit"]),
                                 cons.get("_page_rule", "")[:60]))
            else:
                F.append(Finding("A8", INFO, "문서", "규정 구간 %d쪽 ≤ 양식 규정 %d쪽 (전체 %d쪽)"
                                 % (span, cons["page_limit"], len(pages))))
        else:
            n_pages = n_pages or page_count(path)
            F.append(Finding("A8", INFO, "문서", "양식 규정 %d쪽 이내 (문서 전체 %s쪽) — 구간을 못 찾아 직접 확인"
                             % (cons["page_limit"], n_pages if n_pages else "?")))

    # ---- 자유 서술 문서(표 밖 본문) 검사: 양식이 아니라 forge 로 만든 문서에 해당 ----
    if base is None:
        import layout as L
        levels = []           # (기호 깊이 순위, 첫 줄 위치 mm)
        for i, p in enumerate(doc.paragraphs):
            text = (p.text or "").strip()
            if not text or p.tables:
                continue
            cid = PR.first_run_char(p.element)
            ci = PR.char_info(cps, fonts, cid) or {}
            pi = PR.para_info(pps, p.para_pr_id_ref) or {}
            where = "문단%d" % i
            m = PR.LEAD_RE.match(text + " ")
            lead = m.group(1) if m else ""
            # ★ 자동 글머리표로 붙는 기호는 본문 텍스트에 없다 — 문단속성에서 읽어야 한다.
            #   이걸 빼먹어서 h2·h3 가 같은 '❍' 인 문서가 검사를 통과했다.
            if not lead:
                hd = (pi or {}).get("heading")
                if hd and (hd[0] or "NONE") == "BULLET":
                    b = doc.styles.bullets.get(str(hd[1]))
                    lead = (getattr(b, "char", None) or "•") if b is not None else "•"
                elif hd and (hd[0] or "NONE") == "NUMBER":
                    lead = "1."
            kind = PR.lead_kind_of(lead)
            long_body = len(text) > 60 and not lead
            # 기호 없는 본문에 내어쓰기가 있으면 둘째 줄부터 밀린다 (기호 문단의 내어쓰기는 의도된 것)
            if long_body and (pi.get("indent") or 0) < -300:
                F.append(Finding("A2", ERROR, where, "본문에 내어쓰기 %.1fmm" % ((pi.get("indent") or 0) / MM), text[:30]))
            if len(text) > 20 and is_hint_color(ci.get("color")):
                F.append(Finding("A4", WARN, where, "예시·안내 색 글자: '%s'" % text[:24]))
            rank = mark_rank(lead)
            if rank is not None:
                first = max(0, (pi.get("left") or 0) + (pi.get("indent") or 0)) / MM
                levels.append((rank, first, text[:20]))
        # A17 계층 기호 겹침: 서로 다른 깊이인데 같은 기호를 쓰면 문서에서 계층이 보이지 않는다.
        #    (같은 기호가 같은 들여쓰기면 정상 — 같은 계층의 항목들이다)
        depth_of = {}
        for rank, first, sample in levels:
            depth_of.setdefault(rank, set()).add(round(first, 1))
        seen_mark = {}
        for rank, first, sample in levels:
            m = PR.LEAD_RE.match(sample + " ")
            lead = m.group(1) if m else ""
            # 글머리(- · •)는 같은 기호를 들여쓰기로 구분해 쓰는 게 공문서 관례다 → 겹침으로 보지 않는다
            if not lead or lead in ("-", "·", "•", "–"):
                continue
            prev = seen_mark.get(lead)
            if prev is not None and abs(prev - first) > 1.0:
                F.append(Finding("A17", WARN, "문서",
                                 "같은 기호 '%s' 가 서로 다른 계층에 쓰였다(%.1fmm, %.1fmm)" % (lead, prev, first),
                                 "대제목과 소제목이 구분되지 않는다"))
                break
            seen_mark.setdefault(lead, first)

        # A11 계층 역전: 공문서 기호 순서(1. 가. 1) 가) (1) ① / □ ○ - ·)에서 하위가 상위보다 왼쪽이면 뒤집혀 보인다
        by_rank = {}
        for rank, first, sample in levels:
            by_rank.setdefault(rank, []).append(first)
        ranks = sorted(by_rank)
        for a_, b_ in zip(ranks, ranks[1:]):
            shallow = sum(by_rank[a_]) / len(by_rank[a_])
            deep = sum(by_rank[b_]) / len(by_rank[b_])
            if deep + 0.3 < shallow:
                F.append(Finding("A11", WARN, "문서", "계층 들여쓰기 역전: 하위 기호(%.1fmm)가 상위 기호(%.1fmm)보다 왼쪽" % (deep, shallow),
                                 "--indent gov 로 다시 만들거나 profile 의 역할 배정을 확인"))
                break
    # A20 표가 본문 폭을 넘음 — 오른쪽이 쪽 경계 밖으로 삐져나간다
    text_w_mm = (pg.get("width_mm") or 210) - (pg.get("left") or 20) - (pg.get("right") or 20)
    for ti, t in enumerate(tables):
        sz = t.element.find('{%s}sz' % HP)
        w = int(sz.get("width")) if sz is not None and sz.get("width") else None
        if not w:
            continue
        if base_texts is None and w / MM > text_w_mm + 1:
            F.append(Finding("A20", ERROR, "표%d" % ti, "표 폭 %.0fmm > 본문 폭 %.0fmm — 쪽 밖으로 나간다"
                             % (w / MM, text_w_mm), "표 폭을 본문 폭에 맞춰라"))

    # A18 표 셀에 자동 글머리표 — 표 데이터마다 '•' 가 붙는다.
    #    양식은 원본 구조를 보존하는 게 목적이므로 '우리가 채운 칸'만 본다.
    for ti, t in enumerate(tables):
        hit = None
        for row in t.rows:
            for cell in row.cells:
                if base_texts is not None:
                    k = (ti, cell.address[0], cell.address[1])
                    cur = " ".join((p.text or "") for p in cell.paragraphs).strip()
                    if base_texts.get(k) == cur:
                        continue
                for p in cell.paragraphs:
                    if not (p.text or "").strip():
                        continue
                    pi = PR.para_info(pps, p.para_pr_id_ref) or {}
                    hd = pi.get("heading")
                    if hd and (hd[0] or "NONE") in ("BULLET", "NUMBER"):
                        hit = "표%d(%d,%d)" % (ti, cell.address[0], cell.address[1])
                        break
                if hit:
                    break
            if hit:
                break
        if hit:
            F.append(Finding("A18", ERROR, hit, "표 셀에 자동 글머리표가 걸려 있다 — 표 데이터마다 기호가 붙는다",
                             "셀 문단속성의 heading 을 NONE 으로"))

    # A19 머리말·꼬리말에 참조 문서 내용이 남음 (생성 문서에서만 — 양식은 원래 있는 게 정상)
    if base_texts is None:
        for tag in ("header", "footer"):
            for e in doc.sections[0].element.iter('{%s}%s' % (HP, tag)):
                txt = " ".join((x.text or "") for x in e.iter('{%s}t' % HP)).strip()
                if len(re.sub(r"[\s\-–—]", "", txt)) >= 4:
                    F.append(Finding("A19", ERROR, tag, "머리말/꼬리말에 참조 문서 내용이 남아 있다: '%s'" % txt[:34],
                                     "남의 대회·기관 이름이 제출본에 박힌다"))
                    break

    # A14 같은 값 중복 기입 — 데이터 표의 여러 칸을 같은 값으로 덮어쓴 사고를 잡는다
    if base_texts is not None:
        from collections import Counter
        vals = Counter()
        for ti, t in enumerate(tables):
            for row in t.rows:
                for cell in row.cells:
                    txt = " ".join((p.text or "") for p in cell.paragraphs).strip()
                    key = (ti, cell.address[0], cell.address[1])
                    if len(txt) >= 4 and base_texts.get(key) != txt:
                        vals[txt] += 1
        for v, n in vals.most_common(3):
            if n >= 4:
                F.append(Finding("A14", ERROR, "문서", "같은 값이 %d칸에 채워졌다: '%s'" % (n, v[:26]),
                                 "표 열 이름을 라벨로 오인했을 수 있다"))
    for t in todo[:12]:
        F.append(Finding("TODO", INFO, "직접입력", t))
    return F


def page_count(path):
    """rhwp 로 실제 쪽수를 센다(없으면 None)."""
    import subprocess
    rh = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tools", "rhwp", "rhwp", "rhwp.exe")
    if not os.path.exists(rh):
        return None
    try:
        out = subprocess.run([rh, "explain", os.path.abspath(path)], capture_output=True, text=True,
                             encoding="utf-8", errors="replace", timeout=120).stdout
        m = re.search(r"(\d+)\s*쪽", out)
        return int(m.group(1)) if m else None
    except Exception:
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("hwpx")
    ap.add_argument("--base", default=None, help="원본 양식 — 바뀐 칸만 검사(오탐 제거)")
    ap.add_argument("--notice", default=None, help="analyze_notice.py 결과 JSON (분량 제한 검사)")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--strict", action="store_true", help="경고도 실패로 취급")
    a = ap.parse_args()
    notice = json.load(open(a.notice, encoding="utf-8")) if a.notice and os.path.exists(a.notice) else None
    F = audit(a.hwpx, notice, a.base)
    errs = [f for f in F if f.level == ERROR]
    warns = [f for f in F if f.level == WARN]
    if a.json:
        print(json.dumps([f.as_dict() for f in F], ensure_ascii=False, indent=1))
    else:
        print("=== 제출 전 검사: %s ===" % os.path.basename(a.hwpx))
        if not F:
            print("  결함 없음")
        for f in F:
            print("  " + f.line())
        print("  요약: 오류 %d · 경고 %d · 정보 %d" % (len(errs), len(warns), len(F) - len(errs) - len(warns)))
    if errs or (a.strict and warns):
        return 2
    return 1 if warns else 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main())
