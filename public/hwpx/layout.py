"""
layout.py — 계층 들여쓰기 규칙과 사용자 지정 서식(spec).

## 왜 필요한가 (실측 근거)
참조 hwpx 의 서식 ID 를 그대로 물려받아도 '꼭지 밑 하위 글의 들여쓰기'는 생기지 않는다.
LibreOffice 로 렌더한 서울시 공고문 PDF 에서 각 줄의 첫 글자 x 좌표를 재보면:

    1. 대회 개요        x=51.1  (왼쪽 마진)
    ㅇ 대 회 명: ...     x=56.4  (+5.3pt)
    - 주요내용 : ...     x=65.2  (+14.1pt)
    ※ 팀의 경우 ...      x=66.7  (+15.6pt)

문단의 왼여백(paraPr margin left)은 셋 다 0 이다. 즉 참조 문서는 **본문 텍스트 앞에 공백을
넣어** 계층을 만든다. 서식 ID 만 베끼면 그 공백이 없으니 전부 왼쪽에 붙는다.

## 이 모듈의 해법
공백 대신 **문단 왼여백 + 내어쓰기**로 계층을 만든다. 편집이 쉽고, 줄바꿈되어도 항목 내용에
맞춰 정렬된다(공문서 규칙: "항목이 두 줄 이상이면 둘째 줄부터 항목 내용의 첫 글자에 맞춘다").

레벨당 들여쓰기는 「행정업무의 운영 및 혁신에 관한 규정 시행규칙」의 항목 구분 관행을 따른다.
상위 항목보다 2타(= 한글 1글자) 오른쪽에서 시작. 항목 기호는 1. / 가. / 1) / 가) / (1) / (가) / ① / ㉮.
"""
from __future__ import annotations

PT_PER_MM = 72 / 25.4


def mm(pt):
    return pt / PT_PER_MM


def width_em(s):
    """문자열의 폭을 em(한글 1글자) 단위로. 전각 1.0, 반각 0.5."""
    return sum(1.0 if ord(ch) > 0x2000 else 0.5 for ch in s)


# 문서 계층에서 각 역할의 깊이. body/bullet/note 는 '지금 열려 있는 계층' 아래로 들어간다.
FIXED_DEPTH = {"title": 0, "h1": 1, "h2": 2, "h3": 3}

# 「행정업무규정 시행규칙」 항목 구분 순서 (필요 시 □ ○ - ㆍ 같은 특수기호 사용 허용)
GOV_MARKS = ["1.", "가.", "1)", "가)", "(1)", "(가)", "①", "㉮"]

PRESETS = {
    # 공문서 관행: 레벨당 1글자 들여쓰기 + 내어쓰기(둘째 줄을 항목 내용에 맞춤). 기본값.
    "gov": {"step_em": 1.0, "hang": True},
    # 더 깊은 들여쓰기
    "wide": {"step_em": 1.5, "hang": True},
    # 내어쓰기 없이 왼여백만. 줄바꿈된 둘째 줄이 기호 아래로 오지만 모든 뷰어에서 동일하게 보인다.
    "flat": {"step_em": 1.0, "hang": False},
    # 참조 문서 그대로 (들여쓰기 손대지 않음)
    "ref": None,
}


class IndentPlan:
    """역할 → (왼여백 mm, 첫줄 들여쓰기 mm) 를 계산한다."""

    def __init__(self, preset="gov", base_pt=13.0, steps_mm=None):
        self.cfg = PRESETS.get(preset, PRESETS["gov"]) if steps_mm is None else {"step_em": None, "hang": True, "body_extra_em": 0.0}
        self.base_pt = base_pt or 13.0
        self.steps_mm = steps_mm          # 사용자가 직접 준 레벨별 mm 목록
        self.depth = 0                    # 지금 열려 있는 계층(h1/h2/h3 를 만나면 갱신)

    @property
    def enabled(self):
        return self.cfg is not None

    def note_role(self, role):
        if role in ("h1", "h2", "h3"):
            self.depth = FIXED_DEPTH[role]
        elif role == "title":
            self.depth = 0

    def level_of(self, role):
        if role in FIXED_DEPTH:
            return FIXED_DEPTH[role]
        if role == "bullet2":
            return self.depth + 2
        if role in ("bullet", "body", "note", "number"):
            return self.depth + 1
        return self.depth

    def indent_mm(self, role, lead, size_pt=None):
        """(left_mm, first_line_mm). left 는 항목 내용의 왼쪽 선, first 는 기호를 왼쪽으로 빼는 음수."""
        if not self.enabled:
            return None, None
        lvl = self.level_of(role)
        pt = size_pt or self.base_pt
        if self.steps_mm is not None:
            base = self.steps_mm[min(max(lvl - 1, 0), len(self.steps_mm) - 1)]
        else:
            base = mm(max(0, lvl - 1) * self.cfg["step_em"] * self.base_pt)
        # lead 에는 이미 뒤 공백이 붙어 온다. strip 후 폭을 재고 공백 반 칸만 더한다.
        hang = mm((width_em(lead.strip()) + 0.5) * pt) if (lead.strip() and self.cfg["hang"]) else 0.0
        return round(base + hang, 2), round(-hang, 2) if hang else 0.0

    def preview(self, roles, base_pt=None):
        """역할별 논리 위치(첫 줄 / 둘째 줄, mm)를 표로 계산 — 렌더러를 믿지 못할 때 쓰는 검증표."""
        self.depth = 0
        rows = []
        for role in ("title", "h1", "h2", "h3", "body", "bullet", "bullet2", "number", "note"):
            r = roles.get(role) or {}
            self.note_role(role)
            lead = (r.get("lead") or "")
            left, first = self.indent_mm(role, lead + " " if lead else "", r.get("size_pt") or base_pt)
            if left is None:
                rows.append((role, lead, None, None))
            else:
                rows.append((role, lead, round(left + first, 2), round(left, 2)))
        self.depth = 0
        return rows


def spec_template(profile):
    """참조에서 뽑은 profile 을 사람이 고치기 쉬운 spec 으로 변환 — '사용자가 원하는 서식' 출발점."""
    out = {"_설명": "값을 고치면 그대로 반영된다. font/size_pt/bold/lead 를 비우면 참조 문서 값을 쓴다.",
           "indent": {"preset": "gov", "step_em": 1.0},
           "page": profile.get("page"), "levels": {}}
    for role in ("title", "h1", "h2", "h3", "bullet", "bullet2", "number", "note", "body"):
        r = (profile.get("roles") or {}).get(role) or {}
        out["levels"][role] = {"lead": r.get("lead", ""), "font": None, "size_pt": None,
                               "bold": None, "align": None, "line_spacing": None,
                               "_참조": r.get("desc", "")}
    return out
