#!/usr/bin/env bash
# 7차 배치(테크/AI) unlisted 업로드. 사이드카 태그+link 자동.
cd "$(dirname "$0")" || exit 1
export YT_PRIVACY=unlisted PYTHONUTF8=1
up () { YT_TOPIC="$2" python upload_youtube.py "$1" "$3" "$4"; }

up "$(ls -t out/엔비디아*.mp4 | head -1)" "엔비디아" \
   "엔비디아 또 신기록, 블랙웰 품절에 차세대 루빈" \
   "엔비디아 분기 매출 681억 달러(+73%) 신기록. 블랙웰 GPU 품절 수준, 오픈AI와 대규모 공급, 차세대 칩 루빈 공개."

up "$(ls -t out/테슬라*.mp4 | head -1)" "테슬라" \
   "테슬라 자율주행 빅뉴스, UN 규제·로보택시 확대" \
   "유엔이 세계 첫 자율주행 통합 규제 채택(50~60개국). FSD v14.3.4로 모델 통합, 로보택시 댈러스·휴스턴 운행·7개 도시 확대."

up "$(ls -t out/2026_최강_AI_모델*.mp4 | head -1)" "AI모델" \
   "2026 최강 AI 모델은? 클로드·제미나이·GPT" \
   "2026 AI 판도. 클로드 오푸스 4.8 종합 1위·코딩 최강, 구글 제미나이 3.5 공개, 오픈AI GPT-5.6 임박. 용도별로 갈아타기."

up "$(ls -t out/무료_AI_툴*.mp4 | head -1)" "AI툴추천" \
   "지금 무료로 쓰는 AI 툴, 어디서 찾나" \
   "무료 AI 툴 총정리. 글쓰기·이미지·요약부터 취업·부동산·건강·세금 계산까지. 올댓에이아이에 48종 모음."

echo "===== UPLOAD BATCH7 DONE ====="
