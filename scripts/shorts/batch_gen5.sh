#!/usr/bin/env bash
# 5차 배치: 전월세전환율·자동차보험·예금자보호·카드선택 (글자-프리 파이프라인).
set -u
cd "$(dirname "$0")/../.." || exit 1
SH=scripts/shorts
mkdir -p "$SH/verify"
for name in conversion carinsure deposit cardpick; do
  echo "===== GEN $name ====="
  npx tsx "$SH/make-short.ts" "$SH/$name.json" > "$SH/verify/$name.log" 2>&1
  mp4=$(ls -t "$SH"/out/*.mp4 2>/dev/null | head -1)
  echo "newest mp4: $mp4"
  if [ -n "$mp4" ]; then
    ffmpeg -y -ss 1.6 -i "$mp4" -frames:v 1 "$SH/verify/$name.png" >/dev/null 2>&1
    echo "frame -> $SH/verify/$name.png"
    grep RESULT "$SH/verify/$name.log" | tail -1
  fi
done
echo "===== BATCH5 DONE ====="
