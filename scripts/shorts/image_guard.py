# -*- coding: utf-8 -*-
"""발행 전에 생성된 **이미지 자체**를 판별 모델로 본다.

왜 필요한가
----------
2026-09-02, "복부초음파" 편의 배경으로 SDXL 이 **전신 나체**를 그렸고 그대로 공개
발행돼 유튜브에서 노출 정책 위반으로 삭제됐다.

첫 대응은 프롬프트에서 위험 낱말을 거르는 것이었는데 그건 검수가 아니다. 프롬프트가
깨끗해도 모델은 딴 걸 그린다. 사고의 본질은 **아무도 결과물을 보지 않고 공개한 것**이다.

두 번째 시도는 살색 비율이었는데 그것도 버렸다. 구리색 실험기구 사진을 84% 살색으로
읽어 정상 배경 열 개 중 다섯을 막았다. 절반을 막는 검사는 결국 꺼지고, 꺼진 검사는
없는 것만 못하다.

지금은 학습된 분류기를 쓴다. 실측(2026-09-02):
    사고 이미지        nsfw 1.000
    정상 배경 8개      nsfw 0.000 ~ 0.001
경계가 이렇게 벌어져 있으면 임계값을 어디에 둬도 갈린다.

사용:
    python image_guard.py <이미지경로> [--json]
    종료 코드 0 = 통과, 2 = 차단
"""

import io
import json
import os
import sys

MODEL = "Falconsai/nsfw_image_detection"

# 실측상 정상은 0.001 아래, 사고는 1.000 이었다. 0.5 는 그 사이 어디든 안전하다.
BLOCK = 0.5

# 이 위면 통과시키되 사람이 한 번 보게 표시한다.
WARN = 0.10

_clf = None


def _classifier():
    """모델을 한 번만 올린다(12편이면 12번 부른다)."""
    global _clf
    if _clf is None:
        from transformers import pipeline
        _clf = pipeline("image-classification", model=MODEL, device=-1)
    return _clf


def nsfw_score(path):
    """이미지의 nsfw 확률(0~1). 판정 불가면 None."""
    scores = {d["label"]: d["score"] for d in _classifier()(path)}
    return scores.get("nsfw")


def check(path):
    """(통과여부, 등급, 설명, 점수).

    검사를 **못 했을 때는 통과시킨다.** 모델을 못 올렸다고 그날 발행이 통째로
    멈추면 안 된다 — 다만 등급을 skip 으로 남겨 호출부가 로그에 적게 한다.
    """
    if not os.path.exists(path):
        return True, "skip", "이미지가 없어 검사하지 않음", None
    try:
        score = nsfw_score(path)
    except Exception as e:
        return True, "skip", "검사 실패(%s)" % e, None
    if score is None:
        return True, "skip", "모델이 점수를 주지 않음", None

    if score >= BLOCK:
        return (False, "block",
                "선정적 이미지로 판정(%.3f). 발행을 멈춥니다." % score, score)
    if score >= WARN:
        return (True, "warn",
                "애매합니다(%.3f). 사람이 한 번 보세요." % score, score)
    return True, "ok", "이상 없음(%.3f)" % score, score


def main():
    if len(sys.argv) < 2:
        sys.exit("usage: python image_guard.py <image> [--json]")
    ok, level, msg, score = check(sys.argv[1])

    if "--json" in sys.argv:
        sys.stdout.write(json.dumps(
            {"ok": ok, "level": level, "message": msg, "nsfw": score},
            ensure_ascii=False))
    else:
        out = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
        out.write("[%s] %s  %s\n" % (level.upper(), os.path.basename(sys.argv[1]), msg))
        out.flush()
    return 0 if ok else 2


if __name__ == "__main__":
    sys.exit(main())
