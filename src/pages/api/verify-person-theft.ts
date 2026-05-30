/**
 * /api/verify-person-theft — 인물 사진 도용·사칭 탐지.
 *
 * 입력: POST { input: base64 image, identity?: string, accessCode? }
 *   identity = 이 사진이 "누구라고 주장하는지" (선택). 같은 얼굴이 다른 신원이면 도용.
 * 자체 모델(verify.allthatai.kr/verify/person-theft) 호출.
 */
import type { APIRoute } from 'astro';
import { incrEvent } from '../../lib/stat-counter';
import { checkAccess, forbidden, modelHeaders } from '../../lib/access-gate';
import { webDetect, webTheftSignal } from '../../lib/web-detection';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  let body: any;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }

  const gate = checkAccess(request, body);
  if (!gate.ok) return forbidden(gate.reason!);

  const imageInput = (body?.input || '').toString().trim();
  const identity = (body?.identity || '').toString().trim() || null;
  if (!imageInput) return new Response(JSON.stringify({ ok: false, error: '사진을 올려주세요' }), { status: 400 });

  incrEvent('verify_person_theft');

  const modelApi = (import.meta.env as any).SCAM_MODEL_API || process.env.SCAM_MODEL_API;
  if (!modelApi) {
    return new Response(JSON.stringify({ ok: false, error: '도용탐지 모델 서버 미연결 (SCAM_MODEL_API)' }), { status: 503 });
  }

  // base64만 (data:image/... 또는 순수). URL은 미지원.
  const b64 = imageInput.startsWith('http') ? null : imageInput;
  if (!b64) return new Response(JSON.stringify({ ok: false, error: '사진 파일을 직접 올려주세요 (URL 미지원)' }), { status: 400 });

  try {
    // ① 자체 모델(재사용 매칭) + ② Google Vision 웹 역검색 — 병렬
    const [selfRes, web] = await Promise.all([
      fetch(`${modelApi}/verify/person-theft`, {
        method: 'POST',
        headers: modelHeaders(),
        body: JSON.stringify({ image_b64: b64, identity, context: 'web-verify', store: true }),
        signal: AbortSignal.timeout(25000),
      }).then(async (r) => (r.ok ? r.json() : null)).catch(() => null),
      webDetect(imageInput).catch(() => null),
    ]);

    if (!selfRes || !selfRes.ok) {
      return new Response(JSON.stringify({ ok: false, error: '도용탐지 모델 응답 실패' }), { status: 502 });
    }
    const d = selfRes;

    // 자체 DB 재사용 (다른 신원)
    const diffIdentity = (d.matches || []).filter((m: any) => m.different_identity);
    const redFlags: string[] = [];
    for (const r of (d.reasons || [])) redFlags.push(r);

    let score = d.score ?? 0;

    // 웹 역검색 신호 결합
    const webResult = web && web.available ? webTheftSignal(web) : { score: 0, reasons: [] };
    if (webResult.reasons.length) redFlags.push(...webResult.reasons);
    score = Math.max(score, webResult.score);

    const verdict = score >= 70 ? '도용·사칭 의심 높음' : score >= 40 ? '의심' : score >= 20 ? '주의' : '정상';

    return new Response(JSON.stringify({
      ok: true,
      slug: 'person-theft',
      source: 'self-model + google-web-detection',
      riskScore: score,
      verdict,
      summary: redFlags.length ? redFlags[0] : '도용·사칭 정황이 발견되지 않았습니다. (자체 DB·웹 역검색 기준)',
      hasFace: d.has_face,
      nFaces: d.n_faces,
      reusedIdentities: diffIdentity.map((m: any) => ({
        identity: m.identity, via: m.via, score: m.score, at: m.at,
      })),
      webMatches: web && web.available ? {
        fullMatches: web.fullMatches,
        partialMatches: web.partialMatches,
        pages: web.pages,
        bestGuess: web.bestGuessLabel,
      } : null,
      webAvailable: !!(web && web.available),
      redFlags,
      nextSteps: score >= 40
        ? ['발견된 웹 출처에서 원본·다른 신원 확인', '상대에게 영상통화·실시간 인증 요청', '송금·투자 요청은 절대 응하지 말 것']
        : ['추가 정황이 있으면 다시 검증', '의심되면 영상통화로 본인 확인'],
      privacy: 'no_image_storage_embeddings_only',
    }), { headers: { 'Content-Type': 'application/json', 'X-Privacy-Policy': 'no-image-storage' } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : 'fetch failed' }), { status: 500 });
  }
};
