/**
 * 집단 관측 — 개인이 원리적으로 못 보는 것.
 *
 * 티맵의 "이 구간 사고났나요?"와 같은 구조다. 자동 대조가 뽑은 주장(계좌·전화·URL·사업자번호)을
 * 해시로 세고, 사용자가 [사기였어요]/[아니었어요]를 누르면 그 해시의 확인 카운트가 올라간다.
 * 다음 사람에게는 "이 계좌는 최근 30일 N명에게 왔고, M명이 사기로 확인했습니다"가 뜬다.
 *
 * 더치트는 피해가 난 뒤 신고해야 등록된다. 이건 검사 요청 자체가 관측이라 **첫 피해자 이전에** 쌓인다.
 *
 * 저장하는 것: 소금친 SHA-256 해시와 정수 카운트뿐. 원문·메시지·누가 물었는지는 저장하지 않는다.
 * env: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN (없으면 no-op), CROWD_SALT(권장)
 */

const SEEN_TTL = 30 * 24 * 3600;       // 관측은 30일 창
const FEEDBACK_TTL = 180 * 24 * 3600;  // 확인은 6개월
const DEDUPE_TTL = 24 * 3600;          // 같은 IP가 같은 해시에 하루 한 번

export type ClaimKind = 'account' | 'phone' | 'url' | 'brno';
export interface CrowdRow { kind: ClaimKind; label: string; hash: string; seen: number; scam: number; safe: number }

function env(name: string): string {
  return (import.meta.env as any)[name] || process.env[name] || '';
}

function upstash(): { url: string; token: string } | null {
  // Vercel KV 는 Upstash 기반이라 REST 프로토콜이 같다. 프로덕션엔 KV_REST_API_* 만 있다(실측).
  const url = env('UPSTASH_REDIS_REST_URL') || env('KV_REST_API_URL');
  const token = env('UPSTASH_REDIS_REST_TOKEN') || env('KV_REST_API_TOKEN');
  return url && token ? { url, token } : null;
}

async function pipeline(cmds: (string | number)[][]): Promise<any[]> {
  const u = upstash();
  if (!u || !cmds.length) return [];
  try {
    const r = await fetch(`${u.url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${u.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmds),
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return [];
    const arr = await r.json();
    return Array.isArray(arr) ? arr.map((x) => x?.result) : [];
  } catch { return []; }
}

function normalize(kind: ClaimKind, v: string): string {
  if (kind === 'url') return v.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
  return v.replace(/\D/g, '');
}

async function hashRaw(s: string): Promise<string> {
  const salt = env('CROWD_SALT') || 'allthatai-crowd-v1';
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}|${s}`));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

export async function hashClaim(kind: ClaimKind, value: string): Promise<string> {
  return hashRaw(`${kind}|${normalize(kind, value)}`);
}

/** 라벨은 사용자에게 보여줄 가려진 표기 — 원문은 클라이언트로도 다시 안 보낸다. */
function mask(kind: ClaimKind, v: string): string {
  if (kind === 'url') return v;
  const d = v.replace(/\D/g, '');
  if (d.length <= 4) return d;
  return d.slice(0, 3) + '*'.repeat(Math.max(2, d.length - 6)) + d.slice(-3);
}

/**
 * 관측 + 조회. 이번 검사에서 나온 주장들의 seen 을 1 올리고, 누적 seen/scam/safe 를 돌려준다.
 * 돌려주는 seen 은 '나를 포함하지 않은' 값이라 "다른 N명에게도" 로 읽을 수 있다.
 */
export async function observeAndLookup(claims: Record<string, string[]>): Promise<CrowdRow[]> {
  const items: { kind: ClaimKind; value: string }[] = [];
  for (const kind of ['account', 'phone', 'url', 'brno'] as ClaimKind[]) {
    for (const v of (claims?.[kind] || []).slice(0, 5)) items.push({ kind, value: String(v) });
  }
  if (!items.length) return [];

  const hashes = await Promise.all(items.map((i) => hashClaim(i.kind, i.value)));
  const readCmds: (string | number)[][] = [['MGET', ...hashes.flatMap((h) => [`crowd:seen:${h}`, `crowd:scam:${h}`, `crowd:safe:${h}`])]];
  // 관리자 화면용 상위 집계 — 키를 SCAN 하지 않도록 정렬셋에 같이 쌓는다. 라벨은 가려진 표기만 저장한다.
  const writeCmds: (string | number)[][] = hashes.flatMap((h, i) => [
    ['INCR', `crowd:seen:${h}`], ['EXPIRE', `crowd:seen:${h}`, SEEN_TTL],
    ['ZINCRBY', 'crowd:top:seen', 1, h], ['HSET', 'crowd:label', h, `${items[i].kind}:${mask(items[i].kind, items[i].value)}`],
  ]);
  const [read] = await pipeline(readCmds);
  pipeline(writeCmds); // fire-and-forget

  const vals: any[] = Array.isArray(read) ? read : [];
  return items.map((it, i) => ({
    kind: it.kind,
    label: mask(it.kind, it.value),
    hash: hashes[i],
    seen: Number(vals[i * 3] || 0),
    scam: Number(vals[i * 3 + 1] || 0),
    safe: Number(vals[i * 3 + 2] || 0),
  }));
}

/** 사용자 확인 — 티맵의 '사고났나요?' 클릭. 같은 IP·같은 해시는 하루 한 번만 센다. */
/** 관리자용 — 사기 확인·관측 상위 N. 라벨은 가려진 표기(원문 없음). */
export async function topReported(n = 10): Promise<{ scam: any[]; seen: any[] }> {
  const [scam, seen] = await pipeline([['ZREVRANGE', 'crowd:top:scam', 0, n - 1, 'WITHSCORES'], ['ZREVRANGE', 'crowd:top:seen', 0, n - 1, 'WITHSCORES']]);
  const pairs = (arr: any[]) => { const out: [string, number][] = []; for (let i = 0; i + 1 < (arr || []).length; i += 2) out.push([String(arr[i]), Number(arr[i + 1])]); return out; };
  const sp = pairs(scam), se = pairs(seen);
  const hashes = [...new Set([...sp, ...se].map(([h]) => h))];
  const [labels] = hashes.length ? await pipeline([['HMGET', 'crowd:label', ...hashes]]) : [[]];
  const label = new Map(hashes.map((h, i) => [h, (labels || [])[i] || '?']));
  const rows = (ps: [string, number][]) => ps.map(([h, c]) => ({ hash: h, label: label.get(h), count: c }));
  return { scam: rows(sp), seen: rows(se) };
}

export async function feedback(hashes: string[], verdict: 'scam' | 'safe', ip: string): Promise<{ counted: number }> {
  const clean = hashes.filter((h) => /^[0-9a-f]{32}$/.test(h)).slice(0, 10);
  if (!clean.length) return { counted: 0 };
  const ipHash = await hashRaw(`ip|${ip || 'unknown'}`);  // IP 도 원문 저장 안 함(정규화 없이 그대로 해시)

  const dedupe = await pipeline(clean.map((h) => ['SET', `crowd:fb:${ipHash}:${h}`, '1', 'NX', 'EX', DEDUPE_TTL]));
  const fresh = clean.filter((_, i) => dedupe[i] === 'OK');
  if (!fresh.length) return { counted: 0 };

  await pipeline(fresh.flatMap((h) => [['INCR', `crowd:${verdict}:${h}`], ['EXPIRE', `crowd:${verdict}:${h}`, FEEDBACK_TTL], ['ZINCRBY', `crowd:top:${verdict}`, 1, h]]));
  return { counted: fresh.length };
}
