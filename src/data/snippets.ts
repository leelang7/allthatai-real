/**
 * 복붙 스니펫 레지스트리. 한국 개발자 high-intent 검색어 직격.
 *
 * 각 entry는 /snippets/{slug} 페이지로 렌더되며, Copy-to-clipboard 버튼이
 * 자동 박힘. 검색 타겟: "정규식 이메일", "git undo", "linux 용량 확인" 등.
 */

export type SnippetCategory = 'regex' | 'git' | 'linux' | 'sql' | 'korean' | 'excel' | 'curl' | 'js' | 'python';

export interface SnippetEntry {
  slug: string;
  /** SEO title (검색 매칭) */
  title: string;
  /** One-liner meta description */
  description: string;
  category: SnippetCategory;
  /** Code blocks — each has label, language, code */
  snippets: { label: string; lang: string; code: string; note?: string }[];
  /** Usage examples (input → output) */
  examples?: { input: string; output: string }[];
  /** FAQ items (rich snippet target) */
  faqs?: { q: string; a: string }[];
  /** Tags for filter / cross-link */
  tags: string[];
}

export const snippets: SnippetEntry[] = [
  // ===== 정규식 (Regex) =====
  {
    slug: 'regex-email',
    title: '이메일 정규식 — 복붙용 (JavaScript/Java/Python)',
    description: '실무에서 가장 많이 쓰는 이메일 검증 정규식. RFC 5322 vs 단순 검증 둘 다 포함.',
    category: 'regex',
    snippets: [
      {
        label: '단순 검증 (98% case)',
        lang: 'javascript',
        code: `/^[\\w.+-]+@[\\w-]+\\.[\\w.-]+$/`,
        note: '대부분의 실무에 충분. 영어/숫자/일부 특수문자만 허용.',
      },
      {
        label: 'RFC 5322 완전판',
        lang: 'javascript',
        code: `/^(([^<>()[\\]\\\\.,;:\\s@"]+(\\.[^<>()[\\]\\\\.,;:\\s@"]+)*)|(".+"))@((\\[[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\])|(([a-zA-Z\\-0-9]+\\.)+[a-zA-Z]{2,}))$/`,
        note: 'RFC 5322 완전 준수. 매우 김 — 진짜 필요할 때만.',
      },
      {
        label: 'Java',
        lang: 'java',
        code: `Pattern.compile("^[\\\\w.+-]+@[\\\\w-]+\\\\.[\\\\w.-]+$").matcher(email).matches()`,
      },
      {
        label: 'Python',
        lang: 'python',
        code: `re.match(r"^[\\w.+-]+@[\\w-]+\\.[\\w.-]+$", email)`,
      },
    ],
    examples: [
      { input: 'user@example.com', output: '✓ 매칭' },
      { input: 'user+tag@example.co.kr', output: '✓ 매칭' },
      { input: 'invalid@', output: '✗ 매칭 안 됨' },
    ],
    faqs: [
      { q: '왜 RFC 5322 완전판이 그렇게 김?', a: 'RFC 5322는 따옴표·이스케이프·도메인 리터럴 등을 다 허용. 실무에선 99% 짧은 버전이면 충분합니다.' },
      { q: '서버에서도 검증해야 하나?', a: '네. 클라이언트 정규식은 UX용. 실제 발송 가능 여부는 SMTP 핸드셰이크로만 확인 가능.' },
    ],
    tags: ['정규식', 'email', 'validation'],
  },
  {
    slug: 'regex-phone-kr',
    title: '한국 휴대폰 번호 정규식 — 010 검증',
    description: '010-XXXX-XXXX 형식 검증 + 자동 하이픈 삽입.',
    category: 'regex',
    snippets: [
      {
        label: '010-XXXX-XXXX (하이픈 필수)',
        lang: 'javascript',
        code: `/^010-\\d{4}-\\d{4}$/`,
      },
      {
        label: '하이픈 있어도 없어도 OK',
        lang: 'javascript',
        code: `/^010-?\\d{3,4}-?\\d{4}$/`,
      },
      {
        label: '하이픈 자동 삽입',
        lang: 'javascript',
        code: `phone.replace(/^(\\d{3})(\\d{3,4})(\\d{4})$/, '$1-$2-$3')`,
        note: '입력: 01012345678 → 출력: 010-1234-5678',
      },
    ],
    examples: [
      { input: '010-1234-5678', output: '✓' },
      { input: '01012345678', output: '✓ (옵셔널 하이픈 패턴)' },
      { input: '011-1234-5678', output: '✗ (010만 허용)' },
    ],
    tags: ['정규식', 'phone', '한국'],
  },
  {
    slug: 'regex-korean',
    title: '한글 정규식 — 한글만/한자 포함/자모 검증',
    description: '한글 문자열 검증 패턴 모음. 자음/모음 분리, 한자 포함, 한글 글자수 등.',
    category: 'regex',
    snippets: [
      {
        label: '한글만 (완성형)',
        lang: 'javascript',
        code: `/^[가-힣]+$/`,
        note: '가~힣 사이 (완성된 한글 글자만)',
      },
      {
        label: '한글 자모 포함',
        lang: 'javascript',
        code: `/^[ㄱ-ㅎㅏ-ㅣ가-힣]+$/`,
        note: '키보드 한글 입력 중간 상태(자음/모음)도 매칭',
      },
      {
        label: '한글 + 영어 + 숫자',
        lang: 'javascript',
        code: `/^[가-힣a-zA-Z0-9]+$/`,
      },
      {
        label: '한글 글자수 카운트 (정확)',
        lang: 'javascript',
        code: `const len = [...text].length; // 이모지·한자 포함 모두 정확`,
        note: '\`text.length\`는 surrogate pair 때문에 부정확',
      },
    ],
    tags: ['정규식', '한글', 'unicode'],
  },
  {
    slug: 'regex-business-number',
    title: '사업자등록번호 정규식 + 검증 알고리즘',
    description: '사업자번호 형식 검증 + 체크섬 검증 (XXX-XX-XXXXX).',
    category: 'regex',
    snippets: [
      {
        label: '형식만 (하이픈 옵션)',
        lang: 'javascript',
        code: `/^\\d{3}-?\\d{2}-?\\d{5}$/`,
      },
      {
        label: '체크섬 포함 완전 검증',
        lang: 'javascript',
        code: `function validateBizNo(num) {
  const digits = num.replace(/-/g, '').split('').map(Number);
  if (digits.length !== 10) return false;
  const k = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let sum = digits.slice(0, 9).reduce((s, d, i) => s + d * k[i], 0);
  sum += Math.floor((digits[8] * 5) / 10);
  return (10 - (sum % 10)) % 10 === digits[9];
}`,
        note: '국세청 공식 알고리즘. 마지막 자리가 체크 디지트.',
      },
    ],
    examples: [
      { input: '123-45-67890', output: '형식 ✓, 체크섬 별도 검증' },
      { input: '안녕하세요', output: '✗' },
    ],
    tags: ['정규식', '사업자', '한국', 'validation'],
  },
  {
    slug: 'regex-url',
    title: 'URL 정규식 — 복붙용',
    description: 'http/https URL 검증 + 추출 패턴.',
    category: 'regex',
    snippets: [
      {
        label: 'URL 검증 (간단)',
        lang: 'javascript',
        code: `/^https?:\\/\\/[\\w.-]+(?:\\.[\\w.-]+)+[\\w._~:\\/?#\\[\\]@!$&'()*+,;=-]*$/`,
      },
      {
        label: '본문에서 URL 추출',
        lang: 'javascript',
        code: `text.match(/https?:\\/\\/[^\\s]+/g) || []`,
      },
      {
        label: 'URL 객체 활용 (권장)',
        lang: 'javascript',
        code: `try { new URL(str); return true; } catch { return false; }`,
        note: '정규식보다 안전. 모던 환경에서 첫 선택.',
      },
    ],
    tags: ['정규식', 'url'],
  },
  {
    slug: 'regex-password',
    title: '비밀번호 정규식 — 영문+숫자+특수문자',
    description: '복잡도 조건별 비밀번호 정규식 (8자, 10자, 영숫특, 대소문자).',
    category: 'regex',
    snippets: [
      {
        label: '8자 이상 + 영문/숫자/특수문자 각 1개',
        lang: 'javascript',
        code: `/^(?=.*[A-Za-z])(?=.*\\d)(?=.*[@$!%*#?&])[A-Za-z\\d@$!%*#?&]{8,}$/`,
      },
      {
        label: '10자 이상 + 대문자/소문자/숫자/특수문자',
        lang: 'javascript',
        code: `/^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*#?&])[A-Za-z\\d@$!%*#?&]{10,}$/`,
      },
      {
        label: '8–16자 영숫만',
        lang: 'javascript',
        code: `/^[A-Za-z\\d]{8,16}$/`,
      },
    ],
    tags: ['정규식', 'password', 'validation'],
  },

  // ===== Git =====
  {
    slug: 'git-undo-last-commit',
    title: 'git 마지막 커밋 되돌리기 — 7가지 상황',
    description: 'reset / revert / amend — 언제 뭘 쓰나.',
    category: 'git',
    snippets: [
      {
        label: '커밋 취소 (파일 변경 유지)',
        lang: 'bash',
        code: `git reset --soft HEAD~1`,
        note: '커밋만 취소. 변경사항은 stage 상태로 유지.',
      },
      {
        label: '커밋 + stage 취소 (파일은 유지)',
        lang: 'bash',
        code: `git reset HEAD~1`,
      },
      {
        label: '커밋 + 변경사항 모두 폐기 (위험)',
        lang: 'bash',
        code: `git reset --hard HEAD~1`,
        note: '⚠ 변경사항 완전 사라짐. 푸시된 거면 절대 X',
      },
      {
        label: '메시지만 수정',
        lang: 'bash',
        code: `git commit --amend -m "새 메시지"`,
      },
      {
        label: '파일 추가/제거 후 amend',
        lang: 'bash',
        code: `git add forgotten-file.txt
git commit --amend --no-edit`,
      },
      {
        label: '이미 푸시한 커밋 — revert (안전)',
        lang: 'bash',
        code: `git revert HEAD`,
        note: '새 커밋으로 되돌림. 협업 안전.',
      },
      {
        label: '이미 푸시한 커밋 — force push (위험)',
        lang: 'bash',
        code: `git push --force-with-lease origin main`,
        note: '⚠ 협업 중이면 다른 사람 작업 날아갈 수 있음. --force-with-lease가 안전한 변형.',
      },
    ],
    faqs: [
      { q: 'reset vs revert 차이?', a: 'reset은 히스토리에서 커밋 제거. revert는 새 커밋으로 되돌림. 푸시된 거는 revert 필수.' },
    ],
    tags: ['git', 'undo'],
  },
  {
    slug: 'git-conflict',
    title: 'Git 충돌 해결 — merge conflict 단계별',
    description: '충돌 발생부터 해결, 푸시까지.',
    category: 'git',
    snippets: [
      {
        label: '충돌 파일 확인',
        lang: 'bash',
        code: `git status # "both modified" 파일`,
      },
      {
        label: '특정 파일 ours/theirs 한쪽 선택',
        lang: 'bash',
        code: `git checkout --ours conflicted-file.txt   # 내 버전 유지
git checkout --theirs conflicted-file.txt # 상대 버전 유지
git add conflicted-file.txt
git commit`,
      },
      {
        label: 'merge 중단하고 처음으로',
        lang: 'bash',
        code: `git merge --abort`,
      },
      {
        label: 'rebase 중 충돌 해결 후 계속',
        lang: 'bash',
        code: `# 충돌 수동 해결 후
git add .
git rebase --continue`,
      },
    ],
    tags: ['git', 'conflict', 'rebase'],
  },
  {
    slug: 'git-stash',
    title: 'git stash — 작업 임시 저장 7가지',
    description: '현재 작업 잠시 두고 다른 일 하기.',
    category: 'git',
    snippets: [
      { label: '현재 변경사항 stash', lang: 'bash', code: `git stash` },
      { label: '메시지 + untracked 파일도 같이', lang: 'bash', code: `git stash push -u -m "WIP: 결제 기능"` },
      { label: 'stash 목록', lang: 'bash', code: `git stash list` },
      { label: '가장 최근 stash 복원 (삭제 안 함)', lang: 'bash', code: `git stash apply` },
      { label: '복원 + 삭제', lang: 'bash', code: `git stash pop` },
      { label: '특정 stash 적용', lang: 'bash', code: `git stash apply stash@{2}` },
      { label: 'stash 삭제', lang: 'bash', code: `git stash drop stash@{0}` },
      { label: '모든 stash 삭제', lang: 'bash', code: `git stash clear` },
    ],
    tags: ['git', 'stash'],
  },

  // ===== Linux =====
  {
    slug: 'linux-disk-usage',
    title: 'Linux 디스크 용량 확인 명령어',
    description: 'df / du / ncdu — 파티션·디렉토리별 용량.',
    category: 'linux',
    snippets: [
      { label: '파티션별 용량 (사람이 읽기 쉽게)', lang: 'bash', code: `df -h` },
      { label: '현재 폴더 안 모든 하위 폴더 용량', lang: 'bash', code: `du -h --max-depth=1 | sort -h` },
      { label: '가장 큰 파일 10개 찾기', lang: 'bash', code: `find / -type f -exec du -h {} + 2>/dev/null | sort -h | tail -10` },
      { label: '인터랙티브 (ncdu 추천)', lang: 'bash', code: `ncdu /` },
    ],
    tags: ['linux', 'disk', 'monitoring'],
  },
  {
    slug: 'linux-process',
    title: 'Linux 프로세스 관리 — ps/top/kill',
    description: 'CPU·메모리 점유 프로세스 찾기 + 죽이기.',
    category: 'linux',
    snippets: [
      { label: '실시간 CPU/메모리 (top 대신 권장)', lang: 'bash', code: `htop` },
      { label: 'CPU 가장 많이 쓰는 프로세스 5개', lang: 'bash', code: `ps aux --sort=-%cpu | head -6` },
      { label: '특정 이름 프로세스 찾기', lang: 'bash', code: `pgrep -af node` },
      { label: 'PID로 죽이기', lang: 'bash', code: `kill -9 1234` },
      { label: '이름으로 죽이기', lang: 'bash', code: `pkill -9 node` },
      { label: '특정 포트 점유 프로세스', lang: 'bash', code: `lsof -i :3000` },
    ],
    tags: ['linux', 'process'],
  },
  {
    slug: 'linux-find',
    title: 'Linux find 명령어 — 파일 검색 패턴 모음',
    description: '이름/크기/수정일/권한별 파일 찾기.',
    category: 'linux',
    snippets: [
      { label: '이름으로 찾기', lang: 'bash', code: `find . -name "*.log"` },
      { label: '대소문자 무시', lang: 'bash', code: `find . -iname "*.LOG"` },
      { label: '크기 100MB 이상', lang: 'bash', code: `find / -type f -size +100M 2>/dev/null` },
      { label: '7일 이내 수정', lang: 'bash', code: `find . -type f -mtime -7` },
      { label: '찾아서 삭제', lang: 'bash', code: `find /tmp -name "*.bak" -mtime +30 -delete` },
      { label: '찾아서 명령 실행', lang: 'bash', code: `find . -name "*.tmp" -exec rm {} +` },
    ],
    tags: ['linux', 'find'],
  },

  // ===== SQL =====
  {
    slug: 'sql-window-functions',
    title: 'SQL 윈도우 함수 — ROW_NUMBER / RANK / LAG',
    description: '그룹별 순위·이전값·누적합 등 자주 쓰는 패턴.',
    category: 'sql',
    snippets: [
      {
        label: '그룹별 순위 (동점 처리)',
        lang: 'sql',
        code: `SELECT
  category,
  product,
  price,
  ROW_NUMBER() OVER (PARTITION BY category ORDER BY price DESC) AS rn,
  RANK()       OVER (PARTITION BY category ORDER BY price DESC) AS rk,
  DENSE_RANK() OVER (PARTITION BY category ORDER BY price DESC) AS drk
FROM products;`,
      },
      {
        label: '이전 행 값 (LAG)',
        lang: 'sql',
        code: `SELECT
  date,
  revenue,
  LAG(revenue, 1) OVER (ORDER BY date) AS prev_day_revenue,
  revenue - LAG(revenue, 1) OVER (ORDER BY date) AS delta
FROM daily_sales;`,
      },
      {
        label: '누적 합 (running total)',
        lang: 'sql',
        code: `SELECT
  date,
  revenue,
  SUM(revenue) OVER (ORDER BY date ROWS UNBOUNDED PRECEDING) AS running_total
FROM daily_sales;`,
      },
    ],
    tags: ['sql', 'window', 'analytics'],
  },
  {
    slug: 'sql-join',
    title: 'SQL JOIN 7가지 — INNER / LEFT / RIGHT / FULL / CROSS / SELF / ANTI',
    description: '실무 자주 헷갈리는 JOIN 7개 차이 + 사용법.',
    category: 'sql',
    snippets: [
      { label: 'INNER JOIN (양쪽 매칭만)', lang: 'sql', code: `SELECT a.*, b.* FROM a INNER JOIN b ON a.id = b.a_id;` },
      { label: 'LEFT JOIN (왼쪽 전부 + 매칭)', lang: 'sql', code: `SELECT a.*, b.* FROM a LEFT JOIN b ON a.id = b.a_id;` },
      { label: 'ANTI JOIN (왼쪽에 있고 오른쪽에 없는)', lang: 'sql', code: `SELECT a.* FROM a LEFT JOIN b ON a.id = b.a_id WHERE b.a_id IS NULL;` },
      { label: 'SELF JOIN (계층 구조)', lang: 'sql', code: `SELECT e.name, m.name AS manager FROM employees e LEFT JOIN employees m ON e.manager_id = m.id;` },
      { label: 'CROSS JOIN (모든 조합)', lang: 'sql', code: `SELECT * FROM colors CROSS JOIN sizes;` },
    ],
    tags: ['sql', 'join'],
  },

  // ===== 한국 특화 =====
  {
    slug: 'korean-currency-format',
    title: '한국 원화(KRW) 포맷팅 — JavaScript/Java/Python',
    description: '₩1,234,567 형식. Intl API 활용 권장.',
    category: 'korean',
    snippets: [
      {
        label: 'JavaScript (Intl 권장)',
        lang: 'javascript',
        code: `new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(1234567)
// "₩1,234,567"`,
      },
      {
        label: 'JavaScript (기호 없이 콤마만)',
        lang: 'javascript',
        code: `(1234567).toLocaleString('ko-KR')
// "1,234,567"`,
      },
      {
        label: 'Java',
        lang: 'java',
        code: `NumberFormat.getCurrencyInstance(Locale.KOREA).format(1234567)
// "₩1,234,567"`,
      },
      {
        label: 'Python',
        lang: 'python',
        code: `f"₩{1234567:,}"
# "₩1,234,567"`,
      },
    ],
    tags: ['한국', 'format', 'currency'],
  },
  {
    slug: 'korean-date-format',
    title: '한국식 날짜 포맷 — 2026년 5월 9일',
    description: '한국어 날짜 표시 + 요일 변환.',
    category: 'korean',
    snippets: [
      {
        label: 'JavaScript Intl',
        lang: 'javascript',
        code: `new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
}).format(new Date())
// "2026년 5월 9일 금요일"`,
      },
      {
        label: 'Java',
        lang: 'java',
        code: `LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy년 M월 d일 EEEE", Locale.KOREAN))`,
      },
      {
        label: 'Python',
        lang: 'python',
        code: `import locale, datetime
locale.setlocale(locale.LC_TIME, 'ko_KR.UTF-8')
datetime.datetime.now().strftime('%Y년 %-m월 %-d일 %A')`,
      },
    ],
    tags: ['한국', 'date', 'format'],
  },
  {
    slug: 'korean-juminno-validation',
    title: '주민등록번호 검증 알고리즘 (체크섬)',
    description: '주민번호 마지막 자리 체크 디지트 검증. ⚠ 실제 저장 금지 (개인정보보호법).',
    category: 'korean',
    snippets: [
      {
        label: 'JavaScript',
        lang: 'javascript',
        code: `function validateJuminno(num) {
  const digits = num.replace('-', '').split('').map(Number);
  if (digits.length !== 13) return false;
  const k = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5];
  const sum = digits.slice(0, 12).reduce((s, d, i) => s + d * k[i], 0);
  return (11 - (sum % 11)) % 10 === digits[12];
}`,
        note: '⚠ 실제 시스템에서 주민번호 저장 시 개인정보보호법 위반. 절대 DB에 저장 X.',
      },
    ],
    tags: ['한국', 'validation', '개인정보'],
  },

  // ===== Curl =====
  {
    slug: 'curl-cheatsheet',
    title: 'curl 명령어 모음 — API 테스트 복붙용',
    description: 'GET/POST/PUT/DELETE + 헤더 + JSON + 파일 업로드.',
    category: 'curl',
    snippets: [
      { label: 'GET + JSON 응답 보기', lang: 'bash', code: `curl -s https://api.example.com/users | jq` },
      { label: 'POST + JSON body', lang: 'bash', code: `curl -X POST https://api.example.com/users \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Lee","email":"lee@example.com"}'` },
      { label: 'Bearer 토큰 인증', lang: 'bash', code: `curl -H "Authorization: Bearer $TOKEN" https://api.example.com/me` },
      { label: '응답 헤더만 보기', lang: 'bash', code: `curl -I https://example.com` },
      { label: '파일 다운로드', lang: 'bash', code: `curl -O https://example.com/file.zip` },
      { label: '파일 업로드 (multipart)', lang: 'bash', code: `curl -F "file=@/path/to/local.jpg" https://api.example.com/upload` },
      { label: 'follow redirects', lang: 'bash', code: `curl -L https://goo.gl/short-url` },
    ],
    tags: ['curl', 'http', 'api'],
  },

  // ===== JavaScript =====
  {
    slug: 'js-async-patterns',
    title: 'JavaScript 비동기 패턴 — Promise/async/병렬/순차',
    description: '실무에서 헷갈리는 비동기 패턴 5가지.',
    category: 'js',
    snippets: [
      { label: '병렬 (다 끝날 때까지)', lang: 'javascript', code: `const [a, b, c] = await Promise.all([fetchA(), fetchB(), fetchC()]);` },
      { label: '병렬 + 일부 실패 OK', lang: 'javascript', code: `const results = await Promise.allSettled([fetchA(), fetchB()]);
results.forEach(r => r.status === 'fulfilled' ? handle(r.value) : log(r.reason));` },
      { label: '순차 (앞 결과로 뒤)', lang: 'javascript', code: `const a = await fetchA();
const b = await fetchB(a.id);` },
      { label: '경쟁 (먼저 끝나는 것)', lang: 'javascript', code: `const winner = await Promise.race([fetchA(), timeout(5000)]);` },
      { label: '재시도 3번', lang: 'javascript', code: `async function retry(fn, n = 3) {
  for (let i = 0; i < n; i++) {
    try { return await fn(); }
    catch (e) { if (i === n - 1) throw e; await new Promise(r => setTimeout(r, 1000 * (i + 1))); }
  }
}` },
    ],
    tags: ['javascript', 'async', 'promise'],
  },

  // ===== Python =====
  // ===== Java =====
  {
    slug: 'java-stream',
    title: 'Java Stream API — filter/map/collect 패턴',
    description: 'Java 8+ Stream 자주 쓰는 변환·필터·그룹·통계.',
    category: 'js',
    snippets: [
      { label: '필터 + 변환', lang: 'java', code: `List<String> names = users.stream()
    .filter(u -> u.getAge() >= 18)
    .map(User::getName)
    .collect(Collectors.toList());` },
      { label: '그룹핑', lang: 'java', code: `Map<String, List<User>> byDept = users.stream()
    .collect(Collectors.groupingBy(User::getDept));` },
      { label: '합산', lang: 'java', code: `int total = items.stream().mapToInt(Item::getPrice).sum();` },
      { label: '중복 제거 + 정렬', lang: 'java', code: `List<String> unique = names.stream().distinct().sorted().toList();` },
    ],
    tags: ['java', 'stream'],
  },

  // ===== TypeScript =====
  {
    slug: 'ts-utility-types',
    title: 'TypeScript 유틸리티 타입 — Pick/Omit/Partial 모음',
    description: 'TS 내장 유틸리티 타입 8개 + 실무 활용 예시.',
    category: 'js',
    snippets: [
      { label: 'Pick — 필드 선택', lang: 'typescript', code: `type UserSummary = Pick<User, 'id' | 'name'>;` },
      { label: 'Omit — 필드 제외', lang: 'typescript', code: `type CreateUser = Omit<User, 'id' | 'createdAt'>;` },
      { label: 'Partial — 전체 옵션', lang: 'typescript', code: `type UserUpdate = Partial<User>;` },
      { label: 'Required — 전체 필수', lang: 'typescript', code: `type StrictUser = Required<User>;` },
      { label: 'Record — 키-값 맵', lang: 'typescript', code: `type Roles = Record<'admin' | 'user' | 'guest', Permission[]>;` },
      { label: 'ReturnType — 함수 반환 타입', lang: 'typescript', code: `type UserResult = ReturnType<typeof fetchUser>;` },
      { label: 'Awaited — Promise 풀기', lang: 'typescript', code: `type User = Awaited<ReturnType<typeof fetchUser>>;` },
    ],
    tags: ['typescript', 'types'],
  },

  // ===== CSS =====
  {
    slug: 'css-center',
    title: 'CSS 가운데 정렬 5가지 — Flexbox/Grid/Absolute',
    description: '실무 자주 검색되는 가운데 정렬 패턴 모음.',
    category: 'js',
    snippets: [
      { label: 'Flexbox 가운데 (가장 흔함)', lang: 'css', code: `.parent {
  display: flex;
  align-items: center;
  justify-content: center;
}` },
      { label: 'Grid 가운데 (한 줄)', lang: 'css', code: `.parent { display: grid; place-items: center; }` },
      { label: 'Absolute 가운데', lang: 'css', code: `.child {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}` },
      { label: '텍스트만 가운데', lang: 'css', code: `text-align: center;
line-height: 50px; /* 높이와 같게 */` },
      { label: 'margin auto', lang: 'css', code: `.child { margin: 0 auto; }  /* 가로만 */` },
    ],
    tags: ['css', 'layout', 'center'],
  },
  {
    slug: 'css-truncate',
    title: 'CSS 텍스트 줄임표 (... ellipsis) — 1줄/N줄',
    description: '한 줄 / 여러 줄 텍스트 잘라서 ... 표시.',
    category: 'js',
    snippets: [
      { label: '1줄 자르기', lang: 'css', code: `.truncate {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}` },
      { label: 'N줄 자르기 (line-clamp)', lang: 'css', code: `.clamp-2 {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}` },
      { label: 'Tailwind 활용', lang: 'css', code: `<p class="line-clamp-3">긴 텍스트...</p>` },
    ],
    tags: ['css', 'text', 'ellipsis'],
  },

  // ===== Docker =====
  {
    slug: 'docker-cheatsheet',
    title: 'Docker 명령어 모음 — 컨테이너/이미지/볼륨',
    description: '실무 자주 쓰는 Docker 명령어 + Dockerfile 기본.',
    category: 'linux',
    snippets: [
      { label: '실행 중 컨테이너 목록', lang: 'bash', code: `docker ps` },
      { label: '전체 (중지 포함)', lang: 'bash', code: `docker ps -a` },
      { label: '컨테이너 중지/삭제', lang: 'bash', code: `docker stop <id> && docker rm <id>` },
      { label: '이미지 삭제 (강제)', lang: 'bash', code: `docker rmi -f <image>` },
      { label: '컨테이너 로그 (tail)', lang: 'bash', code: `docker logs -f --tail 100 <container>` },
      { label: '컨테이너 안 접속', lang: 'bash', code: `docker exec -it <container> /bin/bash` },
      { label: '사용 안 하는 리소스 정리', lang: 'bash', code: `docker system prune -a --volumes` },
      { label: 'Dockerfile 기본 (Node)', lang: 'dockerfile', code: `FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]` },
    ],
    tags: ['docker', 'container'],
  },
  {
    slug: 'docker-compose',
    title: 'docker-compose.yml — 자주 쓰는 패턴 모음',
    description: 'Postgres + Node 풀스택 dev 환경 docker-compose 템플릿.',
    category: 'linux',
    snippets: [
      { label: 'Postgres + Node + Redis', lang: 'yaml', code: `version: '3.8'
services:
  app:
    build: .
    ports: ["3000:3000"]
    env_file: .env
    depends_on: [db, redis]
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_PASSWORD: dev
      POSTGRES_DB: app
    volumes: ["pgdata:/var/lib/postgresql/data"]
    ports: ["5432:5432"]
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
volumes:
  pgdata:` },
    ],
    tags: ['docker', 'compose'],
  },

  // ===== React =====
  {
    slug: 'react-useeffect-patterns',
    title: 'React useEffect 패턴 — cleanup/deps/race condition',
    description: 'useEffect 자주 빠지는 함정 + 정답 패턴.',
    category: 'js',
    snippets: [
      { label: '마운트 시 1번 (deps []) ', lang: 'javascript', code: `useEffect(() => {
  fetchInitialData();
}, []);` },
      { label: 'cleanup 함수 (구독 해제)', lang: 'javascript', code: `useEffect(() => {
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);
}, []);` },
      { label: 'Race condition 방지 (AbortController)', lang: 'javascript', code: `useEffect(() => {
  const ctrl = new AbortController();
  fetch(url, { signal: ctrl.signal })
    .then(r => r.json())
    .then(setData)
    .catch(e => e.name !== 'AbortError' && console.error(e));
  return () => ctrl.abort();
}, [url]);` },
      { label: '값 변경 추적 (deps에 값)', lang: 'javascript', code: `useEffect(() => {
  console.log('userId 변경됨:', userId);
}, [userId]);` },
    ],
    tags: ['react', 'hooks'],
  },
  {
    slug: 'react-memo-callback',
    title: 'React useMemo / useCallback — 언제 쓰나',
    description: '성능 최적화 hooks 사용 시점 + 함정.',
    category: 'js',
    snippets: [
      { label: 'useMemo — 비싼 계산 캐싱', lang: 'javascript', code: `const filteredItems = useMemo(
  () => items.filter(i => i.price > 100),
  [items]
);` },
      { label: 'useCallback — 자식 props 안정화', lang: 'javascript', code: `const handleClick = useCallback((id) => {
  onSelect(id);
}, [onSelect]);` },
      { label: '⚠ 함정: 무조건 쓰지 마라', lang: 'javascript', code: `// 단순 계산은 useMemo 오히려 느림
// React.memo 자식이 없으면 useCallback 무의미
// 측정 먼저, 최적화는 그 다음` },
    ],
    tags: ['react', 'memo', 'performance'],
  },

  // ===== Korean extra =====
  {
    slug: 'korean-zipcode',
    title: '한국 우편번호 검증 — 신우편번호 (5자리)',
    description: '2015년 이후 5자리 우편번호 검증. Daum 우편번호 API 연동 예시 포함.',
    category: 'korean',
    snippets: [
      { label: '5자리 정규식', lang: 'javascript', code: `/^\\d{5}$/` },
      { label: 'Daum 우편번호 API 연동', lang: 'html', code: `<script src="//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"></script>
<script>
new daum.Postcode({
  oncomplete: function(data) {
    document.getElementById('zip').value = data.zonecode;
    document.getElementById('addr').value = data.address;
  }
}).open();
</script>` },
    ],
    tags: ['한국', 'address', 'zipcode'],
  },
  {
    slug: 'korean-card-number',
    title: '한국 신용카드 번호 — Luhn 검증',
    description: '카드 번호 형식 + Luhn 알고리즘으로 체크섬.',
    category: 'korean',
    snippets: [
      { label: '하이픈 자동 삽입', lang: 'javascript', code: `card.replace(/(\\d{4})(?=\\d)/g, '$1-')
// "1234567890123456" → "1234-5678-9012-3456"` },
      { label: 'Luhn 체크섬', lang: 'javascript', code: `function luhn(num) {
  const d = num.replace(/\\D/g, '').split('').map(Number).reverse();
  return d.reduce((sum, x, i) => {
    if (i % 2) x = x * 2 > 9 ? x * 2 - 9 : x * 2;
    return sum + x;
  }, 0) % 10 === 0;
}` },
    ],
    tags: ['한국', 'card', 'validation'],
  },
  {
    slug: 'korean-bank-account',
    title: '한국 은행 계좌번호 — 정규식 모음',
    description: '주요 은행별 계좌번호 형식 정규식.',
    category: 'korean',
    snippets: [
      { label: '국민·신한·우리 (10–14자리)', lang: 'javascript', code: `/^\\d{10,14}$/` },
      { label: '카카오뱅크 (3-3-7)', lang: 'javascript', code: `/^3333-?\\d{2}-?\\d{7}$/` },
      { label: '토스뱅크 (1000-XX-XXXXXXX)', lang: 'javascript', code: `/^1000-?\\d{2}-?\\d{7}$/` },
      { label: '하이픈 제거 normalize', lang: 'javascript', code: `account.replace(/-/g, '').trim()` },
    ],
    tags: ['한국', 'bank', 'account'],
  },

  // ===== Excel =====
  {
    slug: 'excel-vlookup',
    title: 'Excel VLOOKUP / XLOOKUP — 다른 시트 데이터 가져오기',
    description: '실무 1번째로 검색되는 Excel 함수. XLOOKUP이 신버전.',
    category: 'excel',
    snippets: [
      { label: 'VLOOKUP (구버전 호환)', lang: 'excel', code: `=VLOOKUP(A2, Sheet2!A:C, 3, FALSE)
# A2의 값을 Sheet2의 A열에서 찾아, 같은 행의 C열(3번째) 반환` },
      { label: 'XLOOKUP (Excel 365+)', lang: 'excel', code: `=XLOOKUP(A2, Sheet2!A:A, Sheet2!C:C, "없음")
# 더 유연, 왼쪽 검색 가능, 없을 때 fallback` },
      { label: 'INDEX + MATCH (어디서나 OK)', lang: 'excel', code: `=INDEX(Sheet2!C:C, MATCH(A2, Sheet2!A:A, 0))` },
    ],
    tags: ['excel', 'vlookup', 'lookup'],
  },
  {
    slug: 'excel-conditional',
    title: 'Excel 조건부 함수 — IF/IFS/SUMIF/COUNTIF',
    description: '조건에 따른 값 반환·합계·카운트.',
    category: 'excel',
    snippets: [
      { label: 'IF — 단일 조건', lang: 'excel', code: `=IF(A2>=60, "합격", "불합격")` },
      { label: 'IFS — 다중 조건 (Excel 365+)', lang: 'excel', code: `=IFS(A2>=90, "A", A2>=80, "B", A2>=70, "C", TRUE, "F")` },
      { label: 'SUMIF — 조건부 합계', lang: 'excel', code: `=SUMIF(B:B, "서울", C:C)
# B열이 "서울"인 행의 C열 합` },
      { label: 'COUNTIFS — 다중 조건 카운트', lang: 'excel', code: `=COUNTIFS(A:A, ">=2026-01-01", B:B, "완료")` },
    ],
    tags: ['excel', 'if', 'condition'],
  },

  // ===== Python (original) =====
  {
    slug: 'python-file-io',
    title: 'Python 파일 입출력 — 한 줄씩, JSON, CSV, 인코딩',
    description: '한국어 인코딩 포함 실무 파일 처리.',
    category: 'python',
    snippets: [
      { label: 'UTF-8 파일 한 줄씩 읽기', lang: 'python', code: `with open('data.txt', 'r', encoding='utf-8') as f:
    for line in f:
        print(line.strip())` },
      { label: '한 번에 다 읽기', lang: 'python', code: `text = open('data.txt', encoding='utf-8').read()` },
      { label: 'CSV 한국어 안전 처리', lang: 'python', code: `import csv
with open('data.csv', encoding='utf-8-sig', newline='') as f:
    for row in csv.DictReader(f):
        print(row)` },
      { label: 'JSON 한글 안 깨지게 저장', lang: 'python', code: `import json
with open('out.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)` },
    ],
    tags: ['python', 'file', 'encoding'],
  },
];

export const CATEGORY_LABEL: Record<SnippetCategory, string> = {
  regex: '정규식',
  git: 'Git',
  linux: 'Linux',
  sql: 'SQL',
  korean: '한국 특화',
  excel: 'Excel',
  curl: 'curl/HTTP',
  js: 'JavaScript',
  python: 'Python',
};

export const CATEGORY_COLOR: Record<SnippetCategory, string> = {
  regex: 'bg-violet-500/10 text-violet-300 border-violet-500/30',
  git: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
  linux: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
  sql: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  korean: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  excel: 'bg-green-500/10 text-green-300 border-green-500/30',
  curl: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  js: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30',
  python: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30',
};
