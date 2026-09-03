/**
 * /api/admin-stats — 핵심 매출 이벤트 실시간 카운트.
 *
 * 인증: ?key=ADMIN_KEY (env)
 * 데이터: Upstash Redis REST API (env UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)
 *
 * 키 구조:
 *   stat:{event}:total
 *   stat:{event}:{YYYY-MM-DD}
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const TRACKED_EVENTS = [
  'service_inquiry', 'scam_report',
  'verify_text:phishing-text', 'verify_text:romance-scam',
  'verify_text:health-gym-terms', 'verify_text:insurance-terms',
  'verify_text:telecom-terms', 'verify_text:subscription-terms',
  'verify_text:fake-review', 'verify_text:ai-text-detection',
  'verify_image:deepfake-image', 'verify_image:document-forgery',
  'verify_image:etungi-forgery',
  'ai_etungi', 'ai_contract', 'ai_listing_fraud', 'ai_price_predict',
  'hidden_money_diagnose', 'lifecycle_sim',
];

async function redisGet(key: string): Promise<number> {
  const url = ((import.meta.env as any).UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_URL || (import.meta.env as any).KV_REST_API_URL || process.env.KV_REST_API_URL);
  const token = ((import.meta.env as any).UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || (import.meta.env as any).KV_REST_API_TOKEN || process.env.KV_REST_API_TOKEN);
  if (!url || !token) return 0;
  try {
    const r = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!r.ok) return 0;
    const d = await r.json();
    return parseInt(d.result || '0', 10) || 0;
  } catch { return 0; }
}

export const GET: APIRoute = async ({ url }) => {
  const ADMIN_KEY = (import.meta.env as any).ADMIN_KEY || process.env.ADMIN_KEY;
  if (!ADMIN_KEY) {
    return new Response(JSON.stringify({ ok: false, error: 'ADMIN_KEY env 등록 필요' }), { status: 503 });
  }
  const key = url.searchParams.get('key');
  if (key !== ADMIN_KEY) {
    return new Response(JSON.stringify({ ok: false, error: '인증 실패' }), { status: 401 });
  }

  const upstashUrl = ((import.meta.env as any).UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_URL || (import.meta.env as any).KV_REST_API_URL || process.env.KV_REST_API_URL);
  if (!upstashUrl) {
    return new Response(JSON.stringify({
      ok: true,
      configured: false,
      message: 'Upstash Redis 미등록. UPSTASH_REDIS_REST_URL/TOKEN env 등록 필요',
      setupUrl: 'https://console.upstash.com',
      events: TRACKED_EVENTS,
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  // 모든 이벤트에 대해 total, today, yesterday 카운트 병렬 조회
  const results = await Promise.all(TRACKED_EVENTS.flatMap((e) => [
    redisGet(`stat:${e}:total`).then((n) => [e, 'total', n] as const),
    redisGet(`stat:${e}:${today}`).then((n) => [e, 'today', n] as const),
    redisGet(`stat:${e}:${yesterday}`).then((n) => [e, 'yesterday', n] as const),
  ]));

  const stats: Record<string, { total: number; today: number; yesterday: number }> = {};
  TRACKED_EVENTS.forEach((e) => { stats[e] = { total: 0, today: 0, yesterday: 0 }; });
  results.forEach(([e, kind, n]) => { (stats[e] as any)[kind] = n; });

  return new Response(JSON.stringify({
    ok: true,
    configured: true,
    today,
    stats,
  }), { headers: { 'Content-Type': 'application/json' } });
};
