#!/bin/bash
# MuseTalk 안 건드리고, GPU VRAM이 비면(<4500MiB) 그때 AllThatAI 배치 실행
cd "C:/Users/leesc/Documents/allthatai-real/scripts/shorts"
for i in $(seq 1 90); do
  used=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits 2>/dev/null | head -1 | tr -d ' ')
  if [ -n "$used" ] && [ "$used" -lt 4500 ]; then
    echo "[$((i))] GPU 여유(${used}MiB) → AllThatAI 배치 시작"
    bash run_tsl.sh
    echo "=== gpu_wait 완료 ==="
    exit 0
  fi
  echo "[$((i))] GPU ${used}MiB 사용중(MuseTalk) — 대기"
  sleep 60
done
echo "=== 90분내 GPU 안 비어서 미실행(MuseTalk 계속 중) ==="
