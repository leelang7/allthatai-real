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
  const url = (import.meta.env as any).UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = (import.meta.env as any).UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
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
