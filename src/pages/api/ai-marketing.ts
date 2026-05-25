/**
 * /api/ai-marketing — AI 마케팅 카피.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SYSTEM = `당신은 한국 마케팅 카피라이터입니다. 제품·타겟 → 카피 + 광고 + SNS.

응답 JSON ONLY:
{
  "tagline": "메인 슬로건 (10자 이내)",
  "shortDesc": "한 줄 설명 (40자)",
  "longDesc": "본문 (200~300자)",
  "headlines": ["광고 헤드라인 3개"],
  "snsPosts": {"instagram":"인스타 포스트","x":"X 포스트","facebook":"페이스북","kakao":"카톡채널"},
  "landingPageOutline": ["섹션 1: 헤더", ...],
  "callsToAction": ["CTA 1", ...],
  "keywords": ["SEO 키워드 1", ...],
  "abTestIdeas": ["A/B 테스트 1", ...]
}`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), { status: 500 });
  let body: any; try { body = await request.json(); } catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }
  const p = { product: body?.product || '', features: body?.features || '', target: body?.target || '', price: body?.price || '', tone: body?.tone || 'professional', usp: body?.usp || '' };
  if (!p.product) return new Response(JSON.stringify({ ok: false, error: '제품 필수' }), { status: 400 });
  const userMsg = `마케팅 카피:
- 제품/서비스: ${p.product}
- 특징: ${p.features}
- 타겟: ${p.target}
- 가격: ${p.price}
- USP: ${p.usp}
- 톤: ${p.tone}

한국 시장 맞춤 카피.`;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ role: 'user', parts: [{ text: userMsg }] }], generationConfig: { temperature: 0.5, maxOutputTokens: 3000, responseMimeType: 'application/json' } }) });
    if (!res.ok) return new Response(JSON.stringify({ ok: false, error: `Gemini ${res.status}` }), { status: 502 });
    const data = await res.json() as any;
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let parsed: any;
    try { parsed = JSON.parse(reply); } catch { try { parsed = JSON.parse(reply.replace(/```json|```/g, '').trim()); } catch { return new Response(JSON.stringify({ ok: false, error: 'JSON 파싱 실패' }), { status: 502 }); } }
    return new Response(JSON.stringify({ ok: true, ...parsed }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) { return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : 'fetch failed' }), { status: 500 }); }
};
