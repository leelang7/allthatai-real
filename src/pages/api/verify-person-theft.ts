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
    const res = await fetch(`${modelApi}/verify/person-theft`, {
      method: 'POST',
      headers: modelHeaders(),
      body: JSON.stringify({ image_b64: b64, identity, context: 'web-verify', store: true }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) {
      return new Response(JSON.stringify({ ok: false, error: `도용탐지 ${res.status}` }), { status: 502 });
    }
    const d = await res.json();
    if (!d.ok) return new Response(JSON.stringify({ ok: false, error: d.error || '분석 실패' }), { status: 502 });

    // 다른 신원으로 재사용된 매치
    const diffIdentity = (d.matches || []).filter((m: any) => m.different_identity);
    const redFlags: string[] = [];
    for (const r of (d.reasons || [])) redFlags.push(r);

    const verdict = d.verdict || '정상';
    const score = d.score ?? 0;

    return new Response(JSON.stringify({
      ok: true,
      slug: 'person-theft',
      source: 'self-model:person-theft',
      riskScore: score,
      verdict,
      summary: redFlags.length ? redFlags[0] : '도용·사칭 정황이 발견되지 않았습니다.',
      aiProbability: d.ai_probability != null ? `${Math.round(d.ai_probability * 100)}%` : null,
      hasFace: d.has_face,
      nFaces: d.n_faces,
      reusedIdentities: diffIdentity.map((m: any) => ({
        identity: m.identity, via: m.via, score: m.score, at: m.at,
      })),
      matchCount: (d.matches || []).length,
      redFlags,
      nextSteps: score >= 50
        ? ['상대에게 영상통화·실시간 인증 요청', '같은 사진이 쓰인 다른 계정 신고', '송금·투자 요청은 절대 응하지 말 것']
        : ['추가 정황이 있으면 다시 검증', '의심되면 영상통화로 본인 확인'],
      privacy: 'no_image_storage_embeddings_only',
    }), { headers: { 'Content-Type': 'application/json', 'X-Privacy-Policy': 'no-image-storage' } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : 'fetch failed' }), { status: 500 });
  }
};
