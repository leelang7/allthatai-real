#!/bin/bash
mkdir -p dataset/ok dataset/ng dataset/unknown
for i in $(seq 1 12); do touch "dataset/ok/IMG_$i.jpg"; done
for i in $(seq 1 5);  do touch "dataset/ng/IMG_$i.jpg"; done
for i in $(seq 1 3);  do touch "dataset/unknown/IMG_$i.jpg"; done

cat > labels.csv <<'CSV'
img_001.jpg,ok,kim
img_002.jpg,ng,lee
img_003.jpg,ok,kim
img_004.jpg,ok,park
img_005.jpg,unknown,lee
img_006.jpg,ng,kim
img_007.jpg,ok,park
img_008.jpg,ok,lee
img_009.jpg,unknown,kim
img_010.jpg,ok,park
CSV

cat > train.log <<'LOG'
epoch 1 loss 0.912 acc 0.61
epoch 2 loss 0.640 acc 0.74
epoch 3 loss 0.455 acc 0.83
epoch 4 loss 0.391 acc 0.88
epoch 5 loss 0.402 acc 0.86
LOG
echo "실습 준비 완료"
