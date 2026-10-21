/**
 * 크루 대항 저장소 — Upstash Redis REST(크라우드와 같은 env). 규칙은 crew-core.ts.
 *
 * 키 (주간 키는 70일 뒤 사라진다):
 *   crew:c:{id}            HASH name·code·created
 *   crew:code:{CODE}       STRING id
 *   crew:m:{id}            HASH 기기id → 닉네임(크루 안에서만 보인다)
 *   crew:who:{기기id}       STRING 지금 속한 크루 id (한 사람 한 크루)
 *   crew:w:{주}:{id}        HASH 기기id → 그 주 거리(m)
 *   crew:board:{주}         ZSET 크루id → 그 주 크루 합(m)
 *
 * 남는 것: 크루 이름, 닉네임, 주간 거리 합. 실명·연락처·경로·심박·시각은 받지도 않는다.
 * 손목·폰이 보내는 '보고'는 그 주 **누적 합**이라 몇 번 와도 같은 값이 된다(멱등).
 */
import {
  acceptableWeeks, cleanCrewName, cleanMeters, cleanMemberId, cleanNick, cleanRuns, gapToNext,
  isTestId, isoWeekKST, makeCode, normalizeCode, rankCrews, type CrewRow, type Ranked,
} from './crew-core';

const WEEK_TTL = 70 * 24 * 3600;
const MAX_MEMBERS = 300;
const BOARD_SIZE = 50;

function env(name: string): string {
  return ((import.meta as any).env?.[name]) || process.env[name] || '';
}

function upstash(): { url: string; token: string } | null {
  const url = env('UPSTASH_REDIS_REST_URL') || env('KV_REST_API_URL');
  const token = env('UPSTASH_REDIS_REST_TOKEN') || env('KV_REST_API_TOKEN');
  return url && token ? { url, token } : null;
}

export function crewStorageReady(): boolean {
  return upstash() !== null;
}

async function pipeline(cmds: (string | number)[][]): Promise<any[]> {
  const u = upstash();
  if (!u || !cmds.length) return [];
  const r = await fetch(`${u.url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${u.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
    signal: AbortSignal.timeout(4000),
  });
  if (!r.ok) throw new Error(`redis ${r.status}`);
  const arr = await r.json();
  return Array.isArray(arr) ? arr.map((x) => x?.result) : [];
}

/** 크루 안 기기의 보고 열쇠. 기기id 를 아는 남이 대신 거리를 써 넣지 못하게. */
async function tokenFor(crewId: string, memberId: string): Promise<string> {
  const secret = env('CREW_SECRET') || env('CROWD_SALT') || 'allthatai-crew-v1';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${crewId}:${memberId}`));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

function rand(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

function hex(b: Uint8Array): string {
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
}

export type CrewResult = { ok: true; [k: string]: unknown } | { ok: false; error: string; status: number };

const bad = (error: string, status = 400): CrewResult => ({ ok: false, error, status });

/** 크루 만들기 — 만든 사람이 첫 멤버. 하루 3개까지(같은 기기). */
export async function createCrew(b: any): Promise<CrewResult> {
  const name = cleanCrewName(b.name);
  const memberId = cleanMemberId(b.memberId);
  const nick = cleanNick(b.nick);
  if (!name) return bad('크루 이름은 2~20자, 연락처·주소는 안 됩니다');
  if (!memberId || !nick) return bad('memberId·nick 필요(닉네임 1~16자)');
  if (isTestId(memberId)) return { ok: true, test: true, crewId: 'test-crew', code: 'TEST23', token: 'test' };
  const day = isoWeekKST(new Date()) + new Date().getUTCDay();
  const [made] = await pipeline([['INCR', `crew:mk:${memberId}:${day}`], ['EXPIRE', `crew:mk:${memberId}:${day}`, 86400]]);
  if (Number(made) > 3) return bad('오늘은 크루를 더 만들 수 없어요', 429);
  const crewId = hex(rand(6));
  let code = '';
  for (let i = 0; i < 6 && !code; i++) {
    const c = makeCode(rand(6));
    const [set] = await pipeline([['SET', `crew:code:${c}`, crewId, 'NX']]);
    if (set === 'OK') code = c;
  }
  if (!code) return bad('코드를 못 만들었어요 — 다시 시도', 503);
  await pipeline([['HSET', `crew:c:${crewId}`, 'name', name, 'code', code, 'created', Date.now()]]);
  const joined = await joinCrew({ code, memberId, nick });
  return joined.ok ? { ...joined, created: true } : joined;
}

/** 코드로 들어가기. 이미 다른 크루면 옮긴다(한 사람 한 크루 — 두 크루에 거리를 두 번 세지 않게). */
export async function joinCrew(b: any): Promise<CrewResult> {
  const code = normalizeCode(b.code);
  const memberId = cleanMemberId(b.memberId);
  const nick = cleanNick(b.nick);
  if (!code) return bad('초대 코드는 6자예요');
  if (!memberId || !nick) return bad('memberId·nick 필요(닉네임 1~16자)');
  if (isTestId(memberId)) return { ok: true, test: true, crewId: 'test-crew', code, token: 'test' };
  const [crewId] = await pipeline([['GET', `crew:code:${code}`]]);
  if (!crewId) return bad('없는 코드예요', 404);
  const [count, prev, name] = await pipeline([
    ['HLEN', `crew:m:${crewId}`], ['GET', `crew:who:${memberId}`], ['HGET', `crew:c:${crewId}`, 'name'],
  ]);
  if (prev !== crewId && Number(count) >= MAX_MEMBERS) return bad('크루 인원이 다 찼어요', 409);
  const cmds: (string | number)[][] = [
    ['HSET', `crew:m:${crewId}`, memberId, nick],
    ['SET', `crew:who:${memberId}`, crewId],
  ];
  if (prev && prev !== crewId) {
    cmds.push(['HDEL', `crew:m:${prev}`, memberId]);
    // 옮기면 그 주 거리는 새 크루로 — 옛 크루 합에서 빼야 두 번 안 센다.
    for (const w of acceptableWeeks(new Date())) cmds.push(['HDEL', `crew:w:${w}:${prev}`, memberId]);
  }
  await pipeline(cmds);
  if (prev && prev !== crewId) for (const w of acceptableWeeks(new Date())) await retotal(w, prev);
  return { ok: true, crewId, code, name, token: await tokenFor(crewId, memberId) };
}

async function retotal(week: string, crewId: string): Promise<number> {
  const [vals] = await pipeline([['HVALS', `crew:w:${week}:${crewId}`]]);
  const total = (Array.isArray(vals) ? vals : []).reduce((s: number, v: unknown) => s + (Number(v) || 0), 0);
  await pipeline([
    total > 0 ? ['ZADD', `crew:board:${week}`, total, crewId] : ['ZREM', `crew:board:${week}`, crewId],
    ['EXPIRE', `crew:board:${week}`, WEEK_TTL],
  ]);
  return total;
}

/** 그 주 내 누적 거리 보고. 몇 번 와도 같은 값(멱등). */
export async function reportWeek(b: any): Promise<CrewResult> {
  const memberId = cleanMemberId(b.memberId);
  const crewId = String(b.crewId ?? '');
  const week = String(b.week ?? '');
  const meters = cleanMeters(b.meters);
  if (!memberId || !/^[a-f0-9]{12}$|^test-crew$/.test(crewId)) return bad('crewId·memberId 필요');
  if (meters === null) return bad('거리는 0~400km');
  if (!acceptableWeeks(new Date()).includes(week)) return bad('이번 주·지난주만 받아요', 422);
  if (isTestId(memberId)) return { ok: true, test: true, week, meters };
  if (String(b.token ?? '') !== (await tokenFor(crewId, memberId))) return bad('열쇠가 맞지 않아요', 403);
  const [who] = await pipeline([['GET', `crew:who:${memberId}`]]);
  if (who !== crewId) return bad('이 크루 멤버가 아니에요', 403);
  await pipeline([
    ['HSET', `crew:w:${week}:${crewId}`, memberId, meters],
    ['EXPIRE', `crew:w:${week}:${crewId}`, WEEK_TTL],
    ['HSET', `crew:r:${week}:${crewId}`, memberId, cleanRuns(b.runs)],
    ['EXPIRE', `crew:r:${week}:${crewId}`, WEEK_TTL],
  ]);
  const total = await retotal(week, crewId);
  return { ok: true, week, meters, crewTotal: total };
}

/** 순위판. crewId 를 주면 우리 크루 등수·한 계단 차이·멤버별 기여(닉네임)까지. */
export async function board(b: any): Promise<CrewResult> {
  const week = acceptableWeeks(new Date()).includes(String(b.week)) ? String(b.week) : isoWeekKST(new Date());
  const by: 'total' | 'avg' = b.by === 'avg' ? 'avg' : 'total';
  const crewId = /^[a-f0-9]{12}$/.test(String(b.crewId ?? '')) ? String(b.crewId) : null;
  const [flat] = await pipeline([['ZREVRANGE', `crew:board:${week}`, 0, BOARD_SIZE - 1, 'WITHSCORES']]);
  const ids: string[] = [];
  const totals = new Map<string, number>();
  const arr: string[] = Array.isArray(flat) ? flat : [];
  for (let i = 0; i + 1 < arr.length; i += 2) { ids.push(arr[i]); totals.set(arr[i], Number(arr[i + 1]) || 0); }
  if (crewId && !totals.has(crewId)) {
    const [score] = await pipeline([['ZSCORE', `crew:board:${week}`, crewId]]);
    if (score != null) { ids.push(crewId); totals.set(crewId, Number(score) || 0); }
  }
  const meta = ids.length
    ? await pipeline(ids.flatMap((id) => [['HGET', `crew:c:${id}`, 'name'], ['HVALS', `crew:w:${week}:${id}`]]))
    : [];
  const rows: CrewRow[] = ids.map((id, i) => ({
    id,
    name: String(meta[i * 2] ?? '이름 없음'),
    total: totals.get(id) ?? 0,
    active: (Array.isArray(meta[i * 2 + 1]) ? meta[i * 2 + 1] : []).filter((v: unknown) => Number(v) > 0).length,
  }));
  const ranked: Ranked[] = rankCrews(rows, by);
  const out: Record<string, unknown> = {
    ok: true, week, by,
    top: ranked.slice(0, 20).map(({ id, ...r }) => ({ ...r, mine: id === crewId })),
  };
  if (crewId) {
    const me = ranked.find((r) => r.id === crewId);
    const [names, meters] = await pipeline([['HGETALL', `crew:m:${crewId}`], ['HGETALL', `crew:w:${week}:${crewId}`]]);
    const nick = new Map<string, string>();
    for (let i = 0; Array.isArray(names) && i + 1 < names.length; i += 2) nick.set(names[i], names[i + 1]);
    const members: { nick: string; meters: number }[] = [];
    for (let i = 0; Array.isArray(meters) && i + 1 < meters.length; i += 2) {
      members.push({ nick: nick.get(meters[i]) ?? '나간 멤버', meters: Number(meters[i + 1]) || 0 });
    }
    members.sort((a, b) => b.meters - a.meters);
    out.mine = me
      ? { rank: me.rank, of: ranked.length, total: me.total, avg: me.avg, active: me.active, gapUp: gapToNext(ranked, crewId, by) }
      : { rank: null, of: ranked.length, total: 0, avg: 0, active: 0, gapUp: null };
    out.members = members.slice(0, 50);
  }
  return out as CrewResult;
}
