"""
form_tool.py — 제출 양식(.hwpx)의 '채울 칸'을 스스로 찾아내고, 값을 채워 넣는다.

공고문이 요구하는 서식이 별도 파일로 오는 경우(참가신청서·기획서 양식 등)가 대부분이다.
그 양식은 자유 서술이 아니라 **표의 빈칸**이므로, 문서를 새로 만들면 안 되고 원본을 채워야 한다.

채울 칸을 찾는 신호:
  · 예시 글자색이 파란 계열 — 양식이 "파란색 예시는 지우고 입력" 이라고 안내하는 관행
  · 예시 문구 자체 — "내용을 입력하세요", "홍길동", "example@", "00명", "010-0000-0000"
  · 라벨 셀 오른쪽의 빈 칸
  · 안내문(※ …)이 든 큰 칸 — 서술형 항목의 본문 자리

사용법:
  python form_tool.py scan 양식.hwpx -o form.json      채울 칸 목록 뽑기
  python form_tool.py fill 양식.hwpx answers.json out.hwpx
     answers.json = {"주제명": "...", "1) 연구 문제 및 제안 배경": "...", ...}
"""
import sys, os, re, json, argparse
from hwpx import HwpxDocument
import profile_ref as PR

BLUE_RE = re.compile(r"^#(0{2}[0-9A-Fa-f]{2}[89A-Fa-f][0-9A-Fa-f]|[0-9A-Fa-f]{2}[0-9A-Fa-f]{2}[C-Fc-f][0-9A-Fa-f])$")
PLACEHOLDER_RE = re.compile(r"내용을?\s*입력|입력하세요|예\s*시|^예\s*[)\]]|홍길동|example@|@nst\.re\.kr|010-0{3,}|"
                            r"^0{2}\s*[명일월]|^\d{2}\.\s*\d{2}\.\s*\d{2}\.$|^NAIS$|^팀명$|^0+$|"
                            r"^\d+\s*자\s*이내$|^[0-9]{4}\.[0-9]{2}\s*~|^YYYY|^0000|"
                            r"^[○◯●o]{2,}$|^[-–—_]{3,}$|^[XxＸ]{2,}$|^(?:[·•‧ㆍ]\s*){3,}")     # ○○○, · · · 같은 자리표시
GUIDE_RE = re.compile(r"^[※◼▪▶►◈☞◆]")           # 안내 기호로 시작하면 라벨이 아니라 안내문이다
# 안내문이 괄호 속에 예를 들어 보여 주는 것 — "(예시: 창업경진대회_심평팀_홍길동)"
EXAMPLE_PAREN_RE = re.compile(r"[(（]\s*(?:예시|예)\s*[:：)][^)）]*[)）]?")


def is_placeholder(txt):
    """칸의 글이 '지우고 새로 쓰라는 예시'인지.

    ★ 긴 안내문이 괄호로 예를 드는 것은 예시 칸이 아니다. 유의사항 표의
      "모든 서류는 PDF로 … 파일명 (예시: 창업경진대회_심평팀_홍길동)" 에서 '예시'·'홍길동'
      이 걸려 안내문을 지우고 본문을 채운 사고가 있었다. 괄호 속 예시를 걷어 낸 뒤에도
      예시 표지가 남아 있을 때만 예시 칸으로 본다. 짧은 칸('홍길동')은 그대로 예시다.
    """
    if not txt:
        return False
    if len(txt) > 40:
        txt = EXAMPLE_PAREN_RE.sub(" ", txt)
    return bool(PLACEHOLDER_RE.search(txt))
HINT_RE = re.compile(r"제한\s*없음|첨부\s*가능|자유롭게|기술하|작성하|입력")
# 답 칸 안의 작성 요령은 글머리 기호로 시작한다('❍ 아이디어의 창안 동기…'). 체크박스(□☐)는 뺀다.
ANSWER_GUIDE_RE = re.compile(r"^[❍○◦●•·\-–\*※▶►◼▪☞◆◈]")
# 작성 요령에는 지시 동사가 있다. 기호만 보고 판단하면 공고 본문('· 민간 클라우드 제공')과
# 심사 기준('• 공공데이터가 유의미하게 사용되었는가?')까지 답 칸으로 잡는다.
INSTRUCT_RE = re.compile(r"작성|기재|기술|서술|제시|설명|입력|기입|명시|적어|적을|포함하여|첨부")
# 문장 속 빈칸: 글자 사이 공백 3칸 이상, 또는 ':' 뒤가 비었거나 공백 2칸 이상('전화번호:     -')
# 빈칸을 '명시적으로' 표시한 꼴만 — 공백 3칸 기준은 이미 쓴 본문의 우연한 공백까지 잡았다.
#   ':' 뒤가 빈 것  /  괄호 안이 빈 것 '(    )종'  /  단위 앞이 빈 것 '20   학년도', '년    월    일'
TEMPLATE_BLANK_RE = re.compile(
    r"[:：](?: {2,}|\s*$)"
    r"|[(（][^)）\w]{0,2} {3,}[)）]"
    r"|(?:^|\S) {2,}(?:년|월|일|학년도|학기|학년|학점|종|부|명|원|세|호|시|분)(?=\s|$|[ ,.)(])"
)
# 빈칸 바로 뒤에 오는 단서 — 단위나 닫는 기호
BLANK_AFTER_RE = re.compile(r"^(?:년|월|일|학년도|학기|학년|학점|종|부|명|원|세|호|시|분|개|회|건|점|[)）\-~～/])")
TEMPLATE_SKIP_RE =re.compile(r"^\s*(?:[•ㆍ·∙\-–❍○◦※▶►◆◈☞]|[①-⑳]|\d{1,2}[.)]\s)")   # 안내문·번호 목록
CHECKBOX_RE = re.compile(r"[□■☐☑☒▢✓✔]")
GENERIC_LABEL_RE =re.compile(r"^[◈※▶■□\s]*(작성\s*내용|세부\s*내용|내\s*용|작성\s*란|기재\s*내용)\s*$")
# 칸 안에 그림·도형·안쪽 표가 있으면 덮어쓰면 안 된다(작성본의 시연 화면 캡처, 안내문 1×1 표를 품은 칸)
OBJECT_TAGS = {"tbl", "pic", "container", "ole", "rect", "ellipse", "line", "arc", "polygon", "curve", "equation", "textart"}
RULE_FONT_RE = re.compile(r"(\d{1,2}(?:\.\d)?)\s*(?:pt|포인트|호)")
RULE_LS_RE = re.compile(r"줄\s*간격\s*(\d{2,3})\s*%")
RULE_PAGE_RE = re.compile(r"(\d{1,3})\s*(?:쪽|페이지|장|page|p(?!t))\s*(?:이내|이하|내외)", re.I)   # '최대 5page 이내' 도
BIG_BOX_MM = 25
LIMIT_RE = re.compile(r"(\d{1,4})\s*(?:자|글자|字)\s*(?:이내|이하|내외|까지)")


def find_limit(*texts):
    """'20자 이내', '300자 이내 작성' 같은 칸별 글자 수 제한을 읽는다.

    ★ 안내문에 적힌 이 제한을 아무도 안 보고 있었다 — 20자 칸에 30자를 넣어 규정 위반인 채로
      '제출 가능' 판정이 났다.
    """
    for t in texts:
        m = LIMIT_RE.search(re.sub(r"\s+", " ", t or ""))
        if m:
            return int(m.group(1))
    return None


def find_constraints(doc, tables):
    """양식이 스스로 정한 규정을 읽는다 — '글자 크기 11pt, 고딕폰트, 줄간격 160% 이내, 3쪽 이내'.

    ★ 안내문에서 물려받은 9pt 로 채워 놓고 넘어갔던 사고의 재발 방지. 규정은 본문 문단이나
      표 셀 어디에든 ※ 로 적혀 있으므로 문서 전체를 훑는다.
    """
    lines = [(p.text or "") for p in doc.paragraphs]
    for t in tables:
        for row in t.rows:
            for c in row.cells:
                lines.append(" ".join((p.text or "") for p in c.paragraphs))
    out = {}
    for line in lines:
        s = re.sub(r"\s+", " ", line).strip()
        if not s or not re.search(r"글자|폰트|글꼴|줄 ?간격|쪽|페이지|분량", s):
            continue
        m = RULE_FONT_RE.search(s)
        if m and "font_pt" not in out and re.search(r"글자|폰트|글꼴", s):
            out["font_pt"] = float(m.group(1))
            out["_font_rule"] = s[:100]
        m = RULE_LS_RE.search(s)
        if m and "line_spacing" not in out:
            out["line_spacing"] = int(m.group(1))
        m = RULE_PAGE_RE.search(s)
        if m and "page_limit" not in out:
            out["page_limit"] = int(m.group(1))
            out["_page_rule"] = s[:100]
        if "font_family" not in out:
            if re.search(r"고딕", s) and re.search(r"글자|폰트|글꼴", s):
                out["font_family"] = "고딕"
            elif re.search(r"명조|바탕", s) and re.search(r"글자|폰트|글꼴", s):
                out["font_family"] = "명조"
    return out


def is_blue(color):
    if not color or color == "none":
        return False
    c = color.upper()
    if not re.match(r"^#[0-9A-F]{6}$", c):
        return False
    r, g, b = int(c[1:3], 16), int(c[3:5], 16), int(c[5:7], 16)
    return b >= 130 and b > r + 50 and b > g + 40


FIELD_LABEL = re.compile(
    r"^(성\s*명|이\s*름|팀\s*명|단체명|소\s*속|학\s*교|학\s*과|직\s*위|직\s*책|생년월일|연락처|전화|휴대|이메일|메일|주\s*소|"
    r"신청자|대표자|참가자|응모|분\s*야|주\s*제|제\s*목|과제명|사업명|서비스명|기\s*간|일\s*자|날\s*짜|금\s*액|예\s*산|"
    r"인원|구\s*분|내\s*용|비\s*고|목\s*적|배\s*경|개\s*요|계\s*획|효\s*과|방\s*안|현\s*황|서\s*명)")
SHADED = {}


def cell_shaded(root, cell):
    """셀에 배경(음영)이 있나 — 양식의 '라벨 칸'은 대개 음영이 깔려 있다."""
    bf = cell.element.get("borderFillIDRef")
    if bf is None:
        return False
    if bf in SHADED:
        return SHADED[bf]
    val = False
    for e in root.iter('{%s}borderFill' % HH):
        if e.get("id") == str(bf):
            wb = e.find('.//{%s}winBrush' % 'http://www.hancom.co.kr/hwpml/2011/core')
            face = (wb.get("faceColor") if wb is not None else "") or ""
            val = bool(face) and face.lower() not in ("none", "#ffffff")
            break
    SHADED[bf] = val
    return val


def cell_color(doc, cps, fonts, cell):
    for p in cell.paragraphs:
        cid = PR.first_run_char(p.element)
        ci = PR.char_info(cps, fonts, cid) or {}
        if ci.get("color"):
            return ci["color"]
    return None


def scan(path):
    doc = HwpxDocument.open(path)
    _, root, fonts, cps, pps = PR.load(path)
    SHADED.clear()
    slots, guides = [], []
    tables = list(PR.iter_tables(doc.paragraphs))
    for ti, t in enumerate(tables):
        grid = {}
        for row in t.rows:
            for c in row.cells:
                txt = " ".join((p.text or "").strip() for p in c.paragraphs).strip()
                grid[c.address] = (c, txt)
        for (r, cidx), (cell, txt) in sorted(grid.items()):
            color = cell_color(doc, cps, fonts, cell)
            blue = is_blue(color)
            ph = is_placeholder(txt)
            guide = bool(txt) and bool(GUIDE_RE.match(txt))
            if guide:
                guides.append({"table": ti, "row": r, "col": cidx, "text": re.sub(r"\s+", " ", txt)[:300]})
            # 예시 글자가 없는 순수 빈칸도 후보 — 단, '라벨 | ____' 구조가 분명할 때만.
            # ★ 아무 빈칸이나 잡으면 데이터 명세서의 표까지 양식으로 오인한다(246칸을 채운 사고).
            #   라벨 칸에 음영이 있거나, 라벨이 신청서에서 쓰는 필드명일 때로 제한한다.
            empty_slot = False
            # 폭이 12mm 미만인 칸은 글을 쓰는 자리가 아니다(구분선·좁은 열).
            # ★ 폭 7mm 칸에 339자를 넣어 칸 높이가 1446mm(쪽의 6배)가 된 사고를 막는다.
            narrow = (cell.width or 0) < 12 * 283.46
            if not txt and cidx > 0 and not narrow:
                lcell, lt = grid.get((r, cidx - 1), (None, ""))
                if lt and 1 <= len(lt) <= 14 and not GUIDE_RE.match(lt) and not PLACEHOLDER_RE.search(lt):
                    if FIELD_LABEL.match(lt.strip()) or (lcell is not None and cell_shaded(root, lcell)):
                        empty_slot = True
            if not (blue or ph or empty_slot):
                continue
            def ok_label(lcell, s):
                # 순번(1, 2, 3…)이나 기호는 라벨이 아니다 — 명단 표의 행 번호를 라벨로 잡으면
                # 같은 라벨이 반복돼 표 전체가 데이터 표로 오인된다
                s = (s or "").strip()
                if not (s and not s.isdigit() and len(s) <= 40
                        and not PLACEHOLDER_RE.search(s) and not GUIDE_RE.match(s)):
                    return False
                # ★ 파란 예시는 '채워야 할 값'이지 라벨이 아니다.
                #   가로로 늘어선 명단 표(성명|생년월일|소속|휴대전화|이메일)에서 왼쪽 칸의
                #   예시값('국가과학기술연구회')을 휴대전화 칸의 라벨로 잡아, 개인정보 칸인데도
                #   PERSONAL 필터를 빠져나가 본문이 채워지던 사고를 막는다.
                if lcell is not None and is_blue(cell_color(doc, cps, fonts, lcell)):
                    return False
                return True

            # 세로형(라벨|입력)은 왼쪽에, 가로형 명단 표는 열 머리글에 라벨이 있다.
            # 음영이 걸린 칸이 양식의 라벨 칸이므로, 음영 후보를 먼저 고른다.
            cands = []
            for back in range(cidx - 1, -1, -1):          # 같은 행 왼쪽
                lcell, lt = grid.get((r, back), (None, ""))
                if ok_label(lcell, lt):
                    cands.append((0 if (lcell is not None and cell_shaded(root, lcell)) else 1, 0, lt))
                    break
            for up in range(r - 1, -1, -1):               # 같은 열 위쪽
                ucell, ut = grid.get((up, cidx), (None, ""))
                if ok_label(ucell, ut):
                    cands.append((0 if (ucell is not None and cell_shaded(root, ucell)) else 1, 1, ut))
                    break
            cands.sort()                                   # 음영 우선, 같으면 왼쪽 우선
            label = cands[0][2] if cands else ""
            # 글자 수 제한은 이 칸·라벨·오른쪽 이웃 어디에든 적혀 있다
            right = grid.get((r, cidx + 1), (None, ""))[1]
            slots.append({"table": ti, "row": r, "col": cidx,
                          "label": re.sub(r"\s+", " ", label)[:40],
                          "current": re.sub(r"\s+", " ", txt)[:60],
                          "limit": find_limit(txt, label, right),
                          "blue": blue, "placeholder": ph})
    # 서술형 항목: 안내문(※)만 든 1×1 표는 그 자체가 답을 쓰는 자리다.
    # 라벨은 앞선 '목차 표'의 1) 2) 3) 항목을 **순서대로** 배정하는 편이 정확하다
    # (셀 위치로 되짚으면 병합 때문에 엉뚱한 항목이 잡힌다).
    outline = []
    for t in tables:
        for row in t.rows:
            for c in row.cells:
                s = " ".join((p.text or "").strip() for p in c.paragraphs).strip()
                s = re.sub(r"\s+", " ", s)
                if re.match(r"^\d\)\s*\S", s) and len(s) <= 30 and s not in outline:
                    outline.append(s)
    narrative = []
    solo = [g for g in guides if _is_solo_guide(tables, g)]
    for i, g in enumerate(solo):
        narrative.append({"table": g["table"], "row": g["row"], "col": g["col"], "guide": g["text"],
                          "limit": find_limit(g["text"]),
                          "label": outline[i] if i < len(outline) else guess_label(tables, g),
                          "label_src": "outline" if i < len(outline) else "guess"})
    # 다단 표의 '▶ 안내행' 바로 아래에 큰 빈칸(≥25mm)이 있으면 그 큰 칸이 진짜 답 자리다.
    # (내일로 해커톤 기획서 구조: 제목행 / ▶안내행 / 45mm 빈칸행)  안내행은 파란 예시이므로 비운다.
    for s in slots:
        t = tables[s["table"]]
        if t.row_count == 1:
            continue
        try:
            below = t.cell(s["row"] + 1, s["col"])
        except Exception:
            continue
        btxt = " ".join((p.text or "").strip() for p in below.paragraphs).strip()
        if (below.height or 0) >= BIG_BOX_MM * 283.46 and (not btxt or HINT_RE.search(btxt)):
            s["guide_cell"] = [s["row"], s["col"]]
            s["row"], s["col"] = below.address
            s["current"] = btxt[:60]
            s["big_box"] = True
    # ── 제목행/답칸 구조 ──────────────────────────────────────────────────────
    # 공모전 기획서·사업계획서의 가장 흔한 꼴:
    #     [음영] 1) 아이디어 구상 및 제안 배경
    #     [    ] ❍ 아이디어의 창안 동기, 목적 … (작성 요령)
    # 답 칸에 파란 예시도 '홍길동' 같은 자리표시도 없어서 위 규칙들이 전부 놓친다
    # (고용노동 공모전 제안서·사업계획서가 '빈칸 0개'로 나오던 원인).
    # 음영 제목 바로 아래의, 표 폭 대부분을 차지하는 높은 칸을 답 칸으로 본다.
    # ★ 명단 표(성명|생년월일|… 머리글 아래 줄)를 잡지 않도록 폭 60%·높이 10mm 이상만.
    taken = {(s["table"], s["row"], s["col"]) for s in slots}
    for ti, t in enumerate(tables):
        grid = {}
        for row in t.rows:
            for c in row.cells:
                grid[c.address] = (c, " ".join((p.text or "").strip() for p in c.paragraphs).strip())
        tw = sum((c.width or 0) for (r, _), (c, _) in grid.items() if r == 0) or 1
        for (r, ci), (cell, txt) in sorted(grid.items()):
            if r == 0 or (ti, r, ci) in taken:
                continue
            up = grid.get((r - 1, ci))
            if not up:
                continue
            ucell, ut = up
            if not (ut and len(ut) <= 40 and cell_shaded(root, ucell) and not cell_shaded(root, cell)):
                continue
            if (cell.width or 0) < 0.6 * tw or (cell.height or 0) < 10 * 283.46:
                continue
            if txt and not (ANSWER_GUIDE_RE.match(txt) and INSTRUCT_RE.search(txt)):
                continue                                   # 이미 쓰인 본문·공고 내용은 건드리지 않는다
            sub = cell.element.find('{%s}subList' % HP)
            if sub is not None and any(e.tag.rsplit('}', 1)[-1] in OBJECT_TAGS for e in sub.iter()):
                continue
            lab = re.sub(r"\s+", " ", ut)[:40]
            if GENERIC_LABEL_RE.match(lab):
                # '◈ 작성내용' 은 '무엇을 쓰라' 는 안내의 제목이다. 그 아래 칸은 작성 요령 상자이고
                # 답은 다음 표(· · · 칸)에 쓴다(보건의료 창업경진대회 사업계획서).
                continue
            slots.append({"table": ti, "row": r, "col": ci,
                          "label": lab,
                          "current": re.sub(r"\s+", " ", txt)[:60],
                          "limit": find_limit(txt, ut),
                          "blue": False, "placeholder": False, "big_box": True})
            taken.add((ti, r, ci))

    # ── 글 속 빈칸(틀 문장) ─────────────────────────────────────────────────────
    # 대학·행정 서식에 흔한 꼴:  [신청학기] 20   학년도    제   학기
    #                            [연 락 처] 전화번호:          -
    # 칸이 비어 있지도 예시가 있지도 않고, 문장 안의 공백이 빈칸이다(장학금 신청서가 0칸이던 원인).
    # 틀 문장 통째를 'template' 로 넘겨, 화면이 입력란에 미리 넣고 사용자가 공백 자리에 써넣는다.
    # ★ 라벨 칸이 왼쪽에 있을 때만 — 공고문 본문의 들여쓰기 공백을 잡지 않게.
    for ti, t in enumerate(tables):
        grid = {}
        for row in t.rows:
            for c in row.cells:
                grid[c.address] = (c, " ".join((p.text or "") for p in c.paragraphs))
        for (r, ci), (cell, raw) in sorted(grid.items()):
            if ci == 0 or (ti, r, ci) in taken:
                continue
            txt = raw.strip()
            if not txt or len(txt) > 120 or not TEMPLATE_BLANK_RE.search(raw) or GUIDE_RE.match(txt):
                continue
            if TEMPLATE_SKIP_RE.match(txt) or CHECKBOX_RE.search(txt):
                continue                                   # 안내문·번호 목록·체크박스(고르기는 따로 다룬다)
            if all(len(w) <= 1 for w in txt.split()):      # '성    명' 처럼 자간만 벌린 제목
                continue
            if cell_shaded(root, cell):
                continue
            lcell, lt = grid.get((r, ci - 1), (None, ""))
            lt = re.sub(r"\s+", " ", (lt or "")).strip()
            if not (1 <= len(lt) <= 20 and not TEMPLATE_BLANK_RE.search(lt) and not PLACEHOLDER_RE.search(lt)):
                continue
            blanks = template_blanks(cell)
            if not blanks:
                continue
            slots.append({"table": ti, "row": r, "col": ci, "label": lt[:40],
                          "current": re.sub(r"\s+", " ", txt)[:60], "template": raw.rstrip("\n"),
                          "blanks": blanks,
                          "limit": None, "blue": False, "placeholder": False})
            taken.add((ti, r, ci))

    # 항목 제목이 표 밖(또는 앞 표)에 있는 양식은 칸 안에서 라벨을 못 찾는다.
    # 그런 칸은 '칸 7' 같은 번호로만 보여 무엇을 쓰는 자리인지 알 수 없으므로,
    # 앞선 표의 소제목을 끌어와 붙인다. 한 표에 칸이 하나일 때만 — 여러 칸이면 같은
    # 라벨이 겹쳐 채우기가 첫 칸에만 들어간다.
    from collections import Counter
    per_table = Counter(s["table"] for s in slots)
    heads = headings_before_tables(doc)
    todo = [s for s in slots if not s.get("label") and per_table[s["table"]] == 1]
    head_of = {id(s): (heads[s["table"]] if s["table"] < len(heads) else "") for s in todo}
    head_use = Counter(h for h in head_of.values() if h)
    for s in todo:
        h = head_of[id(s)]
        # 절 제목이 이 칸 하나만 가리킬 때만 쓴다 — 여러 칸이 같은 이름이면 채울 때 같은 글이 들어간다
        g = h if (h and head_use[h] == 1) else guess_label(tables, s)
        if g:
            s["label"] = g[:40]

    # ★ 같은 칸이 '빈칸'과 '서술형' 양쪽에 잡히면 화면에 입력란이 둘 뜨고 나중 값이 앞 값을 덮는다.
    #   (서술형 30칸 중 22칸이 겹쳤다 — 예비창업패키지 18, NAIS 4). 서술형 쪽을 남긴다:
    #   안내문 상자 전용 처리(점선→실선·폭 맞춤)가 서술형 경로에 있다.
    narr_pos = {(n["table"], n["row"], n["col"]) for n in narrative}
    slots = [s for s in slots if (s["table"], s["row"], s["col"]) not in narr_pos]
    # 목차에서 이름을 못 얻은 서술형 칸은 표 앞 절 제목('1. 문제 인식(Problem)')으로
    # 목차에서 얻은 이름(NAIS '1) 연구 문제…')은 정확하므로 두고, 추정 이름은 더 나은 근거로 바꾼다:
    # 바깥 표 칸 안에 든 상자면 그 행 이름, 아니면 앞 절 제목. 추정은 앞 표 글을 줍기 쉬워
    # 사업비 표 아래 상자가 '지급수수료' 가 되는 식으로 틀렸다.
    hp = headings_before_tables(doc, with_parent=True)
    def better(n):
        if n.get("label_src") == "outline" or n["table"] >= len(hp):
            return None
        h, parent = hp[n["table"]]
        return parent or h or None
    cand = {id(n): better(n) for n in narrative}
    use = Counter(v for v in cand.values() if v)
    for n in narrative:
        v = cand[id(n)]
        if v and use[v] == 1:                  # 한 칸만 가리킬 때만 — 같은 이름이면 같은 글이 들어간다
            n["label"] = v[:40]

    return {"source": os.path.basename(path), "tables": len(tables),
            "slots": slots, "narrative": narrative, "guides": guides,
            "sections": [h for h, _ in hp],          # 표마다 앞 절 제목 — 화면이 칸을 절 단위로 묶는 데 쓴다
            "constraints": find_constraints(doc, tables)}


def _is_solo_guide(tables, g):
    """안내문만 들어 있는 1×1 표인지 — 서술형 답을 쓰는 칸의 특징."""
    try:
        t = tables[g["table"]]
    except Exception:
        return False
    return t.row_count == 1 and t.column_count == 1


HEADING_RE = re.compile(r"^(\d{1,2}[.)]\s|[가-하][.)]\s|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ][.)]?\s|[□■◆◇▣]\s?\S|[<〈《]\s*\S.*[>〉》]$)")   # '< 1단계 사업비 집행계획 >' 같은 표 소제목도


def headings_before_tables(doc, with_parent=False):
    """문서 순서대로 훑어, 각 표(iter_tables 순서) 앞의 절 제목을 돌려준다.

    절 제목('1. 창업 아이템 개요')은 표 밖 문단에도, '□ 일반현황' 같은 □ 문단에도,
    제목만 든 1×1 표('1. 문제 인식(Problem)_창업 아이템의 필요성')에도 있다(예비창업패키지).
    with_parent=True 면 (제목, 바깥 칸의 행 이름) 쌍 — 다른 표의 칸 안에 든 안내 상자는
    바깥 행 이름('문제 인식')이 곧 항목 이름이다.
    ★ '[서식3-1]' 같은 서식 번호는 문서 단위라 제외(결과서 17칸이 전부 '[서식3-1]' 이 됐었다).
    """
    out, last = [], [""]
    def label_of(t):
        t = re.sub(r"\s+", " ", t or "").strip()
        if 2 <= len(t) <= 50 and HEADING_RE.match(t):
            core = re.sub(r"^[□■◆◇▣<〈《\s]+|[>〉》\s]+$", "", t)
            if re.match(r"^\[?\s*(서식|양식|별첨|붙임|첨부)\s*[\d-]*\s*\]?$", core):
                return ""                             # '<서식3>' 같은 서식 번호는 문서 단위 — 칸 이름이 아니다
            return re.sub(r"^[□■◆◇▣<〈《]\s*|\s*[>〉》]$", "", t)
        return ""
    def walk(paras, top, parent):
        for p in paras:
            if top:
                h = label_of(p.text)
                if h:
                    last[0] = h
            for tb in p.tables:
                out.append((last[0], parent))
                cells = [c for row in tb.rows for c in row.cells]
                if top and len(cells) <= 2:              # 제목 전용 표 — 뒤따르는 표들의 절 제목
                    h = label_of(" ".join((q.text or "") for q in cells[0].paragraphs))
                    if h:
                        last[0] = h
                grid = {c.address: c for c in cells}
                for c in cells:
                    r, ci = c.address
                    left = grid.get((r, ci - 1)) if ci > 0 else None
                    row_name = re.sub(r"\s+", " ", " ".join((q.text or "") for q in left.paragraphs)).strip() if left is not None else ""
                    walk(c.paragraphs, False, row_name[:40] if 1 <= len(row_name) <= 40 else parent)
    walk(doc.paragraphs, True, "")
    return out if with_parent else [h for h, _ in out]


def guess_label(tables, g):
    """안내문 칸 바로 앞 표/셀에서 항목명을 추정한다(1) 연구 문제 … 같은 소제목)."""
    ti = g["table"]
    for back in range(ti, max(-1, ti - 3), -1):
        try:
            t = tables[back]
        except Exception:
            continue
        texts = []
        for row in t.rows:
            for c in row.cells:
                s = " ".join((p.text or "").strip() for p in c.paragraphs).strip()
                if s and not GUIDE_RE.match(s):
                    texts.append(s)
        for s in reversed(texts):
            if re.match(r"^\d\)|^\[.*\]|^[가-힣]{2,}", s) and len(s) <= 30:
                return re.sub(r"\s+", " ", s)
    return ""


HP = 'http://www.hancom.co.kr/hwpml/2011/paragraph'


def is_hint_color(color):
    """예시·안내용 글자색인가 — 파랑뿐 아니라 회색(#808080 '글자수 제한 없음' 류)도 있다."""
    if not color or color == "none":
        return False
    c = color.upper()
    if not re.match(r"^#[0-9A-F]{6}$", c):
        return False
    r, g, b = int(c[1:3], 16), int(c[3:5], 16), int(c[5:7], 16)
    if is_blue(c):
        return True
    # ★ 종이 위에서 흐려 안 보이는 색도 안내용이다. 공모전 제안서의 작성 요령이 연베이지(#E3DCC1)
    #   였는데 회색만 보던 규칙이 놓쳐, 채운 본문이 그 색을 물려받아 거의 안 보였다(검사도 통과).
    if (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62:
        return True
    return abs(r - g) < 24 and abs(g - b) < 24 and r >= 0x60          # 회색 계열


def blacken(doc, cps, fonts, cell, cache):
    """채운 글자를 검은색으로. 우리가 방금 덮어쓴 칸이므로 검정이 아닌 색은 전부 예시색이다
    (파랑 '삭제 후 입력', 회색 '글자수 제한 없음' 힌트 등)."""
    for p in cell.paragraphs:
        for run in p.element.findall('{%s}run' % HP):
            cid = run.get("charPrIDRef")
            ci = PR.char_info(cps, fonts, cid) or {}
            if not is_hint_color(ci.get("color")):
                continue
            if cid not in cache:
                kw = {"color": "#000000", "bold": bool(ci.get("bold"))}
                if ci.get("font"):
                    kw["font"] = ci["font"]
                if ci.get("size_pt"):
                    kw["size"] = ci["size_pt"]
                try:
                    cache[cid] = str(doc.styles.ensure_run(**kw))
                except Exception:
                    cache[cid] = cid
            run.set("charPrIDRef", cache[cid])


def check_options(doc, tables, value):
    """'참가분야' 같은 선택지를 체크한다.

    양식의 선택지는 □ 글자가 아니라 **체크박스 컨트롤**인 경우가 많다(NAIS 신청서가 그렇다).
    컨트롤이 있으면 컨트롤을 켜고, 없으면 □ 글자를 ■ 로 바꾼다.
    """
    key = re.sub(r"\s+", "", value)
    hits = []
    try:
        boxes = doc.list_check_boxes()
    except Exception:
        boxes = []
    def attr(o, k):                       # dict 로도, 객체로도 올 수 있다
        return o.get(k) if isinstance(o, dict) else getattr(o, k, None)
    for i, cb in enumerate(boxes):
        raw = attr(cb, "caption") or ""
        cap = re.sub(r"\s+", "", raw)
        if cap and (cap == key or key[:5] in cap or cap[:5] in key):
            idx = attr(cb, "index")
            doc.set_check_box(True, index=i if idx is None else idx)
            hits.append("참가분야 '%s' 체크" % raw.strip())
    if hits:
        return hits
    # 글자 □ 방식: "□ 인공지능 □ 웹/모바일 □ 빅데이터" 처럼 한 줄에 여러 개가 있으므로
    # 해당 항목 **바로 앞의 □ 하나만** ■ 로 바꾼다 (str.replace 로 전부 바꾸면 전부 체크되는 사고).
    pat = re.compile(r"□(\s*)(" + re.escape(value.strip()) + r")")
    for t in tables:
        for row in t.rows:
            for c in row.cells:
                for p in c.paragraphs:
                    for run in p.element.findall('{%s}run' % HP):
                        for t_el in run.findall('{%s}t' % HP):
                            if t_el.text and "□" in t_el.text and pat.search(t_el.text):
                                t_el.text = pat.sub(lambda m: "■" + m.group(1) + m.group(2), t_el.text, count=1)
                                hits.append("'%s' 체크" % value)
                                return hits
    return hits


PT = 100          # 1pt = 100 HWPUNIT (7200/inch ÷ 72)
HH = 'http://www.hancom.co.kr/hwpml/2011/head'
HC = 'http://www.hancom.co.kr/hwpml/2011/core'


NARROW_MM = 45.0   # 이보다 좁은 칸은 11pt 기준 한 줄에 12자도 안 들어간다


def flat_para(root, base_id, cache, header=None, width=None):
    """안내문용 문단속성에서 '내어쓰기·왼여백'만 0으로 뺀 문단속성을 만든다.

    ★ 양식의 안내문(※ …)은 기호가 튀어나오도록 내어쓰기가 걸려 있다. 그 칸에 본문을 넣으면
      둘째 줄부터 안쪽으로 밀려 들어가 이상해진다. 정렬·줄간격은 그대로 두고 들여쓰기만 없앤다.
    """
    import copy
    narrow = width is not None and (width / 283.46) < NARROW_MM
    key = (base_id, narrow)
    if key in cache:
        return cache[key]
    props = None
    for e in root.iter('{%s}paraProperties' % HH):
        props = e
        break
    src = None
    for e in root.iter('{%s}paraPr' % HH):
        if e.get("id") == str(base_id):
            src = e
            break
    if src is None or props is None:
        cache[key] = str(base_id)
        return cache[key]
    new = copy.deepcopy(src)
    ids = [int(e.get("id")) for e in root.iter('{%s}paraPr' % HH) if (e.get("id") or "").isdigit()]
    nid = str(max(ids) + 1)
    new.set("id", nid)
    for mg in new.iter('{%s}margin' % HH):
        for tag in ("intent", "left"):
            el = mg.find('{%s}%s' % (HC, tag))
            if el is not None:
                el.set("value", "0")
    # 힌트 문구("글자수 제한 없음")는 가운데 정렬인 경우가 많다 → 본문은 양쪽 정렬.
    # ★ 단 좁은 칸에서는 양쪽·배분 정렬이 '내 용 입 니 다' 처럼 글자를 벌려 놓는다.
    #   한 줄에 열 자도 못 넣는 칸(폭 45mm 미만)은 왼쪽 정렬이라야 글자가 붙어서 나온다.
    al = new.find('{%s}align' % HH)
    if al is not None:
        cur = al.get("horizontal")
        if narrow:
            if cur in ("JUSTIFY", "DISTRIBUTE", "CENTER", "RIGHT"):
                al.set("horizontal", "LEFT")
        elif cur in ("CENTER", "RIGHT", "DISTRIBUTE"):
            al.set("horizontal", "JUSTIFY")
    # 힌트 문단은 줄간격 100% 인 경우가 많아 본문을 넣으면 빽빽하다 → 양식 규정값(없으면 160%)으로
    want = int(cache.get("_ls") or 160)
    for ls in new.iter('{%s}lineSpacing' % HH):
        if ls.get("type") == "PERCENT" and int(ls.get("value") or 0) < 130:
            ls.set("value", str(want))
    # 안내문 칸에 자동 글머리표가 걸려 있으면 채운 본문 앞에도 '-' 가 붙는다 → 뗀다
    hd = new.find('{%s}heading' % HH)
    if hd is not None and (hd.get("type") or "NONE") in ("BULLET", "NUMBER"):
        hd.set("type", "NONE")
        hd.set("idRef", "0")
        hd.set("level", "0")
    props.append(new)
    props.set("itemCnt", str(len(props)))
    cache[key] = nid
    pps = cache.get("_pps")
    if pps is not None:
        pps[nid] = new                            # 높이 계산이 곧바로 참조할 수 있게
    hdr = cache.get("_header")
    if hdr is not None:
        hdr.mark_dirty()                          # 헤더에 스타일을 더했으면 헤더도 dirty
    return nid


def mark(table):
    """★ python-hwpx 는 직접 XML 을 고치면 '변경됨'을 모른다. mark_dirty 를 빼먹으면 저장 시
    원본 바이트가 그대로 쓰여 수정이 조용히 사라진다(자가시험으로 확인된 함정)."""
    try:
        table.mark_dirty()
    except Exception:
        pass


def strip_auto_bullet(root, cell, cache):
    """칸 문단의 자동 글머리표만 뗀다(정렬·줄간격은 그대로).

    ★ 짧은 값을 채우는 칸에도 자동 글머리가 걸려 있으면 '- 홍길동' 처럼 기호가 붙는다.
      전체 정리(normalize_cell)는 짧은 라벨-값 칸의 가운데 정렬까지 바꿔 버리므로 이것만 뗀다.
    """
    import copy
    for p in cell.paragraphs:
        pid = str(p.para_pr_id_ref)
        key = ("nb", pid)
        if key not in cache:
            src = next((e for e in root.iter('{%s}paraPr' % HH) if e.get("id") == pid), None)
            hd = src.find('{%s}heading' % HH) if src is not None else None
            if src is None or hd is None or (hd.get("type") or "NONE") == "NONE":
                cache[key] = pid
            else:
                props = next((e for e in root.iter('{%s}paraProperties' % HH)), None)
                if props is None:
                    cache[key] = pid
                else:
                    new = copy.deepcopy(src)
                    ids = [int(e.get("id")) for e in root.iter('{%s}paraPr' % HH) if (e.get("id") or "").isdigit()]
                    nid = str(max(ids) + 1)
                    new.set("id", nid)
                    nh = new.find('{%s}heading' % HH)
                    nh.set("type", "NONE")
                    nh.set("idRef", "0")
                    nh.set("level", "0")
                    props.append(new)
                    props.set("itemCnt", str(len(props)))
                    cache[key] = nid
                    hdr = cache.get("_header")
                    if hdr is not None:
                        hdr.mark_dirty()
        p.element.set("paraPrIDRef", cache[key])


def normalize_cell(doc, root, cell, pcache, solid_bf):
    """채운 칸을 '본문답게' 정리: 빈 문단 제거 · 내어쓰기 해제 · 점선 테두리를 실선으로."""
    paras = list(cell.paragraphs)
    for p in paras[1:]:                      # 안내문 뒤에 붙어 있던 빈 문단은 아래 여백만 만든다
        if (p.text or "").strip():
            continue
        el = p.element
        parent = el.getparent()
        if parent is not None:
            parent.remove(el)
    for p in cell.paragraphs:
        nid = flat_para(root, p.para_pr_id_ref, pcache, width=cell.width)
        p.element.set("paraPrIDRef", nid)
    sub = cell.element.find('{%s}subList' % HP)      # 세로 중앙 → 위 맞춤 (본문이 칸 한가운데 떠 있지 않게)
    if sub is not None and sub.get("vertAlign") not in (None, "TOP"):
        sub.set("vertAlign", "TOP")
    if solid_bf:
        cell.element.set("borderFillIDRef", str(solid_bf))


def refit_cell(doc, cps, fonts, pps, table, cell, text):
    """채운 글자 분량에 맞춰 셀(과 표)의 높이를 다시 잡는다.

    ★ 이걸 빼먹으면 한/글에서 글자가 칸을 넘쳐 잘린다. 원본 셀 높이는 '예시 한 줄' 기준이라
      내용을 채우면 반드시 모자란다. 렌더 그림만 보면 놓치기 쉬운 결함이다.
    """
    from hwpx.form_fit import estimate_lines
    para = cell.paragraphs[0] if cell.paragraphs else None
    cid = PR.first_run_char(para.element) if para is not None else None
    ci = PR.char_info(cps, fonts, cid) or {}
    pi = PR.para_info(pps, para.para_pr_id_ref) if para is not None else {}
    font_pt = ci.get("size_pt") or 10.0
    ls = (pi or {}).get("line_spacing") or 160
    el = cell.element
    mg = el.find('{%s}cellMargin' % HP)
    ml = int(mg.get("left", 510)) if mg is not None else 510
    mr = int(mg.get("right", 510)) if mg is not None else 510
    mt = int(mg.get("top", 141)) if mg is not None else 141
    mb = int(mg.get("bottom", 141)) if mg is not None else 141
    avail = max(1000, (cell.width or 30000) - ml - mr)
    lines = 0
    for chunk in str(text).split("\n"):
        lines += max(1, estimate_lines(chunk, avail, font_pt))
    line_h = font_pt * PT * (ls / 100.0)
    need = int(lines * line_h + mt + mb + line_h * 0.25)
    # 본문 높이를 넘도록 늘리면 표가 쪽을 넘어 깨진다 → 거기서 멈추고 검사(A1/A15)가 알리게 둔다
    pg = PR.page_setup(doc) or {}
    cap = int(((pg.get("height_mm") or 297) - (pg.get("top") or 15) - (pg.get("bottom") or 15)
               - (pg.get("header") or 0) - (pg.get("footer") or 0)) * 283.46)
    if need > cap:
        need = cap
    if need <= (cell.height or 0):
        return 0
    grew = need - (cell.height or 0)
    cell.set_size(height=need)
    if table.row_count == 1:                      # 1행 표는 표 높이도 같이 늘린다
        sz = table.element.find('{%s}sz' % HP)
        if sz is not None:
            sz.set("height", str(int(sz.get("height", "0")) + grew))
    else:
        for c2 in table.rows[cell.address[0]].cells:
            if c2.height and c2.height < need:
                c2.set_size(height=need)
        sz = table.element.find('{%s}sz' % HP)
        if sz is not None:
            sz.set("height", str(int(sz.get("height", "0")) + grew))
    return grew


def widen_table(table, target_w):
    """서술형 내용 표를 제목 줄과 같은 폭으로 늘린다.

    양식의 안내문 상자는 원본에서 제목 줄보다 좁게 그려져 있는 경우가 있다. 예시 한 줄일 때는
    티가 안 나지만 내용을 채우면 '제목은 전체 폭, 내용은 좁은 상자'가 되어 문서가 어색해진다.
    """
    sz = table.element.find('{%s}sz' % HP)
    cur = int(sz.get("width")) if sz is not None and sz.get("width") else None
    if not cur or cur >= target_w:
        return 0
    scale = target_w / cur
    for row in table.rows:
        for c in row.cells:
            if c.width:
                c.set_size(width=int(c.width * scale))
    sz.set("width", str(int(target_w)))
    return int(target_w - cur)


def fill(path, answers, out):
    doc = HwpxDocument.open(path)
    root = doc.parts.headers[0].element          # 편집 중인 문서의 트리여야 추가한 스타일이 저장된다
    fonts, cps, pps = PR.index_styles(root)
    tables = list(PR.iter_tables(doc.paragraphs))
    pcache = {"_pps": pps, "_header": doc.parts.headers[0]}
    try:                                     # 안내문 상자의 점선을 실선으로 바꿀 borderFill
        solid_bf = doc.styles.ensure_border_fill(border_color="#000000", border_width="0.12 mm")
    except Exception:
        solid_bf = None
    widths = [int(t.element.find('{%s}sz' % HP).get("width"))
              for t in tables if t.element.find('{%s}sz' % HP) is not None and t.element.find('{%s}sz' % HP).get("width")]
    body_w = max(widths) if widths else None
    info = scan(path)
    cons = info.get("constraints") or {}
    pcache["_ls"] = cons.get("line_spacing") or 160          # 본문 줄간격 하한 보정값
    done, missed = [], []
    cache = {}
    by_label = {}
    for s in info["slots"]:
        by_label.setdefault(s["label"], []).append(s)
    for s in info["narrative"]:
        by_label.setdefault(s["label"], []).append(s)

    def norm(x):
        return re.sub(r"[\s\[\]()]+", "", x or "")

    def reindex():
        # ensure_run 등으로 헤더에 스타일이 추가되면 색인이 낡는다 → 높이 계산 전에 갱신
        f2, c2, p2 = PR.index_styles(root)
        cps.update(c2)
        pps.update(p2)
        fonts.update(f2)

    for key, val in answers.items():
        if key.startswith("_"):
            continue
        if key in ("참가분야", "선택", "분야", "활용기술"):
            hits = check_options(doc, tables, str(val))
            done.extend(hits) if hits else missed.append(key)
            for t in tables:
                mark(t)
            continue
        # '@표:행:열' — 화면이 칸 위치로 보낸 값. 라벨로 찾으면 같은 이름의 칸(사업계획서의 '구분' 네 개)
        # 이 첫 값으로 모두 덮이고 나머지 입력은 버려졌다. 위치로 받으면 칸마다 제 값이 들어간다.
        m_pos = re.match(r"^@(\d+):(\d+):(\d+)$", key)
        if m_pos:
            pos = tuple(int(x) for x in m_pos.groups())
            hit = [s for s in info["slots"] + info["narrative"]
                   if (s.get("table"), s.get("row"), s.get("col")) == pos]
            if not hit:
                missed.append(key)
                continue
            _fill_one(doc, root, tables, hit[0], hit[0].get("label") or key, val, cons, cps, fonts, pps,
                      cache, pcache, solid_bf, body_w, reindex, done)
            continue
        # 같은 라벨이 여러 번 나오면(팀명이 신청서·동의서·서약서에 각각) 정확히 일치하는 칸은 전부 채운다.
        # 단 3개를 넘으면 데이터 표의 열 이름일 가능성이 크므로 첫 칸만 — 표를 같은 값으로 덮는 사고 방지.
        targets = []
        for lab, lst in by_label.items():
            if not (norm(lab) and norm(lab) == norm(key)):
                continue
            # 한 표 안에서 같은 라벨이 여러 번이면 표의 열 이름이다 → 첫 칸만.
            # 서로 다른 표에 나뉘어 있으면(서식1·2·3의 팀명) 전부 채운다.
            per_table = {}
            for s in lst:
                per_table.setdefault(s["table"], []).append(s)
            for tno, group in per_table.items():
                targets.extend(group if len(group) == 1 else group[:1])
        if not targets:
            for lab, lst in by_label.items():
                if norm(key) and norm(key) in norm(lab):
                    targets = [lst[0]]
                    break
        if not targets:
            missed.append(key)
            continue
        for target in targets:
            lim = target.get("limit")
            if lim and len(str(val)) > lim:
                done.append("!! '%s' %d자 > 양식 제한 %d자 — 줄여야 한다" % (key[:20], len(str(val)), lim))
            _fill_one(doc, root, tables, target, key, val, cons, cps, fonts, pps, cache, pcache, solid_bf, body_w, reindex, done)
    doc.save_to_path(out)
    return done, missed


def _cell_texts(cell):
    """칸 안의 글자 조각(<hp:t>)을 문단 번호와 함께. 자식 요소가 든 조각(탭 등)은 건드리지 않는다."""
    out = []
    for pi, p in enumerate(cell.paragraphs):
        for t in p.element.iter('{%s}t' % HP):
            if len(t) == 0:
                out.append((pi, t))
    return out


def template_blanks(cell):
    """틀 문장 속 빈칸(공백 2칸 이상)의 위치와 앞뒤 문맥.

    ★ 칸 전체를 새 글로 갈아 끼우면 여러 문단이 한 문단으로 합쳐지고, 빈칸에 걸린 밑줄
      (양식의 '______' 는 밑줄 친 공백이다)이 사라진다(장학금 신청서 렌더로 확인).
      그래서 빈칸 자리의 글자만 바꾼다 — 문단·글자 서식은 그대로 남는다.
    """
    pieces = _cell_texts(cell)
    raw = []
    for k, (pi, t) in enumerate(pieces):
        txt = t.text or ""
        for m in re.finditer(r" {2,}", txt):
            raw.append((k, pi, m.start(), m.end(), len(txt)))
    # 한 빈칸이 조각 둘로 나뉜 경우(밑줄 친 공백 + 그냥 공백)를 하나로 — 아니면 같은 칸이 두 번 뜬다
    merged = []
    for k, pi, s0, e0, ln in raw:
        if merged:
            pk, ppi, ps, pe, pln, extra = merged[-1]
            last_k = extra[-1][0] if extra else pk
            last_end = extra[-1][2] if extra else pe
            last_len = len(pieces[last_k][1].text or "")
            if ppi == pi and k == last_k + 1 and last_end == last_len and s0 == 0:
                extra.append((k, s0, e0))
                continue
        merged.append([k, pi, s0, e0, ln, []])
    blanks = []
    for k, pi, s0, e0, _, extra in merged:
        lk, le = (extra[-1][0], extra[-1][2]) if extra else (k, e0)
        before = "".join((q.text or "") for (pj, q) in pieces[:k] if pj == pi) + (pieces[k][1].text or "")[:s0]
        after = (pieces[lk][1].text or "")[le:] + "".join((q.text or "") for (pj, q) in pieces[lk + 1:] if pj == pi)
        b, a = before.strip(), after.strip()
        if not b:                                      # 문단 첫머리 들여쓰기는 빈칸이 아니다
            continue
        # ★ 빈칸에는 앞뒤 단서가 있다. 없으면 단어 사이를 넓게 띄운 것뿐이다('20 학년도 ▢ 제 학기' 의 가운데).
        if not (BLANK_AFTER_RE.match(a) or b[-1] in ":：-~～(（/" or b[-1].isdigit() or not a):
            continue
        if not a and b[-1] not in ":：-~～(（":         # 문단 끝 공백은 ':' '-' '(' 뒤일 때만 빈칸
            continue
        blanks.append({"piece": k, "start": s0, "end": e0,
                       "extra": [[xk, xs, xe] for xk, xs, xe in extra],
                       "before": re.sub(r"\s+", " ", b)[-14:], "after": re.sub(r"\s+", " ", a)[:10]})
    return blanks


def fill_blanks(cell, blanks, values):
    """빈칸 자리의 공백만 값으로 바꾼다. 값이 짧으면 공백으로 채워 뒤 글자 자리를 지킨다."""
    pieces = _cell_texts(cell)
    by_piece = {}
    for b, v in zip(blanks, values):
        v = (v or "").strip()
        if not v:
            continue
        # 조각 둘로 나뉜 빈칸이면 더 긴 쪽(대개 밑줄 친 공백)에 쓴다 — 짧은 쪽에 쓰면 값이 선 앞에 뜬다
        k, s0, e0 = b["piece"], b["start"], b["end"]
        for xk, xs, xe in b.get("extra") or []:
            if xe - xs > e0 - s0:
                k, s0, e0 = xk, xs, xe
        glue = b.get("before", "")[-1:].isdigit()       # '20▢학년도' 의 연도처럼 앞 숫자에 붙여 쓴다
        by_piece.setdefault(k, []).append(({"start": s0, "end": e0, "glue": glue}, v))
    n = 0
    for k, items in by_piece.items():
        if k >= len(pieces):
            continue
        t = pieces[k][1]
        txt = t.text or ""
        for b, v in sorted(items, key=lambda x: -x[0]["start"]):   # 뒤에서부터 — 앞 위치가 안 밀린다
            width = b["end"] - b["start"]
            core = (v if b.get("glue") else " " + v) + " "
            rep = core.ljust(width) if len(core) <= width else core
            txt = txt[:b["start"]] + rep + txt[b["end"]:]
            n += 1
        t.text = txt
    return n


def _fill_one(doc, root, tables, target, key, val, cons, cps, fonts, pps, cache, pcache, solid_bf, body_w, reindex, done):
    if True:
        t = tables[target["table"]]
        cell = t.cell(target["row"], target["col"])
        if target.get("blanks"):
            # 틀 문장 칸 — 빈칸 자리만 바꾸고 끝낸다(문단·밑줄·칸 높이를 건드리지 않는다)
            vals = val if isinstance(val, list) else [val]
            n = fill_blanks(cell, target["blanks"], vals)
            mark(t)
            done.append("%s → 표%d(%d,%d) 빈칸 %d곳" % (key, target["table"], target["row"], target["col"], n))
            return
        was_guide = bool(GUIDE_RE.match((target.get("current") or "").strip())) or bool(target.get("big_box")) \
            or "guide" in target
        # ★ 칸 첫머리가 빈 여백 문단이고 작성 요령은 그 아래 있는 양식이 있다. set_text 는 첫 문단
        #   서식을 쓰므로 여백용의 작은 글자·좁은 줄간격으로 본문이 들어가 잘리거나 안 보였다.
        #   글이 있는 첫 문단 앞의 빈 문단을 떼어, 요령 문단의 서식을 기준으로 쓴다.
        paras = list(cell.paragraphs)
        first = next((q for q in paras if (q.text or "").strip()), None)
        if first is not None and first is not paras[0]:
            for q in paras:
                if q is first:
                    break
                par = q.element.getparent()
                if par is not None:
                    par.remove(q.element)
        cell.set_text(str(val), preserve_format=True)
        blacken(doc, cps, fonts, cell, cache)
        long_text = len(str(val)) > 60
        narrative_box = (t.row_count == 1 and t.column_count == 1)
        # 긴 본문을 채우는 칸은 무조건 정리한다 — 안내문 서식(자동 글머리·내어쓰기·빈 문단·
        # 가운데 정렬·줄간격 100%)이 남으면 본문이 이상해진다. 1×1 상자만 보던 조건으로는
        # 표 안 서술형 칸(금융 AI Challenge 기획서)을 놓쳤다.
        strip_auto_bullet(root, cell, pcache)      # 길이와 무관하게 자동 글머리는 뗀다
        # '· · ·' 자리표시 칸은 내어쓰기가 걸린 글머리 문단이라, 짧은 글이어도 둘째 줄이 안으로 밀린다
        dot_box = bool(re.match(r"^(?:[·•‧ㆍ]\s*){3,}", (target.get("current") or "").strip()))
        if narrative_box or target.get("big_box") or long_text or was_guide or dot_box:
            # 안내문 서식(내어쓰기·빈 문단·점선)은 본문에 맞지 않는다. 점선→실선은 1×1 상자만.
            normalize_cell(doc, root, cell, pcache, solid_bf if narrative_box else None)
            if narrative_box and body_w:
                widen_table(t, body_w)
        if cons.get("font_pt") and long_text:
            resize_cell(doc, cps, fonts, cell, cons["font_pt"], cache)   # 양식 규정 글자 크기로
        if target.get("guide_cell"):                                    # 파란 ▶ 안내행은 비우고 낮춘다
            gr, gc = target["guide_cell"]
            try:
                g = t.cell(gr, gc)
                g.set_text("", preserve_format=True)
                low = int(3.5 * 283.46)
                for c2 in t.rows[gr].cells:
                    if c2.height and c2.height > low:
                        c2.set_size(height=low)
            except Exception:
                pass
        reindex()
        grew = refit_cell(doc, cps, fonts, pps, t, cell, val)
        mark(t)                                                   # 직접 조작분이 저장되도록
        done.append("%s → 표%d(%d,%d)%s%s" % (key, target["table"], target["row"], target["col"],
                                              "  높이 +%.1fmm" % (grew / 283.46) if grew else "",
                                              "  %gpt" % cons["font_pt"] if (cons.get("font_pt") and long_text) else ""))


def resize_cell(doc, cps, fonts, cell, pt, cache):
    """채운 글자를 양식 규정 크기로. 글꼴·굵기는 유지하고 크기·색(검정)만 맞춘다."""
    for p in cell.paragraphs:
        for run in p.element.findall('{%s}run' % HP):
            cid = run.get("charPrIDRef")
            ci = PR.char_info(cps, fonts, cid) or {}
            if abs((ci.get("size_pt") or 0) - pt) < 0.5:
                continue
            k = ("sz", cid, pt)
            if k not in cache:
                kw = {"size": pt, "color": "#000000", "bold": bool(ci.get("bold"))}
                if ci.get("font"):
                    kw["font"] = ci["font"]
                try:
                    cache[k] = str(doc.styles.ensure_run(**kw))
                except Exception:
                    cache[k] = cid
            run.set("charPrIDRef", cache[k])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["scan", "fill"])
    ap.add_argument("form")
    ap.add_argument("rest", nargs="*")
    ap.add_argument("-o", "--out", default=None)
    a = ap.parse_args()
    if a.cmd == "scan":
        info = scan(a.form)
        if a.out:
            json.dump(info, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print("=== 양식 분석: %s (표 %d개) ===" % (info["source"], info["tables"]))
        print("채울 칸 %d개:" % len(info["slots"]))
        for s in info["slots"][:24]:
            mark = "파랑" if s["blue"] else ("빈칸" if not s["current"] else "예시")
            lim = ("  제한%d자" % s["limit"]) if s.get("limit") else ""
            print("   [%s] 표%-2d (%d,%d) %-14s ← 현재 '%s'%s" % (mark, s["table"], s["row"], s["col"], s["label"], s["current"][:28], lim))
        print("서술형 항목 %d개:" % len(info["narrative"]))
        for n in info["narrative"][:10]:
            lim = ("  제한%d자" % n["limit"]) if n.get("limit") else ""
            print("   표%-2d %-22s | %s%s" % (n["table"], n["label"][:22], n["guide"][:60], lim))
        if info.get("constraints"):
            print("양식 규정:", {k: v for k, v in info["constraints"].items() if not k.startswith("_")})
        if a.out:
            print("-> %s" % a.out)
    else:
        answers = json.load(open(a.rest[0], encoding="utf-8"))
        out = a.rest[1] if len(a.rest) > 1 else (a.out or "filled.hwpx")
        done, missed = fill(a.form, answers, out)
        print("채움 %d칸 -> %s" % (len(done), out))
        for d in done:
            print("   " + d)
        if missed:
            print("못 찾은 항목:", ", ".join(missed))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
