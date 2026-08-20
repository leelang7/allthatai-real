# -*- coding: utf-8 -*-
"""쇼츠 배경(SDXL) 프롬프트 다양화기.

문제: 배경 프롬프트를 손으로 쓰다 보면 같은 템플릿을 계속 복붙하게 되고,
      결과적으로 채널 전체 톤이 하나로 수렴한다(청록+다크+보케).
해결: 주제 문자열을 해시해 팔레트·화풍·구도·조명을 결정적으로 골라 조합한다.
      같은 주제는 항상 같은 배경(재현 가능), 다른 주제는 확실히 다른 배경.

사용:
    from bg_palette import bg_for
    bg = bg_for("모두의 AI 6파전", subject="six consortiums competing for a national AI project")
"""
import hashlib

# 12 팔레트 — 색이 겹치지 않도록 계열을 흩어놓는다.
PALETTES = [
    "deep indigo and hot magenta accents",
    "emerald green and lime highlights",
    "warm amber and crimson accents",
    "violet and electric cyan accents",
    "slate blue and burnt orange accents",
    "teal and coral accents",
    "dusty rose and antique gold accents",
    "forest green and warm brass accents",
    "midnight navy and ice blue accents",
    "burgundy and cream accents",
    "copper and charcoal accents",
    "mint green and graphite accents",
]

# 8 화풍 — 사진/일러스트/3D/그래픽을 섞는다.
STYLES = [
    "cinematic photography with shallow depth of field",
    "isometric 3d render, clean studio lighting",
    "flat vector editorial illustration, bold shapes",
    "macro photography, crisp texture detail",
    "long exposure light trails, motion energy",
    "layered paper cutout diorama",
    "technical blueprint schematic look",
    "textured oil painting, visible brush strokes",
]

# 6 구도 — 피사체 배치를 바꿔 화면 리듬을 다르게.
COMPOSITIONS = [
    "wide establishing shot, subject small in frame",
    "close-up hero shot, subject centered",
    "top-down flat lay arrangement",
    "low angle looking up, dramatic scale",
    "diagonal dynamic composition, strong leading lines",
    "symmetrical centered composition, calm balance",
]

# 6 조명/배경 밝기 — 다크 일변도에서 벗어난다.
LIGHTING = [
    "dark moody background, rim lighting",
    "bright airy background, soft daylight",
    "high contrast dramatic spotlight",
    "soft gradient background, diffused light",
    "golden hour warm sunlight",
    "cool overcast even lighting",
]

# 모든 배경에 공통으로 지켜야 할 제약(자막 자리 확보 + 텍스트/로고/얼굴 배제).
CONSTRAINT = "negative space at top for title, no text, no letters, no logos, no watermarks, no human faces, high detail"


def _idx(topic: str, salt: str, n: int) -> int:
    h = hashlib.sha256((salt + "|" + topic).encode("utf-8")).hexdigest()
    return int(h[:8], 16) % n


def bg_for(topic: str, subject: str) -> str:
    """주제별로 팔레트·화풍·구도·조명이 갈리는 배경 프롬프트를 만든다.

    topic   : 영상 주제(해시 시드). 같은 주제 → 같은 배경.
    subject : 그림에 담을 대상 묘사(영문). 예: "a home router sending signals"
    """
    p = PALETTES[_idx(topic, "pal", len(PALETTES))]
    s = STYLES[_idx(topic, "sty", len(STYLES))]
    c = COMPOSITIONS[_idx(topic, "cmp", len(COMPOSITIONS))]
    l = LIGHTING[_idx(topic, "lgt", len(LIGHTING))]
    return f"{subject}, {s}, {c}, {l}, {p}, {CONSTRAINT}"


def preview(topics):
    for t in topics:
        print(f"- {t}\n    {bg_for(t, 'SUBJECT')}\n")


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        preview(sys.argv[1:])
    else:
        preview([
            "모두의 AI 6파전 네이버는 왜 빠졌나",
            "KT가 국산 반도체에 자체 AI 넣어 팔기 시작했다",
            "강남 심야 자율주행 택시 19대로 늘어난다",
            "청년월세 특별지원 월 20만원 받는 법",
            "직장인 건강검진 안 받으면 과태료 나옵니다",
            "아이돌봄서비스 정부지원 등급부터 확인",
        ])
