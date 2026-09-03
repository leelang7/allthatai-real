/**
 * Upstash Redis REST 기반 이벤트 카운터.
 *
 * env: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN (없으면 no-op)
 *
 * 사용:
 *   import { incrEvent } from '../../lib/stat-counter';
 *   incrEvent('verify_text:phishing-text');  // await X (fire and forget)
 */

export function incrEvent(event: string): void {
  const e = (import.meta.env as any);
  // Vercel KV(Upstash 기반)는 KV_REST_API_* 로 들어온다 — 프로덕션엔 UPSTASH_* 가 없어 카운터가 no-op 였다(2026-09-03 실측)
  const url = e.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_URL || e.KV_REST_API_URL || process.env.KV_REST_API_URL;
  const token = e.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || e.KV_REST_API_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return;

  const today = new Date().toISOString().slice(0, 10);
  const keys = [`stat:${event}:total`, `stat:${event}:${today}`];

  // fire-and-forget (응답 안 기다림)
  for (const key of keys) {
    fetch(`${url}/incr/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    }).catch(() => { /* silent */ });
  }
}
