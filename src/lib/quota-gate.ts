/**
 * 무료 사용 횟수 게이트 — "코드 없는 사람도 무료 3회까지".
 *
 * 정책:
 *   - 유효한 액세스 코드 보유 → 무제한 (코드 게이트가 우선)
 *   - 코드 없음 → IP 기준 무료 FREE_LIMIT 회까지 허용, 소진되면 차단(402)
 *
 * 저장: Upstash Redis REST (stat-counter와 동일 env 재사용).
 *   - UPSTASH 미설정 시 카운트 불가 → 안전하게 "허용"(개발/로컬).
 *   - 키 quota:ip:<ip> 에 INCR, 30일 롤링 만료.
 *
 * 사용 흐름(엔드포인트):
 *   1) checkAccess 로 코드 검사 → 코드 OK면 그냥 진행(무제한)
 *   2) 코드 없으면 peekQuota() 로 잔여 확인 → 0이면 quotaExhausted() 반환
 *   3) 분석 성공 후 consumeQuota() 로 1 차감(INCR)
 */

import { allowedCodes, extractCode } from './access-gate';

export const FREE_LIMIT = 3;
const TTL_SECONDS = 60 * 60 * 24 * 30; // 30일 롤링

function redisEnv() {
  const url = (import.meta.env as any).UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = (import.meta.env as any).UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

/** 클라이언트 IP 추출 (Cloudflare → Vercel 순). */
export function clientIp(request: Request): string {
  const h = request.headers;
  const cf = h.get('cf-connecting-ip');
  if (cf) return cf.trim();
  const xff = h.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return h.get('x-real-ip')?.trim() || 'unknown';
}

function key(ip: string): string {
  return `quota:ip:${ip}`;
}

async function redisGet(url: string, token: string, k: string): Promise<number> {
  try {
    const res = await fetch(`${url}/get/${encodeURIComponent(k)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return 0;
    const j = (await res.json()) as { result?: string | null };
    return j.result ? parseInt(j.result, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

/** 잔여 무료 횟수 확인 (차감 안 함). Redis 미설정이면 항상 여유 있음으로 간주. */
export async function peekQuota(request: Request): Promise<{ used: number; remaining: number; limit: number; tracked: boolean }> {
  const env = redisEnv();
  if (!env) return { used: 0, remaining: FREE_LIMIT, limit: FREE_LIMIT, tracked: false };
  const ip = clientIp(request);
  const used = await redisGet(env.url, env.token, key(ip));
  return { used, remaining: Math.max(0, FREE_LIMIT - used), limit: FREE_LIMIT, tracked: true };
}

/** 무료 1회 차감(INCR + 만료 갱신). 차감 후 used 반환. */
export async function consumeQuota(request: Request): Promise<number> {
  const env = redisEnv();
  if (!env) return 0;
  const ip = clientIp(request);
  const k = key(ip);
  try {
    const res = await fetch(`${env.url}/incr/${encodeURIComponent(k)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.token}` },
    });
    const j = (await res.json()) as { result?: number };
    const used = j.result ?? 0;
    // 첫 사용 시 만료 설정 (롤링)
    fetch(`${env.url}/expire/${encodeURIComponent(k)}/${TTL_SECONDS}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.token}` },
    }).catch(() => {});
    return used;
  } catch {
    return 0;
  }
}

/**
 * 통합 게이트: 유효한 코드 → 무제한, 없으면 무료 3회.
 * 반환 useFree=true 면 분석 성공 후 consumeQuota()를 호출해야 함.
 */
export async function gateOrQuota(
  request: Request,
  body?: any
): Promise<{ ok: boolean; response?: Response; useFree: boolean; remaining?: number }> {
  const codes = allowedCodes();
  const code = extractCode(request, body);
  const hasValidCode = codes.size > 0 && !!code && codes.has(code);

  // 코드 게이트 미설정(개발) 또는 유효 코드 → 무제한
  if (codes.size === 0 || hasValidCode) {
    return { ok: true, useFree: false };
  }
  // 잘못된 코드를 "입력"한 경우는 명확히 거부 (오타 안내)
  if (code && !codes.has(code)) {
    return {
      ok: false,
      useFree: false,
      response: new Response(
        JSON.stringify({ ok: false, reason: 'invalid_access_code', error: '유효하지 않은 액세스 코드입니다.' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      ),
    };
  }
  // 코드 미입력 → 무료 3회 체험
  const q = await peekQuota(request);
  if (q.remaining <= 0) {
    return { ok: false, useFree: false, response: quotaExhausted(q.used) };
  }
  return { ok: true, useFree: true, remaining: q.remaining };
}

/** 무료 소진 응답 (402 Payment Required). */
export function quotaExhausted(used: number): Response {
  return new Response(
    JSON.stringify({
      ok: false,
      reason: 'free_quota_exhausted',
      error: `무료 ${FREE_LIMIT}회를 모두 사용했어요. 계속 이용하려면 액세스 코드를 입력하거나 결제해 주세요.`,
      used,
      limit: FREE_LIMIT,
    }),
    { status: 402, headers: { 'Content-Type': 'application/json' } }
  );
}
