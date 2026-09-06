/**
 * 주장 추출 — scam-models/crosscheck/claims.py 의 TS 이식.
 *
 * 왜 사이트에도 있나: 모델 서버(홈 PC)가 죽어도 사실 대조·즉시 반증·집단 관측은 살아야 한다.
 * 그 셋은 모델이 필요 없다. 이 파일과 registry.ts 가 Vercel 쪽 축소 모드의 부품이다.
 * 규칙을 바꾸면 Python 쪽(claims.py)도 같이 바꿔야 한다 — 두 경로의 판정이 갈리면 안 된다.
 */

export interface Claims {
  brno: string[];
  phone: string[];
  account: string[];
  url: string[];
  financial_company: string[];
  public_institution: string[];
  public_institution_demand: boolean;
  amount_krw: number[];
}

export interface Check { check: string; status: '반증' | '미확인' | '부합'; reason: string; data: any; latency_ms?: number }

const BRNO = /(?<!\d)(\d{3})-?(\d{2})-?(\d{5})(?!\d)/g;
const PHONE = /(?<!\d)(?:01[016789]|0[2-9]\d?|1[5-9]\d{2})-?\d{3,4}-?\d{4}(?!\d)/g;
const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"']+|(?<![\w.])[a-z0-9-]+\.(?:kr|com|net|org|io|co|me|xyz|top|shop|link|site)(?:\/[^\s<>"']*)?/gi;
const ACCOUNT = /(?<!\d)\d{2,6}-\d{2,6}-\d{2,8}(?:-\d{1,6})?(?!\d)/g;
const AMOUNT = /(\d[\d,]*)\s*(억|천만|백만|만)\s*원|(\d[\d,]*)\s*(달러|USD)/g;
const FIN_NAME = /([가-힣A-Za-z]{1,12}(?:은행|저축은행|캐피탈|카드|보험|생명|화재|증권|자산운용|투자|대부|금융))/g;

const PUBLIC: Record<string, string[]> = {
  금융감독원: ['금융감독원', '금감원'],
  검찰: ['검찰', '검찰청', '지검', '검사'],
  경찰: ['경찰', '경찰청', '수사관', '사이버수사'],
  국세청: ['국세청', '세무서'],
  법원: ['법원', '판사'],
  금융위원회: ['금융위원회', '금융위'],
  한국신용정보원: ['신용정보원'],
  예금보험공사: ['예금보험공사', '예보'],
};
// 2026-09-06 두 곳을 고쳤다(레드팀 실측).
//  · 구어체 설치·이전 표현을 넣었다 — "안내 앱을 먼저 깔아주세요", "보관 계좌로 옮겨"
//    가 통째로 빠져나갔다(금감원 사칭인데 '미확인'으로 떨어졌다).
//  · `찾아` 를 `현금/돈 … 찾아|인출` 로 좁혔다. 그냥 `찾아` 면 진짜 경찰 출석요구서의
//    "가까운 경찰서를 찾아오세요" 가 사칭으로 뒤집힌다.
// scam-models/crosscheck/claims.py 와 같은 내용이어야 한다(test_parity.py 가 고정).
const DEMAND_PUBLIC =
  /(안전\s?계좌|보관\s?계좌|이체|송금|입금|보내주|앱\s*설치|설치하|설치해|깔아|깔고|깔아서|다운로드|다운받|링크|원격|팀뷰어|보안카드|비밀번호|OTP|(현금|돈|예금|자금)[^.!?]{0,10}(찾아|인출|옮기|옮겨|이전)|인출)/;
const UNIT: Record<string, number> = { 억: 100_000_000, 천만: 10_000_000, 백만: 1_000_000, 만: 10_000 };

const digits = (s: string) => s.replace(/\D/g, '');
const uniq = (a: string[]) => [...new Set(a)].sort();

export function extract(text: string): Claims {
  const t = String(text ?? '');
  const brno = uniq([...t.matchAll(BRNO)].map((m) => m[1] + m[2] + m[3]));
  const phone = uniq([...t.matchAll(PHONE)].map((m) => digits(m[0])));
  const url = uniq([...t.matchAll(URL_RE)].map((m) => m[0].replace(/[.,)]+$/, '')));
  const account = uniq([...t.matchAll(ACCOUNT)].map((m) => m[0]).filter((a) => {
    const d = digits(a);
    return d.length >= 10 && !brno.includes(d) && !phone.includes(d);
  }));
  const financial_company = uniq([...t.matchAll(FIN_NAME)].map((m) => m[1]));
  const public_institution = Object.entries(PUBLIC).filter(([, keys]) => keys.some((k) => t.includes(k))).map(([n]) => n).sort();
  const public_institution_demand = public_institution.length > 0 && DEMAND_PUBLIC.test(t);
  const amount_krw = uniq([...t.matchAll(AMOUNT)].map((m) =>
    m[1] ? String(parseInt(m[1].replace(/,/g, ''), 10) * UNIT[m[2]]) : String(parseInt(m[3].replace(/,/g, ''), 10) * 1400)
  )).map(Number).sort((a, b) => a - b);
  return { brno, phone, account, url, financial_company, public_institution, public_institution_demand, amount_krw };
}

/** 공공기관 사칭 즉시 반증 — 조회 0, 지연 0. */
export function publicInstitutionCheck(c: Claims): Check[] {
  return c.public_institution.map((inst) => c.public_institution_demand
    ? { check: `${inst} 사칭`, status: '반증', reason: `${inst}은(는) 어떤 경우에도 계좌이체·앱 설치·비밀번호를 요구하지 않는다. 요구가 있으면 사칭이다`, data: null }
    : { check: `${inst} 언급`, status: '미확인', reason: '요구가 아직 없다. 이체·설치·원격 요구가 나오는 순간 반증', data: null });
}

/** 조회 소스가 없는 주장도 표에 올린다 — 뽑아놓고 조용히 넘기면 사용자가 확인된 줄 안다. */
export function unsourcedChecks(c: Claims): Check[] {
  const out: Check[] = [];
  for (const a of c.account.slice(0, 3)) out.push({ check: '계좌 신고이력', status: '미확인', reason: `${a.slice(0, 3)}…${a.slice(-3)} — 조회 소스 없음(더치트 제휴 필요). 집단 관측 카운트로 대신 본다`, data: null });
  for (const p of c.phone.slice(0, 3)) out.push({ check: '전화번호 신고이력', status: '미확인', reason: `${p.slice(0, 3)}…${p.slice(-4)} — 조회 소스 없음(더치트 제휴 필요). 집단 관측 카운트로 대신 본다`, data: null });
  for (const u of c.url.slice(0, 3)) out.push({ check: 'URL 피싱 목록', status: '미확인', reason: `${u.slice(0, 40)} — KISA 피싱 URL 목록 미연동(2025-07 이후 갱신 정지)`, data: null });
  return out;
}
