/**
 * 한글 양식 도구(/tools/hwp-form)가 세는 결과 종류 — 허용 목록.
 *
 * 화면은 이 이름 하나만 보낸다(파일·파일 이름·쓴 내용·칸 이름은 안 보낸다). /api/hwp-stat 은 목록 밖 이름을 버리고,
 * /api/admin-stats 는 이 목록을 그대로 센다 — 이름을 더할 땐 여기 한 곳만.
 */
export const HWP_EVENTS = [
  'hwp_scan:ok', 'hwp_scan:zero', 'hwp_scan:hwp',
  'hwp_make:ok', 'hwp_make:fix', 'hwp_make:fail', 'hwp_download',
  'hwp_err:boot', 'hwp_err:docx', 'hwp_err:not_hwpx', 'hwp_err:empty', 'hwp_err:unsupported',
  'hwp_err:structure', 'hwp_err:password', 'hwp_err:corrupt', 'hwp_err:memory', 'hwp_err:other',
  'hwp_test',   // 배포 확인용(curl 한 번) — 관리자 화면 표에는 안 나온다
] as const;
