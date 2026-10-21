/**
 * 크루 대항 — 저장소 없이 시험할 수 있는 규칙만.
 *
 * 크루 = Ditto 의 아지트, 주간 총거리 순위 = 패권 랭킹. 다른 점 하나: 기록은 사람이 적지 않는다.
 * 안드로이드는 헬스 커넥트(삼성헬스·가민 커넥트), 아이폰은 애플 건강에서 앱이 주간 합만 보낸다.
 *
 * 밖으로 나오는 것은 **주간 러닝 거리 합(m)과 횟수**뿐이다. 경로·심박·시각·실명은 없다.
 */

/** 주는 한국 시각 월요일 0시에 바뀐다. */
const KST_MS = 9 * 60 * 60 * 1000;

/** "2026-W43" — ISO 주(월요일 시작), 한국 시각 기준. */
export function isoWeekKST(d: Date): string {
  const k = new Date(d.getTime() + KST_MS);
  // ISO 주: 그 주 목요일이 속한 해.
  const day = (k.getUTCDay() + 6) % 7; // 월=0 … 일=6
  const thu = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate() - day + 3));
  const yearStart = new Date(Date.UTC(thu.getUTCFullYear(), 0, 1));
  const week = Math.floor((thu.getTime() - yearStart.getTime()) / 86_400_000 / 7) + 1;
  return `${thu.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * 받아 줄 주 — 이번 주와 지난주만. 월요일 새벽에 지난주 마지막 러닝이 늦게 동기화되는 일이
 * 흔하다(워치 → 폰 → 헬스 커넥트). 그 이전 주는 이미 끝난 승부라 고치지 않는다.
 */
export function acceptableWeeks(now: Date): string[] {
  return [isoWeekKST(now), isoWeekKST(new Date(now.getTime() - 7 * 86_400_000))];
}

/** 한 사람이 한 주에 낼 수 있는 상한(m). 울트라 러너도 주 400km 는 안 넘는다 — 넘으면 자동차다. */
export const MAX_WEEK_METERS = 400_000;

export function cleanMeters(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n < 0 || n > MAX_WEEK_METERS) return null;
  return Math.round(n);
}

export function cleanRuns(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 50 ? Math.round(n) : 0;
}

/**
 * 크루 안에서 보이는 이름. 1~16자, 전화번호·주소창 글자·제어문자는 안 받는다 —
 * 실명·연락처를 닉네임 칸으로 흘리는 것을 막는다(Ditto 의 외부 연락처 필터와 같은 생각).
 */
export function cleanNick(v: unknown): string | null {
  const s = String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (s.length < 1 || s.length > 16) return null;
  if (/\d{3,}[-\s]?\d{3,}/.test(s) || /https?:|www\.|\.com|@/i.test(s)) return null;
  return s;
}

/** 크루 이름. 2~20자, 같은 규칙. */
export function cleanCrewName(v: unknown): string | null {
  const s = String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (s.length < 2 || s.length > 20) return null;
  if (/\d{3,}[-\s]?\d{3,}/.test(s) || /https?:|www\.|\.com|@/i.test(s)) return null;
  return s;
}

/** 초대 코드 글자 — 헷갈리는 0/O·1/I/L 은 뺀다(카톡으로 불러 줄 때 틀린다). */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function makeCode(bytes: Uint8Array, len = 6): string {
  let s = '';
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[bytes[i % bytes.length] % CODE_ALPHABET.length];
  return s;
}

export function normalizeCode(v: unknown): string | null {
  const s = String(v ?? '').toUpperCase().replace(/[\s-]/g, '');
  return /^[A-Z2-9]{6}$/.test(s) && [...s].every((c) => CODE_ALPHABET.includes(c)) ? s : null;
}

/** 익명 기기 id — 앱이 처음 한 번 만든 무작위 값. 'test-' 로 시작하면 저장하지 않는다. */
export function cleanMemberId(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return /^[A-Za-z0-9_-]{8,64}$/.test(s) ? s : null;
}

export function isTestId(id: string): boolean {
  return id.startsWith('test-');
}

export interface CrewRow {
  id: string;
  name: string;
  /** 이번 주 합(m). */
  total: number;
  /** 이번 주 1m 라도 뛴 사람 수. */
  active: number;
}

export interface Ranked extends CrewRow {
  rank: number;
  /** 1인 평균(m) — 뛴 사람 기준. 사람 많은 크루만 이기지 않게 따로 줄 세운다. */
  avg: number;
}

/**
 * 순위. [by] 'total' = 총거리, 'avg' = 뛴 사람 1인 평균.
 * 같은 값이면 같은 등수(1, 2, 2, 4). 0m 크루는 뺀다 — 아무도 안 뛴 크루가 꼴찌로 떠 있을 이유가 없다.
 */
export function rankCrews(rows: CrewRow[], by: 'total' | 'avg' = 'total'): Ranked[] {
  const withAvg = rows
    .filter((r) => r.total > 0)
    .map((r) => ({ ...r, avg: r.active > 0 ? Math.round(r.total / r.active) : 0 }));
  const key = (r: { total: number; avg: number }) => (by === 'total' ? r.total : r.avg);
  withAvg.sort((a, b) => key(b) - key(a) || b.total - a.total || a.name.localeCompare(b.name));
  const out: Ranked[] = [];
  withAvg.forEach((r, i) => {
    const prev = out[i - 1];
    out.push({ ...r, rank: prev && key(prev) === key(r) ? prev.rank : i + 1 });
  });
  return out;
}

/** 우리 크루가 한 계단 오르려면 몇 m 가 더 필요한가. 1등이면 null. */
export function gapToNext(ranked: Ranked[], crewId: string, by: 'total' | 'avg' = 'total'): number | null {
  const i = ranked.findIndex((r) => r.id === crewId);
  if (i <= 0) return null;
  const key = (r: Ranked) => (by === 'total' ? r.total : r.avg);
  const above = ranked.slice(0, i).reverse().find((r) => key(r) > key(ranked[i]));
  return above ? key(above) - key(ranked[i]) + 1 : null;
}
