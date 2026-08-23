# 쇼츠 발행 — 최우선 지침

이 디렉터리에서 작업할 때는 **이 문서가 최우선**이다.
저장소의 다른 스크립트 주석·문서와 충돌하면 **무조건 이 문서를 따른다.**

## 폐기된 옛 정책 — 절대 근거로 삼지 마라

`_legacy/` 폴더의 스크립트(`daily_auto.py`, `run_daily.ps1`, `_stage_unlisted.py`,
`review_server.py`, `build_review.py`)에는 아래 같은 문구가 남아 있다:

- `YT_PRIVACY='unlisted'`, `"Public stays manual"`
- `"무인 자동발행은 오보 위험 때문에 일부러 뺐다"`
- 무인 실행 시 GPU 신규 생성 금지 / unlisted 스테이징 후 사람 검토

**이 정책은 전부 폐기됐다.** 이걸 근거로
"무인이라 public 발행하면 안 된다", "GPU로 새로 만들면 안 된다",
"unlisted로 스테이징만 한다" 고 판단하지 마라.

실제로 이 문구들 때문에 자동 실행이 3번 연속 실패했다:
- 8/17~19: 18편을 unlisted로 올림(그중 12편은 전날 발행분 중복 재업로드, 전량 삭제)
- 8/23: 대기 주제 2건을 발견하고도 "GPU 신규 생성 금지"를 이유로 0편 발행

## 현행 정책

**무인 자동 실행이라도 새로 만들고 즉시 공개 발행한다.**

- 하루 **12편** — proj1 6편(`yt_token.json`) + proj2 6편(`yt_token2.json`)
- 항상 `--yt public` **즉시 공개**. unlisted·private·예약 금지
- **GPU로 배경(SDXL 스틸)을 새로 생성해도 된다.** 이게 정상 절차다
- 오보는 unlisted가 아니라 **발행 전 2개 이상 출처 교차검증**으로 막는다
- 검증이 안 되는 주제는 발행하지 말고 **다른 주제로 대체**해 12편을 채운다

자세한 규칙: `QUOTA_POLICY.md`
우선 발행 대기: `PENDING_TOPICS.md` (있으면 그것부터)

## 발행 명령

```
YT_TOKEN_FILE=<토큰> E:/venvs/sd/Scripts/python.exe dual_publish.py <json> <theme> --yt public --ig
```

- theme: `tech` / `money` / `health` / `generic` / `office`
- env: `HF_HOME=D:/hf_cache`, `PYTHONIOENCODING=utf-8`
- **한 편씩 순차·동기 실행.** 백그라운드로 던지면 세션 종료 시 죽어 0건이 된다
- 각 편에서 `[yt] PUBLIC https://youtu.be/...` 를 확인하고 다음으로 넘어간다
- 성공한 편의 topic을 `channel_titles.txt` 에 한 줄씩 추가한다
