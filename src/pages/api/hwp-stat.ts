/**
 * /api/hwp-stat — 한글 양식 도구의 결과 종류 횟수만 센다(관리자 통계용).
 *
 * 받는 것: {"e": "<HWP_EVENTS 중 하나>"} — 200자 넘거나 목록 밖이면 버린다. 파일·내용은 이 도구가 애초에 안 보낸다.
 * 응답은 늘 204 — 화면은 결과를 기다리지 않는다(sendBeacon).
 */
import type { APIRoute } from 'astro';
import { incrEventNow } from '../../lib/stat-counter';
import { HWP_EVENTS } from '../../lib/hwp-events';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const t = await request.text();
    if (t.length <= 200) {
      const e = String((JSON.parse(t) || {}).e || '');
      if ((HWP_EVENTS as readonly string[]).includes(e)) await incrEventNow(e);
    }
  } catch { /* 잘못된 본문은 조용히 버린다 */ }
  return new Response(null, { status: 204 });
};
