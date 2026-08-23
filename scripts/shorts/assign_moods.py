# 곡별 1차 무드 분류 → 재생목록 네비게이션용. meta에 mood 저장.
# 폭넓은 장르(클럽·뉴에이지·월드·감성…)를 유저가 길 안 잃게 정돈된 버킷으로.
# Suno 실제 스타일이 없으면 제목·태그 휴리스틱(대시보드에서 곡별 수정 가능).
import json
import os
import re
from pathlib import Path

HERE = Path(__file__).parent
META = HERE / "music" / ".meta.json"

# 무드 정의: key → (한국어, 영어 재생목록명, 제목 키워드, 태그 키워드)
MOODS = {
    "workout": ("운동", "Workout / Energy Music",
                ["sprint", "iron", "march", "anvil", "piston", "engine", "frostbite",
                 "pulse", "circuit", "forge", "hammer", "grid", "rave", "interval"],
                ["운동할 때", "헬스"]),
    "lofi": ("집중·Lofi", "Lofi Beats to Study & Focus",
             ["focus", "discipline", "quiet", "machine", "study", "concentration"],
             ["공부할 때", "집중", "lofi"]),
    "ambient": ("힐링·뉴에이지", "Sleep, Healing & Ambient (New Age)",
                ["hollow", "silence", "drift", "hypnic", "breathing", "remains",
                 "light", "meditation", "drone", "courtyard", "moon", "still"],
                ["힐링", "수면", "잔잔"]),
    "emotional": ("감성·피아노", "Emotional Piano & Lament",
                  ["lament", "ghost", "dawn", "tear", "unfinished", "note", "past",
                   "reverie", "velvet", "sunlit", "still here"],
                  ["감성", "발라드", "피아노"]),
    "club": ("클럽·EDM", "Club / Dance / EDM",
             ["rave", "floor", "groove", "platform", "shuffle", "transit", "subway",
              "choir", "screams"],
             ["신나는 댄스", "클럽", "edm"]),
    "world": ("월드·국악", "World & Traditional Fusion",
              ["daegeum", "gakseori", "jeongak", "ganges", "samba", "grasshopper",
               "cattle", "market", "ritual", "chant", "bishoftu"],
              []),
    "drive": ("드라이브·시티팝", "Night Drive / City Pop",
              ["drive", "night", "neon", "city", "highway", "cruise", "train"],
              ["드라이브", "시티팝"]),
    "rock": ("락", "Rock Instrumental",
             ["rust", "guitar", "metal", "riff", "grunge"],
             ["락"]),
}

# 우선순위(겹칠 때 위가 이김) — 특색 강한 것부터
ORDER = ["world", "club", "rock", "workout", "emotional", "ambient", "lofi", "drive"]


def classify(title: str, tags: str) -> str:
    t = (title or "").lower()
    tg = tags or ""
    # 1) 제목 키워드 우선순위대로
    for key in ORDER:
        _, _, tkws, _ = MOODS[key]
        if any(k in t for k in tkws):
            return key
    # 2) 태그 카테고리로 폴백
    for key in ORDER:
        _, _, _, gkws = MOODS[key]
        if any(g in tg for g in gkws):
            return key
    # 3) 한글 제목(국악류 가능성) → world, 아니면 ambient 기본
    if re.search(r"[가-힣]", title or ""):
        return "world"
    return "ambient"


def main():
    meta = json.loads(META.read_text(encoding="utf-8"))
    from collections import defaultdict
    dist = defaultdict(list)
    for nm, v in meta.items():
        if v.get("instrumental") is not True:
            continue
        mood = v.get("mood") or classify(v.get("title") or nm, v.get("tags") or "")
        v["mood"] = mood
        meta[nm] = v
        base = (v.get("title") or nm).split(" #")[0]
        dist[mood].append(base)
    META.write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    print("=== 무드 분포(재생목록 네비) ===")
    for key in ORDER:
        if key not in dist:
            continue
        ko, en, *_ = MOODS[key]
        uniq = sorted(set(dist[key]))
        print(f"[{ko} / {en}] {len(uniq)}곡")
        print("   " + ", ".join(uniq))


if __name__ == "__main__":
    main()
