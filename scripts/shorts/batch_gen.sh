#!/usr/bin/env bash
# 7개 실생활 돈정보 쇼츠 순차 생성 + hook 프레임 추출(검증용).
# GPU 단일이라 한 번에 하나씩. 업로드는 검증 후 별도 단계.
set -u
cd "$(dirname "$0")/../.." || exit 1
SH=scripts/shorts
mkdir -p "$SH/verify"
JSONS="geunro silup sinsaeng yeongeum sumeun janyeo sanghan"
for name in $JSONS; do
  echo "===== GEN $name ====="
  npx tsx "$SH/make-short.ts" "$SH/$name.json" > "$SH/verify/$name.log" 2>&1
  mp4=$(ls -t "$SH"/out/*.mp4 2>/dev/null | head -1)
  echo "newest mp4: $mp4"
  if [ -n "$mp4" ]; then
    # hook 프레임(1.6초 지점) 추출 -> verify/<name>.png
    ffmpeg -y -ss 1.6 -i "$mp4" -frames:v 1 "$SH/verify/$name.png" >/dev/null 2>&1
    echo "frame -> $SH/verify/$name.png"
    grep RESULT "$SH/verify/$name.log" | tail -1
  fi
done
echo "===== BATCH DONE ====="
