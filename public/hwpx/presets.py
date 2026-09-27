"""
presets.py — 계층(항목기호) · 표 · 글꼴을 '골라 쓰는' 프리셋.

참조 문서를 흉내내는 것만으로는 부족하다. 문서 종류마다 관행이 다르고, 사용자가 원하는
모양이 따로 있다. 그래서 세 축을 각각 독립적으로 고르게 한다.

  --hierarchy gov|symbol|num|mixed|plain|ref     항목 기호 체계와 계층 깊이
  --table     gray|navy|light|plain|ref          표 머리행/테두리
  --font      malgun|hcr|batang|gothic|ref       글꼴 세트

'ref' 는 참조 문서에서 뽑은 값을 그대로 쓴다는 뜻이다.
"""

# ---------------------------------------------------------------- 계층(항목 기호)
# 「행정업무의 운영 및 혁신에 관한 규정 시행규칙」: 1. → 가. → 1) → 가) → (1) → (가) → ① → ㉮
# 정부 보도자료·공고문 관행: □ → ○ → - → ㆍ
HIERARCHY = {
    "gov":    {"marks": ["1.", "가.", "1)", "가)", "(1)", "(가)"],
               "bullet": "-", "bullet2": "·", "number": "1)", "note": "※",
               "desc": "행정업무규정 시행규칙 항목 기호"},
    "symbol": {"marks": ["□", "○", "-", "·"],
               "bullet": "-", "bullet2": "·", "number": "1)", "note": "※",
               "desc": "정부 공고문·보도자료 관행 기호"},
    "num":    {"marks": ["1.", "1.1", "1.1.1", "1.1.1.1"],
               "bullet": "-", "bullet2": "·", "number": "1)", "note": "※",
               "desc": "보고서형 다단 번호"},
    "mixed":  {"marks": ["Ⅰ.", "1.", "가.", "1)"],
               "bullet": "-", "bullet2": "·", "number": "1)", "note": "※",
               "desc": "제안서형(로마자 대제목)"},
    "plain":  {"marks": ["", "", "", ""],
               "bullet": "-", "bullet2": "·", "number": "1.", "note": "※",
               "desc": "기호 없이 글자 크기·굵기로만 구분"},
    "ref":    None,
}

# ---------------------------------------------------------------- 표
TABLE = {
    "gray":  {"head_fill": "#D9D9D9", "head_color": None, "head_bold": True,
              "border_color": "#000000", "border_width": "0.12 mm", "head_align": "CENTER", "desc": "머리행 회색"},
    "navy":  {"head_fill": "#1F3864", "head_color": "#FFFFFF", "head_bold": True,
              "border_color": "#1F3864", "border_width": "0.12 mm", "head_align": "CENTER", "desc": "머리행 남색+흰 글씨"},
    "light": {"head_fill": "#F2F2F2", "head_color": None, "head_bold": True,
              "border_color": "#BFBFBF", "border_width": "0.12 mm", "head_align": "CENTER", "desc": "연회색·가는 테두리"},
    "plain": {"head_fill": None, "head_color": None, "head_bold": True,
              "border_color": "#000000", "border_width": "0.12 mm", "head_align": "CENTER", "desc": "채움 없이 테두리만"},
    "ref":   None,
}

# ---------------------------------------------------------------- 글꼴
FONT = {
    "malgun": {"body": "맑은 고딕", "head": "맑은 고딕", "desc": "맑은 고딕 (설치 확실, 화면용)"},
    "hcr":    {"body": "함초롬바탕", "head": "함초롬돋움", "desc": "함초롬 (한/글 기본, 관공서 표준)"},
    "batang": {"body": "바탕", "head": "돋움", "desc": "바탕/돋움 (윈도우 기본)"},
    "gothic": {"body": "맑은 고딕", "head": "HY헤드라인M", "desc": "본문 고딕 + 강한 제목"},
    "ref":    None,
}

ROLE_ORDER = ["h1", "h2", "h3"]


def hierarchy_leads(name):
    """계층 프리셋 → 역할별 항목 기호. 없으면 None(참조 값 유지)."""
    h = HIERARCHY.get(name)
    if h is None:
        return None
    out = {}
    for i, role in enumerate(ROLE_ORDER):
        out[role] = h["marks"][i] if i < len(h["marks"]) else h["marks"][-1]
    out["bullet"] = h["bullet"]
    out["bullet2"] = h["bullet2"]
    out["number"] = h["number"]
    out["note"] = h["note"]
    out["title"] = ""
    out["body"] = ""
    return out


def describe():
    lines = ["계층(--hierarchy):"]
    for k, v in HIERARCHY.items():
        lines.append("  %-8s %s" % (k, (v["desc"] + "  " + " → ".join(m for m in v["marks"] if m)) if v else "참조 문서 그대로"))
    lines.append("표(--table):")
    for k, v in TABLE.items():
        lines.append("  %-8s %s" % (k, v["desc"] if v else "참조 문서 그대로"))
    lines.append("글꼴(--font):")
    for k, v in FONT.items():
        lines.append("  %-8s %s" % (k, v["desc"] if v else "참조 문서 그대로"))
    return "\n".join(lines)


def build_spec(hierarchy="ref", table="ref", font="ref", size_pt=None, line_spacing=None):
    """세 축의 선택을 forge 가 이해하는 spec 으로 합친다."""
    spec = {"levels": {}, "base": {}, "table": None}
    leads = hierarchy_leads(hierarchy)
    f = FONT.get(font)
    if f:
        spec["base"]["font"] = f["body"]
    if size_pt:
        spec["base"]["size_pt"] = size_pt
    if line_spacing:
        spec["base"]["line_spacing"] = line_spacing
    for role in ("title", "h1", "h2", "h3", "bullet", "bullet2", "number", "note", "body"):
        lv = {}
        if leads is not None:
            lv["lead"] = leads.get(role, "")
        if f:
            lv["font"] = f["head"] if role in ("title", "h1") else f["body"]
        if lv:
            spec["levels"][role] = lv
    spec["table"] = TABLE.get(table)
    return spec
