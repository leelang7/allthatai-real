/**
 * /api/yt-info — 유튜브 링크 조회 프록시.
 *
 * 왜 프록시만 하나
 * ================
 * yt-dlp 는 파이썬이고 JS 런타임까지 쓴다. Vercel 서버리스(Node)에서 못 돈다.
 * 그래서 실제 작업은 홈 PC 서비스(scripts/yt-service/app.py)가 하고, 이 라우트는
 * 제목·길이·화질 같은 **작은 JSON만** 중계한다.
 *
 * 파일 바이트는 여기를 지나지 않는다. /info 가 발급한 토큰으로 브라우저가 홈 PC에
 * 직접 붙는다. 영상을 함수로 흘리면 크기·시간 제한에 바로 걸리기 때문이다.
 *
 * env
 *   YT_API   홈 PC 서비스 주소 (예: https://verify.allthatai.kr:8130)
 *   YT_KEY   그 서비스의 X-API-Key
 * 둘 중 하나라도 없으면 503 으로 "아직 안 켜졌다"고 알린다 — 조용히 실패하지 않는다.
 */
import type { APIRoute } from 'astro';
import { checkAccess, forbidden } from '../../lib/access-gate';
import { incrEvent } from '../../lib/stat-counter';

export const prerender = false;

const YT_ID = /(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: '요청을 읽지 못했습니다.' }, 400);
  }

  // 홈 PC 회선과 디스크를 쓰는 기능이라 코드 게이트 뒤에 둔다(모델 서버와 같은 규칙).
  const gate = checkAccess(request, body);
  if (!gate.ok) return forbidden(gate.reason!);

  const url = String(body.url || '').trim();
  if (!YT_ID.test(url)) {
    return json({ ok: false, error: '유튜브 주소가 아닙니다. 영상 링크를 그대로 붙여 주세요.' }, 400);
  }

  const api = (import.meta.env as any).YT_API || process.env.YT_API;
  const key = (import.meta.env as any).YT_KEY || process.env.YT_KEY;
  if (!api || !key) {
    return json({
      ok: false,
      error: '다운로드 서버가 아직 연결되지 않았습니다. 잠시 후 다시 시도해 주세요.',
      reason: 'backend_not_configured',
    }, 503);
  }

  try {
    const res = await fetch(`${api.replace(/\/$/, '')}/info`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': key,
        'User-Agent': 'AllThatAI-Server/1.0',
      },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(90_000),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.ok) {
      return json({ ok: false, error: d.error || '영상 정보를 가져오지 못했습니다.' }, res.status || 502);
    }
    incrEvent('yt_info');   // 동기 · fire-and-forget
    // 브라우저가 파일을 받으러 갈 주소. 바이트는 이 함수를 지나지 않는다.
    return json({ ...d, fileBase: `${api.replace(/\/$/, '')}/file` });
  } catch (e: any) {
    const timedOut = e?.name === 'TimeoutError' || /abort/i.test(String(e?.message));
    return json({
      ok: false,
      error: timedOut
        ? '서버가 응답하지 않습니다. 영상이 길면 오래 걸릴 수 있습니다.'
        : '다운로드 서버에 연결하지 못했습니다.',
    }, 504);
  }
};
