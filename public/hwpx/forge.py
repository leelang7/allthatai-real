"""
forge.py — AI 가 쓴 내용(markdown 또는 docx) + 참조 hwpx + profile.json → 참조 문서'처럼' 서식된 hwpx.

원리: 참조 hwpx 를 열어 본문만 비우고(header.xml 의 글꼴·charPr·paraPr·borderFill·쪽설정 전부 보존),
profile.json 의 역할→서식ID 를 그대로 붙여 문단을 다시 채운다. 새 스타일을 '만들지' 않으므로
자간·장평·줄간격·들여쓰기·여백이 참조 문서와 동일하고, 한컴이 못 여는 요소가 생길 여지가 없다.

마크다운 규약(AI 에게 이렇게 쓰게 한다 — 선행기호 'ㅇ', '-', '1.' 은 쓰지 말 것. forge 가 참조 문서 방식으로 붙인다):
  # 제목 / ## 대제목(h1) / ### 소제목(h2) / #### h3 / - 글머리 / (두 칸 들여쓴)- 하위 글머리
  1. 번호목록 / ※ 비고 / | 표 | / ![](img.png) / **굵게** / 빈 줄 = 무시

사용법:
  python forge.py content.md  ref.hwpx out.hwpx [--profile profile.json] [--roles roles.json]
  python forge.py content.docx ref.hwpx out.hwpx
"""
import sys, re, json, argparse, os, io
from hwpx import HwpxDocument

HP = 'http://www.hancom.co.kr/hwpml/2011/paragraph'
HWP_PER_MM = 7200 / 25.4
CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮"
GA = "가나다라마바사아자차카타파하"


# ---------------- 입력 파싱 ----------------
def parse_inline(text):
    """**굵게** 분리 -> [(text, bold)]"""
    parts, pos = [], 0
    for m in re.finditer(r"\*\*(.+?)\*\*", text):
        if m.start() > pos:
            parts.append((text[pos:m.start()], False))
        parts.append((m.group(1), True))
        pos = m.end()
    if pos < len(text):
        parts.append((text[pos:], False))
    return parts or [("", False)]


def parse_markdown(md, base_dir="."):
    lines = md.splitlines()
    els = []
    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        s = line.strip()
        if not s:
            i += 1
            continue
        if s.startswith("|") and i + 1 < len(lines) and re.match(r"^\s*\|?[\s:|-]+\|?\s*$", lines[i + 1]) and "-" in lines[i + 1]:
            rows = [[c.strip() for c in s.strip("|").split("|")]]
            i += 2
            while i < len(lines) and lines[i].strip().startswith("|"):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")])
                i += 1
            els.append(("table", rows))
            continue
        m = re.match(r"^!\[[^\]]*\]\(([^)]+)\)", s)
        if m:
            els.append(("image", os.path.join(base_dir, m.group(1))))
            i += 1
            continue
        if s.startswith("#### "):
            els.append(("h3", s[5:]))
        elif s.startswith("### "):
            els.append(("h2", s[4:]))
        elif s.startswith("## "):
            els.append(("h1", s[3:]))
        elif s.startswith("# "):
            els.append(("title", s[2:]))
        elif re.match(r"^(\s*)[-*•·]\s+", line):
            ind = len(re.match(r"^(\s*)", line).group(1))
            els.append(("bullet2" if ind >= 2 else "bullet", re.sub(r"^\s*[-*•·]\s+", "", line)))
        elif re.match(r"^\s*\d+[.)]\s+", s):
            els.append(("number", re.sub(r"^\s*\d+[.)]\s+", "", s)))
        elif s.startswith("※"):
            els.append(("note", s[1:].strip()))
        else:
            els.append(("body", s))
        i += 1
    return els


def parse_docx(path):
    from docx import Document
    from docx.oxml.ns import qn
    doc = Document(path)
    els = []
    rels = {r.rId: r for r in doc.part.rels.values()}
    paras = {p._p: p for p in doc.paragraphs}
    tables = {t._tbl: t for t in doc.tables}
    for child in doc.element.body.iterchildren():
        if child.tag == qn('w:p'):
            p = paras.get(child)
            if p is None:
                continue
            name = (p.style.name if p.style else "") or ""
            for b in child.findall('.//' + qn('a:blip')):
                rid = b.get(qn('r:embed'))
                if rid in rels:
                    els.append(("image_bytes", rels[rid].target_part.blob))
            t = "".join(("**" + r.text + "**") if (r.bold and r.text.strip()) else r.text for r in p.runs).strip()
            if not t:
                continue
            if name == "Title":
                els.append(("title", t))
            elif name.startswith("Heading 1") or name == "제목 1":
                els.append(("h1", t))
            elif name.startswith("Heading 2") or name == "제목 2":
                els.append(("h2", t))
            elif name.startswith("Heading") or name.startswith("제목"):
                els.append(("h3", t))
            elif "Bullet" in name:
                els.append(("bullet2" if name.endswith("2") else "bullet", t))
            elif "Number" in name:
                els.append(("number", t))
            elif t.startswith("※"):
                els.append(("note", t[1:].strip()))
            else:
                els.append(("body", t))
        elif child.tag == qn('w:tbl'):
            tb = tables.get(child)
            if tb is not None:
                els.append(("table", [[c.text.strip() for c in r.cells] for r in tb.rows]))
    return els


# ---------------- 생성 ----------------
class Forge:
    def __init__(self, ref, profile, plan=None, spec=None):
        self.doc = HwpxDocument.open(ref)
        self._ref = ref
        self.prof = profile
        self.roles = profile["roles"]
        self.plan = plan
        self.counters = {"h1": 0, "h2": 0, "h3": 0, "number": 0}
        self._bold_cache = {}
        self._para_cache = {}
        self._table_preset = (spec or {}).get("table")
        if spec:
            self.apply_spec(spec)
        # 본문 글자 크기를 들여쓰기 계산 기준(1글자 폭)으로 쓴다
        self.base_pt = self.roles.get("body", {}).get("size_pt") or self.char_size(self.roles["body"]["char"]) or 13.0
        if self.plan:
            self.plan.base_pt = self.base_pt
        pg = profile.get("page") or {}
        if pg:
            # 본문 폭 = 쪽 폭 − 좌우 여백 − 제본 여백. 넘으면 표가 쪽 밖으로 삐져나간다.
            self.text_w = int((pg.get("width_mm", 210) - pg.get("left", 20) - pg.get("right", 20)
                               - (pg.get("gutter") or 0)) * HWP_PER_MM)
        else:
            self.text_w = 45000

    def clear_body(self):
        # 참조가 여러 구역(section)이면 첫 구역만 남긴다 — 다른 구역의 마지막 문단은 지울 수 없어 예외가 난다
        try:
            secs = list(self.doc.sections)
            for s in secs[1:]:
                try:
                    self.doc.remove_section(s)
                except Exception:
                    pass
        except Exception:
            pass
        ps = list(self.doc.paragraphs)
        for p in ps[1:]:
            try:
                p.remove()
            except ValueError:            # 구역의 마지막 문단은 못 지운다 → 비우기만
                p.clear_text()
        p0 = ps[0]
        p0.clear_text()
        # 첫 문단 안의 표·그림·도형·텍스트(제목 상자 등)는 제거, 구역설정(secPr)·단설정(ctrl)만 보존
        for run in list(p0.element.findall('{%s}run' % HP)):
            for ch in list(run):
                if not (ch.tag.endswith('}secPr') or ch.tag.endswith('}ctrl')):
                    run.remove(ch)
            if len(run) == 0:
                p0.element.remove(run)
        for ch in list(p0.element):                       # linesegarray 등 남은 배치 정보도 제거(한컴이 재계산)
            if ch.tag.endswith('}linesegarray'):
                p0.element.remove(ch)
        # ★ 참조 문서의 머리말·꼬리말을 지운다. 안 지우면 남의 대회 이름이 우리 제출본 하단에
        #   그대로 박힌다("2026 국민행복 서비스 발굴·창업경진대회"가 실제로 남아 있었다).
        for fn in ("remove_header", "remove_footer"):
            try:
                getattr(self.doc, fn)()
            except Exception:
                pass
        b = self.roles["body"]
        p0.element.set("paraPrIDRef", b["para"])
        p0.element.set("styleIDRef", b["style"])
        self.p0 = p0

    def _load_ref_styles(self):
        if not hasattr(self, "_cps"):
            import profile_ref as PR
            _, _, self._fonts, self._cps, _ = PR.load(self._ref)
        return self._cps, self._fonts

    def char_size(self, cid):
        import profile_ref as PR
        cps, fonts = self._load_ref_styles()
        return (PR.char_info(cps, fonts, cid) or {}).get("size_pt")

    def apply_spec(self, spec):
        """사용자 지정 서식(spec.json)으로 역할별 글꼴·크기·굵게·정렬·줄간격·글머리기호를 덮어쓴다.

        참조 문서는 쪽 여백과 스타일 저장소로만 쓰이고, 실제 서식은 사용자가 정한 값이 이긴다.
        """
        import profile_ref as PR
        cps, fonts = self._load_ref_styles()
        base = spec.get("base") or {}
        for role, ov in (spec.get("levels") or {}).items():
            if role not in self.roles or not isinstance(ov, dict):
                continue
            r = self.roles[role]
            ci = PR.char_info(cps, fonts, r["char"]) or {}
            font = ov.get("font") or base.get("font") or ci.get("font")
            size = ov.get("size_pt") or base.get("size_pt") or ci.get("size_pt")
            bold = ov.get("bold") if ov.get("bold") is not None else ci.get("bold")
            kw = {"bold": bool(bold)}
            if font:
                kw["font"] = font
            if size:
                kw["size"] = size
            if ci.get("ratio") not in (None, 100):
                kw["ratio"] = ci["ratio"]
            if ci.get("spacing"):
                kw["letter_spacing"] = ci["spacing"]
            try:
                r["char"] = self.doc.styles.ensure_run(**kw)
                r["size_pt"] = size
            except Exception as e:
                print("   (spec 글자속성 적용 실패 %s: %s)" % (role, e))
            if "lead" in ov and ov["lead"] is not None:
                r["lead"] = ov["lead"]
                r["lead_kind"] = PR.lead_kind_of(ov["lead"])
                r["auto_heading"] = False
            align = ov.get("align") or base.get("align")
            ls = ov.get("line_spacing") or base.get("line_spacing")
            if align or ls:
                p = self.doc.add_paragraph("", style_id_ref=r["style"], para_pr_id_ref=r["para"],
                                           char_pr_id_ref=r["char"], include_run=False, inherit_style=False)
                idx = len(list(self.doc.paragraphs)) - 1
                self.doc.set_paragraph_format(paragraph_index=idx, alignment=align, line_spacing_percent=ls)
                r["para"] = str(list(self.doc.paragraphs)[idx].para_pr_id_ref)
                p.remove()
        pg = spec.get("page") or {}
        if pg.get("margin_mm"):
            try:
                self.doc.set_page_setup(margins_mm=pg["margin_mm"])
            except Exception as e:
                print("   (spec 쪽여백 적용 실패: %s)" % e)

    def bold_char(self, cid):
        """참조 charPr(cid)와 글꼴·크기·자간·장평·색이 같은 굵은 charPr 을 확보한다(없으면 python-hwpx 가 새로 만든다)."""
        if cid not in self._bold_cache:
            import profile_ref as PR
            if not hasattr(self, "_cps"):
                _, _, self._fonts, self._cps, _ = PR.load(self._ref)
            ci = PR.char_info(self._cps, self._fonts, cid) or {}
            kw = dict(bold=True)
            if ci.get("font"):
                kw["font"] = ci["font"]
            if ci.get("size_pt"):
                kw["size"] = ci["size_pt"]
            if ci.get("ratio") not in (None, 100):
                kw["ratio"] = ci["ratio"]
            if ci.get("spacing"):
                kw["letter_spacing"] = ci["spacing"]
            if ci.get("color") and ci["color"] not in ("#000000", "none"):
                kw["color"] = ci["color"]
            try:
                self._bold_cache[cid] = self.doc.styles.ensure_run(**kw)
            except Exception as e:
                print("   (굵게 charPr 파생 실패, 기본 굵게 사용: %s)" % e)
                self._bold_cache[cid] = self.doc.styles.ensure_run(bold=True)
        return self._bold_cache[cid]

    def role(self, name):
        return self.roles.get(name) or self.roles.get("bullet") or self.roles["body"]

    def derive_para(self, r, left_mm, first_mm):
        """참조 문단속성에서 '왼여백·첫줄 들여쓰기'만 바꾼 문단속성을 한 번 만들어 재사용한다.

        정렬·줄간격·문단 앞뒤 간격 등 나머지는 참조 값을 그대로 물려받는다.
        """
        key = (r["para"], round(left_mm, 2), round(first_mm, 2))
        if key not in self._para_cache:
            p = self.doc.add_paragraph("", style_id_ref=r["style"], para_pr_id_ref=r["para"],
                                       char_pr_id_ref=r["char"], include_run=False, inherit_style=False)
            idx = len(list(self.doc.paragraphs)) - 1
            self.doc.set_paragraph_format(paragraph_index=idx, indent_left_mm=left_mm, first_line_indent_mm=first_mm)
            self._para_cache[key] = str(list(self.doc.paragraphs)[idx].para_pr_id_ref)
            p.remove()
        return self._para_cache[key]

    def auto_mark(self, r):
        """자동 글머리표가 붙는 역할이 화면에 실제로 찍는 기호. 텍스트에는 없으므로 정의에서 읽는다."""
        import profile_ref as PR
        if not isinstance(r, dict) or not r.get("para"):
            return ""
        root = self.doc.parts.headers[0].element
        _, _, pps = PR.index_styles(root)
        pi = PR.para_info(pps, r["para"]) or {}
        hd = pi.get("heading")
        if not hd or (hd[0] or "NONE") == "NONE":
            return ""
        if hd[0] == "BULLET":
            b = self.doc.styles.bullets.get(str(hd[1]))
            return (getattr(b, "char", "") or "•") if b is not None else "•"
        return "1."

    def no_bullet_para(self, pid):
        """표 셀용 문단속성 — 자동 글머리표를 뗀다.

        ★ 참조 표의 셀 문단에 글머리표가 걸려 있으면 우리 표 데이터마다 '•' 가 붙는다
          ("• 서울시 상권분석 서비스" 처럼 실제로 붙었다).
        """
        import copy
        import profile_ref as PR
        if not hasattr(self, "_nb_cache"):
            self._nb_cache = {}
        pid = str(pid)
        if pid in self._nb_cache:
            return self._nb_cache[pid]
        root = self.doc.parts.headers[0].element
        src = next((e for e in root.iter('{%s}paraPr' % PR.HH) if e.get("id") == pid), None)
        hd = src.find('{%s}heading' % PR.HH) if src is not None else None
        if src is None or hd is None or (hd.get("type") or "NONE") == "NONE":
            self._nb_cache[pid] = pid
            return pid
        props = next((e for e in root.iter('{%s}paraProperties' % PR.HH)), None)
        if props is None:
            self._nb_cache[pid] = pid
            return pid
        new = copy.deepcopy(src)
        ids = [int(e.get("id")) for e in root.iter('{%s}paraPr' % PR.HH) if (e.get("id") or "").isdigit()]
        nid = str(max(ids) + 1)
        new.set("id", nid)
        nh = new.find('{%s}heading' % PR.HH)
        nh.set("type", "NONE")
        nh.set("idRef", "0")
        nh.set("level", "0")
        props.append(new)
        props.set("itemCnt", str(len(props)))
        self.doc.parts.headers[0].mark_dirty()
        self._nb_cache[pid] = nid
        return nid

    def para_for(self, role, r, lead):
        """이 문단이 쓸 문단속성 id — 계층 들여쓰기가 켜져 있으면 왼여백을 계산해 새로 파생."""
        if not self.plan or not self.plan.enabled:
            return self.derive_para(r, r["indent_mm"], 0.0) if r.get("indent_mm") else r["para"]
        size = (r.get("size_pt") or self.base_pt)
        left, first = self.plan.indent_mm(role, lead, size)
        if left is None:
            return r["para"]
        return self.derive_para(r, left, first)

    def lead_for(self, role):
        r = self.role(role)
        if r.get("auto_heading") or not r.get("lead"):
            return ""
        kind, lead = r.get("lead_kind"), r["lead"]
        if kind == "num":
            self.counters[role] = self.counters.get(role, 0) + 1
            if lead.rstrip(".").count(".") >= 1:
                # 다단 번호(1.1). 자릿수는 참조의 lead 가 아니라 '이 역할의 계층 깊이'가 정한다
                # → h1 은 "1.", h2 는 "1.1", h3 는 "1.1.1". 참조 lead 를 그대로 쓰면 대제목이 "1" 처럼 어정쩡해진다.
                chain = ["h1", "h2", "h3"]
                idx = chain.index(role) if role in chain else len(chain) - 1
                parts = [max(1, self.counters.get(x, 0)) for x in chain[:idx]] + [self.counters[role]]
                return (".".join(str(x) for x in parts) + ("." if len(parts) == 1 else "")) + " "
            return re.sub(r"\d+", str(self.counters[role]), lead) + " "
        if kind == "ga":
            self.counters[role] = self.counters.get(role, 0) + 1
            sep = lead[-1] if lead and lead[-1] in ".)" else "."   # '가)' 를 '가.' 로 바꿔 찍던 버그
            return GA[(self.counters[role] - 1) % len(GA)] + sep + " "
        if kind == "circ":
            self.counters[role] = self.counters.get(role, 0) + 1
            return CIRCLED[(self.counters[role] - 1) % len(CIRCLED)] + " "
        return lead + " "

    def reset_below(self, role):
        order = ["h1", "h2", "h3", "number"]
        if role in order:
            for r in order[order.index(role) + 1:]:
                self.counters[r] = 0

    def add_para(self, role, text):
        r = self.role(role)
        self.reset_below(role)
        # ★ 자동 글머리표가 붙는 계층이 상위와 같은 기호를 찍으면 화면에서 구분되지 않는다
        #   (h2·h3 가 둘 다 '❍', 번호목록이 대제목과 똑같이 '1.').
        #   자동 글머리는 텍스트에 없으므로 정의에서 읽어 비교하고, 겹치면 떼고 표준 기호를 붙인다.
        #   ※ number 에 기본 기호를 채우기 **전에** 판단해야 한다 — 채운 뒤엔 조건이 막힌다.
        if role in ("h3", "number") and r.get("auto_heading"):
            mine = self.auto_mark(r)
            others = [self.auto_mark(self.roles.get(k) or {}) or (self.roles.get(k) or {}).get("lead")
                      for k in ("h1", "h2", "h3") if k != role]
            if mine and mine in others:
                alt = next((g for g in ("1)", "가)", "(1)", "①") if g not in others and g != mine), "1)")
                r = dict(r, para=self.no_bullet_para(r["para"]), auto_heading=False, lead=alt,
                         lead_kind="num" if (alt[0].isdigit() or alt.startswith("(")) else "ga")
                self.roles[role] = r
        lead = "" if (role == "title" and r.get("fallback")) else self.lead_for(role)   # 빌린 제목 서식엔 기호를 붙이지 않음
        if role == "number" and not lead:
            self.counters["number"] += 1
            lead = "%d. " % self.counters["number"]
        if self.plan:
            self.plan.note_role(role)
        para = self.para_for(role, r, lead)
        p = self.doc.add_paragraph("", style_id_ref=r["style"], para_pr_id_ref=para, char_pr_id_ref=r["char"],
                                   include_run=False, inherit_style=False)
        first = True
        for seg, bold in parse_inline(text):
            if first:
                seg = lead + seg
                first = False
            p.add_run(seg, char_pr_id_ref=self.bold_char(r["char"]) if bold else r["char"])
        if role == "title" and r.get("fallback"):
            # 참조에 제목 서식이 없어 대제목 서식을 빌린 경우: 가운데 정렬 문단속성을 새로 만들어 붙인다
            try:
                self.doc.set_paragraph_format(paragraph_index=len(list(self.doc.paragraphs)) - 1, alignment="CENTER")
            except Exception as e:
                print("   (제목 가운데 정렬 실패: %s)" % e)
        return p

    def table_style(self):
        """표 프리셋(--table)이 지정되면 borderFill 을 새로 만들어 (머리행, 데이터행) id 를 돌려준다."""
        if not self._table_preset:
            return None
        if not hasattr(self, "_tbf"):
            t = self._table_preset
            head = self.doc.styles.ensure_border_fill(border_color=t["border_color"], border_width=t["border_width"],
                                                      fill_color=t.get("head_fill"))
            body = self.doc.styles.ensure_border_fill(border_color=t["border_color"], border_width=t["border_width"])
            hc = {"bold": bool(t.get("head_bold"))}
            if t.get("head_color"):
                hc["color"] = t["head_color"]
            base = (self.roles.get("table") or {}).get("head", {}).get("char") or self.roles["body"]["char"]   # 참조에 표가 없을 수도
            import profile_ref as PR
            cps, fonts = self._load_ref_styles()
            ci = PR.char_info(cps, fonts, base) or {}
            if ci.get("font"):
                hc["font"] = ci["font"]
            if ci.get("size_pt"):
                hc["size"] = ci["size_pt"]
            self._tbf = {"head_bf": str(head), "body_bf": str(body), "head_char": str(self.doc.styles.ensure_run(**hc))}
        return self._tbf

    def add_table(self, rows):
        tr = self.roles.get("table") or {}
        ncol = max(len(r) for r in rows)
        body = self.roles["body"]
        head, tbody = dict(tr.get("head") or {}), dict(tr.get("body") or {})
        for spec in (head, tbody):                       # 참조 셀에 글자속성이 없으면 본문 속성으로
            for k in ("para", "char", "style", "bf"):
                if spec.get(k) in (None, "None", ""):
                    spec[k] = None
            if not spec.get("char"):
                spec["char"] = body["char"]
        ts = self.table_style()
        if ts:                                            # 표 프리셋이 지정되면 참조 표 서식을 덮어쓴다
            head["bf"], tbody["bf"] = ts["head_bf"], ts["body_bf"]
            head["char"] = ts["head_char"]
            tbody["char"] = body["char"]
        t = self.doc.add_table(len(rows), ncol, width=self.text_w, border_fill_id_ref=(ts["body_bf"] if ts else tr.get("bf")),
                               para_pr_id_ref=body["para"], style_id_ref=body["style"], char_pr_id_ref=body["char"])
        for ri, row in enumerate(rows):
            spec = head if ri == 0 else tbody
            for ci in range(ncol):
                txt = row[ci] if ci < len(row) else ""
                cell = t.cell(ri, ci)
                cell.set_text(re.sub(r"\*\*", "", txt))
                for cp in cell.paragraphs:
                    if spec.get("para"):
                        cp.element.set("paraPrIDRef", self.no_bullet_para(spec["para"]))
                    if spec.get("style"):
                        cp.element.set("styleIDRef", spec["style"])
                    if spec.get("char"):
                        for run in cp.element.findall('{%s}run' % HP):
                            run.set("charPrIDRef", spec["char"])
                if spec.get("bf"):
                    t.set_cell_border_fill(ri, ci, spec["bf"])
        widths = [max(1, max((len(r[ci]) if ci < len(r) else 1) for r in rows)) for ci in range(ncol)]
        t.set_column_widths([min(w, 30) + 4 for w in widths])
        # 행 높이를 내용에 맞춘다 — 셀 글이 두 줄로 접히면 한/글이 늘리긴 하지만, 파일 값도 맞춰 두어야
        # 검사·다른 뷰어에서 '칸 넘침'으로 보이지 않는다
        try:
            from hwpx.form_fit import estimate_lines
            import profile_ref as PR
            cps, fonts = self._load_ref_styles()
            for ri, row in enumerate(rows):
                need = 0
                for ci in range(ncol):
                    cell = t.cell(ri, ci)
                    txt = re.sub(r"\*\*", "", row[ci] if ci < len(row) else "")
                    spec = head if ri == 0 else tbody
                    pt = (PR.char_info(cps, fonts, spec.get("char")) or {}).get("size_pt") or 10.0
                    avail = max(1000, (cell.width or 8000) - 1020)
                    lines = max(1, estimate_lines(txt, avail, pt))
                    need = max(need, int(lines * pt * 100 * 1.6 + 282 + pt * 25))
                for ci in range(ncol):
                    c2 = t.cell(ri, ci)
                    if c2.height and c2.height < need:
                        c2.set_size(height=need)
            t.mark_dirty()
        except Exception as e:
            print("   (표 행 높이 맞춤 생략: %s)" % e)
        self.doc.add_paragraph("", style_id_ref=body["style"], para_pr_id_ref=body["para"], char_pr_id_ref=body["char"], inherit_style=False)
        return t

    def add_image(self, data, fmt="png"):
        try:
            from PIL import Image
            im = Image.open(io.BytesIO(data))
            w, h = im.size
        except Exception:
            w, h = 800, 600
        wm = min((self.text_w / HWP_PER_MM) * 0.9, 150.0)
        hm = wm * h / w
        body = self.roles["body"]
        self.doc.add_picture(data, fmt, width_mm=wm, height_mm=hm, align="CENTER", para_pr_id_ref=body["para"], style_id_ref=body["style"])

    def build(self, els):
        self.clear_body()
        for kind, val in els:
            if kind == "table":
                self.add_table(val)
            elif kind == "image":
                if os.path.exists(val):
                    self.add_image(open(val, "rb").read(), os.path.splitext(val)[1].lstrip(".").lower() or "png")
            elif kind == "image_bytes":
                self.add_image(val)
            else:
                self.add_para(kind, val)

    def save(self, out):
        rep = self.doc.save_to_path(out, return_report=True)
        v = HwpxDocument.open(out).validate()
        return rep, v


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("content")
    ap.add_argument("ref")
    ap.add_argument("out")
    ap.add_argument("--profile", default=None)
    ap.add_argument("--roles", default=None, help="역할 덮어쓰기 JSON (LLM/사람)")
    ap.add_argument("--indent", default="gov",
                    help="계층 들여쓰기: gov(기본, 레벨당 1글자) | wide | ref(참조 그대로) | '0,5,10,15'(레벨별 mm)")
    ap.add_argument("--spec", default=None, help="사용자 지정 서식 JSON — 글꼴·크기·굵게·글머리기호·정렬·줄간격을 직접 지정")
    ap.add_argument("--make-spec", default=None, metavar="OUT.json", help="참조에서 수정용 spec 템플릿을 뽑고 종료")
    ap.add_argument("--hierarchy", default="ref", help="계층 기호: gov|symbol|num|mixed|plain|ref")
    ap.add_argument("--table", default="ref", help="표 서식: gray|navy|light|plain|ref")
    ap.add_argument("--font", default="ref", help="글꼴: malgun|hcr|batang|gothic|ref")
    ap.add_argument("--size", type=float, default=None, help="본문 글자 크기 pt")
    ap.add_argument("--line-spacing", type=int, default=None, help="줄간격 %%")
    ap.add_argument("--list-presets", action="store_true", help="고를 수 있는 프리셋 목록 출력")
    a = ap.parse_args()
    import presets as PS
    if a.list_presets:
        print(PS.describe())
        return
    if a.profile and os.path.exists(a.profile):
        prof = json.load(open(a.profile, encoding="utf-8"))
    else:
        import profile_ref as PR
        prof, _ = PR.build_profile(a.ref)
    if a.roles:
        prof["roles"].update(json.load(open(a.roles, encoding="utf-8")))
    import layout as L
    if a.make_spec:
        json.dump(L.spec_template(prof), open(a.make_spec, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print("서식 템플릿 -> %s  (값을 고친 뒤 --spec 으로 넘기면 그대로 적용된다)" % a.make_spec)
        return
    spec = json.load(open(a.spec, encoding="utf-8")) if a.spec else None
    if a.hierarchy != "ref" or a.table != "ref" or a.font != "ref" or a.size or a.line_spacing:
        pre = PS.build_spec(a.hierarchy, a.table, a.font, a.size, a.line_spacing)
        if spec:                                   # --spec 파일이 있으면 그쪽 값이 이긴다
            for role, lv in pre["levels"].items():
                spec.setdefault("levels", {}).setdefault(role, {})
                for k, v in lv.items():
                    spec["levels"][role].setdefault(k, v)
            for k, v in pre["base"].items():
                spec.setdefault("base", {}).setdefault(k, v)
            spec.setdefault("table", pre["table"])
        else:
            spec = pre
    ind = (spec or {}).get("indent", {}).get("preset", a.indent) if spec else a.indent
    if "," in str(ind):
        plan = L.IndentPlan(steps_mm=[float(x) for x in str(ind).split(",")])
    elif ind == "ref":
        plan = L.IndentPlan(preset="ref")
    else:
        plan = L.IndentPlan(preset=ind if ind in L.PRESETS else "gov")
    if a.content.lower().endswith(".docx"):
        els = parse_docx(a.content)
    else:
        els = parse_markdown(open(a.content, encoding="utf-8").read(), os.path.dirname(os.path.abspath(a.content)))
    if a.out.lower().endswith(".docx"):
        import to_docx as TD
        d = TD.DocxForge(spec or {"base": {}, "levels": {}, "table": None}, plan=plan, page=prof.get("page"))
        d.build(els)
        d.save(a.out)
        from collections import Counter
        print("OK -> %s (워드)  요소 %d개 %s" % (a.out, len(els), dict(Counter(k for k, _ in els))))
        return
    f = Forge(a.ref, prof, plan=plan, spec=spec)
    f.build(els)
    rep, v = f.save(a.out)
    from collections import Counter
    print("OK -> %s  요소 %d개 %s" % (a.out, len(els), dict(Counter(k for k, _ in els))))
    print("   들여쓰기=%s%s  save mode=%s  XSD issues=%s"
          % (ind, " spec=%s" % a.spec if a.spec else "", getattr(rep, 'actual_mode', '?'), list(v.issues) or '없음'))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
