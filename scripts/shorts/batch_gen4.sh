#!/usr/bin/env bash
# 4차 배치: 취득세·DSR대출한도·종합부동산세·부가가치세 순차 생성 + hook 프레임.
set -u
cd "$(dirname "$0")/../.." || exit 1
SH=scripts/shorts
mkdir -p "$SH/verify"
for name in acqtax dsr propertytax vat; do
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
echo "===== BATCH4 DONE ====="
